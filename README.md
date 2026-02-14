<img src="wavefront_full.png?sanitize=true" alt="logo" width="400" /> 

# wavefront

Wavefront is a dataflow visualizer. It can generate cycle-by-cycle previews of tokens flowing through a dataflow graph and instructions firing. 

## Usage

**Live Demo:** [https://jobitaki.github.io/wavefront/](https://jobitaki.github.io/wavefront/)

### Running as a Desktop Application (Electron)

To run Wavefront as a desktop application:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the application:
   ```bash
   npm start
   ```

### Building Desktop Applications

To build standalone executables for distribution:

- **Windows**: `npm run build:win`
- **macOS**: `npm run build:mac`
- **Linux**: `npm run build:linux`
- **All platforms**: `npm run build`

Built applications will be available in the `dist/` directory.

### Running in Browser

Alternatively, you can open `index.html` directly in your browser. Example dot graph and fire.log are available in the examples directory.