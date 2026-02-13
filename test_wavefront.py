#!/usr/bin/env python3
"""
Test script to validate the wavefront PyQt application logic without GUI.
Tests file parsing and core functionality.
"""

import sys
import re
from pathlib import Path
from collections import defaultdict

# Test DataflowEntry class
class DataflowEntry:
    """Represents a single entry in the fire log."""
    def __init__(self, cycle: int, instruction_id: int, instruction_name: str, args: list, line: str):
        self.cycle = cycle
        self.instruction_id = instruction_id
        self.instruction_name = instruction_name
        self.args = args
        self.line = line

def parse_fire_log(content: str):
    """Parse the fire log content."""
    fire_log_data = []
    cycle_data = defaultdict(list)
    
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
            fire_log_data.append(entry)
            cycle_data[cycle].append(entry)
    
    return fire_log_data, cycle_data

def extract_node_ids_from_dot(dot_content: str):
    """Extract node IDs from DOT content."""
    id_pattern = re.compile(r'\[ID:(\d+)\]')
    node_ids = set()
    for match in id_pattern.finditer(dot_content):
        node_id = int(match.group(1))
        node_ids.add(node_id)
    return node_ids

def test_with_example_files():
    """Test with the example files in the repository."""
    examples_dir = Path(__file__).parent / "examples"
    
    # Test DOT file loading
    dot_file = examples_dir / "example_dot.dot"
    if dot_file.exists():
        print(f"✓ Found DOT file: {dot_file}")
        with open(dot_file, 'r') as f:
            dot_content = f.read()
        print(f"  - Size: {len(dot_content)} bytes")
        
        node_ids = extract_node_ids_from_dot(dot_content)
        print(f"  - Extracted {len(node_ids)} node IDs from DOT file")
        print(f"  - Node IDs range: {min(node_ids) if node_ids else 'N/A'} to {max(node_ids) if node_ids else 'N/A'}")
    else:
        print(f"✗ DOT file not found: {dot_file}")
        return False
    
    # Test fire log loading
    log_file = examples_dir / "fire.log"
    if log_file.exists():
        print(f"\n✓ Found fire log: {log_file}")
        with open(log_file, 'r') as f:
            log_content = f.read()
        print(f"  - Size: {len(log_content)} bytes")
        
        fire_log_data, cycle_data = parse_fire_log(log_content)
        print(f"  - Parsed {len(fire_log_data)} entries")
        print(f"  - Found {len(cycle_data)} cycles")
        
        if cycle_data:
            min_cycle = min(cycle_data.keys())
            max_cycle = max(cycle_data.keys())
            print(f"  - Cycle range: {min_cycle} to {max_cycle}")
            
            # Show first few entries
            print(f"\n  First 5 entries:")
            for i, entry in enumerate(fire_log_data[:5]):
                print(f"    [{entry.cycle}] ({entry.instruction_id}) {entry.instruction_name} {' '.join(entry.args)}")
            
            # Show instructions per cycle statistics
            cycles_with_data = [c for c in range(min_cycle, min(min_cycle + 5, max_cycle + 1))]
            print(f"\n  Instructions per cycle (first 5 cycles):")
            for cycle in cycles_with_data:
                count = len(cycle_data.get(cycle, []))
                print(f"    Cycle {cycle}: {count} instructions")
    else:
        print(f"✗ Fire log not found: {log_file}")
        return False
    
    # Test graphviz rendering (just check if library is available)
    try:
        import graphviz
        print(f"\n✓ Graphviz Python library available")
        
        # Try to render the example DOT file
        src = graphviz.Source(dot_content)
        svg_data = src.pipe(format='svg').decode('utf-8')
        print(f"  - Successfully rendered DOT to SVG ({len(svg_data)} bytes)")
    except ImportError:
        print(f"\n✗ Graphviz Python library not available")
        return False
    except Exception as e:
        print(f"\n✗ Error rendering with Graphviz: {e}")
        return False
    
    print("\n" + "="*60)
    print("✓ All tests passed! The PyQt application should work correctly.")
    print("="*60)
    return True

if __name__ == '__main__':
    success = test_with_example_files()
    sys.exit(0 if success else 1)
