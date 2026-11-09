const http = require('http');
const path = require('path');
const fs = require('fs');
const { createApiServer } = require('./apiServer.cjs');
const { attachSyncWebSocketServer } = require('./syncHub.cjs');
const { batchStopProfiles } = require('./browserLauncher.cjs');

// Parse --port argument or fallback to env / 19888
const portArg = process.argv.find((a) => a.startsWith('--port='));
let initialPort = 19888;
if (portArg) {
  initialPort = parseInt(portArg.split('=')[1], 10) || 19888;
} else if (process.env.CHAMELEON_PORT) {
  initialPort = parseInt(process.env.CHAMELEON_PORT, 10) || 19888;
}

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

let activePort = initialPort;
let maxRetries = 20;

function tryListen(port, retriesLeft) {
  const srv = http.createServer(expressApp);

  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (retriesLeft > 0) {
        console.warn(`[ChameleonX Backend] Port ${port} is in use, hunting for next available port (${port + 1})...`);
        tryListen(port + 1, retriesLeft - 1);
      } else {
        console.error(`[ChameleonX Backend] Fatal: Unable to find an available port in range.`);
        process.exit(1);
      }
    } else {
      console.error('[ChameleonX Backend] Server error:', err);
    }
  });

  srv.listen(port, HOST, () => {
    activePort = port;
    process.env.CHAMELEON_PORT = String(port);
    attachSyncWebSocketServer(srv);
    console.log(`[ChameleonX Backend] Ready at http://${HOST}:${port} (Port verified)`);

    // Write ephemeral active port file so other components / CLI can read it
    try {
      const { DATA_DIR } = require('./store.cjs');
      const portFile = path.join(DATA_DIR, '.active_port');
      fs.writeFileSync(portFile, JSON.stringify({ port, pid: process.pid, timestamp: Date.now() }), 'utf8');
    } catch (e) {}
  });
}

tryListen(initialPort, maxRetries);

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

// Guard against unhandled errors causing unexpected process crash
process.on('uncaughtException', (err) => {
  console.error('[ChameleonX Backend] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[ChameleonX Backend] Unhandled Rejection:', reason);
});

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('message', (msg) => {
  if (msg === 'shutdown') cleanup();
});
