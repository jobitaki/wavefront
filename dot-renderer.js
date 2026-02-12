// Simple DOT file parser and SVG renderer
class DotRenderer {
    constructor() {
        this.nodes = [];
        this.edges = [];
    }

    parse(dotContent) {
        this.nodes = [];
        this.edges = [];

        // Remove comments
        dotContent = dotContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        // Extract node definitions
        const nodeRegex = /(\w+)\s*\[([^\]]+)\]/g;
        let match;
        while ((match = nodeRegex.exec(dotContent)) !== null) {
            const id = match[1];
            const attrs = this.parseAttributes(match[2]);
            this.nodes.push({ id, label: attrs.label || id, ...attrs });
        }

        // Extract edge definitions
        const edgeRegex = /(\w+)\s*-[->]\s*(\w+)(?:\s*\[([^\]]+)\])?/g;
        while ((match = edgeRegex.exec(dotContent)) !== null) {
            const from = match[1];
            const to = match[2];
            const attrs = match[3] ? this.parseAttributes(match[3]) : {};
            this.edges.push({ from, to, label: attrs.label || '', ...attrs });
        }

        // Add nodes that appear only in edges
        const edgeNodes = new Set();
        this.edges.forEach(edge => {
            edgeNodes.add(edge.from);
            edgeNodes.add(edge.to);
        });

        edgeNodes.forEach(nodeId => {
            if (!this.nodes.find(n => n.id === nodeId)) {
                this.nodes.push({ id: nodeId, label: nodeId });
            }
        });
    }

    parseAttributes(attrString) {
        const attrs = {};
        const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(attrString)) !== null) {
            attrs[match[1]] = match[2];
        }
        return attrs;
    }

    render(width = 800, height = 600) {
        if (this.nodes.length === 0) {
            throw new Error('No nodes to render');
        }

        // Create a simple hierarchical layout
        const layout = this.calculateLayout(width, height);

        // Create SVG
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" class="dataflow-graph">`;
        
        // Define arrow marker
        svg += `
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#333" />
                </marker>
            </defs>
        `;

        // Render edges first (so they appear behind nodes)
        svg += '<g class="edges">';
        this.edges.forEach(edge => {
            const fromNode = layout.find(n => n.id === edge.from);
            const toNode = layout.find(n => n.id === edge.to);
            if (fromNode && toNode) {
                svg += this.renderEdge(edge, fromNode, toNode);
            }
        });
        svg += '</g>';

        // Render nodes
        svg += '<g class="nodes">';
        layout.forEach(node => {
            svg += this.renderNode(node);
        });
        svg += '</g>';

        svg += '</svg>';
        return svg;
    }

    calculateLayout(width, height) {
        // Simple layered layout algorithm
        const nodePositions = [];
        const layers = this.assignLayers();
        const layerHeight = height / (layers.length + 1);

        layers.forEach((layer, layerIndex) => {
            const layerWidth = width / (layer.length + 1);
            layer.forEach((nodeId, nodeIndex) => {
                const node = this.nodes.find(n => n.id === nodeId);
                nodePositions.push({
                    ...node,
                    x: (nodeIndex + 1) * layerWidth,
                    y: (layerIndex + 1) * layerHeight
                });
            });
        });

        return nodePositions;
    }

    assignLayers() {
        // Topological sort to assign layers
        const layers = [];
        const visited = new Set();
        const inDegree = new Map();

        // Calculate in-degrees
        this.nodes.forEach(node => inDegree.set(node.id, 0));
        this.edges.forEach(edge => {
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        });

        // Build layers
        while (visited.size < this.nodes.length) {
            const currentLayer = [];
            this.nodes.forEach(node => {
                if (!visited.has(node.id) && inDegree.get(node.id) === 0) {
                    currentLayer.push(node.id);
                }
            });

            if (currentLayer.length === 0) {
                // Handle cycles or disconnected nodes - add all remaining unvisited nodes
                this.nodes.forEach(node => {
                    if (!visited.has(node.id)) {
                        currentLayer.push(node.id);
                    }
                });
                
                // Safety check: if still empty, break to avoid infinite loop
                if (currentLayer.length === 0) {
                    break;
                }
            }

            layers.push(currentLayer);
            currentLayer.forEach(nodeId => {
                visited.add(nodeId);
                this.edges.forEach(edge => {
                    if (edge.from === nodeId) {
                        inDegree.set(edge.to, inDegree.get(edge.to) - 1);
                    }
                });
            });
        }

        return layers;
    }

    renderNode(node) {
        const rectWidth = 120;
        const rectHeight = 50;
        const x = node.x - rectWidth / 2;
        const y = node.y - rectHeight / 2;

        return `
            <g class="node" data-id="${node.id}">
                <title>${node.id}</title>
                <rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" 
                      fill="${node.fillcolor || '#add8e6'}" stroke="#333" stroke-width="2" rx="5"/>
                <text x="${node.x}" y="${node.y}" text-anchor="middle" dy=".3em" 
                      font-family="Arial" font-size="14" fill="#000">${this.escapeHtml(node.label)}</text>
            </g>
        `;
    }

    renderEdge(edge, fromNode, toNode) {
        const edgeId = `${edge.from}->${edge.to}`;
        
        // Calculate connection points
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const fromX = fromNode.x + (dx / dist) * 60;
        const fromY = fromNode.y + (dy / dist) * 25;
        const toX = toNode.x - (dx / dist) * 60;
        const toY = toNode.y - (dy / dist) * 25;

        // Control point for curve
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        const perpX = -(toY - fromY) * 0.1;
        const perpY = (toX - fromX) * 0.1;
        const ctrlX = midX + perpX;
        const ctrlY = midY + perpY;

        let svg = `
            <g class="edge" data-id="${edgeId}">
                <title>${edgeId}</title>
                <path d="M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${toX} ${toY}" 
                      stroke="#333" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
        `;

        if (edge.label) {
            svg += `<text x="${midX}" y="${midY - 5}" text-anchor="middle" 
                          font-family="Arial" font-size="11" fill="#666">${this.escapeHtml(edge.label)}</text>`;
        }

        svg += '</g>';
        return svg;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
