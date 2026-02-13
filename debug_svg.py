#!/usr/bin/env python3
"""
Debug script to test SVG parsing and highlight creation.
"""

import sys
import xml.etree.ElementTree as ET
import graphviz
from pathlib import Path

def test_svg_parsing():
    """Test SVG parsing with actual example file."""
    
    examples_dir = Path(__file__).parent / "examples"
    dot_file = examples_dir / "example_dot.dot"
    
    if not dot_file.exists():
        print("✗ Example DOT file not found")
        return False
    
    print("Loading DOT file...")
    with open(dot_file, 'r') as f:
        dot_content = f.read()
    
    print("Rendering to SVG...")
    src = graphviz.Source(dot_content)
    svg_data = src.pipe(format='svg').decode('utf-8')
    print(f"✓ Generated SVG ({len(svg_data)} bytes)")
    
    # Save SVG for inspection
    with open('/tmp/debug_graph.svg', 'w') as f:
        f.write(svg_data)
    print("✓ Saved SVG to /tmp/debug_graph.svg")
    
    # Parse SVG
    print("\nParsing SVG...")
    try:
        root = ET.fromstring(svg_data)
        print(f"✓ Root tag: {root.tag}")
        
        # Test different namespace approaches
        ns = {'svg': 'http://www.w3.org/2000/svg'}
        
        # Method 1: With namespace prefix
        nodes1 = root.findall('.//svg:g[@class="node"]', ns)
        print(f"Method 1 (svg:g): Found {len(nodes1)} nodes")
        
        # Method 2: With full namespace in tag
        nodes2 = root.findall('.//{http://www.w3.org/2000/svg}g[@class="node"]')
        print(f"Method 2 (full ns): Found {len(nodes2)} nodes")
        
        # Method 3: Without namespace (in case SVG doesn't have it)
        nodes3 = root.findall('.//g[@class="node"]')
        print(f"Method 3 (no ns): Found {len(nodes3)} nodes")
        
        # Check if nodes have the expected structure
        if nodes1:
            node = nodes1[0]
            print(f"\nFirst node structure:")
            print(f"  Tag: {node.tag}")
            print(f"  Attribs: {node.attrib}")
            
            title = node.find('svg:title', ns)
            if title is not None:
                print(f"  Title: {title.text}")
            else:
                print(f"  Title not found with namespace")
                title = node.find('{http://www.w3.org/2000/svg}title')
                if title is not None:
                    print(f"  Title (full ns): {title.text}")
            
            # Check for shape elements
            ellipse = node.find('.//svg:ellipse', ns)
            rect = node.find('.//svg:rect', ns)
            polygon = node.find('.//svg:polygon', ns)
            
            if ellipse is not None:
                print(f"  Shape: ellipse at cx={ellipse.get('cx')}, cy={ellipse.get('cy')}")
            elif rect is not None:
                print(f"  Shape: rect at x={rect.get('x')}, y={rect.get('y')}")
            elif polygon is not None:
                print(f"  Shape: polygon with points={polygon.get('points')[:50]}...")
            
            # Check text elements
            texts = node.findall('.//svg:text', ns)
            print(f"  Text elements: {len(texts)}")
            if texts:
                for i, text in enumerate(texts[:2]):
                    content = ''.join(text.itertext())
                    print(f"    Text {i}: {content[:50]}")
        
        # Check edges
        edges1 = root.findall('.//svg:g[@class="edge"]', ns)
        edges2 = root.findall('.//g[@class="edge"]')
        print(f"\nEdges with ns: {len(edges1)}")
        print(f"Edges without ns: {len(edges2)}")
        
        if edges1:
            edge = edges1[0]
            title = edge.find('svg:title', ns)
            if title is not None:
                print(f"First edge: {title.text}")
            path = edge.find('.//svg:path', ns)
            if path is not None:
                path_d = path.get('d', '')
                print(f"Path data: {path_d[:100]}...")
        
    except Exception as e:
        print(f"✗ Error parsing SVG: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == '__main__':
    print("="*60)
    print("Debug: SVG Parsing Test")
    print("="*60)
    test_svg_parsing()
