#!/usr/bin/env python3
"""
Wavefront - Dataflow Token Visualizer (PyQt Version)
A tool for visualizing dataflow graphs and animating execution traces.

Requires Python 3.9+ (for PyQt6 compatibility)
"""

import sys
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

# Check Python version
if sys.version_info < (3, 9):
    print("Error: Python 3.9 or higher is required (current: {}.{}.{})".format(
        sys.version_info.major, sys.version_info.minor, sys.version_info.micro
    ))
    sys.exit(1)

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QSlider, QGraphicsView,
    QGraphicsScene, QGraphicsTextItem, QGraphicsEllipseItem,
    QGraphicsRectItem, QGraphicsLineItem, QGraphicsPathItem,
    QMessageBox, QSplitter, QTextEdit, QGroupBox
)
from PyQt6.QtCore import Qt, QTimer, QPointF, QRectF, QLineF
from PyQt6.QtGui import (
    QPen, QBrush, QColor, QPainter, QFont, QTransform,
    QWheelEvent, QKeyEvent, QPainterPath
)
try:
    from PyQt6.QtSvgWidgets import QGraphicsSvgItem
    from PyQt6.QtSvg import QSvgRenderer
except ImportError:
    QGraphicsSvgItem = None
    QSvgRenderer = None

try:
    import graphviz
except ImportError:
    graphviz = None


class DataflowEntry:
    """Represents a single entry in the fire log."""
    def __init__(self, cycle: int, instruction_id: int, instruction_name: str, args: List[str], line: str):
        self.cycle = cycle
        self.instruction_id = instruction_id
        self.instruction_name = instruction_name
        self.args = args
        self.line = line


class GraphViewer(QGraphicsView):
    """Custom graphics view with zoom and pan capabilities."""
    
    MIN_ZOOM = 0.1
    MAX_ZOOM = 10.0
    ZOOM_IN_FACTOR = 1.15
    ZOOM_OUT_FACTOR = 0.85
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self._zoom = 1.0
    
    def wheelEvent(self, event: QWheelEvent):
        """Handle mouse wheel for zooming."""
        if event.angleDelta().y() > 0:
            factor = self.ZOOM_IN_FACTOR
            self._zoom *= factor
        else:
            factor = self.ZOOM_OUT_FACTOR
            self._zoom *= factor
        
        if self.MIN_ZOOM < self._zoom < self.MAX_ZOOM:
            self.scale(factor, factor)
        else:
            self._zoom /= factor
    
    def zoom_in(self):
        """Zoom in the view."""
        factor = self.ZOOM_IN_FACTOR
        self._zoom *= factor
        if self._zoom < self.MAX_ZOOM:
            self.scale(factor, factor)
        else:
            self._zoom /= factor
    
    def zoom_out(self):
        """Zoom out the view."""
        factor = self.ZOOM_OUT_FACTOR
        self._zoom *= factor
        if self._zoom > self.MIN_ZOOM:
            self.scale(factor, factor)
        else:
            self._zoom /= factor
    
    def reset_zoom(self):
        """Reset zoom to 100%."""
        self.resetTransform()
        self._zoom = 1.0


