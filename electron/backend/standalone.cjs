const http = require('http');
const path = require('path');
const fs = require('fs');
const { createApiServer } = require('./apiServer.cjs');
const { attachSyncWebSocketServer } = require('./syncHub.cjs');
const { batchStopProfiles } = require('./browserLauncher.cjs');

const PORT = 19888;
const HOST = '127.0.0.1';

// Server dialog handler fallback (Tauri handles dialogs on frontend via @tauri-apps/plugin-dialog)
async function fallbackDialogHandler(options = {}) {
  return null;
}

const expressApp = createApiServer(fallbackDialogHandler);

// Serve static frontend assets if dist exists
const distPath = path.join(__dirname, '..', '..', 'dist');
if (fs.existsSync(distPath)) {
  expressApp.use(require('express').static(distPath));
}

const server = expressApp.listen(PORT, HOST, () => {
  attachSyncWebSocketServer(server);
  console.log(`[ChameleonX Backend] Ready at http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[ChameleonX Backend] Port ${PORT} already active, reusing existing backend instance.`);
    process.exit(0);
  } else {
    console.error('[ChameleonX Backend] Server error:', err);
  }
});

async function cleanup() {
  console.log('[ChameleonX Backend] Cleaning up and stopping browser profiles...');
  try {
    await batchStopProfiles();
  } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('message', (msg) => {
  if (msg === 'shutdown') cleanup();
});
