// Dataflow Token Visualizer Application
// Handles file parsing, graph rendering, and animation

class DataflowVisualizer {
    constructor() {
        this.dotContent = null;
        this.fireLogData = [];
        this.cycleData = new Map(); // Map of cycle number to array of instructions
        this.currentCycle = 0;
        this.isPlaying = false;
        this.playbackSpeed = 5; // Default speed multiplier
        this.playbackInterval = null;
        this.graphSvg = null;
        this.nodeMap = new Map(); // Map instruction ID to node element
        this.nodeIdToName = new Map(); // Map instruction ID to node name (from DOT file)
        this.edgeMap = new Map(); // Map edge identifier to edge element
        this.edgesBySource = new Map(); // for fast edge lookup by source node
        this.edgeList = [];                  // pure-data edge descriptors for the queue engine
        this.edgesByTargetInput = new Map(); // "targetName:inputKey" → SVG edge element
        this.fireLogFileKey = null;           // stable file identity key for snapshot cache
        this.fireLogRawText = null;            // raw fire log text (for embedding in .wavesnap)
        this.queueEngine = new QueueStateEngine({ snapshotInterval: 10 });
        this.pendingWavesnapBuffer = null;     // .wavesnap loaded before fire log key is known
        this.queuedTokens = new Map(); // Map targetNodeName -> Map<inputKey, {baseX, baseY, tokens:[]}>
        this._statsTokenHistory = []; // rolling array of {cycle, count} for tokens-in-flight chart
        this.queueVisualizationEnabled = false; // Toggle for queue visualization (off by default)
        this.memoryState = new Map();  // addr -> { value:string, cycle:number }
        this._memoryLastCycle = -1;    // last cycle for which memoryState is valid
        this.zoom = null; // D3 zoom behavior
        this.currentTransform = d3.zoomIdentity; // Current zoom/pan transform
        this.stepSize = 1; // Default step size for prev/next navigation
        this.searchDebounceTimer = null; // Debounce timer for search
        this.searchTerm = ''; // Current search term
        
        // Cache DOM elements for performance
        this.dom = {};
        this.cacheDOMElements();
        
        // Ensure queue toggle is unchecked on page load
        const queueToggle = document.getElementById('queueToggleBtn');
        if (queueToggle) queueToggle.checked = false;
        
        this.initializeEventListeners();
    }

    cacheDOMElements() {
        // Cache frequently accessed DOM elements
        this.dom.graphContainer = document.getElementById('graph-container');
        this.dom.executionLog = document.getElementById('executionLog');
        this.dom.memoryLog     = document.getElementById('memoryLog');
        this.dom.cycleInstrCount = document.getElementById('cycleInstrCount');
        this.dom.playBtn = document.getElementById('playBtn');
        this.dom.pauseBtn = document.getElementById('pauseBtn');
        this.dom.prevBtn = document.getElementById('prevBtn');
        this.dom.nextBtn = document.getElementById('nextBtn');
        this.dom.resetBtn = document.getElementById('resetBtn');
        this.dom.speedValue = document.getElementById('speedValue');
        this.dom.topMenuBar = document.getElementById('topMenuBar');
        this.dom.sidebarLeft = document.getElementById('sidebarLeft');
        this.dom.visualization = document.getElementById('visualization');
        this.dom.totalCycles = document.getElementById('totalCycles');
        this.dom.totalNodes = document.getElementById('totalNodes');
        this.dom.fileMenuBtn = document.getElementById('fileMenuBtn');
        this.dom.fileDropdown = document.getElementById('fileDropdown');
        this.dom.sidebarToggle = document.getElementById('sidebarToggle');
    }

