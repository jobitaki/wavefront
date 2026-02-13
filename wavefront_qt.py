#!/usr/bin/env python3
"""
Wavefront - Dataflow Token Visualizer (PyQt Version)
A tool for visualizing dataflow graphs and animating execution traces.
"""

import sys
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QSlider, QGraphicsView,
    QGraphicsScene, QGraphicsTextItem, QGraphicsEllipseItem,
    QGraphicsRectItem, QGraphicsLineItem, QGraphicsPathItem,
    QMessageBox, QSplitter, QTextEdit, QGroupBox
)
from PyQt6.QtCore import Qt, QTimer, QPointF, QRectF, QLineF, QPainterPath
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
            factor = 1.15
            self._zoom *= factor
        else:
            factor = 0.85
            self._zoom *= factor
        
        if self._zoom > 0.1 and self._zoom < 10:
            self.scale(factor, factor)
        else:
            self._zoom /= factor
    
    def zoom_in(self):
        """Zoom in the view."""
        factor = 1.15
        self._zoom *= factor
        if self._zoom < 10:
            self.scale(factor, factor)
        else:
            self._zoom /= factor
    
    def zoom_out(self):
        """Zoom out the view."""
        factor = 0.85
        self._zoom *= factor
        if self._zoom > 0.1:
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
        self.node_map: Dict[int, QGraphicsTextItem] = {}  # instruction_id -> graphics item
        self.original_node_colors: Dict[int, QColor] = {}
        
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
            svg_data = src.pipe(format='svg').decode('utf-8')
            
            # Clear the scene
            self.scene.clear()
            
            # Load SVG into scene
            renderer = QSvgRenderer(svg_data.encode('utf-8'))
            self.svg_item = QGraphicsSvgItem()
            self.svg_item.setSharedRenderer(renderer)
            self.scene.addItem(self.svg_item)
            
            # Set scene rect to SVG bounds
            self.scene.setSceneRect(self.svg_item.boundingRect())
            
            # Build node map for highlighting
            self.build_node_map()
            
            # Fit graph in view
            self.graph_view.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to render graph:\n{str(e)}")
    
    def build_node_map(self):
        """Build a map of instruction IDs to their graphical representations."""
        # Note: With SVG rendering, we can't easily highlight individual nodes
        # This is a limitation of using QGraphicsSvgItem
        # For better highlighting, we would need to parse the SVG or use a different approach
        self.node_map = {}
        
        # Extract node IDs from DOT content for reference
        id_pattern = re.compile(r'\[ID:(\d+)\]')
        for match in id_pattern.finditer(self.dot_content):
            node_id = int(match.group(1))
            self.node_map[node_id] = None  # Placeholder
    
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
        
        # Update execution log
        log_text = f"<h3>Cycle {self.current_cycle}</h3>"
        for entry in instructions:
            log_text += f"<div><b>{entry.instruction_name}</b> (ID:{entry.instruction_id})"
            if entry.args:
                log_text += f" {' '.join(entry.args)}"
            log_text += "</div>"
        
        self.execution_log.setHtml(log_text)
        
        # Note: Node highlighting would require a different rendering approach
        # The current SVG-based rendering doesn't allow easy manipulation of individual elements
    
    def play(self):
        """Start playback animation."""
        if not self.cycle_data:
            return
        
        self.is_playing = True
        self.play_button.setEnabled(False)
        self.pause_button.setEnabled(True)
        
        # Calculate interval based on speed (speed 1-10, where 10 is fastest)
        # Interval in milliseconds: 1000 / speed
        interval = int(1000 / self.playback_speed)
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
