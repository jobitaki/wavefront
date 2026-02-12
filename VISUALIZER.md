# Dataflow Token Visualizer

A web-based interface for visualizing the movement of dataflow tokens through the dataflow dot graph on a cycle-by-cycle basis.

![Dataflow Token Visualizer Interface](https://github.com/user-attachments/assets/e6ca81dc-ff8e-467d-bcf9-bd5de2009a7a)

## Overview

This visualizer helps you understand program execution by showing:
- The dataflow graph structure with instruction nodes and edges
- Cycle-by-cycle execution of instructions from the fire.log
- Visual tokens that highlight active instructions and their connections
- An execution log showing instruction details for each cycle

## Features

- 📊 **Interactive Graph Visualization**: Renders complex DOT graphs using Graphviz
- 🎬 **Cycle-by-Cycle Playback**: Step through or auto-play execution cycles
- 🔴 **Token Animation**: Red animated tokens appear on active instructions
- 📝 **Execution Log**: View instruction details with arguments for each cycle
- 📈 **Statistics**: See total cycles, instructions, and graph nodes
- ⚡ **Speed Control**: Adjust playback speed from 1x to 10x

## Usage

### Opening the Visualizer

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge, Safari)
2. The visualizer requires internet connectivity to load CDN resources:
   - @hpcc-js/wasm (Graphviz rendering library)
   - D3.js (visualization utilities)

### Loading Files

1. **Upload DOT Graph File**: Click "Choose File" under "DOT Graph File (.dot)" and select your `.dot` file
   - Example: `example_dot.dot` from this repository
   
2. **Upload Fire Log File**: Click "Choose File" under "Fire Log File (.log)" and select your fire log file
   - Example: `fire.log` from this repository

3. **Automatic Rendering**: Once both files are loaded, the graph will render automatically

### Playback Controls

- **▶ Play**: Start automatic cycle-by-cycle animation
- **⏸ Pause**: Pause the animation
- **⏮ Previous**: Step back one cycle
- **⏭ Next**: Step forward one cycle
- **⏮ Reset**: Reset to cycle 0
- **Speed Slider**: Adjust playback speed (1x - 10x)

### Keyboard Shortcuts

- **Space**: Play/Pause toggle
- **← (Left Arrow)**: Previous cycle
- **→ (Right Arrow)**: Next cycle
- **Home**: Reset to first cycle (cycle 0)
- **End**: Jump to last cycle

### Understanding the Visualization

- **Highlighted Nodes**: Nodes that glow indicate instructions executing in the current cycle
- **Red Tokens**: Animated red circles appear on active instruction nodes
- **Highlighted Edges**: Edges connected to active instructions are highlighted in gold
- **Execution Log**: Terminal-style log shows current and recent cycle instructions

## File Formats

### DOT Graph Format

The visualizer expects DOT format files with instruction IDs in node labels:
```dot
node_name [label="Instruction Name\n[ID:X]", ...];
```

The ID format `[ID:X]` is used to match instructions in the fire.log.

### Fire.log Format

Fire log entries should follow this format:
```
[cycle] (instruction_id) instruction_name [args...]
```

**Examples:**
```
[1] (3) copy 58 58
[2] (0) c0 0
[5] (22) mul 0 4 0
```

- `[cycle]`: The execution cycle number
- `(instruction_id)`: Unique instruction identifier (matches DOT graph ID)
- `instruction_name`: Name of the instruction
- `[args...]`: Space-separated arguments/operands

## Technical Details

### Dependencies

- **@hpcc-js/wasm**: JavaScript port of Graphviz for DOT rendering
- **D3.js**: For SVG manipulation and utilities

### Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Architecture

- `index.html`: Main HTML structure and styling
- `app.js`: JavaScript application logic
  - File handling and parsing
  - Graph rendering with Graphviz
  - Animation and playback control
  - Token visualization

## Example Files

This repository includes example files:
- `example_dot.dot`: Sample dataflow graph (235 lines)
- `fire.log`: Sample execution trace (607 entries)

## Documentation References

For more details on the fire.log and DOT graph formats, see:
- `README.md`: Main documentation with format mappings
- `fire_log_quick_reference.txt`: Quick lookup guide for instruction formats
- `fire_log_port_mapping.md`: Complete reference for port mappings
- `example_trace.md`: Concrete walkthrough example

## Troubleshooting

### Graph not rendering
- Ensure both files are uploaded
- Check browser console for errors
- Verify CDN resources are accessible (requires internet)

### Instructions not highlighting
- Verify fire.log instruction IDs match DOT graph IDs
- Check that DOT labels contain `[ID:X]` format

### Performance issues
- Large graphs (>500 nodes) may render slowly
- Consider using a modern browser with hardware acceleration
- Reduce playback speed for complex visualizations

## Future Enhancements

Potential improvements:
- Zoom and pan controls for large graphs
- Filter instructions by type or cycle range
- Export visualization as video or GIF
- Search functionality for specific instructions
- Side-by-side comparison of multiple runs

## License

See repository LICENSE file for details.
