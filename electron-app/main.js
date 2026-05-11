const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let serverStarted = false;

function getResourcePath(rel) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, rel);
  }
  return path.join(__dirname, '..', rel);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'QuickBite — Counter Dashboard',
    backgroundColor: '#0a0f1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'dashboard', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Start the server
  try {
    const { startServer, getLocalIP } = require('./server');
    const customerMenuPath = getResourcePath('customer-menu');
    const io = await startServer(3000, customerMenuPath);
    global.io = io;
    global.localIP = getLocalIP();
    global.serverPort = 3000;
    serverStarted = true;
    console.log('Server started. IP:', global.localIP);
  } catch (e) {
    console.error('Server failed to start:', e);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// IPC
ipcMain.handle('get-server-info', () => ({
  ip: global.localIP || 'localhost',
  port: global.serverPort || 3000
}));

ipcMain.handle('open-external', (e, url) => shell.openExternal(url));
