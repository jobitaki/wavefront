#!/usr/bin/env python3
"""
Create a visual demonstration of the highlighting by rendering to an image.
"""

import sys
import os
os.environ['QT_QPA_PLATFORM'] = 'offscreen'

from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from wavefront_qt import WavefrontVisualizer
from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QPainter, QImage
from PyQt6.QtCore import QRectF

def create_visualization_screenshot():
    """Create a screenshot showing the highlighting."""
    
    app = QApplication(sys.argv)
    viz = WavefrontVisualizer()
    
    # Load files
    print("Loading files...")
    dot_file = Path(__file__).parent / "examples" / "example_dot.dot"
    with open(dot_file, 'r') as f:
        viz.dot_content = f.read()
    
    log_file = Path(__file__).parent / "examples" / "fire.log"
    with open(log_file, 'r') as f:
        content = f.read()
    viz.parse_fire_log(content)
    
    # Render graph
    print("Rendering graph...")
    viz.render_graph()
    
    print(f"Node map: {len(viz.node_map)} entries")
    print(f"Edge map: {len(viz.edge_map)} entries")
    
    # Set to cycle 2 to show multiple highlights
    print("Setting to cycle 2...")
    viz.current_cycle = 2
    viz.update_visualization()
    
    print(f"Highlights created: {len(viz.highlight_items)}")
    print(f"Tokens created: {len(viz.token_items)}")
    
    # Get the scene bounds
    scene_rect = viz.scene.sceneRect()
    print(f"Scene rect: {scene_rect}")
    
    # Create an image to render to
    # Scale down for reasonable file size
    scale = 0.3
    width = int(scene_rect.width() * scale)
    height = int(scene_rect.height() * scale)
    
    print(f"Creating image: {width}x{height}")
    image = QImage(width, height, QImage.Format.Format_ARGB32)
    image.fill(0xFFFFFFFF)  # White background
    
    # Create painter and render scene
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.scale(scale, scale)
    viz.scene.render(painter, QRectF(0, 0, scene_rect.width(), scene_rect.height()), scene_rect)
    painter.end()
    
    # Save image
    output_path = "/tmp/wavefront_highlighting_demo.png"
    image.save(output_path)
    print(f"\n✓ Saved visualization to: {output_path}")
    
    return True

if __name__ == '__main__':
    try:
        success = create_visualization_screenshot()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