    initializeEventListeners() {
        // File upload listeners
        document.getElementById('dotFile').addEventListener('change', (e) => this.handleDotFile(e));
        document.getElementById('fireLog').addEventListener('change', (e) => this.handleFireLog(e));

        // File menu and reuploads
        this.dom.fileMenuBtn?.addEventListener('click', () => this.toggleFileMenu());
        document.getElementById('reuploadDot')?.addEventListener('click', () => this.reuploadDot());
        document.getElementById('reuploadFireLog')?.addEventListener('click', () => this.reuploadFireLog());
        document.getElementById('reuploadDotFile')?.addEventListener('change', (e) => this.handleDotFile(e));
        document.getElementById('reuploadFireLogFile')?.addEventListener('change', (e) => this.handleFireLog(e));
        document.getElementById('exportSnapshotsItem')?.addEventListener('click', () => this._exportSnapshots());
        document.getElementById('importSnapshotsItem')?.addEventListener('click', () => {
            this.dom.fileDropdown?.classList.remove('show');
            document.getElementById('importSnapshotFile')?.click();
        });
        document.getElementById('importSnapshotFile')?.addEventListener('change', (e) => this._handleSnapshotFile(e));
        
        // Sidebar toggle
        this.dom.sidebarToggle?.addEventListener('click', () => this.toggleSidebar());

        // Stats panel toggle
        document.getElementById('statsToggle')?.addEventListener('click', () => this.toggleStatsPanel());
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dom.fileDropdown && !this.dom.fileMenuBtn.contains(e.target) && !this.dom.fileDropdown.contains(e.target)) {
                this.dom.fileDropdown.classList.remove('show');
            }
        });

        // Playback control listeners
        document.getElementById('playBtn').addEventListener('click', () => this.play());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('prevBtn').addEventListener('click', () => this.previousCycle());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextCycle());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

        // Speed control
        document.getElementById('speedSlider').addEventListener('input', (e) => {
            this.playbackSpeed = parseInt(e.target.value);
            this.dom.speedValue.textContent = `${this.playbackSpeed}x`;
            if (this.isPlaying) {
                this.pause();
                this.play();
            }
        });

        // Zoom control listeners
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomResetBtn').addEventListener('click', () => this.resetZoom());

        // Cycle navigation controls
        const jumpToCycleInput = document.getElementById('jumpToCycleInput');
        const jumpToCycleBtn = document.getElementById('jumpToCycleBtn');
        const stepSizeInput = document.getElementById('stepSizeInput');
        
        jumpToCycleBtn?.addEventListener('click', () => this.jumpToCycle());
        jumpToCycleInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.jumpToCycle();
                e.target.blur(); // Remove focus after jumping
            }
        });
        jumpToCycleInput?.addEventListener('blur', () => {
            this.jumpToCycle();
        });
        
        stepSizeInput?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1) {
                this.stepSize = value;
            } else {
                e.target.value = this.stepSize;
            }
        });

        // Timeline events are wired in _initTimeline(), called from enableControls().

        // Queue visualization toggle
        document.getElementById('queueToggleBtn').addEventListener('change', (e) => this.toggleQueueVisualization(e.target.checked));

        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const searchClearBtn = document.getElementById('searchClearBtn');
        
        searchInput?.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
        searchClearBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                this.handleSearchInput('');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.dotContent || !this.fireLogData.length) return;
            
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    if (this.isPlaying) {
                        this.pause();
                    } else {
                        this.play();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.previousCycle();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextCycle();
                    break;
                case 'Home':
                    e.preventDefault();
                    this.reset();
                    break;
                case 'End':
                    e.preventDefault();
                    const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
                    this.currentCycle = maxCycle;
                    this.updateVisualization();
                    break;
            }
        });
    }

    _resetQueueState() {
        this.queueEngine.ready = false;
        this.queueEngine.clearSnapshots?.();
        const toggle = document.getElementById('queueToggleBtn');
        if (toggle && toggle.checked) {
            toggle.checked = false;
            this.toggleQueueVisualization(false);
        }
        this._setExportEnabled(false);
        this._statsTokenHistory = [];
    }

    async handleDotFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        this._resetQueueState();
        const statusEl = document.getElementById('dotStatus');
        try {
            this.dotContent = await this.readFile(file);
            statusEl.textContent = `✓ Loaded: ${file.name}`;
            statusEl.className = 'file-status success';
            
            this.checkAndRenderGraph();
        } catch (error) {
            statusEl.textContent = `✗ Error loading file: ${error.message}`;
            statusEl.className = 'file-status error';
            console.error('Error loading DOT file:', error);
        }
    }

    async handleFireLog(event) {
        const file = event.target.files[0];
        if (!file) return;

        this._resetQueueState();
        const statusEl = document.getElementById('fireLogStatus');
        try {
            // For small files (< 10MB), use the old method
            if (file.size < 10 * 1024 * 1024) {
                const content = await this.readFile(file);
                this.parseFireLog(content);
            } else {
                // For large files, use chunked parsing
                await this.parseFireLogChunked(file, statusEl);
            }
            
            statusEl.textContent = `✓ Loaded: ${file.name} (${this.fireLogData.length} entries)`;
            statusEl.className = 'file-status success';
            
            this.fireLogFileKey = `${file.name}:${file.size}:${file.lastModified}`;
            this.checkAndRenderGraph();
        } catch (error) {
            statusEl.textContent = `✗ Error loading file: ${error.message}`;
            statusEl.className = 'file-status error';
            console.error('Error loading fire log:', error);
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    async parseFireLogChunked(file, statusEl) {
        this.fireLogData = [];
        this.fireLogRawText = '';
        this.cycleData.clear();
        
        const chunkSize = 1024 * 1024; // 1MB chunks
        const fileSize = file.size;
        let offset = 0;
        let partialLine = ''
        const fireLogRegex = /^\[(\d+)\]\s+\((\d+)\)\s+(\S+)(.*)$/;
        
        while (offset < fileSize) {
            const chunk = file.slice(offset, offset + chunkSize);
            const text = await this.readFile(chunk);
            this.fireLogRawText += text;
            
            // Combine with any partial line from previous chunk
            const fullText = partialLine + text;
            const lines = fullText.split('\n');
            
            // Save the last line if it's incomplete (unless we're at end of file)
            if (offset + chunkSize < fileSize) {
                partialLine = lines.pop();
            } else {
                partialLine = '';
            }
            
            // Process complete lines
            for (const line of lines) {
                const match = line.trim().match(fireLogRegex);
                if (match) {
                    const cycle = parseInt(match[1]);
                    const instructionId = parseInt(match[2]);
                    const instructionName = match[3];
                    const argsStr = match[4].trim();
                    const args = argsStr ? argsStr.split(/\s+/) : [];

                    const entry = {
                        cycle,
                        instructionId,
                        instructionName,
                        args,
                        line: line.trim()
                    };

                    this.fireLogData.push(entry);

                    // Group by cycle
                    if (!this.cycleData.has(cycle)) {
                        this.cycleData.set(cycle, []);
                    }
                    this.cycleData.get(cycle).push(entry);
                }
            }
            
            offset += chunkSize;
            const progress = Math.min(100, Math.round((offset / fileSize) * 100));
            statusEl.textContent = `Loading: ${progress}% (${this.fireLogData.length} entries)`;
            statusEl.className = 'file-status';
            
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    async loadExampleFiles(exampleKey = 'default') {
        const EXAMPLES = {
            'bfs':   { label: 'Breadth-First Search', snap: 'examples/bfs_256.wavesnap' },
            'dmm':   { label: 'Dense Matrix Multiply', snap: 'examples/dmm_16.wavesnap' },
            'sconv': { label: 'Sparse Convolution',   snap: 'examples/sconv_256.wavesnap' },
            'sort':  { label: 'Radix Sort',           snap: 'examples/sort_512.wavesnap' },
        };
        const ex = EXAMPLES[exampleKey] || EXAMPLES['bfs'];
        try {
            const response = await fetch(ex.snap);
            if (!response.ok) throw new Error(`Snapshot not found (${response.status})`);
            const buf = await response.arrayBuffer();
            const result = await this.queueEngine.importFromBuffer(buf, null);
            if (!result.ok) throw new Error('Invalid .wavesnap file');
            if (result.dot && result.fireLog) {
                this.dotContent = result.dot;
                this.parseFireLog(result.fireLog);
                this.fireLogFileKey = result.fileKey;
                const dotStatus  = document.getElementById('dotStatus');
                const fireStatus = document.getElementById('fireLogStatus');
                const snapStatus = document.getElementById('wavesnapStatus');
                if (dotStatus)  { dotStatus.textContent  = '✓ Loaded from .wavesnap'; dotStatus.className  = 'file-status success'; }
                if (fireStatus) { fireStatus.textContent = '✓ Loaded from .wavesnap'; fireStatus.className = 'file-status success'; }
                if (snapStatus) { snapStatus.textContent = `✓ ${ex.snap.split('/').pop()}`; snapStatus.className = 'file-status wavesnap-status success'; }
                this._setExportEnabled(true);
                await this.checkAndRenderGraph();
                console.log(`Example "${ex.label}" loaded successfully`);
            }
        } catch (error) {
            console.error('Failed to load example files:', error);
        }
    }

    parseFireLog(content) {
        // Parse fire.log format: [cycle] (instruction_id) instruction_name [args...]
        // Note: Arguments are split on whitespace. If arguments contain spaces,
        // they will be split into multiple elements. This matches the fire.log format.
        this.fireLogRawText = content;
        const lines = content.trim().split('\n');
        this.fireLogData = [];
        this.cycleData.clear();

        const fireLogRegex = /^\[(\d+)\]\s+\((\d+)\)\s+(\S+)(.*)$/;

        for (const line of lines) {
            const match = line.trim().match(fireLogRegex);
            if (match) {
                const cycle = parseInt(match[1]);
                const instructionId = parseInt(match[2]);
                const instructionName = match[3];
                const argsStr = match[4].trim();
                const args = argsStr ? argsStr.split(/\s+/) : [];

                const entry = {
                    cycle,
                    instructionId,
                    instructionName,
                    args,
                    line: line.trim()
                };

                this.fireLogData.push(entry);

                // Group by cycle
                if (!this.cycleData.has(cycle)) {
                    this.cycleData.set(cycle, []);
                }
                this.cycleData.get(cycle).push(entry);
            }
        }
    }

    async checkAndRenderGraph() {
        if (this.dotContent && this.fireLogData.length > 0) {
            await this.renderGraph();
            this.enableControls();
            this.updateStats();
            // Snapshots are built on demand when the user enables the Queue toggle.
            // If a .wavesnap was pre-loaded, try to import it silently now so it
            // is ready before the toggle is ever flipped.
            if (this.pendingWavesnapBuffer && this.fireLogFileKey) {
                const buf = this.pendingWavesnapBuffer;
                this.pendingWavesnapBuffer = null;
                this.queueEngine.importFromBuffer(buf, this.fireLogFileKey)
                    .then(result => { if (result.ok) this._setExportEnabled(true); })
                    .catch(() => {});
            }
        }
    }

    async renderGraph() {
        const container = document.getElementById('graph-container');
        const loadingMsg = document.getElementById('loadingMessage');
        const loadingNote = loadingMsg ? loadingMsg.querySelector('#loadingNote') : null;

        if (loadingNote) loadingNote.textContent = 'Rendering graph...';

        try {
            // Wait for @hpcc-js/wasm library to be available
            if (!window["@hpcc-js/wasm"]) {
                throw new Error("Graphviz WASM library not loaded. Please refresh the page.");
            }
            
            // Use @hpcc-js/wasm to render the DOT graph
            const graphviz = await window["@hpcc-js/wasm"].Graphviz.load();
            const svgString = graphviz.dot(this.dotContent);
            
            // Insert the SVG into the container
            container.innerHTML = svgString;
            // Mark container as having a graph so the background switches to white
            container.classList.add('has-graph');
            if (loadingMsg) loadingMsg.style.display = 'none';

            // Get the actual SVG element that was created
            this.graphSvg = container.querySelector('svg');
            if (this.graphSvg) {
                this.graphSvg.id = 'graph-svg';
                this.graphSvg.style.width = '100%';
                this.graphSvg.style.height = '100%';
                
                // Setup pan and zoom
                this.setupZoom();
                
                // Build node and edge maps for faster lookup
                this.buildNodeMap();
                this.buildEdgeMap();
            }


        } catch (error) {
            console.error('Error rendering graph:', error);
            if (loadingNote) loadingNote.textContent = `Error rendering graph: ${error.message}`;
            if (loadingMsg) loadingMsg.classList.add('error');
        }
    }

    buildNodeMap() {
        // Find all nodes in the SVG and map them by their instruction ID
        // DOT format typically includes [ID:X] in the label
        this.nodeMap.clear();
        this.nodeIdToName = new Map(); // Maps instruction ID to node name (from title element)

        if (!this.graphSvg) return;

        const nodes = this.graphSvg.querySelectorAll('g.node');
        nodes.forEach(node => {
            // Get the node name from the title element (e.g., "dataflow_constant_1")
            const titleEl = node.querySelector('title');
            const nodeName = titleEl ? titleEl.textContent.trim() : null;

            // Collect all text content from the node (including tspan elements)
            let allText = '';
            const textElements = node.querySelectorAll('text, tspan');
            textElements.forEach(textEl => {
                allText += textEl.textContent + ' ';
            });

            // Look for [ID:X] pattern in all the collected text
            const idMatch = allText.match(/\[ID:(\d+)\]/);
            if (idMatch) {
                const id = parseInt(idMatch[1]);
                this.nodeMap.set(id, node);
                if (nodeName) {
                    this.nodeIdToName.set(id, nodeName);
                }

            }
        });


    }

    buildEdgeMap() {
        // Find all edges in the SVG
        this.edgeMap.clear();
        this.edgesBySource.clear();
        this.edgeList = [];
        this.edgesByTargetInput = new Map();

        if (!this.graphSvg) return;

        const edges = this.graphSvg.querySelectorAll('g.edge');
        edges.forEach((edge, index) => {
            const titleEl = edge.querySelector('title');
            if (titleEl) {
                const edgeId = titleEl.textContent;
                this.edgeMap.set(edgeId, edge);
                this.edgeMap.set(index, edge); // Also store by index for fallback

                // Index by source name for fast outgoing-edge lookup
                const match = edgeId.match(/^([^-:>\s]+)/);
                if (match) {
                    const sourceName = match[1];
                    if (!this.edgesBySource.has(sourceName))
                        this.edgesBySource.set(sourceName, []);
                    this.edgesBySource.get(sourceName).push(edge);
                }

                // Build pure-data edge list for the queue engine (no DOM refs)
                const labelEl = edge.querySelector('text');
                const edgeLabel = labelEl ? labelEl.textContent.trim() : '';
                const titleMatch = edgeId.trim().match(/^([^->\s]+)\s*->\s*([^->\s]+)/);
                if (titleMatch) {
                    this.edgeList.push({
                        sourceName: titleMatch[1],
                        targetName: titleMatch[2],
                        label: edgeLabel
                    });
                    // Reverse map: "targetName:inputKey" → SVG edge element
                    const opMatch = edgeLabel.match(/op\[(\d+)\]/);
                    if (opMatch) {
                        this.edgesByTargetInput.set(`${titleMatch[2]}:${opMatch[1]}`, edge);
                    }
                }
            }
        });

        console.log(`Built edge map with ${this.edgeMap.size} edges, ${this.edgeList.length} pure-data edges`);
    }

    enableControls() {
        // Enable playback buttons
        this.dom.playBtn.disabled = false;
        this.dom.prevBtn.disabled = false;
        this.dom.nextBtn.disabled = false;
        this.dom.resetBtn.disabled = false;
        
        // Enable cycle navigation controls
        document.getElementById('jumpToCycleInput').disabled = false;
        document.getElementById('jumpToCycleBtn').disabled = false;
        document.getElementById('stepSizeInput').disabled = false;

        // Initialize DAW-style timeline canvas
        this._initTimeline();
        
        this.reset();
    }

    updateStats() {
        const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
        this.dom.totalCycles.textContent = maxCycle;
        this.dom.totalNodes.textContent = this.nodeMap.size;
    }

    /** Builds queue snapshots, showing a progress bar in the menu bar.
     * Called only when the user enables the Queue toggle.
     */
    async _buildQueueSnapshots() {
        if (!this.fireLogFileKey || !this.edgeList.length) return;

        // Determine whether snapshot computation can be skipped.
        // Even if snapshots exist, build() must run to populate _cycleData,
        // _bySource, and _nodeIdToName which getPreCycleState needs for replay.
        const alreadyReady = this.queueEngine.ready &&
                             this.queueEngine._fileKey === this.fireLogFileKey;

        const progressEl = document.getElementById('snapshotProgress');
        const barEl      = document.getElementById('snapshotProgressBar');
        const labelEl    = document.getElementById('snapshotProgressLabel');

        if (!alreadyReady) {
            // Show progress bar and disable jump controls.
            this._setJumpControlsDisabled(true);
            if (progressEl) {
                progressEl.style.display = 'flex';
                barEl.style.setProperty('--pct', '0%');
                labelEl.textContent = '0%';
            }
        }

        const onProgress = alreadyReady ? null : (cycle, maxCycle) => {
            if (!progressEl) return;
            const pct = maxCycle > 0 ? Math.round((cycle / maxCycle) * 100) : 0;
            barEl.style.setProperty('--pct', `${pct}%`);
            labelEl.textContent = `${pct}%`;
        };

        await this.queueEngine.build(
            this.cycleData,
            this.edgeList,
            this.nodeIdToName,
            this.fireLogFileKey,
            onProgress
        );

        if (!alreadyReady && progressEl) {
            barEl.style.setProperty('--pct', '100%');
            labelEl.textContent = '100%';
            await new Promise(r => setTimeout(r, 300));
            progressEl.style.display = 'none';
            this._setJumpControlsDisabled(false);
        }
        this._setExportEnabled(true);
    }

    _setJumpControlsDisabled(disabled) {
        const input  = document.getElementById('jumpToCycleInput');
        const btn    = document.getElementById('jumpToCycleBtn');
        const canvas = document.getElementById('timelineCanvas');
        if (input)  input.disabled = disabled;
        if (btn)    btn.disabled   = disabled;
        this._timelineDisabled = disabled;
        if (canvas) canvas.style.cursor = disabled ? 'default' : 'col-resize';
    }

    _setExportEnabled(enabled) {
        const btn = document.getElementById('exportSnapshotsItem');
        if (btn) btn.classList.toggle('disabled', !enabled);
    }

    /** Export current snapshots as a gzip-compressed .wavesnap download. */
    async _exportSnapshots() {
        this.dom.fileDropdown?.classList.remove('show');
        if (!this.queueEngine.ready) return;
        try {
            const blob = await this.queueEngine.exportToBlob(this.dotContent, this.fireLogRawText);
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = 'new.wavesnap';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Snapshot export failed:', e);
        }
    }

    /** Load a .wavesnap file the user dropped or selected. */
    async _handleSnapshotFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const result = await this.queueEngine.importFromBuffer(buf, this.fireLogFileKey);
            if (result.ok) {
                console.log('[App] Snapshot file loaded — queue engine is ready.');
                this._setExportEnabled(true);
            } else {
                console.warn('[App] Snapshot file did not match the current fire log (file key mismatch).');
            }
        } catch (e) {
            console.error('[App] Failed to load snapshot file:', e);
        }
        // Reset input so the same file can be reloaded if needed
        event.target.value = '';
    }

    /** Handle a .wavesnap loaded from the initial upload modal (before fire log key is known). */
    async _handleUploadModalWavesnap(event) {
        const file = event.target.files[0];
        if (!file) return;
        const statusEl = document.getElementById('wavesnapStatus');
        try {
            const buf = await file.arrayBuffer();

            // Try to import, skipping the key check initially so we can see
            // whether the archive is self-contained (has embedded dot + fireLog).
            const result = await this.queueEngine.importFromBuffer(buf, null);

            if (!result.ok) {
                if (statusEl) { statusEl.textContent = '✗ Invalid .wavesnap file'; statusEl.className = 'file-status wavesnap-status error'; }
                return;
            }

            // Self-contained archive: bootstrap the full visualisation from it.
            if (result.dot && result.fireLog) {
                this.dotContent = result.dot;
                this.parseFireLog(result.fireLog);
                this.fireLogFileKey = result.fileKey;
                if (statusEl) { statusEl.textContent = `✓ ${file.name}`; statusEl.className = 'file-status wavesnap-status success'; }
                const dotStatus = document.getElementById('dotStatus');
                const fireStatus = document.getElementById('fireLogStatus');
                if (dotStatus)  { dotStatus.textContent  = '✓ Loaded from .wavesnap'; dotStatus.className  = 'file-status success'; }
                if (fireStatus) { fireStatus.textContent = '✓ Loaded from .wavesnap'; fireStatus.className = 'file-status success'; }
                this._setExportEnabled(true);
                await this.checkAndRenderGraph();
                return;
            }

            // Archive without embedded files — behave as before:
            // if fire log is already loaded and the key matches, accept it;
            // otherwise stash as pending.
            if (this.fireLogFileKey) {
                if (result.fileKey === this.fireLogFileKey) {
                    if (statusEl) { statusEl.textContent = `✓ ${file.name}`; statusEl.className = 'file-status wavesnap-status success'; }
                    this._setExportEnabled(true);
                } else {
                    if (statusEl) { statusEl.textContent = '✗ Did not match fire log'; statusEl.className = 'file-status wavesnap-status error'; }
                    this.queueEngine.ready = false;
                }
                return;
            }
            // Fire log not yet loaded — stash buffer for later.
            this.pendingWavesnapBuffer = buf;
            if (statusEl) { statusEl.textContent = `✓ ${file.name} (pending fire log)`; statusEl.className = 'file-status wavesnap-status success'; }
        } catch (e) {
            console.error('[App] Failed to read wavesnap file:', e);
            if (statusEl) { statusEl.textContent = '✗ Read error'; statusEl.className = 'file-status wavesnap-status error'; }
        }
        event.target.value = '';
    }

    /**
     * Given logical queue state from the engine, recreate the queuedTokens
     * SVG elements so the renderer sees the correct visual state.
     * Caller must have already cleared queuedTokens and removed .queued-token elements.
     * @param {Map<string, Map<string, string[]>>} logicalState
     */
    rebuildQueuedTokensFromLogicalState(queues) {
        queues.forEach((inputQueues, targetNodeName) => {
            inputQueues.forEach((tokenValues, inputKey) => {
                if (!tokenValues || !tokenValues.length) return;
                const edgeKey = `${targetNodeName}:${inputKey}`;
                const edge = this.edgesByTargetInput.get(edgeKey);
                if (!edge) return;
                const pathEl = edge.querySelector('path');
                if (!pathEl || !pathEl.getTotalLength) return;
                const L = pathEl.getTotalLength();
                const pt = pathEl.getPointAtLength(Math.max(0, L - 4));
                const baseX = pt.x, baseY = pt.y;
                if (!this.queuedTokens.has(targetNodeName))
                    this.queuedTokens.set(targetNodeName, new Map());
                const nodeQueues = this.queuedTokens.get(targetNodeName);
                // Preserve expanded state across rebuilds
                const prevExpanded = nodeQueues.has(inputKey) ? !!nodeQueues.get(inputKey).expanded : false;
                const queueData = { baseX, baseY, values: [...tokenValues], elements: [], inputKey, expanded: prevExpanded };
                this._redrawQueueSlots(queueData);
                nodeQueues.set(inputKey, queueData);
            });
        });
    }

    play() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.dom.playBtn.disabled = true;
        this.dom.pauseBtn.disabled = false;

        // Calculate interval based on speed (higher speed = shorter interval)
        const baseInterval = 1000; // 1 second base
        const interval = baseInterval / this.playbackSpeed;

        this.playbackInterval = setInterval(() => {
            this.nextCycle();
            
            // Stop if we've reached the end
            const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
            if (this.currentCycle >= maxCycle) {
                this.pause();
            }
        }, interval);
    }

    pause() {
        this.isPlaying = false;
        this.dom.playBtn.disabled = false;
        this.dom.pauseBtn.disabled = true;
        
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
    }

    reset() {
        this.pause();
        this.currentCycle = 0;
        // Clear all queued tokens and overlays
        if (this.graphSvg) {
            this.graphSvg.querySelectorAll('.queued-token, .queue-overlay').forEach(el => el.remove());
        }
        this.queuedTokens.clear();
        this.memoryState.clear();
        this._memoryLastCycle = -1;
        this.updateVisualization();
    }

    previousCycle() {
        if (this.currentCycle > 0) {
            this.currentCycle = Math.max(0, this.currentCycle - this.stepSize);
            // Rebuild queue state from scratch by replaying from cycle 0
            if (this.queueVisualizationEnabled) {
                this.replayToCurrentCycle();
            } else {
                this.updateVisualization();
            }
        }
    }

    replayToCurrentCycle() {
        // Clear all queued tokens and overlays
        if (this.graphSvg) {
            this.graphSvg.querySelectorAll('.queued-token, .queue-overlay').forEach(el => el.remove());
        }
        this.queuedTokens.clear();

        if (this.queueEngine && this.queueEngine.ready) {
            // Fast path: restore queue state from nearest snapshot + minimal replay
            const queues = this.queueEngine.getPreCycleState(this.currentCycle);
            this.rebuildQueuedTokensFromLogicalState(queues);
        } else {
            // Fallback: full linear replay from cycle 0 (used before snapshots are ready)
            for (let cycle = 0; cycle < this.currentCycle; cycle++) {
                const instructions = this.cycleData.get(cycle) || [];
                this.processInstructionsForQueues(instructions);
            }
        }
        // Memory is always rebuilt from cycleData — not stored in snapshots
        this._buildMemoryStateUpTo(this.currentCycle);
        this._memoryLastCycle = this.currentCycle;

        // Display current cycle normally
        this.updateVisualization();
    }

    toggleQueueVisualization(checked) {
        this.queueVisualizationEnabled = checked;
        if (this.queueVisualizationEnabled) {
            // Always go through _buildQueueSnapshots so that build() populates
            // _cycleData / _bySource / _nodeIdToName even when snapshots were
            // restored from a .wavesnap file (where build() was never called).
            this._buildQueueSnapshots()
                .then(() => this.replayToCurrentCycle())
                .catch(e => console.warn('[QueueEngine] Snapshot build failed:', e));
        } else {
            // Clear all queued tokens and overlays
            if (this.graphSvg) {
                this.graphSvg.querySelectorAll('.queued-token, .queue-overlay').forEach(el => el.remove());
            }
            this.queuedTokens.clear();
            this.updateVisualization();
        }
    }

    // Process queue state updates without rendering (for silent replay)
    processInstructionsForQueues(instructions) {
        if (!this.queueVisualizationEnabled) return;

        instructions.forEach(instr => {
            const node = this.nodeMap.get(instr.instructionId);
            if (!node) return;

            const nodeName = this.nodeIdToName.get(instr.instructionId);
            if (!nodeName) return;

            // Pop the head of each input queue when instruction fires
            const shouldPopInputs = this._shouldPopInputTokens(instr);

            if (shouldPopInputs && this.queuedTokens.has(nodeName)) {
                const inputQueues = this.queuedTokens.get(nodeName);
                inputQueues.forEach((queueData, key) => {
                    if (queueData.values && queueData.values.length > 0) {
                        queueData.values.shift();
                        this._redrawQueueSlots(queueData);
                    }
                    if (!queueData.values || queueData.values.length === 0) {
                        inputQueues.delete(key);
                    }
                });
                if (inputQueues.size === 0) this.queuedTokens.delete(nodeName);
            }

            // Produce new tokens at outputs
            const relevantEdges = this.edgesBySource.get(nodeName) || [];
            relevantEdges.forEach(edge => {
                const titleEl = edge.querySelector('title');
                if (!titleEl) return;

                const edgeTitle = titleEl.textContent.trim();
                const labelEl = edge.querySelector('text');
                const edgeLabel = labelEl ? labelEl.textContent.trim() : '';
                const pathEl = edge.querySelector('path');

                if (pathEl && pathEl.getTotalLength) {
                    const L = pathEl.getTotalLength();
                    const pt = pathEl.getPointAtLength(Math.max(0, L - 2));
                    const x = pt.x;
                    const y = pt.y;

                    const resIndex = this._extractResIndexFromEdgeTitle(edgeLabel, nodeName);
                    const val = this._getResValueForIndex(instr, resIndex);

                    if (val !== null && val !== undefined) {
                        const targetMatch = edgeTitle.match(/->\s*([^:\s]+)/);
                        const targetName = targetMatch ? targetMatch[1] : null;
                        let targetInputIdx = null;
                        const opMatch = edgeLabel.match(/op\[(\d+)\]/);
                        if (opMatch) targetInputIdx = parseInt(opMatch[1], 10);
                        if (targetInputIdx === null) targetInputIdx = resIndex;

                        if (targetName) {
                            if (!this.queuedTokens.has(targetName))
                                this.queuedTokens.set(targetName, new Map());
                            const inputQueues = this.queuedTokens.get(targetName);
                            const key = String(targetInputIdx);
                            if (!inputQueues.has(key))
                                inputQueues.set(key, { baseX: x, baseY: y, values: [], elements: [], inputKey: key });
                            const queueData = inputQueues.get(key);
                            queueData.baseX = x;
                            queueData.baseY = y;
                            queueData.values.push(String(val));
                            this._redrawQueueSlots(queueData);
                        }
                    }
                }
            });
        });
    }

    nextCycle() {
        const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
        if (this.currentCycle < maxCycle) {
            this.currentCycle = Math.min(maxCycle, this.currentCycle + this.stepSize);
            this.updateVisualization();
        }
    }

    jumpToCycle() {
        const input = document.getElementById('jumpToCycleInput');
        const targetCycle = parseInt(input.value);
        
        if (isNaN(targetCycle) || targetCycle < 0) {
            // Reset to current cycle if invalid
            input.value = this.currentCycle;
            return;
        }
        
        const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
        const boundedCycle = Math.min(maxCycle, Math.max(0, targetCycle));
        
        this.currentCycle = boundedCycle;

        console.log(`Jumping to cycle ${this.currentCycle}`);
        
        if (this.queueVisualizationEnabled) {
            this.replayToCurrentCycle();
        } else {
            this.updateVisualization();
        }
    }

    updateVisualization() {
        // Update the cycle input field to show current cycle
        const cycleInput = document.getElementById('jumpToCycleInput');
        if (cycleInput) cycleInput.value = this.currentCycle;

        // Update timeline
        const cycleLabel = document.getElementById('timelineCycleLabel');
        if (cycleLabel) cycleLabel.textContent = this.currentCycle;
        this._drawTimelineRuler();
        
        // Clear previous highlights and tokens
        this.clearHighlights();
        
        // Get instructions for current cycle
        const instructions = this.cycleData.get(this.currentCycle) || [];
        
        // Update instruction count
        this.dom.cycleInstrCount.textContent = instructions.length;
        
        // Update execution log
        this.updateExecutionLog(instructions);

        // Update and render memory log
        if (this._memoryLastCycle !== this.currentCycle) {
            // Going forward incrementally
            if (this.currentCycle > this._memoryLastCycle && this._memoryLastCycle >= 0) {
                for (let c = this._memoryLastCycle + 1; c <= this.currentCycle; c++)
                    for (const instr of (this.cycleData.get(c) || [])) this._applyMemoryOp(instr);
            } else {
                // Jumped backward or not yet initialised
                this._buildMemoryStateUpTo(this.currentCycle);
            }
            this._memoryLastCycle = this.currentCycle;
        }
        this._renderMemoryLog(instructions);

        // Highlight active nodes and show tokens
        this.visualizeTokens(instructions);
        
        // Re-apply search highlights if there's an active search
        if (this.searchTerm) {
            this.performSearch(this.searchTerm);
        }

        // Update rolling stats charts
        // Record token-in-flight sample for this cycle before drawing
        const _tokCount = this._countTokensInFlight();
        if (!this._statsTokenHistory.find(e => e.cycle === this.currentCycle))
            this._statsTokenHistory.push({ cycle: this.currentCycle, count: _tokCount });
        // Prune history beyond the last 512 cycles
        const _maxWindow = 512;
        if (this._statsTokenHistory.length > _maxWindow * 2)
            this._statsTokenHistory = this._statsTokenHistory.slice(-_maxWindow);
        this.updateStatsCharts();
    }

    /** Count the total number of queued tokens currently in flight. */
    _countTokensInFlight() {
        let n = 0;
        for (const nodeQueues of this.queuedTokens.values())
            for (const slot of nodeQueues.values())
                n += (slot.values ? slot.values.length : 0);
        return n;
    }

    /** Count memory ops (load/store) in an instruction array. */
    _countMemOps(instructions) {
        return instructions.filter(i => {
            const name = (i.instructionName || '').toLowerCase();
            return name.includes('load') || name.includes('store');
        }).length;
    }

    /**
     * Draw a filled area sparkline onto a canvas.
     * @param {HTMLCanvasElement} canvas
     * @param {number[]} data
     * @param {string} lineColor  Stroke color (any valid CSS color)
     * @param {string} fillColor  Fill color for the area
     */
    _drawSparkline(canvas, data, lineColor, fillColor) {
        const dpr = window.devicePixelRatio || 1;
        const w   = canvas.clientWidth;
        const h   = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        if (data.length < 2) return;
        const max = Math.max(...data, 1);

        // Y-axis: reserve left margin for the peak label
        const labelW = 28;
        const plotW  = w - labelW;
        const step   = plotW / (data.length - 1);
        const plotX  = labelW;

        // Filled area
        ctx.beginPath();
        ctx.moveTo(plotX, h);
        data.forEach((v, i) => ctx.lineTo(plotX + i * step, h - (v / max) * (h - 2)));
        ctx.lineTo(plotX + (data.length - 1) * step, h);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Line
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = plotX + i * step;
            const y = h - (v / max) * (h - 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Thin vertical axis line
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotX, 0);
        ctx.lineTo(plotX, h);
        ctx.stroke();

        // Peak label at top of Y axis
        ctx.font = `500 8px "IBM Plex Mono", monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(String(max), labelW - 4, 2);
    }

    /** Rebuild rolling window data and redraw all three charts. */
    updateStatsCharts() {
        const N = 64;

        const canvasInstr  = document.getElementById('chartInstructions');
        const canvasTokens = document.getElementById('chartTokens');
        const canvasMem    = document.getElementById('chartMemory');
        if (!canvasInstr || !canvasTokens || !canvasMem) return;

        const cur   = this.currentCycle;
        const start = Math.max(0, cur - N + 1);

        const instrData  = [];
        const tokensData = [];
        const memData    = [];

        for (let c = start; c <= cur; c++) {
            const instrs = this.cycleData.get(c) || [];
            instrData.push(instrs.length);
            memData.push(this._countMemOps(instrs));
            const tok = this._statsTokenHistory.find(e => e.cycle === c);
            tokensData.push(tok ? tok.count : 0);
        }

        this._drawSparkline(canvasInstr,  instrData,  'rgb(102, 126, 234)', 'rgba(102, 126, 234, 0.15)');
        this._drawSparkline(canvasMem,    memData,    'rgb(234, 126, 102)', 'rgba(234, 126, 102, 0.15)');

        if (!this.queueVisualizationEnabled) {
            this._drawPlaceholder(canvasTokens, 'Enable Queue Toggle to see data');
        } else {
            this._drawSparkline(canvasTokens, tokensData, 'rgb(82, 196, 169)', 'rgba(82, 196, 169, 0.15)');
        }
    }

    /** Draw a centred placeholder message on a canvas. */
    _drawPlaceholder(canvas, message) {
        const dpr = window.devicePixelRatio || 1;
        const w   = canvas.clientWidth;
        const h   = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        ctx.font = `500 9px "IBM Plex Sans", sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Word-wrap at ~24 chars per line
        const words = message.split(' ');
        const lines = [];
        let line = '';
        for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (test.length > 22 && line) { lines.push(line); line = word; }
            else line = test;
        }
        if (line) lines.push(line);
        const lineH = 12;
        const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
        lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lineH));
    }

    clearHighlights() {
        if (!this.graphSvg) return;
        
        // Remove highlights
        this.graphSvg.querySelectorAll('.highlight-node, .highlight-edge').forEach(el => {
            el.classList.remove('highlight-node', 'highlight-edge');
        });

        // Remove only transient tokens (queued tokens persist)
        this.graphSvg.querySelectorAll('.token').forEach(el => {
            if (!el.classList.contains('queued-token')) {
                el.remove();
            }
        });
    }

    /**
     * Apply store memory side-effects of one instruction to this.memoryState.
     */
    _applyMemoryOp(instr) {
        const name = (instr.instructionName || '').toLowerCase();
        const args = instr.args || [];
        let addr = null, value = null;
        if (name.includes('storeindex')) {
            if (args.length >= 4) { addr = String(args[2]); value = String(args[3]); }
        } else if (name === 'store' || (name.includes('store') && !name.includes('index'))) {
            if (args.length >= 3) { addr = String(args[1]); value = String(args[2]); }
        }
        if (addr !== null && value !== null)
            this.memoryState.set(addr, { value, cycle: instr.cycle });
    }

    /** Rebuild memoryState by replaying all instructions from cycle 0 through targetCycle. */
    _buildMemoryStateUpTo(targetCycle) {
        this.memoryState = new Map();
        for (let c = 0; c <= targetCycle; c++)
            for (const instr of (this.cycleData.get(c) || [])) this._applyMemoryOp(instr);
    }

    /**
     * Render the memory log panel.
     * @param {object[]} currentInstructions  Instructions firing this cycle (for highlights).
     */
    _renderMemoryLog(currentInstructions) {
        const logEl = this.dom.memoryLog;
        if (!logEl) return;
        if (this.memoryState.size === 0) {
            logEl.innerHTML = '';
            return;
        }

        // Collect addresses touched by current cycle's instructions
        const activeAddrs = new Set();
        // Prioritise storeIndex/store over load for conflict within same cycle
        const storeAddrs = new Set();
        for (const instr of currentInstructions) {
            const name = (instr.instructionName || '').toLowerCase();
            const args = instr.args || [];
            let addr = null;
            if (name.includes('storeindex')) {
                if (args.length >= 3) addr = String(args[2]);
            } else if (name.includes('store')) {
                if (args.length >= 2) addr = String(args[1]);
            }
            if (addr !== null) {
                activeAddrs.add(addr);
                storeAddrs.add(addr);
            }
        }

        // Sort addresses numerically where possible, else lexicographically
        const sortedAddrs = Array.from(this.memoryState.keys()).sort((a, b) => {
            const na = Number(a), nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a < b ? -1 : a > b ? 1 : 0;
        });

        let html = '';
        let firstActive = null;
        for (const addr of sortedAddrs) {
            const { value, cycle } = this.memoryState.get(addr);
            const isActive = activeAddrs.has(addr);
            const isStore = storeAddrs.has(addr);
            const cls = isActive
                ? (isStore ? 'memory-log-entry active store' : 'memory-log-entry active load')
                : 'memory-log-entry';
            const id = isActive && !firstActive ? (firstActive = addr, `id="mem-active-first"`) : '';
            html += `<div class="${cls}" ${id}>`
                  + `<span class="mem-addr">${isNaN(Number(addr)) ? addr : '0x' + Number(addr).toString(16).toUpperCase()}</span>`
                  + `<span class="mem-arrow">→</span>`
                  + `<span class="mem-value">${value}</span>`
                  + `<span class="mem-cycle">#${cycle}</span>`
                  + `</div>`;
        }
        logEl.innerHTML = html;

        // Scroll first active address into view
        if (firstActive) {
            const el = logEl.querySelector('#mem-active-first');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
    }

    updateExecutionLog(instructions) {
        const logEl = this.dom.executionLog;
        
        if (instructions.length === 0) {
            logEl.innerHTML = '<div class="execution-log-entry">No instructions in this cycle</div>';
            return;
        }

        // Show current cycle and previous 10 cycles for context
        let html = `<div class="execution-log-entry current">== CYCLE ${this.currentCycle} ==</div>`;
        
        instructions.forEach(instr => {
            html += `<div class="execution-log-entry current">${instr.line}</div>`;
        });

        // Add some previous context
        const contextCycles = 5;
        for (let i = 1; i <= contextCycles; i++) {
            const prevCycle = this.currentCycle - i;
            if (prevCycle >= 0 && this.cycleData.has(prevCycle)) {
                html = `<div class="execution-log-entry">== CYCLE ${prevCycle} ==</div>` +
                       this.cycleData.get(prevCycle).map(instr => 
                           `<div class="execution-log-entry">${instr.line}</div>`
                       ).join('') + html;
            }
        }

        logEl.innerHTML = html;
        
        // Scroll to show current cycle
        const currentEntry = logEl.querySelector('.execution-log-entry.current');
        if (currentEntry) {
            currentEntry.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
    }

    // Main visualization function to highlight active nodes and place tokens
    visualizeTokens(instructions) {
        if (!this.graphSvg) return;
        
        // Use DocumentFragment for efficient batch DOM insertion
        const fragment = document.createDocumentFragment();
        
        instructions.forEach(instr => {
            
            // Highlight the node for this instruction
            const node = this.nodeMap.get(instr.instructionId);
            if (node) {
                const nodeName = this.nodeIdToName.get(instr.instructionId);

                // Only process queues if queue visualization is enabled
                if (this.queueVisualizationEnabled) {
                    const shouldPopInputs = this._shouldPopInputTokens(instr);

                    if (shouldPopInputs && nodeName && this.queuedTokens.has(nodeName)) {
                        const inputQueues = this.queuedTokens.get(nodeName);
                        inputQueues.forEach((queueData, key) => {
                            if (queueData.values && queueData.values.length > 0) {
                                queueData.values.shift();
                                this._redrawQueueSlots(queueData);
                            }
                            if (!queueData.values || queueData.values.length === 0) {
                                inputQueues.delete(key);
                            }
                        });
                        if (inputQueues.size === 0) this.queuedTokens.delete(nodeName);
                    }
                }

                node.classList.add('highlight-node');
                
                // Place tokens at the end of outgoing edges
                let placed = false;
                
                if (nodeName) {
                    // NEW: Use edge lookup map instead of querying all edges
                    const relevantEdges = this.edgesBySource.get(nodeName) || [];
                    
                    relevantEdges.forEach(edge => {
                        const titleEl = edge.querySelector('title');
                        if (!titleEl) return;
                        
                        const edgeTitle = titleEl.textContent.trim();
                        // Get the edge label text which contains res[X]→op[Y]
                        const labelEl = edge.querySelector('text');
                        const edgeLabel = labelEl ? labelEl.textContent.trim() : '';
                        const pathEl = edge.querySelector('path');
                        
                        if (pathEl && pathEl.getTotalLength) {
                            const L = pathEl.getTotalLength();
                            const pt = pathEl.getPointAtLength(Math.max(0, L - 2));
                            const x = pt.x;
                            const y = pt.y;
                            
                            const resIndex = this._extractResIndexFromEdgeTitle(edgeLabel, nodeName);
                            const val = this._getResValueForIndex(instr, resIndex);
                            
                            if (val !== null && val !== undefined) {
                                // Extract target node name and input index from edge title and label
                                const targetMatch = edgeTitle.match(/->\s*([^:\s]+)/);
                                const targetName = targetMatch ? targetMatch[1] : null;
                                // Extract op[Y] from the edge label (which has format res[X]→op[Y])
                                let targetInputIdx = null;
                                const opMatch = edgeLabel.match(/op\[(\d+)\]/);
                                if (opMatch) targetInputIdx = parseInt(opMatch[1], 10);
                                // Fallback: use source output index as guess
                                if (targetInputIdx === null) targetInputIdx = resIndex;

                                if (this.queueVisualizationEnabled && targetName) {
                                    // Enqueue token at target node input (anchored position)
                                    if (!this.queuedTokens.has(targetName)) {
                                        this.queuedTokens.set(targetName, new Map());
                                    }
                                    const inputQueues = this.queuedTokens.get(targetName);
                                    const key = String(targetInputIdx);
                                    
                                    if (!inputQueues.has(key))
                                        inputQueues.set(key, { baseX: x, baseY: y, values: [], elements: [], inputKey: key });
                                    const queueData = inputQueues.get(key);

                                    queueData.baseX = x;
                                    queueData.baseY = y;
                                    queueData.values.push(String(val));
                                    this._redrawQueueSlots(queueData);
                                    placed = true;
                                } else {
                                    // Fallback: transient token at edge endpoint
                                    const gToken = this._createTokenElement(x, y, val);
                                    gToken.classList.add('transient-token');
                                    fragment.appendChild(gToken);
                                    placed = true;
                                }
                            }
                        }
                    });
                }

                // fallback: place token at node center if no outgoing edge or placement failed
                // if (!placed) {
                //     const ellipse = node.querySelector('ellipse, polygon, rect');
                //     if (ellipse) {
                //         const bbox = ellipse.getBBox();
                //         const cx = bbox.x + bbox.width / 2;
                //         const cy = bbox.y + bbox.height / 2;

                //         const val = (instr.args && instr.args.length) ? instr.args[0] : '';
                //         const gToken = this._createTokenElement(cx, cy, val);
                //         gToken.classList.add('transient-token');
                //         fragment.appendChild(gToken);
                //     }
                // }
            } else {
                console.warn(`✗ No node found for instruction ID ${instr.instructionId} (${instr.instructionName})`);
            }

            // Highlight edges connected to this node (pass full instruction for steer logic)
            this.highlightConnectedEdges(instr);
        });
        
        // NEW: Single batch DOM insertion at the end
        const target = (this.contentGroup && this.contentGroup.appendChild) ? this.contentGroup : this.graphSvg;
        target.appendChild(fragment);
    }

    // NEW: Helper method to create token elements
    /**
     * Given a queueData object `{ baseX, baseY, values, elements }`, clear
     * the existing SVG elements and redraw the capped slot view:
     *   ≤ 4 values  →  show all  (tail at top, head at bottom)
     *   > 4 values  →  show tail, tail-1, …, head+1, head  (5 rows)
     * `values[0]` = head (oldest / next to be dequeued)
     * `values[last]` = tail (newest / most recently enqueued)
     */
    _redrawQueueSlots(queueData) {
        // Remove old elements and overlay
        for (const el of queueData.elements) {
            try { el.remove(); } catch (_) {}
        }
        queueData.elements = [];
        if (queueData.overlay) {
            try { queueData.overlay.remove(); } catch (_) {}
            queueData.overlay = null;
        }

        const vals = queueData.values;
        if (!vals || vals.length === 0) return;

        // Build display list (top → bottom = tail → head)
        let slots; // array of { label, isEllipsis }
        const expanded = !!queueData.expanded;
        if (vals.length <= 4 || expanded) {
            slots = [...vals].reverse().map(v => ({ label: String(v), isEllipsis: false }));
        } else {
            slots = [
                { label: String(vals[vals.length - 1]), isEllipsis: false }, // tail
                { label: String(vals[vals.length - 2]), isEllipsis: false }, // tail-1
                { label: '\u2026',                       isEllipsis: true  }, // …
                { label: String(vals[1]),                isEllipsis: false }, // head+1
                { label: String(vals[0]),                isEllipsis: false }, // head
            ];
        }

        const BOX_H     = 18;
        const ELLIPSIS_H = 9;
        const BOX_W      = 52;
        const GAP        = 2;

        // Annotate each slot with its height
        const slotsH = slots.map(s => ({ ...s, h: s.isEllipsis ? ELLIPSIS_H : BOX_H }));

        // Compute total stack height and per-slot center Y positions (stack grows upward)
        const totalH = slotsH.reduce((acc, s) => acc + s.h + GAP, -GAP);
        let cursor = queueData.baseY - totalH; // top edge of topmost slot
        const centerYs = slotsH.map(s => {
            const cy = cursor + s.h / 2;
            cursor += s.h + GAP;
            return cy;
        });

        slotsH.forEach((slot, i) => {
            const el = this._createTokenElement(queueData.baseX, centerYs[i], slot.label, slot.isEllipsis, slot.h);
            el.classList.add('queued-token');
            this.contentGroup.appendChild(el);
            queueData.elements.push(el);
        });

        // Transparent overlay rect for hover/click interaction
        const overlayH = totalH + GAP * 2;
        const overlay  = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        overlay.setAttribute('x',      String(queueData.baseX - BOX_W / 2));
        overlay.setAttribute('y',      String(queueData.baseY - overlayH + GAP));
        overlay.setAttribute('width',  String(BOX_W));
        overlay.setAttribute('height', String(overlayH));
        overlay.setAttribute('fill',   'transparent');
        overlay.setAttribute('stroke', 'none');
        overlay.style.cursor = 'pointer';
        overlay.style.pointerEvents = 'all';
        overlay.classList.add('queue-overlay');
        this.contentGroup.appendChild(overlay);
        queueData.overlay = overlay;

        const count = vals.length;
        const raiseToFront = () => {
            for (const el of queueData.elements) this.contentGroup.appendChild(el);
            this.contentGroup.appendChild(overlay);
        };
        overlay.addEventListener('mouseenter', (e) => {
            raiseToFront();
            this._showQueueTooltip(e, count, queueData.expanded);
        });
        overlay.addEventListener('mousemove', (e) => {
            this._repositionTooltip(e);
        });
        overlay.addEventListener('mouseleave', () => {
            this._hideQueueTooltip();
        });
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideQueueTooltip();
            queueData.expanded = !queueData.expanded;
            this._redrawQueueSlots(queueData);
            // Re-raise after redraw since elements were replaced
            for (const el of queueData.elements) this.contentGroup.appendChild(el);
            if (queueData.overlay) this.contentGroup.appendChild(queueData.overlay);
        });
    }

    _showQueueTooltip(e, count, expanded = false) {
        const tip = document.getElementById('queue-tooltip');
        if (!tip) return;
        const action = (count > 4) ? (expanded ? ' · click to collapse' : ' · click to expand') : '';
        tip.textContent = `${count} item${count !== 1 ? 's' : ''}${action}`;
        tip.style.display = 'block';
        this._repositionTooltip(e);
    }

    _repositionTooltip(e) {
        const tip = document.getElementById('queue-tooltip');
        if (!tip || tip.style.display === 'none') return;
        const OFFSET = 12;
        let left = e.clientX + OFFSET;
        let top  = e.clientY + OFFSET;
        const w = tip.offsetWidth  || 120;
        const h = tip.offsetHeight || 24;
        if (left + w > window.innerWidth  - 8) left = e.clientX - w - OFFSET;
        if (top  + h > window.innerHeight - 8) top  = e.clientY - h - OFFSET;
        tip.style.left = `${left}px`;
        tip.style.top  = `${top}px`;
    }

    _hideQueueTooltip() {
        const tip = document.getElementById('queue-tooltip');
        if (tip) tip.style.display = 'none';
    }

    _initTimeline() {
        const canvas = document.getElementById('timelineCanvas');
        if (!canvas) return;

        // Sync pixel size whenever canvas is resized (HiDPI-aware)
        if (this._timelineResizeObserver) this._timelineResizeObserver.disconnect();
        const syncSize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width  = canvas.offsetWidth  * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            this._drawTimelineRuler();
        };
        this._timelineResizeObserver = new ResizeObserver(syncSize);
        this._timelineResizeObserver.observe(canvas);
        syncSize();

        // Wire drag-to-scrub only once
        if (this._timelineEventsWired) return;
        this._timelineEventsWired = true;

        let dragging = false;
        const seekTo = (clientX) => {
            if (this._timelineDisabled || !this.cycleData) return;
            const rect = canvas.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
            this.currentCycle = Math.round(ratio * maxCycle);
            if (this.queueVisualizationEnabled) {
                this.replayToCurrentCycle();
            } else {
                this.updateVisualization();
            }
        };

        canvas.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); seekTo(e.clientX); });
        document.addEventListener('mousemove', (e) => { if (dragging) seekTo(e.clientX); });
        document.addEventListener('mouseup',   () => { dragging = false; });
    }

    _drawTimelineRuler() {
        const canvas = document.getElementById('timelineCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        if (!W || !H) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const maxCycle = (this.cycleData && this.cycleData.size)
            ? Math.max(0, ...Array.from(this.cycleData.keys()))
            : 0;

        // Background
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.fillRect(0, 0, W, H);

        // Subtle bottom-edge band
        const botGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
        botGrad.addColorStop(0, 'rgba(102,126,234,0)');
        botGrad.addColorStop(1, 'rgba(102,126,234,0.04)');
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, 0, W, H);

        if (maxCycle === 0) { this._drawPlayhead(ctx, 0, W, H, 0); return; }

        // Choose tick intervals so major labels are at least ~55px apart
        const pxPerCycle = W / maxCycle;
        const candidates = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000];
        let majorIv = candidates[candidates.length - 1];
        for (const c of candidates) {
            if (c * pxPerCycle >= 55) { majorIv = c; break; }
        }
        const minorIv = majorIv <= 1 ? 1 : majorIv / 5;

        // Minor ticks
        ctx.strokeStyle = 'rgba(102,126,234,0.15)';
        ctx.lineWidth = 1;
        for (let c = 0; c <= maxCycle; c += minorIv) {
            const x = Math.round((c / maxCycle) * W) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, H - 6); ctx.lineTo(x, H); ctx.stroke();
        }

        // Major ticks + labels
        ctx.font = "600 9px 'IBM Plex Mono', monospace";
        ctx.textBaseline = 'middle';
        for (let c = 0; c <= maxCycle; c += majorIv) {
            const x = Math.round((c / maxCycle) * W) + 0.5;
            ctx.strokeStyle = 'rgba(102,126,234,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, H / 2); ctx.lineTo(x, H); ctx.stroke();
            ctx.fillStyle = 'rgba(102,126,234,0.65)';
            ctx.textAlign = c === 0 ? 'left' : 'center';
            ctx.fillText(String(c), c === 0 ? x + 2 : x, H / 2 - 5);
        }

        this._drawPlayhead(ctx, this.currentCycle, W, H, maxCycle);
    }

    _drawPlayhead(ctx, cycle, W, H, maxCycle) {
        const x = maxCycle > 0 ? Math.round((cycle / maxCycle) * W) : 0;
        // Filled progress track
        ctx.fillStyle = 'rgba(102,126,234,0.08)';
        ctx.fillRect(0, 0, x, H);
        // Glow line
        ctx.save();
        ctx.shadowColor = 'rgba(102,126,234,0.4)';
        ctx.shadowBlur  = 4;
        ctx.strokeStyle = 'rgba(102,126,234,0.9)';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
        ctx.restore();
        // Triangle handle at top
        ctx.fillStyle = 'rgba(102,126,234,0.9)';
        ctx.beginPath();
        ctx.moveTo(x - 5, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x,     8);
        ctx.closePath();
        ctx.fill();
    }

    _createTokenElement(x, y, value, isEllipsis = false, boxH = 18) {
        const BOX_W = 52;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${x}, ${y})`);
        g.classList.add('token');
        if (isEllipsis) g.classList.add('token-ellipsis');

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x',      String(-BOX_W / 2));
        rect.setAttribute('y',      String(-boxH / 2));
        rect.setAttribute('width',  String(BOX_W));
        rect.setAttribute('height', String(boxH));
        rect.setAttribute('rx',     '3');
        rect.classList.add('token-box');
        g.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = String(value);
        text.setAttribute('class', 'token-text');
        text.setAttribute('x', '0');
        text.setAttribute('y', isEllipsis ? '-2' : '0');
        g.appendChild(text);

        return g;
    }

    highlightConnectedEdges(instrOrId) {
        if (!this.graphSvg) return;

        // Support being passed either an instruction object or an instructionId
        const instr = (typeof instrOrId === 'object' && instrOrId !== null) ? instrOrId : null;
        const instructionId = instr ? instr.instructionId : instrOrId;

        const nodeName = this.nodeIdToName.get(instructionId);
        if (!nodeName) return;

        // Use edge lookup map instead of querying all edges
        const relevantEdges = this.edgesBySource.get(nodeName) || [];

        relevantEdges.forEach(edge => {
            const titleEl = edge.querySelector('title');
            if (!titleEl) return;
            const edgeTitle = titleEl.textContent.trim();
            const labelEl = edge.querySelector('text');
            const edgeLabel = labelEl ? labelEl.textContent.trim() : '';

            // Only consider outgoing edges from this node
            if (!edgeTitle.startsWith(nodeName + '->')) return;

            // If we don't have the full instruction, default to previous behavior
            if (!instr) {
                edge.classList.add('highlight-edge');
                return;
            }

            const name = instr.instructionName ? instr.instructionName.toLowerCase() : '';

            // For steer instructions, highlight only if this edge corresponds to a non-null res value
            if (name.includes('steer')) {
                const resIndex = this._extractResIndexFromEdgeTitle(edgeLabel, nodeName);
                const val = this._getResValueForIndex(instr, resIndex);
                if (val !== null && val !== undefined) {
                    edge.classList.add('highlight-edge');
                } else {
                    edge.classList.remove('highlight-edge');
                }
            } else {
                // Non-steer: highlight as before
                edge.classList.add('highlight-edge');
            }
        });
    }

    // Check if input tokens should be popped for this instruction
    // For stream instructions, only pop when last_flag is true
    _shouldPopInputTokens(instr) {
        if (!instr || !instr.instructionName) return true;
        
        const name = instr.instructionName.toLowerCase();
        const args = instr.args || [];
        
        // For stream instructions, only pop inputs when last_flag (args[0]) is 'true'
        if (name.includes('stream')) {
            const lastFlag = args[0];
            return lastFlag === 'true';
        }
        
        // For all other instructions, pop inputs normally
        return true;
    }

    // Try to extract res index from an edge title. Edge titles vary; attempt several patterns.
    _extractResIndexFromEdgeTitle(edgeTitle, nodeName) {
        // Robust extraction of res index from edge title.
        // Preferred pattern: res[<i>]→op[<j>]  (arrow may be Unicode → or ASCII ->)
        // Fallbacks: nodeName:res<i>, :res<i>, res<i>, or op[<j>] alone.
        if (!edgeTitle || typeof edgeTitle !== 'string') return 0;

        // Primary: res[<i>] → op[<j>]
        let m = edgeTitle.match(/res\[(\d+)\]\s*(?:→|->)\s*op\[(\d+)\]/);
        if (m) return parseInt(m[1], 10);

        // Try nodeName:res<k> or nodeName:res[<k>]
        try {
            const nodeRegex = new RegExp(nodeName.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&') + '\\s*[:\\)]\\s*res\[?(\\d+)\]?');
            m = edgeTitle.match(nodeRegex);
            if (m) return parseInt(m[1], 10);
        } catch (e) {
            // If nodeName contains regex-significant chars, skip this specific check
        }

        // Generic res[...] or :res<number> or res<number>
        m = edgeTitle.match(/:?\s*res\[?(\d+)\]?/);
        if (m) return parseInt(m[1], 10);

        // If only op[<j>] is present, use op index as a heuristic for res index
        m = edgeTitle.match(/op\[(\d+)\]/);
        if (m) return parseInt(m[1], 10);

        // As a last resort, default to 0
        return 0;
    }

    // Given a parsed fire.log instruction entry and a res index, return the value for that res index.
    _getResValueForIndex(instr, resIndex) {
        if (!instr || !instr.instructionName) return null;
        const name = instr.instructionName.toLowerCase();
        const args = instr.args || [];

        // Helper: safe index
        const at = (i) => (i >= 0 && i < args.length) ? args[i] : null;

        // Carry / riptide special cases: some lines encode state transitions as first arg
        if (name.includes('carry')) {
            // Examples: "INIT->BLOCK 123" or "BLOCK->INIT"
            if (args.length === 0) return null;
            if (typeof args[0] === 'string' && args[0].includes('->')) {
                // If transition label present and followed by a value, value is likely next arg
                if (args.length >= 2 && !isNaN(Number(args[1]))) {
                    // these logs use args[1] as res[0]
                    return resIndex === 0 ? args[1] : null;
                }
                // BLOCK->INIT has no data output
                return null;
            }
        }

        // Stream instructions (e.g., riptide.stream): often produce multiple outputs
        // Fire log format: last_flag start bound step offset
        // res[0] = start + offset (loop value)
        // res[1] = last_flag
        if (name.includes('stream')) {
            if (!args || args.length < 5) return null;

            const lastFlag = args[0];
            // If this is the final element in the stream, only emit the 'false' decider token
            // and suppress any idx (res[0]) tokens.
            if (lastFlag === 'true') {
                if (resIndex === 1) {
                    return 'false';
                }
                return null;
            }

            // Normal behavior for non-last elements
            if (resIndex === 0) {
                // res[0] = start + offset
                const start = Number(args[1]);
                const offset = Number(args[4]);
                return isNaN(start) || isNaN(offset) ? null : start + offset;
            } else if (resIndex === 1) {
                // res[1] = last_flag but reversed (keeps previous behavior for non-last)
                return lastFlag === 'true' ? 'false' : 'true';
            }
            return null;
        }

        // Binary arithmetic and comparisons: op0 op1 res0
        if (/(add|sub|mul|div|rem|and_|or_|xor|shl|ashr|lshr|^add$|and$|or$|xor$|shl$|ashr$|lshr$|eq$|ne$|lt$|gt$|le$|ge$)/.test(name)) {
            return resIndex === 0 ? at(2) : null;
        }

        // Bitwise and similar use same format
        if (/(and|or|xor|shl|ashr|lshr)/.test(name)) {
            return resIndex === 0 ? at(2) : null;
        }

        // Type conversions: op0 res0
        if (/(extsi|extui|trunci|fptoui|fptosi|sitofp|uitofp|abs|neg)/.test(name)) {
            return resIndex === 0 ? at(1) : null;
        }

        // Constants / passthrough: res0 only
        if (/(constant|c0|copy|dataflow\.constant|dataflow.copy|bitcast|freeze)/.test(name)) {
            return resIndex === 0 ? at(0) : null;
        }

        // Steer instructions
        if (name.includes('steer')) {
            if ((name.includes('true') || name.includes('false')) && args.length >= 3) {
                // true/false steer (1-output): args: decider, data, condition_met
                const fired = String(at(2)).toLowerCase() !== 'false';
                return (resIndex === 0 && fired) ? at(1) : null;
            } else if (args.length >= 3) {
                // dataflow.steer: args: decider, data, channel_output
                const channel = Number(at(2));
                const data = at(1);
                return (resIndex === channel) ? data : null;
            }
        }

        // LoadIndex: op0 op1 computed_addr res0_loaded_data (res0 at index 3)
        if (name.includes('loadindex') || name.includes('loadindex')) {
            return resIndex === 0 ? at(3) : null;
        }
        // Load: op0 ? res0 at index 2
        if (name === 'load' || name.includes('load')) {
            return resIndex === 0 ? at(2) : null;
        }

        // Store / storeIndex generally don't emit data tokens (res=1 status), skip
        if (name.includes('store')) {
            return null;
        }

        // Send: no res
        if (name.includes('send')) return null;

        // Stream / riptide.merge etc. handle some patterns
        if (name.includes('merge') && args.length >= 1) {
            return resIndex === 0 ? at(0) : null;
        }

        // Default: if last arg corresponds to res0 in many patterns
        if (resIndex === 0 && args.length) {
            return at(args.length - 1);
        }

        return null;
    }

    setupZoom() {
        // Setup D3 zoom behavior for pan and zoom
        const container = d3.select('#graph-container');
        const svg = d3.select(this.graphSvg);
        
        // Create a group element to hold all graph content
        const g = svg.select('g');
        
        // If there's no root group, create one and move all content into it
        if (g.empty()) {
            const allContent = svg.selectAll('*').remove();
            const graphGroup = svg.append('g').attr('class', 'zoom-group');
            allContent.each(function() {
                graphGroup.node().appendChild(this);
            });
        }
        
        const zoomGroup = svg.select('g');

        // store a reference to the content group so tokens can be appended into it
        this.contentGroup = zoomGroup.node();
        
        // Define zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 5]) // Min and max zoom levels
            .on('zoom', (event) => {
                this.currentTransform = event.transform;
                zoomGroup.attr('transform', event.transform);
            });
        
        // Apply zoom to the container (not the SVG directly)
        container.call(this.zoom);
        
        // Set initial zoom to fit the content
        this.fitToView();
    }

    fitToView() {
        // Fit the graph to the viewport
        if (!this.graphSvg || !this.zoom) return;
        
        const container = document.getElementById('graph-container');
        const svg = this.graphSvg;
        const g = svg.querySelector('g');
        
        if (!g) return;
        
        try {
            const bounds = g.getBBox();
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            
            if (bounds.width === 0 || bounds.height === 0) return;
            
            // Calculate scale to fit with some padding
            // Use slightly smaller padding and apply a small initial zoom-in factor
            const padding = 100;
            const rawScale = Math.min(
                (containerWidth - padding * 2) / bounds.width,
                (containerHeight - padding * 2) / bounds.height
            );
            // Apply an initial zoom-in multiplier to make the graph larger on first render
            const maxScale = (this.zoom && this.zoom.scaleExtent) ? this.zoom.scaleExtent()[1] : 5;
            let scale = rawScale * 9;
            if (!isFinite(scale) || scale <= 0) scale = 1;
            scale = Math.min(scale, maxScale);
            
            // Calculate centering translation
            let tx = (containerWidth - bounds.width * scale) / 2 - bounds.x * scale;
            let ty = (containerHeight - bounds.height * scale) / 2 - bounds.y * scale;

            // Small manual offset to shift graph right and down to avoid clipping
            const offsetX = 400; // pixels to move right
            const offsetY = 700; // pixels to move down
            tx += offsetX;
            ty += offsetY;
            
            // Apply the transform
            const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
            // Smooth transition to the fitted transform
            d3.select('#graph-container').transition().duration(450).call(this.zoom.transform, transform);
        } catch (error) {
            console.warn('Could not fit graph to view:', error);
        }
    }

    zoomIn() {
        if (!this.zoom) return;
        const container = d3.select('#graph-container');
        container.transition().duration(300).call(this.zoom.scaleBy, 1.3);
    }

    zoomOut() {
        if (!this.zoom) return;
        const container = d3.select('#graph-container');
        container.transition().duration(300).call(this.zoom.scaleBy, 0.7);
    }

    resetZoom() {
        this.fitToView();
    }

    toggleFileMenu() {
        this.dom.fileDropdown?.classList.toggle('show');
    }

    toggleSidebar() {
        this.dom.sidebarLeft?.classList.toggle('collapsed');
        this.dom.visualization?.classList.toggle('sidebar-open');
    }

    toggleStatsPanel() {
        const panel = document.getElementById('sidebarRight');
        const viz   = this.dom.visualization;
        panel?.classList.toggle('collapsed');
        viz?.classList.toggle('stats-open');
        if (panel && !panel.classList.contains('collapsed')) {
            // Redraw charts now that panel is visible again
            this.updateStatsCharts();
        }
    }

    reuploadDot() {
        this.dom.fileDropdown?.classList.remove('show');
        document.getElementById('reuploadDotFile')?.click();
    }

    reuploadFireLog() {
        this.dom.fileDropdown?.classList.remove('show');
        document.getElementById('reuploadFireLogFile')?.click();
    }

    // Search functionality with debouncing
    handleSearchInput(value) {
        const searchClearBtn = document.getElementById('searchClearBtn');
        
        // Show/hide clear button
        if (value.trim()) {
            searchClearBtn?.classList.add('show');
        } else {
            searchClearBtn?.classList.remove('show');
        }
        
        // Clear existing debounce timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        // Set new debounce timer (300ms delay)
        this.searchDebounceTimer = setTimeout(() => {
            this.performSearch(value.trim());
        }, 300);
    }

    performSearch(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
        
        // Clear all previous highlights
        this.clearSearchHighlights();
        
        // If search is empty, just return
        if (!searchTerm) {
            return;
        }
        
        if (!this.graphSvg) {
            return;
        }
        
        // Search through nodes (instructions)
        this.nodeMap.forEach((node, instructionId) => {
            const nodeName = this.nodeIdToName.get(instructionId) || '';
            const textElements = node.querySelectorAll('text, tspan');
            let matchFound = false;
            
            // Check node name
            if (nodeName.toLowerCase().includes(this.searchTerm)) {
                matchFound = true;
            }
            
            // Check all text content in the node
            textElements.forEach(textEl => {
                const text = textEl.textContent.trim().toLowerCase();
                if (text.includes(this.searchTerm)) {
                    matchFound = true;
                }
            });
            
            // Highlight matching nodes
            if (matchFound) {
                node.classList.add('search-highlight-node');
            }
        });
        
        // Search through visible tokens
        const tokens = this.graphSvg.querySelectorAll('.token, .queued-token, .transient-token');
        tokens.forEach(token => {
            const tokenText = token.querySelector('.token-text');
            if (tokenText) {
                const text = tokenText.textContent.trim().toLowerCase();
                if (text.includes(this.searchTerm)) {
                    token.classList.add('search-highlight-token');
                }
            }
        });
    }

    clearSearchHighlights() {
        if (!this.graphSvg) return;
        
        // Remove all search highlight classes
        this.graphSvg.querySelectorAll('.search-highlight-node').forEach(el => {
            el.classList.remove('search-highlight-node');
        });
        
        this.graphSvg.querySelectorAll('.search-highlight-token').forEach(el => {
            el.classList.remove('search-highlight-token');
        });
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.visualizer = new DataflowVisualizer();
    
    // Wire up modal close button
    document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('loadingMessage');
        if (modal) modal.style.display = 'none';
    });

    // Wire up example list items
    document.getElementById('exampleList')?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-example]');
        if (item) window.visualizer.loadExampleFiles(item.dataset.example);
    });
});

// Attach drag & drop handlers for the centered upload modal
document.addEventListener('DOMContentLoaded', () => {
    const dotDrop = document.getElementById('dotDrop');
    const fireDrop = document.getElementById('fireDrop');
    const dotInput = document.getElementById('dotFile');
    const fireInput = document.getElementById('fireLog');
    const dotStatus = document.getElementById('dotStatus');
    const fireStatus = document.getElementById('fireLogStatus');

    if (!dotDrop || !fireDrop || !dotInput || !fireInput) return;

    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

    function makeDrop(zone, inputEl, statusEl, handlerName) {
        ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => { prevent(e); zone.classList.add('dragover'); }));
        ['dragleave', 'dragexit', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { prevent(e); if (ev !== 'drop') zone.classList.remove('dragover'); }));

        zone.addEventListener('drop', (e) => {
            prevent(e);
            zone.classList.remove('dragover');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) {
                // Call the visualizer file handler with a synthetic event
                try {
                    if (window.visualizer && typeof window.visualizer[handlerName] === 'function') {
                        window.visualizer[handlerName]({ target: { files: [file] } });
                    }
                } catch (err) {
                    console.error('Drop handler error:', err);
                }

                // Update visible status
                if (statusEl) statusEl.textContent = `✓ Loaded: ${file.name}`;
            }
        });

        // Click to open file picker
        zone.addEventListener('click', () => inputEl.click());
        // When input changes via picker, update status (the visualizer handler will be called by its own input listener)
        inputEl.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f && statusEl) statusEl.textContent = `✓ Loaded: ${f.name}`;
        });
    }

    makeDrop(dotDrop, dotInput, dotStatus, 'handleDotFile');
    makeDrop(fireDrop, fireInput, fireStatus, 'handleFireLog');

    // Optional wavesnap drop zone in the upload modal
    const wavesnapDrop  = document.getElementById('wavesnapDrop');
    const wavesnapInput = document.getElementById('wavesnapFile');
    const wavesnapStatus = document.getElementById('wavesnapStatus');
    if (wavesnapDrop && wavesnapInput) {
        ['dragenter', 'dragover'].forEach(ev =>
            wavesnapDrop.addEventListener(ev, (e) => { prevent(e); wavesnapDrop.classList.add('dragover'); }));
        ['dragleave', 'dragexit', 'drop'].forEach(ev =>
            wavesnapDrop.addEventListener(ev, (e) => { prevent(e); if (ev !== 'drop') wavesnapDrop.classList.remove('dragover'); }));
        wavesnapDrop.addEventListener('drop', (e) => {
            prevent(e);
            wavesnapDrop.classList.remove('dragover');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (file && window.visualizer) {
                window.visualizer._handleUploadModalWavesnap({ target: { files: [file] }, value: '' });
            }
        });
        wavesnapDrop.addEventListener('click', () => wavesnapInput.click());
        wavesnapInput.addEventListener('change', (e) => {
            if (window.visualizer) window.visualizer._handleUploadModalWavesnap(e);
        });
    }
});

