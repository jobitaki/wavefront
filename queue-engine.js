/**
 * queue-engine.js
 *
 * Manages logical queue state with periodic snapshots for O(snapshotInterval)
 * backward-navigation and cycle-jumping.
 *
 * STORAGE POLICY
 *   Snapshots are kept in IndexedDB only for the lifetime of the current page
 *   session — the entire store is cleared on every pageshow (fresh load or
 *   BFCache restore) and again on pagehide (navigation away / tab close).
 *   Nothing persists to the next browser session unless the user explicitly
 *   exports a .wavesnap file and reloads it on their next visit.
 *
 * USER-CONTROLLED PERSISTENCE
 *   exportToBlob()                → download a gzip-compressed .wavesnap file
 *   importFromBuffer(buf, key)    → restore snapshots from a .wavesnap file;
 *                                   returns true if the file key matches the
 *                                   currently loaded fire log.
 *
 * LOGICAL STATE (this module) vs VISUAL STATE (app.js):
 *   - Logical: Map<nodeName, Map<inputKey, string[]>>  — pure token values, no DOM
 *   - Visual:  Map<nodeName, Map<inputKey, {baseX,baseY,tokens:SVGElement[]}>>
 *
 * app.js calls:
 *   engine.build(cycleData, edgeList, nodeIdToName, fileKey)
 *   engine.getPreCycleState(cycle)  → logical state BEFORE cycle fires
 * then renders SVG from the logical state.
 */

'use strict';

// ─── Pure helpers (mirroring DataflowVisualizer private methods) ──────────────
// Kept in sync with app.js. If you change the logic there, change it here too.

function _shouldPopInputTokens(instr) {
    if (!instr || !instr.instructionName) return true;
    const name = instr.instructionName.toLowerCase();
    if (name.includes('stream')) {
        return (instr.args || [])[0] === 'true';
    }
    return true;
}

function _extractResIndex(edgeLabel, nodeName) {
    if (!edgeLabel || typeof edgeLabel !== 'string') return 0;
    // Primary: res[i] → op[j]
    let m = edgeLabel.match(/res\[(\d+)\]\s*(?:→|->)\s*op\[(\d+)\]/);
    if (m) return parseInt(m[1], 10);
    // nodeName:res<k>
    try {
        const re = new RegExp(
            nodeName.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&') + '\\s*[:\\)]\\s*res\\[?(\\d+)\\]?'
        );
        m = edgeLabel.match(re);
        if (m) return parseInt(m[1], 10);
    } catch (_) { /* skip unsafe nodeName patterns */ }
    // :res<k> or res<k>
    m = edgeLabel.match(/:?\s*res\[?(\d+)\]?/);
    if (m) return parseInt(m[1], 10);
    // op[k] as heuristic
    m = edgeLabel.match(/op\[(\d+)\]/);
    if (m) return parseInt(m[1], 10);
    return 0;
}

function _getResValue(instr, resIndex) {
    if (!instr || !instr.instructionName) return null;
    const name = instr.instructionName.toLowerCase();
    const args = instr.args || [];
    const at = i => (i >= 0 && i < args.length) ? args[i] : null;

    if (name.includes('carry')) {
        if (!args.length) return null;
        if (typeof args[0] === 'string' && args[0].includes('->')) {
            if (args.length >= 2 && !isNaN(Number(args[1])))
                return resIndex === 0 ? args[1] : null;
            return null;
        }
    }

    if (name.includes('stream')) {
        if (!args || args.length < 5) return null;
        const lastFlag = args[0];
        if (lastFlag === 'true') return resIndex === 1 ? 'false' : null;
        if (resIndex === 0) {
            const start = Number(args[1]), offset = Number(args[4]);
            return isNaN(start) || isNaN(offset) ? null : start + offset;
        }
        if (resIndex === 1) return lastFlag === 'true' ? 'false' : 'true';
        return null;
    }

    if (/(add|sub|mul|div|rem|and_|or_|xor|shl|ashr|lshr|eq$|ne$|lt$|gt$|le$|ge$)/.test(name))
        return resIndex === 0 ? at(2) : null;
    if (/(and|or|xor|shl|ashr|lshr)/.test(name))
        return resIndex === 0 ? at(2) : null;
    if (/(extsi|extui|trunci|fptoui|fptosi|sitofp|uitofp|abs|neg)/.test(name))
        return resIndex === 0 ? at(1) : null;
    if (/(constant|c0|copy|dataflow\.constant|dataflow\.copy|bitcast|freeze)/.test(name))
        return resIndex === 0 ? at(0) : null;

    if (name.includes('steer')) {
        if ((name.includes('true') || name.includes('false')) && args.length >= 3) {
            const fired = String(at(2)).toLowerCase() !== 'false';
            return resIndex === 0 && fired ? at(1) : null;
        }
        if (args.length >= 3) {
            const channel = Number(at(2));
            return resIndex === channel ? at(1) : null;
        }
    }

    if (name.includes('loadindex')) return resIndex === 0 ? at(3) : null;
    if (name === 'load' || name.includes('load')) return resIndex === 0 ? at(2) : null;
    if (name.includes('store') || name.includes('send')) return null;
    if (name.includes('merge') && args.length >= 1) return resIndex === 0 ? at(0) : null;
    if (resIndex === 0 && args.length) return at(args.length - 1);
    return null;
}

