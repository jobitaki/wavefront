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
        this.edgesBySource = new Map(); // NEW: for fast edge lookup by source node
        this.zoom = null; // D3 zoom behavior
        this.currentTransform = d3.zoomIdentity; // Current zoom/pan transform
        
        // Cache DOM elements for performance
        this.dom = {};
        this.cacheDOMElements();
        
        this.initializeEventListeners();
    }

    cacheDOMElements() {
        // Cache frequently accessed DOM elements
        this.dom.graphContainer = document.getElementById('graph-container');
        this.dom.executionLog = document.getElementById('executionLog');
        this.dom.currentCycle = document.getElementById('currentCycle');
        this.dom.cycleInstrCount = document.getElementById('cycleInstrCount');
        this.dom.playBtn = document.getElementById('playBtn');
        this.dom.pauseBtn = document.getElementById('pauseBtn');
        this.dom.prevBtn = document.getElementById('prevBtn');
        this.dom.nextBtn = document.getElementById('nextBtn');
        this.dom.resetBtn = document.getElementById('resetBtn');
        this.dom.speedValue = document.getElementById('speedValue');
        this.dom.playbackControls = document.getElementById('playbackControls');
        this.dom.stats = document.getElementById('stats');
        this.dom.totalCycles = document.getElementById('totalCycles');
        this.dom.totalNodes = document.getElementById('totalNodes');
    }

    initializeEventListeners() {
        // File upload listeners
        document.getElementById('dotFile').addEventListener('change', (e) => this.handleDotFile(e));
        document.getElementById('fireLog').addEventListener('change', (e) => this.handleFireLog(e));

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

    async handleDotFile(event) {
        const file = event.target.files[0];
        if (!file) return;

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

        const statusEl = document.getElementById('fireLogStatus');
        try {
            const content = await this.readFile(file);
            this.parseFireLog(content);
            statusEl.textContent = `✓ Loaded: ${file.name} (${this.fireLogData.length} entries)`;
            statusEl.className = 'file-status success';
            
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

    parseFireLog(content) {
        // Parse fire.log format: [cycle] (instruction_id) instruction_name [args...]
        // Note: Arguments are split on whitespace. If arguments contain spaces,
        // they will be split into multiple elements. This matches the fire.log format.
        const lines = content.trim().split('\n');
        this.fireLogData = [];
        this.cycleData.clear();

        const fireLogRegex = /^\[(\d+)\]\s+\((\d+)\)\s+(\S+)(.*)$/;

        lines.forEach((line, index) => {
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
        });


    }

    async checkAndRenderGraph() {
        if (this.dotContent && this.fireLogData.length > 0) {
            await this.renderGraph();
            this.enableControls();
            this.updateStats();
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

            // Show zoom controls now that the graph is rendered
            const zoomControls = document.querySelector('.zoom-controls');
            if (zoomControls) zoomControls.classList.add('visible');

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
        this.edgesBySource.clear(); // Clear the existing map for rebuild

        if (!this.graphSvg) return;

        const edges = this.graphSvg.querySelectorAll('g.edge');
        edges.forEach((edge, index) => {
            const titleEl = edge.querySelector('title');
            if (titleEl) {
                const edgeId = titleEl.textContent;
                this.edgeMap.set(edgeId, edge);
                this.edgeMap.set(index, edge); // Also store by index for fallback
                
                // NEW: Extract source node name and index edge by source
                const match = edgeId.match(/^([^-:>\s]+)/);
                if (match) {
                    const sourceName = match[1];
                    if (!this.edgesBySource.has(sourceName)) {
                        this.edgesBySource.set(sourceName, []);
                    }
                    this.edgesBySource.get(sourceName).push(edge);
                }
            }
        });

        console.log(`Built edge map with ${this.edgeMap.size} edges`);
    }

    enableControls() {
        this.dom.playbackControls.style.display = 'flex';
        this.dom.executionLog.style.display = 'block';
        this.dom.stats.style.display = 'flex';
        
        this.dom.playBtn.disabled = false;
        this.dom.prevBtn.disabled = false;
        this.dom.nextBtn.disabled = false;
        this.dom.resetBtn.disabled = false;
        
        this.reset();
    }

    updateStats() {
        const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
        this.dom.totalCycles.textContent = maxCycle;
        this.dom.totalNodes.textContent = this.nodeMap.size;
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
        this.updateVisualization();
    }

    previousCycle() {
        if (this.currentCycle > 0) {
            this.currentCycle--;
            this.updateVisualization();
        }
    }

    nextCycle() {
        const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
        if (this.currentCycle < maxCycle) {
            this.currentCycle++;
            this.updateVisualization();
        }
    }

    updateVisualization() {
        this.dom.currentCycle.textContent = this.currentCycle;
        
        // Clear previous highlights and tokens
        this.clearHighlights();
        
        // Get instructions for current cycle
        const instructions = this.cycleData.get(this.currentCycle) || [];
        
        // Update instruction count
        this.dom.cycleInstrCount.textContent = instructions.length;
        
        // Update execution log
        this.updateExecutionLog(instructions);
        
        // Highlight active nodes and show tokens
        this.visualizeTokens(instructions);
    }

    clearHighlights() {
        if (!this.graphSvg) return;
        
        // Batch class removal for better performance
        this.graphSvg.querySelectorAll('.highlight-node, .highlight-edge, .token')
            .forEach(el => {
                if (el.classList.contains('token')) {
                    el.remove();
                } else {
                    // Remove highlight classes efficiently
                    el.classList.remove('highlight-node', 'highlight-edge');
                }
            });
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

    visualizeTokens(instructions) {
        if (!this.graphSvg) return;
        
        // Use DocumentFragment for efficient batch DOM insertion
        const fragment = document.createDocumentFragment();
        
        instructions.forEach(instr => {
            
            // Highlight the node for this instruction
            const node = this.nodeMap.get(instr.instructionId);
            if (node) {
                node.classList.add('highlight-node');
                
                // Place tokens at the end of outgoing edges
                const nodeName = this.nodeIdToName.get(instr.instructionId);
                let placed = false;
                
                if (nodeName) {
                    // NEW: Use edge lookup map instead of querying all edges
                    const relevantEdges = this.edgesBySource.get(nodeName) || [];
                    
                    relevantEdges.forEach(edge => {
                        const titleEl = edge.querySelector('title');
                        if (!titleEl) return;
                        
                        const edgeTitle = titleEl.textContent.trim();
                        const pathEl = edge.querySelector('path');
                        
                        if (pathEl && pathEl.getTotalLength) {
                            const L = pathEl.getTotalLength();
                            const pt = pathEl.getPointAtLength(Math.max(0, L - 2));
                            const x = pt.x;
                            const y = pt.y;
                            
                            const resIndex = this._extractResIndexFromEdgeTitle(edgeTitle, nodeName);
                            const val = this._getResValueForIndex(instr, resIndex);
                            
                            if (val !== null && val !== undefined) {
                                // Create token element and add to fragment
                                const gToken = this._createTokenElement(x, y, val);
                                fragment.appendChild(gToken);
                                placed = true;
                            }
                        }
                    });
                }

                // fallback: place token at node center if no outgoing edge or placement failed
                if (!placed) {
                    const ellipse = node.querySelector('ellipse, polygon, rect');
                    if (ellipse) {
                        const bbox = ellipse.getBBox();
                        const cx = bbox.x + bbox.width / 2;
                        const cy = bbox.y + bbox.height / 2;

                        const val = (instr.args && instr.args.length) ? instr.args[0] : '';
                        const gToken = this._createTokenElement(cx, cy, val);
                        fragment.appendChild(gToken);
                    }
                }
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
    _createTokenElement(x, y, value) {
        const gToken = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gToken.setAttribute('transform', `translate(${x}, ${y})`);
        gToken.classList.add('token');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', '10');
        circle.classList.add('token-circle');
        gToken.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = String(value);
        text.setAttribute('class', 'token-text');
        text.setAttribute('x', '0');
        text.setAttribute('y', '0');
        gToken.appendChild(text);

        return gToken;
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
                const resIndex = this._extractResIndexFromEdgeTitle(edgeTitle, nodeName);
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
        // Typical outputs: res[0] = data value, res[1] = predicate/flag
        if (name.includes('stream')) {
            if (!args || args.length === 0) return null;
            const v = at(resIndex);
            return v !== null ? v : null;
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
            // dataflow.steer: args: decider, data, channel_output
            if (name.includes('dataflow.steer') && args.length >= 3) {
                const channel = Number(at(2));
                const data = at(1);
                return (resIndex === channel) ? data : null;
            } else if (args.length >= 3) {
                // true/false steer (1-output): args: decider, data, condition_met
                const fired = String(at(2)) !== '0' && String(at(2)).toLowerCase() !== 'false';
                return (resIndex === 0 && fired) ? at(1) : null;
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
            let scale = rawScale * 4;
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
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.visualizer = new DataflowVisualizer();

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
});

