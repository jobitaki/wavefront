# Quick Start Guide - PyQt Version

Get started with the Wavefront PyQt desktop application in 3 easy steps!

## 1️⃣ Install Dependencies

### System Requirements
- Python 3.9 or higher
- Graphviz system package

### Install Graphviz
**Ubuntu/Debian:**
```bash
sudo apt-get install graphviz
```

**macOS:**
```bash
brew install graphviz
```

**Windows:**
Download from https://graphviz.org/download/

### Install Python Packages
```bash
pip install -r requirements.txt
```

## 2️⃣ Launch the Application

Choose your platform:

**Linux/macOS:**
```bash
./run_wavefront.sh
```

**Windows:**
```
run_wavefront.bat
```

**Direct Python:**
```bash
python3 wavefront_qt.py
```

## 3️⃣ Load Your Files

1. Click **"Load DOT Graph"** and select a `.dot` file (try `examples/example_dot.dot`)
2. Click **"Load Fire Log"** and select a `.log` file (try `examples/fire.log`)
3. The graph will render automatically!

## 🎮 Basic Controls

### Playback
- Click **Play** to start animation
- Use **Previous/Next** to step through cycles
- Press **Space** to play/pause

### Navigation
- **Mouse wheel**: Zoom in/out
- **Click + drag**: Pan around graph
- **Reset View**: Return to original position

### Shortcuts
- `Space`: Play/Pause
- `←/→`: Previous/Next cycle
- `Home`: Reset to start
- `End`: Jump to last cycle

## 📖 Need More Help?

- **Full Documentation**: See `README_PYQT.md`
- **Technical Details**: See `MIGRATION.md`
- **UI Guide**: See `VISUAL_GUIDE.md`

## 🐛 Troubleshooting

**"Graphviz library not found"**
- Install system graphviz package (see step 1)
- Install Python graphviz: `pip install graphviz`

**"Python 3.9 required"**
- Update Python: `python3 --version`
- Use pyenv or conda to install Python 3.9+

**Graph doesn't render**
- Verify DOT file is valid: `dot -Tsvg file.dot -o test.svg`
- Check console for error messages

## ✨ That's It!

You're ready to visualize dataflow graphs. Enjoy! 🚀
