# Wavefront - Dataflow Token Visualizer (PyQt Version)

A desktop application for visualizing dataflow graphs and animating execution traces using PyQt6.

## Features

- **DOT Graph Visualization**: Load and render dataflow graphs in DOT format using Graphviz
- **Fire Log Animation**: Animate execution traces with cycle-by-cycle playback
- **Node Highlighting**: Active nodes are highlighted during playback with orange glow effect
- **Edge Highlighting**: Edges connected to active nodes are highlighted in gold
- **Token Visualization**: Data values displayed as red tokens on edges showing data flow
- **Interactive Controls**: Play, pause, step forward/backward through execution cycles
- **Zoom & Pan**: Interactive graph navigation with mouse wheel zoom and drag-to-pan
- **Execution Log**: Real-time display of instructions executed in each cycle
- **Statistics**: Track total cycles and nodes in the graph
- **Keyboard Shortcuts**: Efficient navigation using keyboard controls

## Installation

### Prerequisites

1. **Python 3.9 or higher** (required by PyQt6)
2. **System dependencies**:
   - Graphviz (for graph rendering)

#### Installing System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get install graphviz
```

**macOS:**
```bash
brew install graphviz
```

**Windows:**
Download and install from: https://graphviz.org/download/

### Python Dependencies

Install the required Python packages:

```bash
pip install -r requirements.txt
```

Or install manually:
```bash
pip install PyQt6 graphviz
```

## Usage

### Running the Application

```bash
python3 wavefront_qt.py
```

### Loading Files

1. Click **"Load DOT Graph"** to load a `.dot` file
2. Click **"Load Fire Log"** to load a fire log file (`.log` or `.txt`)
3. Once both files are loaded, the graph will render automatically

### Playback Controls

- **Play**: Start automatic cycle playback
- **Pause**: Pause playback
- **Previous**: Go to previous cycle
- **Next**: Go to next cycle  
- **Reset**: Return to cycle 0
- **Speed Slider**: Adjust playback speed (1x to 10x)

### Keyboard Shortcuts

- `Space`: Play/Pause
- `←` (Left Arrow): Previous cycle
- `→` (Right Arrow): Next cycle
- `Home`: Reset to cycle 0
- `End`: Jump to last cycle

### Zoom Controls

- **Mouse Wheel**: Zoom in/out
- **Zoom In (+)**: Zoom in button
- **Zoom Out (-)**: Zoom out button
- **Reset View**: Reset zoom to 100%
- **Drag**: Pan around the graph (click and drag)

## Example Files

Example files are provided in the `examples/` directory:
- `example_dot.dot`: Sample dataflow graph in DOT format
- `fire.log`: Sample execution trace

## File Formats

### DOT Graph Format

The application accepts standard Graphviz DOT format files. Nodes should include `[ID:X]` labels for proper animation mapping.

### Fire Log Format

Each line should follow this format:
```
[cycle] (instruction_id) instruction_name [args...]
```

Example:
```
[1] (3) copy 58 58
[2] (19) c1_1 1
[2] (11) pconst_arg4 4
```

## Differences from Web Version

This PyQt desktop version provides:
- Native desktop application experience
- Better performance for large graphs
- Offline usage (no internet connection required)
- System file dialogs for easier file access
- Cross-platform support (Windows, macOS, Linux)

## Architecture

The application consists of:

- **WavefrontVisualizer**: Main window and application controller
- **GraphViewer**: Custom QGraphicsView with zoom/pan support
- **DataflowEntry**: Data model for fire log entries
- Graph rendering using Graphviz Python library
- SVG-based visualization with QGraphicsSvgItem

## Testing

Run the test script to verify functionality:

```bash
python3 test_wavefront.py
```

This will validate:
- DOT file parsing
- Fire log parsing
- Graphviz rendering
- Example file loading

## Troubleshooting

### "Graphviz library not found" error

Make sure both the Graphviz system package and Python library are installed:
```bash
# System package
sudo apt-get install graphviz  # Linux
brew install graphviz          # macOS

# Python package
pip install graphviz
```

### Graph doesn't render

- Verify the DOT file is valid Graphviz format
- Try opening the DOT file with `dot` command: `dot -Tsvg file.dot -o output.svg`
- Check console output for error messages

### Missing system libraries (Linux)

If you get errors about missing EGL or GL libraries:
```bash
sudo apt-get install libegl1 libglib2.0-0
```

## Development

The main application file is `wavefront_qt.py` which contains:
- UI initialization and layout
- File loading and parsing
- Graph rendering with Graphviz
- Animation/playback logic
- Event handling and keyboard shortcuts

## License

See the main repository LICENSE file.

## Links

- Original Web Version: See `index.html` and `app.js`
- Documentation: See `docs/` directory
- Repository: https://github.com/jobitaki/wavefront
