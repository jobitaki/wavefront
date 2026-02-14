const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'wavefront_logo.png')
  });

  // Load the index.html of the app
  mainWindow.loadFile('index.html');

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Wavefront',
          click: () => {
            const aboutWindow = new BrowserWindow({
              width: 400,
              height: 300,
              parent: mainWindow,
              modal: true,
              show: false,
              webPreferences: {
                nodeIntegration: false
              }
            });
            aboutWindow.loadURL(`data:text/html;charset=utf-8,
              <html>
                <head>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      padding: 20px;
                      text-align: center;
                    }
                    h1 { color: #333; }
                    p { color: #666; }
                  </style>
                </head>
                <body>
                  <h1>Wavefront</h1>
                  <p>Version 1.0.0</p>
                  <p>A dataflow visualizer for cycle-by-cycle previews of tokens flowing through dataflow graphs.</p>
                  <p><a href="https://github.com/jobitaki/wavefront">GitHub Repository</a></p>
                </body>
              </html>
            `);
            aboutWindow.once('ready-to-show', () => {
              aboutWindow.show();
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications to stay open until the user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
