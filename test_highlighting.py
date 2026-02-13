#!/usr/bin/env python3
"""
Test script to validate node/edge highlighting and token visualization.
"""

import sys
import re
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_svg_parsing():
    """Test SVG parsing functionality."""
    print("Testing SVG parsing and node/edge extraction...")
    
    # Import after path is set
    try:
        from wavefront_qt import WavefrontVisualizer
        import graphviz
    except ImportError as e:
        print(f"✗ Import failed: {e}")
        return False
    
    # Create a simple test DOT graph
    test_dot = """
    digraph test {
        node_1 [label="Test Node 1\\n[ID:1]", shape=ellipse];
        node_2 [label="Test Node 2\\n[ID:2]", shape=box];
        node_1 -> node_2;
    }
    """
    
    # Render to SVG
    try:
        src = graphviz.Source(test_dot)
        svg_data = src.pipe(format='svg').decode('utf-8')
        print(f"✓ Generated test SVG ({len(svg_data)} bytes)")
    except Exception as e:
        print(f"✗ Failed to generate SVG: {e}")
        return False
    
    # Test XML parsing
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(svg_data)
        ns = {'svg': 'http://www.w3.org/2000/svg'}
        
        # Count nodes and edges
        nodes = root.findall('.//svg:g[@class="node"]', ns)
        edges = root.findall('.//svg:g[@class="edge"]', ns)
        
        print(f"✓ Parsed SVG: {len(nodes)} nodes, {len(edges)} edges")
        
        if len(nodes) < 2 or len(edges) < 1:
            print(f"✗ Expected at least 2 nodes and 1 edge")
            return False
        
    except Exception as e:
        print(f"✗ Failed to parse SVG: {e}")
        return False
    
    print("✓ SVG parsing test passed")
    return True

def test_example_file_parsing():
    """Test parsing with actual example files."""
    print("\nTesting with example files...")
    
    examples_dir = Path(__file__).parent / "examples"
    dot_file = examples_dir / "example_dot.dot"
    
    if not dot_file.exists():
        print("✗ Example DOT file not found")
        return False
    
    try:
        import graphviz
        import xml.etree.ElementTree as ET
        
        with open(dot_file, 'r') as f:
            dot_content = f.read()
        
        # Render to SVG
        src = graphviz.Source(dot_content)
        svg_data = src.pipe(format='svg').decode('utf-8')
        
        # Parse SVG
        root = ET.fromstring(svg_data)
        ns = {'svg': 'http://www.w3.org/2000/svg'}
        
        nodes = root.findall('.//svg:g[@class="node"]', ns)
        edges = root.findall('.//svg:g[@class="edge"]', ns)
        
        print(f"✓ Parsed example file: {len(nodes)} nodes, {len(edges)} edges")
        
        # Extract some node IDs
        node_ids = []
        for node in nodes:  # Check all nodes
            title = node.find('svg:title', ns)
            if title is not None:
                node_name = title.text.strip()
                
                # Find ID in text elements
                text_elems = node.findall('.//svg:text', ns)
                for text_elem in text_elems:
                    text_content = ''.join(text_elem.itertext())
                    id_match = re.search(r'\[ID:(\d+)\]', text_content)
                    if id_match:
                        node_id = int(id_match.group(1))
                        node_ids.append(node_id)
                        if len(node_ids) <= 5:
                            print(f"  - Found node '{node_name}' with ID:{node_id}")
                        break
        
        print(f"✓ Total extracted: {len(node_ids)} node IDs")
        
        if len(node_ids) < 10:
            print(f"✗ Expected to extract at least 10 node IDs, got {len(node_ids)}")
            return False
        
    except Exception as e:
        print(f"✗ Failed to process example file: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("✓ Example file parsing test passed")
    return True

if __name__ == '__main__':
    print("="*60)
    print("Testing Node/Edge Highlighting and Token Visualization")
    print("="*60)
    
    success = True
    success &= test_svg_parsing()
    success &= test_example_file_parsing()
    
    print("\n" + "="*60)
    if success:
        print("✓ All highlighting tests passed!")
    else:
        print("✗ Some tests failed")
    print("="*60)
    
    sys.exit(0 if success else 1)
