#!/usr/bin/env python3
"""
Test script to simulate loading files and checking highlighting without GUI.
"""

import sys
import os

# Suppress Qt warnings in headless environment
os.environ['QT_QPA_PLATFORM'] = 'offscreen'

from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

def test_highlighting_simulation():
    """Test highlighting by simulating file loads."""
    
    try:
        from wavefront_qt import WavefrontVisualizer, DataflowEntry
        from PyQt6.QtWidgets import QApplication
        
        # Create application
        app = QApplication(sys.argv)
        
        # Create visualizer
        viz = WavefrontVisualizer()
        
        print("=" * 60)
        print("Loading DOT file...")
        print("=" * 60)
        
        # Load DOT file
        dot_file = Path(__file__).parent / "examples" / "example_dot.dot"
        with open(dot_file, 'r') as f:
            viz.dot_content = f.read()
        
        print("\n" + "=" * 60)
        print("Loading fire log...")
        print("=" * 60)
        
        # Load fire log
        log_file = Path(__file__).parent / "examples" / "fire.log"
        with open(log_file, 'r') as f:
            content = f.read()
        viz.parse_fire_log(content)
        
        print(f"\nParsed {len(viz.fire_log_data)} log entries")
        print(f"Found {len(viz.cycle_data)} cycles")
        
        print("\n" + "=" * 60)
        print("Rendering graph...")
        print("=" * 60)
        
        # Render graph (this should call parse_svg_elements)
        viz.render_graph()
        
        print("\n" + "=" * 60)
        print("Testing visualization for cycle 2...")
        print("=" * 60)
        
        # Set to cycle 2 and update visualization
        viz.current_cycle = 2
        viz.update_visualization()
        
        print("\n" + "=" * 60)
        print("Summary:")
        print("=" * 60)
        print(f"Node map size: {len(viz.node_map)}")
        print(f"Edge map size: {len(viz.edge_map)}")
        print(f"Highlight items: {len(viz.highlight_items)}")
        print(f"Token items: {len(viz.token_items)}")
        
        if len(viz.highlight_items) > 0:
            print("\n✓ SUCCESS: Highlighting overlays were created!")
        else:
            print("\n✗ PROBLEM: No highlighting overlays were created")
        
        return len(viz.highlight_items) > 0
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_highlighting_simulation()
    sys.exit(0 if success else 1)