// ─── State serialization ──────────────────────────────────────────────────────
// Logical state: Map<nodeName, Map<inputKey, string[]>>
// Serialised form: plain nested object (IndexedDB / structuredClone compatible).

function _serialize(state) {
    const out = Object.create(null);
    state.forEach((inputQueues, nodeName) => {
        const q = Object.create(null);
        inputQueues.forEach((tokens, key) => { q[key] = tokens.slice(); });
        out[nodeName] = q;
    });
    return out;
}

function _deserialize(obj) {
    const state = new Map();
    for (const [nodeName, queues] of Object.entries(obj || {})) {
        const inputQueues = new Map();
        for (const [key, tokens] of Object.entries(queues)) {
            inputQueues.set(key, tokens.slice());
        }
        state.set(nodeName, inputQueues);
    }
    return state;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const _DB_NAME  = 'wavefront-queue-cache';
const _DB_VER   = 1;
const _DB_STORE = 'snapshots';

// ─── Session-scoped DB management ────────────────────────────────────────────
// Clear the entire snapshot store so nothing survives across page sessions.
async function _clearAllSnapshots() {
    try {
        const db = await _openDB();
        await new Promise((resolve, reject) => {
            const req = db.transaction(_DB_STORE, 'readwrite')
                          .objectStore(_DB_STORE).clear();
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
        db.close();
    } catch (_) { /* non-fatal — memory-only mode is fine */ }
}

function _openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(_DB_NAME, _DB_VER);
        req.onupgradeneeded = e => {
            if (!e.target.result.objectStoreNames.contains(_DB_STORE))
                e.target.result.createObjectStore(_DB_STORE);
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function _dbGet(db, key) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(_DB_STORE, 'readonly')
                      .objectStore(_DB_STORE).get(key);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function _dbPut(db, key, value) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(_DB_STORE, 'readwrite')
                      .objectStore(_DB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = e => reject(e.target.error);
    });
}

// ─── QueueStateEngine ─────────────────────────────────────────────────────────

class QueueStateEngine {
    /**
     * @param {object} [opts]
     * @param {number} [opts.snapshotInterval=10]  Cycles between saved snapshots.
     *   Backward navigation / jumps cost at most (snapshotInterval − 1) replay steps.
     */
    constructor({ snapshotInterval = 10 } = {}) {
        this.snapshotInterval = snapshotInterval;
        /** @type {Map<number, object>}  cycle → serialised state (plain obj) */
        this.snapshots  = new Map();
        this.maxCycle   = 0;
        /** Set to true once build() finishes — app.js checks this before using the engine. */
        this.ready      = false;
        /** The fileKey that was used to build the current snapshot set. */
        this._fileKey   = null;

        // Populated by build()
        this._cycleData    = null; // Map<cycle, instruction[]>
        this._nodeIdToName = null; // Map<id, string>
        /** @type {Array<{sourceName:string, targetName:string, label:string}>} */
        this._edges        = null;
        /** @type {Map<string, Array<{targetName,label}>>}  sourceName → edges */
        this._bySource     = null;
        this._db           = null;
    }

    /**
     * Build (or restore from IndexedDB cache) the full snapshot table.
     *
     * Must be called after the DOT graph has been rendered (so edgeList is
     * available) and after the fire log has been parsed (so cycleData is ready).
     *
     * @param {Map<number, object[]>}                     cycleData
     * @param {Array<{sourceName,targetName,label}>}      edgeList
     * @param {Map<number, string>}                       nodeIdToName
     * @param {string}                                    fileKey
     *   A stable identifier for the loaded fire log, e.g. "name:size:mtime".
     *   Used as the IndexedDB cache key — changing this invalidates the cache.
     * @param {function(number,number):void}              [onProgress]
     *   Called periodically as (currentCycle, maxCycle) while building.
     */
    async build(cycleData, edgeList, nodeIdToName, fileKey, onProgress) {
        this._cycleData    = cycleData;
        this._nodeIdToName = nodeIdToName;
        this._edges        = edgeList;
        this._bySource     = new Map();

        for (const edge of edgeList) {
            if (!this._bySource.has(edge.sourceName))
                this._bySource.set(edge.sourceName, []);
            this._bySource.get(edge.sourceName).push(edge);
        }

        this.maxCycle = cycleData.size > 0 ? Math.max(...cycleData.keys()) : 0;

        // ── Fast path: user already imported a matching .wavesnap file ─────────
        if (this.ready && this._fileKey === fileKey) {
            console.log('[QueueEngine] Using imported snapshots — skipping build.');
            return;
        }

        this.ready     = false;
        this.snapshots = new Map();
        this._fileKey  = fileKey;

        // Cache key for session-scoped IndexedDB (cleared on page leave).
        const cacheKey = `${fileKey}|iv${this.snapshotInterval}|mc${this.maxCycle}`;

        // ── Try session cache in IndexedDB ────────────────────────────────────
        try {
            this._db = await _openDB();
            const cached = await _dbGet(this._db, cacheKey);
            if (cached) {
                for (const [k, v] of Object.entries(cached))
                    this.snapshots.set(parseInt(k, 10), v);
                this.ready = true;
                console.log(`[QueueEngine] Restored ${this.snapshots.size} snapshots from session cache.`);
                return;
            }
        } catch (e) {
            console.warn('[QueueEngine] IndexedDB unavailable — snapshots will be memory-only.', e);
        }

        // ── Build from scratch ────────────────────────────────────────────────
        await this._buildSnapshots(onProgress);

        // ── Write to session cache ────────────────────────────────────────────
        if (this._db) {
            try {
                const obj = Object.create(null);
                this.snapshots.forEach((v, k) => { obj[k] = v; });
                await _dbPut(this._db, cacheKey, obj);
                console.log(`[QueueEngine] Saved ${this.snapshots.size} snapshots to session cache.`);
            } catch (e) {
                console.warn('[QueueEngine] Failed to write session cache.', e);
            }
        }
    }

    // ─── Export / Import ───────────────────────────────────────────────────────

    /**
     * Serialise the current snapshot set (plus optional source files) to a
     * gzip-compressed Blob for download.  When dot and fireLog are supplied the
     * resulting .wavesnap is fully self-contained — no other files are needed
     * to reconstruct the visualisation.
     *
     * @param {string|null} dot      Raw DOT graph text.
     * @param {string|null} fireLog  Raw fire-log text.
     */
    async exportToBlob(dot = null, fireLog = null) {
        if (!this.ready) throw new Error('Snapshots not ready — wait for build() to finish.');
        const payload = JSON.stringify({
            v:                1,
            fileKey:          this._fileKey,
            snapshotInterval: this.snapshotInterval,
            maxCycle:         this.maxCycle,
            snapshots:        Object.fromEntries(this.snapshots),
            dot:              dot   ?? undefined,
            fireLog:          fireLog ?? undefined
        });
        const bytes = new TextEncoder().encode(payload);
        const cs    = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const compressed = await new Response(cs.readable).arrayBuffer();
        return new Blob([compressed], { type: 'application/octet-stream' });
    }

    /**
     * Load snapshots from a previously exported .wavesnap ArrayBuffer.
     * Call this before (or after) build() — if the fileKey matches the currently
     * loaded fire log, build() will skip recomputation.
     *
     * When expectedFileKey is null the key check is skipped (useful when loading
     * a self-contained .wavesnap before any fire log has been opened).
     *
     * @param  {ArrayBuffer} buffer
     * @param  {string|null} expectedFileKey  Key of the currently loaded fire log,
     *                                        or null to accept any.
     * @returns {Promise<{ok:boolean, dot:string|null, fireLog:string|null, fileKey:string}>}
     */
    async importFromBuffer(buffer, expectedFileKey = null) {
        const FAIL = { ok: false, dot: null, fireLog: null, fileKey: '' };
        try {
            const ds     = new DecompressionStream('gzip');
            const writer = ds.writable.getWriter();
            writer.write(buffer);
            writer.close();
            const text = await new Response(ds.readable).text();
            const data = JSON.parse(text);
            if (data.v !== 1) return FAIL;
            if (expectedFileKey !== null && data.fileKey !== expectedFileKey) return FAIL;
            this.snapshots = new Map(
                Object.entries(data.snapshots).map(([k, v]) => [parseInt(k, 10), v])
            );
            this._fileKey  = data.fileKey;
            this.maxCycle  = data.maxCycle;
            this.ready     = true;
            console.log(`[QueueEngine] Imported ${this.snapshots.size} snapshots from file.`);
            return { ok: true, dot: data.dot ?? null, fireLog: data.fireLog ?? null, fileKey: data.fileKey };
        } catch (e) {
            console.error('[QueueEngine] importFromBuffer failed:', e);
            return FAIL;
        }
    }

    /** @private */
    async _buildSnapshots(onProgress) {
        const state    = new Map(); // mutable current logical state
        const interval = this.snapshotInterval;
        const CHUNK    = 500;       // cycles before yielding to keep UI responsive

        for (let cycle = 0; cycle <= this.maxCycle; cycle++) {
            // Apply all instructions in this cycle
            const instructions = this._cycleData.get(cycle) || [];
            for (const instr of instructions) this._applyInstruction(instr, state);

            // Snapshot after applying cycle C  →  snapshots[C] = state after C
            if (cycle % interval === 0) {
                this.snapshots.set(cycle, _serialize(state));
            }

            // Yield periodically so the browser stays responsive
            if (cycle % CHUNK === 0) {
                if (onProgress) onProgress(cycle, this.maxCycle);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        this.ready = true;
        console.log(`[QueueEngine] Built ${this.snapshots.size} snapshots over ${this.maxCycle + 1} cycles.`);
    }

    /**
     * Returns the logical queue state that app.js should render BEFORE processing
     * `targetCycle`'s instructions — i.e. the state equivalent to what
     * `replayToCurrentCycle()` used to reconstruct by replaying from cycle 0.
     *
     * Time complexity: O(snapshotInterval) replay steps regardless of targetCycle.
     *
     * @param  {number} targetCycle
     * @returns {Map<string, Map<string, string[]>>}
     *   nodeName → inputKey → ordered array of queued token values (FIFO head first)
     */
    getPreCycleState(targetCycle) {
        if (!this.ready || targetCycle <= 0) return new Map();

        // We need the state *after* cycle (targetCycle − 1).
        const wantAfter = targetCycle - 1;

        // Find the largest snapshot key that is ≤ wantAfter.
        let snapshotCycle = -1;
        for (const [c] of this.snapshots) {
            if (c <= wantAfter && c > snapshotCycle) snapshotCycle = c;
        }

        // Restore from that snapshot (or start empty if none found).
        const state = snapshotCycle >= 0
            ? _deserialize(this.snapshots.get(snapshotCycle))
            : new Map();

        // Replay the gap: cycles (snapshotCycle + 1) through wantAfter inclusive.
        for (let c = snapshotCycle + 1; c <= wantAfter; c++) {
            const instructions = this._cycleData.get(c) || [];
            for (const instr of instructions) this._applyInstruction(instr, state);
        }

        return state;
    }

    /** @private — applies one instruction to the mutable logical state. */
    _applyInstruction(instr, state) {
        const nodeName = this._nodeIdToName.get(instr.instructionId);
        if (!nodeName) return;

        // Pop the head of each input queue when this node fires
        if (_shouldPopInputTokens(instr) && state.has(nodeName)) {
            const qs = state.get(nodeName);
            for (const [key, tokens] of qs) {
                if (tokens.length) tokens.shift(); // FIFO pop
                if (!tokens.length) qs.delete(key);
            }
            if (!qs.size) state.delete(nodeName);
        }

        // Produce tokens on each outgoing edge
        const outEdges = this._bySource.get(nodeName) || [];
        for (const edge of outEdges) {
            const resIdx = _extractResIndex(edge.label, nodeName);
            const val    = _getResValue(instr, resIdx);
            if (val === null || val === undefined) continue;

            // Determine which input slot on the target node this token enters
            let inputIdx = null;
            const opM = edge.label.match(/op\[(\d+)\]/);
            if (opM) inputIdx = parseInt(opM[1], 10);
            if (inputIdx === null) inputIdx = resIdx;

            const tgt = edge.targetName;
            if (!state.has(tgt)) state.set(tgt, new Map());
            const tqs = state.get(tgt);
            const key = String(inputIdx);
            if (!tqs.has(key)) tqs.set(key, []);
            tqs.get(key).push(String(val));
        }
    }
}

// Expose globally — no ES-module bundler needed in this browser app.
window.QueueStateEngine = QueueStateEngine;

// ─── Session lifecycle — clear IndexedDB on every page enter and leave ────────
// This ensures snapshot data never persists to the next browser session unless
// the user explicitly downloads and re-imports a .wavesnap file.
window.addEventListener('pageshow', () => _clearAllSnapshots());
window.addEventListener('pagehide', () => _clearAllSnapshots());
