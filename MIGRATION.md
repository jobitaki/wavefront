# Migration from Web to PyQt Framework

## Overview

This document describes the migration of the Wavefront Dataflow Visualizer from a web-based application (HTML/JavaScript) to a desktop application using the PyQt6 framework.

## Original Implementation

The original application was a browser-based tool built with:
- **HTML/CSS** for UI layout and styling
- **JavaScript** (app.js) for application logic
- **D3.js** for SVG manipulation
- **@hpcc-js/wasm** for Graphviz rendering in the browser
- Required opening `index.html` in a web browser

## New PyQt Implementation

The new desktop application is built with:
- **PyQt6** - Python bindings for Qt6 framework
- **Python 3.8+** - Modern Python for application logic
- **Graphviz Python library** - Direct integration with Graphviz
- **QGraphicsView/QGraphicsScene** - High-performance graphics rendering

## Feature Comparison

| Feature | Web Version | PyQt Version |
|---------|-------------|--------------|
| File Loading | Drag & drop, file picker | Native file dialogs |
| Graph Rendering | Graphviz WASM | Graphviz native (faster) |
| Visualization | SVG via D3.js | SVG via QGraphicsSvgItem |
| Zoom/Pan | D3 zoom behavior | QGraphicsView built-in |
| Playback | JavaScript timers | QTimer (more reliable) |
| Keyboard Shortcuts | JavaScript events | Qt key events |
| Execution Log | DOM manipulation | QTextEdit with HTML |
| Platform | Browser (any OS) | Native desktop (Win/Mac/Linux) |
| Dependencies | Internet (CDN) | Local installation only |

## Implementation Details

### File Structure

```
wavefront/
├── index.html              # Original web UI
├── app.js                  # Original web logic (864 lines)
├── styles.css              # Original web styles
├── wavefront_qt.py         # NEW: PyQt application (520+ lines)
├── requirements.txt        # NEW: Python dependencies
├── test_wavefront.py       # NEW: Test script
├── run_wavefront.sh        # NEW: Linux/Mac launcher
├── run_wavefront.bat       # NEW: Windows launcher
├── README.md               # Updated main README
├── README_PYQT.md          # NEW: PyQt documentation
└── examples/
    ├── example_dot.dot     # Sample graph
    └── fire.log            # Sample execution trace
```

### Key Classes

#### `WavefrontVisualizer` (Main Window)
- Inherits from `QMainWindow`
- Manages UI layout and widgets
- Handles file loading and parsing
- Controls playback and animation
- Implements keyboard shortcuts

#### `GraphViewer` (Custom Graphics View)
- Inherits from `QGraphicsView`
- Provides zoom/pan functionality
- Handles mouse wheel events
- Manages view transformations

#### `DataflowEntry` (Data Model)
- Represents a single fire log entry
- Stores cycle, instruction ID, name, and arguments
- Used for animation and display

### Core Functionality

#### 1. File Loading
- **DOT Files**: Loaded via `QFileDialog`, parsed by Graphviz library
- **Fire Logs**: Loaded via `QFileDialog`, parsed with regex pattern matching

#### 2. Graph Rendering
```python
src = graphviz.Source(self.dot_content)
svg_data = src.pipe(format='svg').decode('utf-8')
renderer = QSvgRenderer(svg_data.encode('utf-8'))
self.svg_item = QGraphicsSvgItem()
self.svg_item.setSharedRenderer(renderer)
```

#### 3. Animation System
- Uses `QTimer` for cycle-based playback
- Adjustable speed (1x to 10x)
- Manual step-through with Previous/Next buttons

#### 4. Fire Log Parsing
Pattern: `[cycle] (instruction_id) instruction_name [args...]`
```python
pattern = re.compile(r'^\[(\d+)\]\s+\((\d+)\)\s+(\S+)(.*)$')
```

## Advantages of PyQt Version

### 1. **Performance**
- Native rendering is faster than browser-based
- Direct Graphviz integration (no WASM overhead)
- Efficient memory management with Qt

### 2. **User Experience**
- Native file dialogs
- System integration (taskbar, dock)
- No browser chrome/tabs
- Better keyboard/mouse handling

### 3. **Offline Capability**
- No internet connection required
- No CDN dependencies
- All assets bundled locally

### 4. **Cross-Platform**
- Single codebase for Windows, macOS, Linux
- Native look and feel on each platform
- Qt handles platform differences

### 5. **Extensibility**
- Easy to add new features in Python
- Rich Qt widget library
- Strong typing and IDE support

## Known Limitations

### 1. **Node Highlighting**
The current implementation uses `QGraphicsSvgItem` for rendering, which doesn't allow easy manipulation of individual SVG elements. Node highlighting during animation is limited.

**Potential Solutions:**
- Parse SVG and create individual QGraphicsItems for each node/edge
- Use Qt's Graphics View framework with custom items
- Implement overlay graphics for highlighting

### 2. **System Dependencies**
- Requires Graphviz to be installed on the system
- Requires Python 3.8+ 
- May need additional system libraries (EGL, etc.) on some Linux distros

### 3. **UI Customization**
The PyQt version uses native widgets which may look different from the web version's custom styling. The functionality is equivalent but the visual appearance differs.

## Installation Requirements

### System Packages
```bash
# Ubuntu/Debian
sudo apt-get install graphviz libegl1

# macOS
brew install graphviz

# Windows
# Download installer from graphviz.org
```

### Python Requirements
- **Python 3.9 or higher** (required by PyQt6)

### Python Packages
```bash
pip install PyQt6 graphviz
```

## Testing

The test suite (`test_wavefront.py`) validates:
- DOT file parsing and node ID extraction
- Fire log parsing and cycle organization
- Graphviz rendering to SVG
- Example file loading

Run tests:
```bash
python3 test_wavefront.py
```

Expected output:
- ✓ 58 node IDs extracted from example DOT
- ✓ 607 entries parsed from fire log
- ✓ 130 cycles identified
- ✓ Successful SVG rendering

## Future Enhancements

### Potential Improvements
1. **Enhanced Node Highlighting**: Parse SVG and create manipulable graphics items
2. **Export Features**: Save animation as video or GIF
3. **Multiple Windows**: Support multiple visualizations simultaneously
4. **Graph Editing**: Allow interactive graph modifications
5. **Advanced Analytics**: Add statistics and performance metrics
6. **Plugin System**: Support for custom analyzers and visualizations
7. **Themes**: Light/dark theme support
8. **Session Saving**: Save and restore visualization sessions

### Code Quality
- Add comprehensive unit tests
- Add integration tests with Qt Test framework
- Add type hints throughout
- Add docstrings for all public methods
- Set up CI/CD pipeline

## Migration Summary

The migration successfully translates all core functionality from the web version to a native desktop application:

✅ File loading (DOT graphs and fire logs)
✅ Graph rendering with Graphviz
✅ Cycle-based playback animation
✅ Playback controls (play, pause, step, reset)
✅ Speed adjustment (1x-10x)
✅ Zoom and pan functionality
✅ Keyboard shortcuts
✅ Execution log display
✅ Statistics tracking
✅ Cross-platform support

The PyQt version provides a solid foundation for future enhancements while maintaining feature parity with the original web application.
