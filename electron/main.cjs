const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { createApiServer } = require('./backend/apiServer.cjs');
const { batchStopProfiles } = require('./backend/browserLauncher.cjs');
const { attachSyncWebSocketServer } = require('./backend/syncHub.cjs');
const { DATA_DIR } = require('./backend/store.cjs');

// Single Instance Lock: 限制單一執行個體，重複開啟時自動喚出原主視窗
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Ensure Electron always gets a clean, unlocked userData directory so it never fails with Lockfile Error 32 or Cache Error 5
function setupCleanUserDataDir() {
  const baseSessionDir = path.join(DATA_DIR, 'app_session');
  fs.mkdirSync(baseSessionDir, { recursive: true });
  const lockFile = path.join(baseSessionDir, 'lockfile');
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
    app.setPath('userData', baseSessionDir);
  } catch (e) {
    // If lockfile is held by another process, use a fresh session dir so this window still opens cleanly
    const fallbackDir = path.join(DATA_DIR, `app_session_${process.pid}`);
    fs.mkdirSync(fallbackDir, { recursive: true });
    app.setPath('userData', fallbackDir);
  }
}

setupCleanUserDataDir();

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('log-level', '3');

let mainWindow = null;
let apiServerInstance = null;
let tray = null;
let isQuitting = false;
const API_PORT = 19888;

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('ChameleonX 指紋瀏覽器 (運行中)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🦎 顯示 ChameleonX 主視窗',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '縮小至工具列',
      click: () => {
        if (mainWindow) {
          mainWindow.minimize();
        }
      },
    },
    {
      label: '隱藏至系統匣',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      },
    },
    { type: 'separator' },
    {
      label: '🛑 完全退出 ChameleonX',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
        mainWindow.focus();
      } else {
        mainWindow.hide();
      }
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

async function handleElectronDialog(options = {}) {
  if (!mainWindow) return null;
  if (options.type === 'directory') {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: options.title || '選擇擴充功能資料夾',
      properties: ['openDirectory'],
    });
    return res.canceled ? null : res.filePaths[0];
  } else if (options.type === 'saveFile') {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: options.title || '儲存檔案',
      defaultPath: options.defaultPath || 'ChameleonX_Backup.zip',
      filters: options.filters || [
        { name: 'ZIP 備份壓縮檔', extensions: ['zip'] },
        { name: '所有檔案', extensions: ['*'] },
      ],
    });
    return res.canceled ? null : res.filePath;
  } else {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: options.title || '選擇檔案',
      properties: ['openFile'],
      filters: options.filters || [
        { name: 'Chrome 擴充功能或執行檔', extensions: ['crx', 'zip', 'exe'] },
        { name: '所有檔案', extensions: ['*'] },
      ],
    });
    return res.canceled ? null : res.filePaths[0];
  }
}

function startLocalBackend() {
  return new Promise((resolve) => {
    const expressApp = createApiServer(handleElectronDialog);
    const distPath = path.join(__dirname, '..', 'dist');
    if (fs.existsSync(distPath)) {
      expressApp.use(require('express').static(distPath));
    }
    apiServerInstance = expressApp.listen(API_PORT, '127.0.0.1', () => {
      attachSyncWebSocketServer(apiServerInstance);
      console.log(`[ChameleonX] Server ready at http://127.0.0.1:${API_PORT}`);
      resolve();
    });
    apiServerInstance.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[ChameleonX] Port ${API_PORT} already active.`);
        resolve();
      }
    });
  });
}

function createWindow() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  const iconPath = process.platform === 'win32' && fs.existsSync(icoPath)
    ? icoPath
    : (fs.existsSync(pngPath) ? pngPath : undefined);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1080,
    minHeight: 680,
    title: 'ChameleonX',
    backgroundColor: '#0c0e12',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 當使用者點擊右上角 X 關閉時，隱藏縮小至系統常駐匣，確保後台環境與代理不被中斷
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadURL(`http://127.0.0.1:${API_PORT}`);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

ipcMain.handle('dialog:selectDirectory', async () => {
  return handleElectronDialog({ type: 'directory' });
});

ipcMain.handle('dialog:selectFile', async (_event, filters) => {
  return handleElectronDialog({ type: 'file', filters });
});

ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
  if (!mainWindow) return null;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: options.title || '儲存備份檔案',
    defaultPath: options.defaultPath || 'ChameleonX_Backup.zip',
    filters: options.filters || [
      { name: 'ZIP 備份壓縮檔', extensions: ['zip'] },
      { name: '所有檔案', extensions: ['*'] },
    ],
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('window:control', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === 'close') {
    if (!isQuitting) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  } else if (action === 'hide') {
    mainWindow.hide();
  }
});

app.whenReady().then(async () => {
  // 設定 Windows App User Model ID，確保工作列正確綁定專屬圖示
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.chameleonx.app');
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  await startLocalBackend();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // 在 Windows 系統匣常駐模式下，視窗關閉不代表整個程式退出
  if (isQuitting) {
    try {
      if (apiServerInstance) apiServerInstance.close();
    } catch (e) {}
    try {
      await batchStopProfiles();
    } catch (e) {}
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  try {
    await batchStopProfiles();
  } catch (e) {}
});
