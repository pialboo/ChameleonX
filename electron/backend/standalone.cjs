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

// Graceful shutdown endpoint
expressApp.post('/api/system/shutdown', async (req, res) => {
  res.json({ success: true, message: 'Shutting down backend and all browser profiles...' });
  setTimeout(cleanup, 150);
});

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

let isCleaningUp = false;
async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('[ChameleonX Backend] Cleaning up and stopping all browser profiles...');
  try {
    await batchStopProfiles();
  } catch (e) {
    console.warn('[ChameleonX Backend] Cleanup error:', e);
  }
  process.exit(0);
}

// Auto-cleanup when parent process (Tauri) closes stdin pipe or terminates
process.stdin.resume();
process.stdin.on('end', () => {
  console.log('[ChameleonX Backend] Parent process closed stdin, shutting down...');
  cleanup();
});
process.stdin.on('close', () => {
  console.log('[ChameleonX Backend] Stdin closed, shutting down...');
  cleanup();
});

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('message', (msg) => {
  if (msg === 'shutdown') cleanup();
});