class WavefrontVisualizer(QMainWindow):
    """Main application window for the Wavefront visualizer."""
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("wavefront - Dataflow Token Visualizer")
        self.setGeometry(100, 100, 1400, 900)
        
        # Data storage
        self.dot_content: Optional[str] = None
        self.fire_log_data: List[DataflowEntry] = []
        self.cycle_data: Dict[int, List[DataflowEntry]] = defaultdict(list)
        self.current_cycle = 0
        self.is_playing = False
        self.playback_speed = 5
        
        # Graph elements
        self.svg_item: Optional[QGraphicsSvgItem] = None
        self.svg_data: Optional[str] = None  # Store raw SVG for parsing
        self.node_map: Dict[int, Dict] = {}  # instruction_id -> {element, bounds, name}
        self.edge_map: Dict[str, Dict] = {}  # edge_id -> {path, source, target}
        self.node_id_to_name: Dict[int, str] = {}  # instruction_id -> node_name
        
        # Highlight overlays
        self.highlight_items: List = []  # Graphics items for highlighting
        self.token_items: List = []  # Graphics items for tokens
        
        # UI setup
        self.init_ui()
        
        # Timer for animation
        self.playback_timer = QTimer()
        self.playback_timer.timeout.connect(self.next_cycle)
    
    def init_ui(self):
        """Initialize the user interface."""
        # Central widget and main layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # File selection area
        file_group = QGroupBox("File Selection")
        file_layout = QHBoxLayout()
        
        self.dot_label = QLabel("No DOT file selected")
        self.dot_button = QPushButton("Load DOT Graph")
        self.dot_button.clicked.connect(self.load_dot_file)
        
        self.log_label = QLabel("No fire log selected")
        self.log_button = QPushButton("Load Fire Log")
        self.log_button.clicked.connect(self.load_fire_log)
        
        file_layout.addWidget(self.dot_button)
        file_layout.addWidget(self.dot_label, 1)
        file_layout.addWidget(self.log_button)
        file_layout.addWidget(self.log_label, 1)
        file_group.setLayout(file_layout)
        main_layout.addWidget(file_group)
        
        # Stats area
        stats_layout = QHBoxLayout()
        self.total_cycles_label = QLabel("Total Cycles: 0")
        self.total_nodes_label = QLabel("Nodes in Graph: 0")
        stats_layout.addWidget(self.total_cycles_label)
        stats_layout.addWidget(self.total_nodes_label)
        stats_layout.addStretch()
        main_layout.addLayout(stats_layout)
        
        # Splitter for graph and log
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # Graph view
        self.scene = QGraphicsScene()
        self.graph_view = GraphViewer()
        self.graph_view.setScene(self.scene)
        self.graph_view.setBackgroundBrush(QBrush(QColor(255, 255, 255)))
        splitter.addWidget(self.graph_view)
        
        # Execution log
        self.execution_log = QTextEdit()
        self.execution_log.setReadOnly(True)
        self.execution_log.setMaximumWidth(400)
        self.execution_log.setMinimumWidth(250)
        splitter.addWidget(self.execution_log)
        
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 1)
        main_layout.addWidget(splitter, 1)
        
        # Zoom controls
        zoom_layout = QHBoxLayout()
        zoom_layout.addStretch()
        
        zoom_in_btn = QPushButton("Zoom In (+)")
        zoom_in_btn.clicked.connect(self.graph_view.zoom_in)
        zoom_layout.addWidget(zoom_in_btn)
        
        reset_zoom_btn = QPushButton("Reset View")
        reset_zoom_btn.clicked.connect(self.graph_view.reset_zoom)
        zoom_layout.addWidget(reset_zoom_btn)
        
        zoom_out_btn = QPushButton("Zoom Out (-)")
        zoom_out_btn.clicked.connect(self.graph_view.zoom_out)
        zoom_layout.addWidget(zoom_out_btn)
        
        main_layout.addLayout(zoom_layout)
        
        # Playback controls
        playback_group = QGroupBox("Playback Controls")
        playback_layout = QHBoxLayout()
        
        self.cycle_label = QLabel("Cycle: 0")
        self.instr_count_label = QLabel("Instructions: 0")
        playback_layout.addWidget(self.cycle_label)
        playback_layout.addWidget(self.instr_count_label)
        playback_layout.addStretch()
        
        self.play_button = QPushButton("Play")
        self.play_button.clicked.connect(self.play)
        self.play_button.setEnabled(False)
        playback_layout.addWidget(self.play_button)
        
        self.pause_button = QPushButton("Pause")
        self.pause_button.clicked.connect(self.pause)
        self.pause_button.setEnabled(False)
        playback_layout.addWidget(self.pause_button)
        
        self.prev_button = QPushButton("Previous")
        self.prev_button.clicked.connect(self.previous_cycle)
        self.prev_button.setEnabled(False)
        playback_layout.addWidget(self.prev_button)
        
        self.next_button = QPushButton("Next")
        self.next_button.clicked.connect(self.next_cycle)
        self.next_button.setEnabled(False)
        playback_layout.addWidget(self.next_button)
        
        self.reset_button = QPushButton("Reset")
        self.reset_button.clicked.connect(self.reset)
        self.reset_button.setEnabled(False)
        playback_layout.addWidget(self.reset_button)
        
        # Speed control
        playback_layout.addWidget(QLabel("Speed:"))
        self.speed_slider = QSlider(Qt.Orientation.Horizontal)
        self.speed_slider.setMinimum(1)
        self.speed_slider.setMaximum(10)
        self.speed_slider.setValue(5)
        self.speed_slider.setMaximumWidth(150)
        self.speed_slider.valueChanged.connect(self.speed_changed)
        playback_layout.addWidget(self.speed_slider)
        
        self.speed_label = QLabel("5x")
        playback_layout.addWidget(self.speed_label)
        
        playback_group.setLayout(playback_layout)
        main_layout.addWidget(playback_group)
    
    def keyPressEvent(self, event: QKeyEvent):
        """Handle keyboard shortcuts."""
        if not self.dot_content or not self.fire_log_data:
            return
        
        if event.key() == Qt.Key.Key_Space:
            if self.is_playing:
                self.pause()
            else:
                self.play()
        elif event.key() == Qt.Key.Key_Left:
            self.previous_cycle()
        elif event.key() == Qt.Key.Key_Right:
            self.next_cycle()
        elif event.key() == Qt.Key.Key_Home:
            self.reset()
        elif event.key() == Qt.Key.Key_End:
            if self.cycle_data:
                self.current_cycle = max(self.cycle_data.keys())
                self.update_visualization()
    
    def load_dot_file(self):
        """Load a DOT graph file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open DOT Graph File", "", "DOT Files (*.dot);;All Files (*)"
        )
        
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    self.dot_content = f.read()
                self.dot_label.setText(f"✓ Loaded: {Path(file_path).name}")
                self.check_and_render_graph()
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to load DOT file:\n{str(e)}")
    
    def load_fire_log(self):
        """Load a fire log file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open Fire Log File", "", "Log Files (*.log *.txt);;All Files (*)"
        )
        
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.parse_fire_log(content)
                self.log_label.setText(f"✓ Loaded: {Path(file_path).name} ({len(self.fire_log_data)} entries)")
                self.check_and_render_graph()
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to load fire log:\n{str(e)}")
    
    def parse_fire_log(self, content: str):
        """Parse the fire log content."""
        self.fire_log_data = []
        self.cycle_data = defaultdict(list)
        
        # Pattern: [cycle] (instruction_id) instruction_name [args...]
        pattern = re.compile(r'^\[(\d+)\]\s+\((\d+)\)\s+(\S+)(.*)$')
        
        for line in content.strip().split('\n'):
            match = pattern.match(line.strip())
            if match:
                cycle = int(match.group(1))
                instruction_id = int(match.group(2))
                instruction_name = match.group(3)
                args_str = match.group(4).strip()
                args = args_str.split() if args_str else []
                
                entry = DataflowEntry(cycle, instruction_id, instruction_name, args, line.strip())
                self.fire_log_data.append(entry)
                self.cycle_data[cycle].append(entry)
    
    def check_and_render_graph(self):
        """Check if both files are loaded and render the graph."""
        if self.dot_content and self.fire_log_data:
            self.render_graph()
            self.enable_controls()
            self.update_stats()
    
    def render_graph(self):
        """Render the DOT graph using Graphviz."""
        if not graphviz:
            QMessageBox.critical(
                self, "Error",
                "Graphviz library not found. Please install it:\n"
                "pip install graphviz\n\n"
                "Also ensure graphviz is installed on your system."
            )
            return
        
        try:
            # Use graphviz to render to SVG
            src = graphviz.Source(self.dot_content)
            self.svg_data = src.pipe(format='svg').decode('utf-8')
            
            # Clear the scene
            self.scene.clear()
            self.highlight_items.clear()
            self.token_items.clear()
            
            # Load SVG into scene
            renderer = QSvgRenderer(self.svg_data.encode('utf-8'))
            self.svg_item = QGraphicsSvgItem()
            self.svg_item.setSharedRenderer(renderer)
            self.scene.addItem(self.svg_item)
            
            # Set scene rect to SVG bounds
            self.scene.setSceneRect(self.svg_item.boundingRect())
            
            # Parse SVG to extract node and edge information
            self.parse_svg_elements()
            
            # Fit graph in view
            self.graph_view.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to render graph:\n{str(e)}")
    
    def parse_svg_elements(self):
        """Parse SVG to extract node and edge positions for highlighting."""
        if not self.svg_data:
            return
        
        try:
            # Parse SVG XML
            root = ET.fromstring(self.svg_data)
            
            # Define SVG namespace
            ns = {'svg': 'http://www.w3.org/2000/svg'}
            
            # Find all groups (nodes and edges in Graphviz SVG)
            for g in root.findall('.//svg:g', ns):
                class_attr = g.get('class', '')
                
                # Process nodes
                if class_attr == 'node':
                    self._parse_node(g, ns)
                
                # Process edges
                elif class_attr == 'edge':
                    self._parse_edge(g, ns)
            
        except Exception as e:
            print(f"Error parsing SVG: {e}")
            # Fallback to simple extraction from DOT content
            self._extract_nodes_from_dot()
    
    def _parse_node(self, node_elem, ns):
        """Parse a node element from SVG."""
        # Get node title (e.g., "dataflow_constant_1")
        title = node_elem.find('svg:title', ns)
        if title is None or title.text is None:
            return
        
        node_name = title.text.strip()
        
        # Find the shape element (ellipse, polygon, rect, etc.)
        shape = (node_elem.find('.//svg:ellipse', ns) or 
                 node_elem.find('.//svg:polygon', ns) or
                 node_elem.find('.//svg:rect', ns) or
                 node_elem.find('.//svg:circle', ns))
        
        if shape is None:
            return
        
        # Extract bounding box based on shape type
        bounds = self._get_shape_bounds(shape)
        
        # Extract text to find [ID:X]
        text_elems = node_elem.findall('.//svg:text', ns)
        instruction_id = None
        for text_elem in text_elems:
            text_content = ''.join(text_elem.itertext())
            id_match = re.search(r'\[ID:(\d+)\]', text_content)
            if id_match:
                instruction_id = int(id_match.group(1))
                break
        
        if instruction_id is not None:
            self.node_map[instruction_id] = {
                'name': node_name,
                'bounds': bounds,
                'shape_type': shape.tag.split('}')[-1]  # Remove namespace
            }
            self.node_id_to_name[instruction_id] = node_name
    
    def _parse_edge(self, edge_elem, ns):
        """Parse an edge element from SVG."""
        # Get edge title (e.g., "node1->node2")
        title = edge_elem.find('svg:title', ns)
        if title is None or title.text is None:
            return
        
        edge_id = title.text.strip()
        
        # Find the path element
        path = edge_elem.find('.//svg:path', ns)
        if path is None:
            return
        
        # Parse source and target from edge_id
        parts = edge_id.split('->')
        if len(parts) == 2:
            source = parts[0].strip()
            target = parts[1].strip()
            
            # Parse the path data
            path_data = path.get('d', '')
            
            self.edge_map[edge_id] = {
                'source': source,
                'target': target,
                'path_data': path_data
            }
    
    def _get_shape_bounds(self, shape):
        """Get bounding rectangle for a shape element."""
        tag = shape.tag.split('}')[-1]
        
        if tag == 'ellipse':
            cx = float(shape.get('cx', 0))
            cy = float(shape.get('cy', 0))
            rx = float(shape.get('rx', 0))
            ry = float(shape.get('ry', 0))
            return QRectF(cx - rx, cy - ry, rx * 2, ry * 2)
        
        elif tag == 'circle':
            cx = float(shape.get('cx', 0))
            cy = float(shape.get('cy', 0))
            r = float(shape.get('r', 0))
            return QRectF(cx - r, cy - r, r * 2, r * 2)
        
        elif tag == 'rect':
            x = float(shape.get('x', 0))
            y = float(shape.get('y', 0))
            width = float(shape.get('width', 0))
            height = float(shape.get('height', 0))
            return QRectF(x, y, width, height)
        
        elif tag == 'polygon':
            # Parse points and compute bounding box
            points_str = shape.get('points', '')
            if points_str:
                points = []
                for coord_pair in points_str.strip().split():
                    if ',' in coord_pair:
                        x, y = coord_pair.split(',')
                        points.append((float(x), float(y)))
                
                if points:
                    min_x = min(p[0] for p in points)
                    max_x = max(p[0] for p in points)
                    min_y = min(p[1] for p in points)
                    max_y = max(p[1] for p in points)
                    return QRectF(min_x, min_y, max_x - min_x, max_y - min_y)
        
        return QRectF()
    
    def _extract_nodes_from_dot(self):
        """Fallback: Extract node IDs from DOT content."""
        if not self.dot_content:
            return
        
        id_pattern = re.compile(r'\[ID:(\d+)\]')
        for match in id_pattern.finditer(self.dot_content):
            node_id = int(match.group(1))
            if node_id not in self.node_map:
                self.node_map[node_id] = {
                    'name': f'node_{node_id}',
                    'bounds': QRectF(),
                    'shape_type': 'unknown'
                }
    
    def enable_controls(self):
        """Enable playback controls."""
        self.play_button.setEnabled(True)
        self.pause_button.setEnabled(True)
        self.prev_button.setEnabled(True)
        self.next_button.setEnabled(True)
        self.reset_button.setEnabled(True)
    
    def update_stats(self):
        """Update statistics display."""
        total_cycles = max(self.cycle_data.keys()) if self.cycle_data else 0
        total_nodes = len(self.node_map)
        
        self.total_cycles_label.setText(f"Total Cycles: {total_cycles}")
        self.total_nodes_label.setText(f"Nodes in Graph: {total_nodes}")
    
    def update_visualization(self):
        """Update the visualization for the current cycle."""
        # Update cycle display
        self.cycle_label.setText(f"Cycle: {self.current_cycle}")
        
        # Get instructions for current cycle
        instructions = self.cycle_data.get(self.current_cycle, [])
        self.instr_count_label.setText(f"Instructions: {len(instructions)}")
        
        # Clear previous highlights and tokens
        self.clear_highlights()
        
        # Update execution log
        log_text = f"<h3>Cycle {self.current_cycle}</h3>"
        for entry in instructions:
            log_text += f"<div><b>{entry.instruction_name}</b> (ID:{entry.instruction_id})"
            if entry.args:
                log_text += f" {' '.join(entry.args)}"
            log_text += "</div>"
        
        self.execution_log.setHtml(log_text)
        
        # Highlight active nodes and edges, show tokens
        self.visualize_tokens(instructions)
    
    def clear_highlights(self):
        """Remove all highlight and token graphics items."""
        for item in self.highlight_items:
            self.scene.removeItem(item)
        self.highlight_items.clear()
        
        for item in self.token_items:
            self.scene.removeItem(item)
        self.token_items.clear()
    
    def visualize_tokens(self, instructions: List[DataflowEntry]):
        """Highlight active nodes and visualize data tokens."""
        for entry in instructions:
            instruction_id = entry.instruction_id
            
            # Highlight the node
            if instruction_id in self.node_map:
                node_info = self.node_map[instruction_id]
                self.highlight_node(node_info)
                
                # Highlight connected edges
                node_name = node_info.get('name')
                if node_name:
                    self.highlight_edges(node_name)
                    
                    # Place tokens on outgoing edges
                    self.place_tokens(entry, node_name)
    
    def highlight_node(self, node_info: Dict):
        """Create a highlight overlay for a node."""
        bounds = node_info.get('bounds')
        if not bounds or bounds.isEmpty():
            return
        
        # Create highlight shape based on node type
        shape_type = node_info.get('shape_type', 'ellipse')
        
        # Add padding to highlight
        padding = 5
        highlight_bounds = bounds.adjusted(-padding, -padding, padding, padding)
        
        # Create highlight item with glow effect
        if shape_type == 'ellipse' or shape_type == 'circle':
            highlight = QGraphicsEllipseItem(highlight_bounds)
        else:
            highlight = QGraphicsRectItem(highlight_bounds)
        
        # Style the highlight
        pen = QPen(QColor(255, 140, 0), 4)  # Orange stroke
        brush = QBrush(QColor(255, 244, 230, 100))  # Light orange fill with transparency
        highlight.setPen(pen)
        highlight.setBrush(brush)
        highlight.setZValue(100)  # Draw above SVG but below tokens
        
        self.scene.addItem(highlight)
        self.highlight_items.append(highlight)
    
    def highlight_edges(self, source_node: str):
        """Highlight edges originating from the given node."""
        for edge_id, edge_info in self.edge_map.items():
            if edge_info['source'] == source_node:
                # Create a highlight line along the edge path
                path_data = edge_info.get('path_data', '')
                if path_data:
                    self.draw_edge_highlight(path_data)
    
    def draw_edge_highlight(self, path_data: str):
        """Draw a highlight overlay on an edge path."""
        try:
            # Parse SVG path data and create QPainterPath
            path = QPainterPath()
            
            # Simple parser for SVG path commands (M, C, L)
            commands = re.findall(r'([MCL])\s*([\d\s,.-]+)', path_data)
            
            for cmd, coords in commands:
                nums = [float(x) for x in re.findall(r'-?\d+\.?\d*', coords)]
                
                if cmd == 'M' and len(nums) >= 2:
                    path.moveTo(nums[0], nums[1])
                elif cmd == 'C' and len(nums) >= 6:
                    path.cubicTo(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5])
                elif cmd == 'L' and len(nums) >= 2:
                    path.lineTo(nums[0], nums[1])
            
            # Create path item with highlight style
            path_item = QGraphicsPathItem(path)
            pen = QPen(QColor(255, 215, 0), 3)  # Gold color
            path_item.setPen(pen)
            path_item.setZValue(99)
            
            self.scene.addItem(path_item)
            self.highlight_items.append(path_item)
            
        except Exception as e:
            print(f"Error drawing edge highlight: {e}")
    
    def place_tokens(self, entry: DataflowEntry, node_name: str):
        """Place data token visualizations on outgoing edges."""
        # Find edges from this node
        for edge_id, edge_info in self.edge_map.items():
            if edge_info['source'] == node_name:
                # Extract token value from instruction args
                token_value = self.get_token_value(entry)
                if token_value is not None:
                    # Get position at end of edge
                    path_data = edge_info.get('path_data', '')
                    pos = self.get_edge_end_position(path_data)
                    if pos:
                        self.create_token(pos, token_value)
                        break  # Only place one token per instruction
    
    def get_token_value(self, entry: DataflowEntry) -> Optional[str]:
        """Extract the token value from instruction arguments."""
        # Simple heuristic: use first argument as token value
        if entry.args:
            return entry.args[0]
        return None
    
    def get_edge_end_position(self, path_data: str) -> Optional[QPointF]:
        """Get the position near the end of an edge path."""
        try:
            commands = re.findall(r'([MCL])\s*([\d\s,.-]+)', path_data)
            
            if commands:
                # Get the last command's coordinates
                last_cmd, last_coords = commands[-1]
                nums = [float(x) for x in re.findall(r'-?\d+\.?\d*', last_coords)]
                
                if len(nums) >= 2:
                    # Position slightly before the arrow head
                    x, y = nums[-2], nums[-1]
                    return QPointF(x - 15, y - 15)  # Offset slightly
        except Exception as e:
            print(f"Error getting edge end position: {e}")
        
        return None
    
    def create_token(self, pos: QPointF, value: str):
        """Create a token visualization at the given position."""
        # Create circle for token
        token_circle = QGraphicsEllipseItem(pos.x() - 10, pos.y() - 10, 20, 20)
        pen = QPen(QColor(204, 0, 0), 2)  # Dark red border
        brush = QBrush(QColor(255, 68, 68))  # Red fill
        token_circle.setPen(pen)
        token_circle.setBrush(brush)
        token_circle.setZValue(200)  # Draw on top of everything
        
        # Create text for value
        token_text = QGraphicsTextItem(str(value))
        token_text.setDefaultTextColor(QColor(255, 255, 255))
        token_text.setFont(QFont("Arial", 8, QFont.Weight.Bold))
        
        # Center text in circle
        text_rect = token_text.boundingRect()
        token_text.setPos(pos.x() - text_rect.width() / 2, pos.y() - text_rect.height() / 2)
        token_text.setZValue(201)
        
        self.scene.addItem(token_circle)
        self.scene.addItem(token_text)
        self.token_items.append(token_circle)
        self.token_items.append(token_text)
    
    def play(self):
        """Start playback animation."""
        if not self.cycle_data:
            return
        
        self.is_playing = True
        self.play_button.setEnabled(False)
        self.pause_button.setEnabled(True)
        
        # Calculate interval based on speed (speed 1-10, where 10 is fastest)
        # Interval in milliseconds: 1000 / speed
        # Guard against division by zero (should not happen with slider min=1, but defensive)
        speed = max(1, self.playback_speed)
        interval = int(1000 / speed)
        self.playback_timer.start(interval)
    
    def pause(self):
        """Pause playback animation."""
        self.is_playing = False
        self.playback_timer.stop()
        self.play_button.setEnabled(True)
        self.pause_button.setEnabled(False)
    
    def next_cycle(self):
        """Advance to the next cycle."""
        if not self.cycle_data:
            return
        
        max_cycle = max(self.cycle_data.keys())
        if self.current_cycle < max_cycle:
            self.current_cycle += 1
            self.update_visualization()
        else:
            self.pause()
    
    def previous_cycle(self):
        """Go back to the previous cycle."""
        if self.current_cycle > 0:
            self.current_cycle -= 1
            self.update_visualization()
    
    def reset(self):
        """Reset to cycle 0."""
        self.pause()
        self.current_cycle = 0
        self.update_visualization()
    
    def speed_changed(self, value: int):
        """Handle speed slider change."""
        self.playback_speed = value
        self.speed_label.setText(f"{value}x")
        
        # Restart playback with new speed if currently playing
        if self.is_playing:
            self.pause()
            self.play()


def main():
    """Main entry point."""
    app = QApplication(sys.argv)
    app.setStyle('Fusion')  # Modern look
    
    window = WavefrontVisualizer()
    window.show()
    
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
