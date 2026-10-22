const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: true,
    },
  });

  const htmlPath = path.join(__dirname, 'render_icon.html');
  await win.loadFile(htmlPath);

  // Wait for rendering
  await new Promise((r) => setTimeout(r, 500));

  const image = await win.webContents.capturePage();
  const pngBuffer = image.toPNG();

  const iconDest = path.join(__dirname, '..', 'electron', 'assets', 'icon.png');
  fs.writeFileSync(iconDest, pngBuffer);
  console.log(`[IconGen] Saved ${pngBuffer.length} bytes to ${iconDest}`);

  // Also generate 32x32 tray icon
  const trayWin = new BrowserWindow({
    width: 32,
    height: 32,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: true,
    },
  });
  await trayWin.loadFile(htmlPath);
  await new Promise((r) => setTimeout(r, 300));
  const trayImg = await trayWin.webContents.capturePage();
  const trayBuffer = trayImg.resize({ width: 32, height: 32 }).toPNG();

  const trayDest = path.join(__dirname, '..', 'electron', 'assets', 'tray.png');
  fs.writeFileSync(trayDest, trayBuffer);
  console.log(`[IconGen] Saved tray icon ${trayBuffer.length} bytes to ${trayDest}`);

  app.quit();
});
