// Tidepool - Dataflow Architecture Debugger
// Main application logic

class TidepoolDebugger {
    constructor() {
        this.dotContent = null;
        this.fireLogEntries = [];
        this.currentCycle = 0;
        this.isPlaying = false;
        this.playbackSpeed = 5;
        this.playbackTimer = null;
        this.graphSvg = null;
        this.nodeMap = new Map();
        this.edgeMap = new Map();
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File inputs
        document.getElementById('dotFile').addEventListener('change', (e) => this.handleDotFile(e));
        document.getElementById('fireLog').addEventListener('change', (e) => this.handleFireLog(e));
        
        // Playback controls
        document.getElementById('playBtn').addEventListener('click', () => this.play());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('stepBtn').addEventListener('click', () => this.step());
        document.getElementById('speedControl').addEventListener('input', (e) => this.updateSpeed(e));
    }

    async handleDotFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.dotContent = await this.readFile(file);
            document.getElementById('dotFileName').textContent = file.name;
            this.updateStatus('DOT file loaded successfully');
            await this.renderGraph();
            this.checkReadyState();
        } catch (error) {
            this.updateStatus('Error loading DOT file: ' + error.message, true);
        }
    }

    async handleFireLog(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const content = await this.readFile(file);
            this.parseFireLog(content);
            document.getElementById('fireLogFileName').textContent = file.name;
            this.updateStatus(`Fire log loaded: ${this.fireLogEntries.length} entries`);
            this.populateLogPanel();
            this.checkReadyState();
        } catch (error) {
            this.updateStatus('Error loading fire log: ' + error.message, true);
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    parseFireLog(content) {
        this.fireLogEntries = [];
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) continue;
            
            const entry = {
                cycle: parseInt(parts[0]),
                instructionId: parts[1],
                outputs: parts.slice(2),
                rawLine: line.trim()
            };
            
            this.fireLogEntries.push(entry);
        }
        
        // Sort by cycle
        this.fireLogEntries.sort((a, b) => a.cycle - b.cycle);
    }

    async renderGraph() {
        if (!this.dotContent) return;

        try {
            const renderer = new DotRenderer();
            renderer.parse(this.dotContent);
            const svgString = renderer.render(900, 500);
            
            const graphContainer = document.getElementById('graph');
            graphContainer.innerHTML = svgString;
            graphContainer.classList.add('has-graph');
            
            this.graphSvg = graphContainer.querySelector('svg');
            this.indexGraphElements();
            
        } catch (error) {
            this.updateStatus('Error rendering graph: ' + error.message, true);
            throw error;
        }
    }

    indexGraphElements() {
        if (!this.graphSvg) return;

        this.nodeMap.clear();
        this.edgeMap.clear();

        // Index nodes
        const nodes = this.graphSvg.querySelectorAll('.node');
        nodes.forEach(node => {
            const id = node.getAttribute('data-id');
            if (id) {
                this.nodeMap.set(id, node);
            }
        });

        // Index edges
        const edges = this.graphSvg.querySelectorAll('.edge');
        edges.forEach(edge => {
            const id = edge.getAttribute('data-id');
            if (id) {
                this.edgeMap.set(id, edge);
            }
        });
    }

    populateLogPanel() {
        const logContent = document.getElementById('logContent');
        logContent.innerHTML = '';

        this.fireLogEntries.forEach((entry, index) => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.id = `log-entry-${index}`;
            logEntry.innerHTML = `
                <div><span class="cycle">Cycle ${entry.cycle}</span></div>
                <div><span class="instruction">Inst: ${entry.instructionId}</span></div>
                ${entry.outputs.length > 0 ? `<div><span class="outputs">Out: ${entry.outputs.join(', ')}</span></div>` : ''}
            `;
            logContent.appendChild(logEntry);
        });
    }

    checkReadyState() {
        const ready = this.dotContent && this.fireLogEntries.length > 0;
        document.getElementById('playBtn').disabled = !ready;
        document.getElementById('pauseBtn').disabled = !ready;
        document.getElementById('resetBtn').disabled = !ready;
        document.getElementById('stepBtn').disabled = !ready;
        document.getElementById('speedControl').disabled = !ready;

        if (ready) {
            this.updateCycleInfo();
        }
    }

    play() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        document.getElementById('playBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        
        this.playbackTimer = setInterval(() => {
            if (this.currentCycle < this.fireLogEntries.length) {
                this.step();
            } else {
                this.pause();
            }
        }, 1000 / this.playbackSpeed);
    }

    pause() {
        this.isPlaying = false;
        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        
        if (this.playbackTimer) {
            clearInterval(this.playbackTimer);
            this.playbackTimer = null;
        }
    }

    reset() {
        this.pause();
        this.currentCycle = 0;
        this.clearAllHighlights();
        this.updateCycleInfo();
        this.updateStatus('Reset to beginning');
        
        // Clear active log entries
        document.querySelectorAll('.log-entry').forEach(entry => {
            entry.classList.remove('active');
        });
    }

    step() {
        if (this.currentCycle >= this.fireLogEntries.length) {
            this.pause();
            this.updateStatus('Playback complete');
            return;
        }

        const entry = this.fireLogEntries[this.currentCycle];
        this.visualizeExecution(entry, this.currentCycle);
        this.currentCycle++;
        this.updateCycleInfo();
    }

    visualizeExecution(entry, index) {
        // Clear previous highlights
        this.clearAllHighlights();

        // Highlight the executing node
        const node = this.nodeMap.get(entry.instructionId);
        if (node) {
            const shape = node.querySelector('rect, ellipse, polygon, path');
            if (shape) {
                shape.classList.add('node-active');
            }
        }

        // Highlight outgoing edges from this instruction
        this.edgeMap.forEach((edge, edgeId) => {
            // Check if this edge starts from the current instruction
            const expectedEdgeId = DotRenderer.getEdgeId(entry.instructionId, '');
            if (edgeId.startsWith(expectedEdgeId.replace('->', ''))) {
                const path = edge.querySelector('path');
                if (path) {
                    path.classList.add('edge-token-flow');
                }
            }
        });

        // Highlight active log entry
        document.querySelectorAll('.log-entry').forEach(e => e.classList.remove('active'));
        const logEntry = document.getElementById(`log-entry-${index}`);
        if (logEntry) {
            logEntry.classList.add('active');
            logEntry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        this.updateStatus(`Executing: ${entry.instructionId} at cycle ${entry.cycle}`);
    }

    clearAllHighlights() {
        // Clear node highlights
        document.querySelectorAll('.node-active').forEach(el => {
            el.classList.remove('node-active');
        });

        // Clear edge highlights
        document.querySelectorAll('.edge-active, .edge-token-flow').forEach(el => {
            el.classList.remove('edge-active', 'edge-token-flow');
        });
    }

    updateSpeed(event) {
        this.playbackSpeed = parseInt(event.target.value);
        document.getElementById('speedValue').textContent = `${this.playbackSpeed}x`;
        
        // If currently playing, restart the timer with new speed
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
    }

    updateCycleInfo() {
        const total = this.fireLogEntries.length;
        document.getElementById('cycleInfo').textContent = `Step: ${this.currentCycle} / ${total}`;
    }

    updateStatus(message, isError = false) {
        const statusElement = document.getElementById('statusMessage');
        statusElement.textContent = message;
        statusElement.style.color = isError ? '#dc3545' : '#28a745';
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const tidepoolDebugger = new TidepoolDebugger();
    
    // Welcome message
    const graphContainer = document.getElementById('graph');
    graphContainer.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 40px;">Load a DOT file to begin</div>';
});
