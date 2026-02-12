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
        this.edgeMap = new Map(); // Map edge identifier to edge element
        
        this.initializeEventListeners();
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
            document.getElementById('speedValue').textContent = `${this.playbackSpeed}x`;
            if (this.isPlaying) {
                this.pause();
                this.play();
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

        console.log(`Parsed ${this.fireLogData.length} fire.log entries across ${this.cycleData.size} cycles`);
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

        loadingMsg.textContent = 'Rendering graph...';

        try {
            // Use @hpcc-js/wasm to render the DOT graph
            const graphviz = await window["@hpcc-js/wasm"].Graphviz.load();
            const svgString = graphviz.dot(this.dotContent);
            
            // Insert the SVG into the container
            container.innerHTML = svgString;
            loadingMsg.style.display = 'none';

            // Get the actual SVG element that was created
            this.graphSvg = container.querySelector('svg');
            if (this.graphSvg) {
                this.graphSvg.id = 'graph-svg';
                this.graphSvg.style.width = '100%';
                this.graphSvg.style.height = 'auto';
                
                // Build node and edge maps for faster lookup
                this.buildNodeMap();
                this.buildEdgeMap();
            }

            console.log('Graph rendered successfully');
        } catch (error) {
            console.error('Error rendering graph:', error);
            loadingMsg.textContent = `Error rendering graph: ${error.message}`;
            loadingMsg.className = 'loading error';
        }
    }

    buildNodeMap() {
        // Find all nodes in the SVG and map them by their instruction ID
        // DOT format typically includes [ID:X] in the label
        this.nodeMap.clear();

        if (!this.graphSvg) return;

        const nodes = this.graphSvg.querySelectorAll('g.node');
        nodes.forEach(node => {
            const titleEl = node.querySelector('title');
            if (titleEl) {
                const titleText = titleEl.textContent;
                // Try to extract ID from the title or label
                const textEl = node.querySelector('text');
                if (textEl) {
                    const labelText = textEl.textContent;
                    // Look for [ID:X] pattern in the label
                    const idMatch = labelText.match(/\[ID:(\d+)\]/);
                    if (idMatch) {
                        const id = parseInt(idMatch[1]);
                        this.nodeMap.set(id, node);
                    }
                }
            }
        });

        console.log(`Built node map with ${this.nodeMap.size} nodes`);
    }

    buildEdgeMap() {
        // Find all edges in the SVG
        this.edgeMap.clear();

        if (!this.graphSvg) return;

        const edges = this.graphSvg.querySelectorAll('g.edge');
        edges.forEach((edge, index) => {
            const titleEl = edge.querySelector('title');
            if (titleEl) {
                const edgeId = titleEl.textContent;
                this.edgeMap.set(edgeId, edge);
                this.edgeMap.set(index, edge); // Also store by index for fallback
            }
        });

        console.log(`Built edge map with ${this.edgeMap.size} edges`);
    }

    enableControls() {
        document.getElementById('playbackControls').style.display = 'flex';
        document.getElementById('executionLog').style.display = 'block';
        document.getElementById('stats').style.display = 'flex';
        
        document.getElementById('playBtn').disabled = false;
        document.getElementById('prevBtn').disabled = false;
        document.getElementById('nextBtn').disabled = false;
        document.getElementById('resetBtn').disabled = false;
        
        this.reset();
    }

    updateStats() {
        const maxCycle = Math.max(...Array.from(this.cycleData.keys()));
        document.getElementById('totalCycles').textContent = maxCycle;
        document.getElementById('totalInstructions').textContent = this.fireLogData.length;
        document.getElementById('totalNodes').textContent = this.nodeMap.size;
    }

    play() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        document.getElementById('playBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;

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
        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        
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
        document.getElementById('currentCycle').textContent = this.currentCycle;
        
        // Clear previous highlights and tokens
        this.clearHighlights();
        
        // Get instructions for current cycle
        const instructions = this.cycleData.get(this.currentCycle) || [];
        
        // Update instruction count
        document.getElementById('cycleInstrCount').textContent = instructions.length;
        
        // Update execution log
        this.updateExecutionLog(instructions);
        
        // Highlight active nodes and show tokens
        this.visualizeTokens(instructions);
    }

    clearHighlights() {
        // Remove all highlight classes and tokens
        if (!this.graphSvg) return;

        this.graphSvg.querySelectorAll('.highlight-node').forEach(el => {
            el.classList.remove('highlight-node');
        });

        this.graphSvg.querySelectorAll('.highlight-edge').forEach(el => {
            el.classList.remove('highlight-edge');
        });

        this.graphSvg.querySelectorAll('.token').forEach(el => {
            el.remove();
        });
    }

    updateExecutionLog(instructions) {
        const logEl = document.getElementById('executionLog');
        
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
            currentEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    visualizeTokens(instructions) {
        if (!this.graphSvg) return;

        instructions.forEach(instr => {
            // Highlight the node for this instruction
            const node = this.nodeMap.get(instr.instructionId);
            if (node) {
                // Highlight the entire node group
                node.classList.add('highlight-node');
                
                // Add a token (animated circle) to show execution
                const ellipse = node.querySelector('ellipse, polygon, rect');
                if (ellipse) {
                    const bbox = ellipse.getBBox();
                    const cx = bbox.x + bbox.width / 2;
                    const cy = bbox.y + bbox.height / 2;
                    
                    const token = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    token.setAttribute('cx', cx);
                    token.setAttribute('cy', cy);
                    token.setAttribute('r', '8');
                    token.classList.add('token');
                    
                    this.graphSvg.appendChild(token);
                }
            }

            // Try to highlight edges connected to this node
            // This is a simplification - in a full implementation, we'd parse the DOT structure
            // to understand exact edge connections
            this.highlightConnectedEdges(instr.instructionId);
        });
    }

    highlightConnectedEdges(instructionId) {
        // Highlight edges connected to the given instruction
        // This is a heuristic approach based on edge titles containing the node ID
        if (!this.graphSvg) return;

        const edges = this.graphSvg.querySelectorAll('g.edge');
        edges.forEach(edge => {
            const titleEl = edge.querySelector('title');
            if (titleEl) {
                const edgeTitle = titleEl.textContent;
                // Check if the edge title contains references to this instruction
                // Use word boundaries to avoid false matches (e.g., ID 1 matching 10, 11, etc.)
                const idPattern = new RegExp(`\\b${instructionId}\\b|_${instructionId}_|_${instructionId}$|^${instructionId}_`);
                if (idPattern.test(edgeTitle)) {
                    // Apply class to the edge group, not just the path
                    edge.classList.add('highlight-edge');
                }
            }
        });
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.visualizer = new DataflowVisualizer();
    console.log('Dataflow Token Visualizer initialized');
});
