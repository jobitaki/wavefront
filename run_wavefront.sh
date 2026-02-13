#!/bin/bash
# Wavefront launcher script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed or not in PATH"
    exit 1
fi

# Check if requirements are installed
python3 -c "import PyQt6" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "PyQt6 not found. Installing dependencies..."
    python3 -m pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies"
        exit 1
    fi
fi

# Check if graphviz is installed
if ! command -v dot &> /dev/null; then
    echo "Warning: Graphviz 'dot' command not found."
    echo "Please install graphviz:"
    echo "  Ubuntu/Debian: sudo apt-get install graphviz"
    echo "  macOS: brew install graphviz"
    echo "  Windows: Download from https://graphviz.org/download/"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run the application
echo "Starting Wavefront Visualizer..."
python3 wavefront_qt.py
