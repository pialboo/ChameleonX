const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const proxyChain = require('proxy-chain');
const WebSocket = require('ws');
const AdmZip = require('adm-zip');
const { store, PROFILES_DIR, KERNEL_DIR } = require('./store.cjs');
const { buildProfileCoreExtension } = require('./extensionManager.cjs');

// Map<profileId, { pid, proc, debugPort, anonymizedProxyUrl, startedAt, kernelType }>
const runningProfiles = new Map();

let kernelDownloadState = {
  downloading: false,
  progress: 0,
  downloadedMB: '0.0',
  totalMB: '0.0',
  version: '',
  statusText: '閒置中',
  error: null,
};

/**
 * Recursively find chrome.exe inside KERNEL_DIR
 */
function findDownloadedFingerprintChromium(dir = KERNEL_DIR) {
  if (!fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'chrome.exe') {
        return fullPath;
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findDownloadedFingerprintChromium(path.join(dir, entry.name));
        if (found) return found;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Detect all available Chromium/Chrome executables on the machine
 */
function detectKernels() {
  const settings = store.getState().settings || {};
  const fpChromePath = findDownloadedFingerprintChromium(KERNEL_DIR);
  const systemCandidates = [
    { name: 'Google Chrome (系統安裝)', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', type: 'system-chrome' },
    { name: 'Google Chrome x86', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', type: 'system-chrome' },
    { name: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', type: 'system-edge' },
    { name: 'Microsoft Edge x64', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', type: 'system-edge' },
  ];

  const available = [];
  if (fpChromePath && fs.existsSync(fpChromePath)) {
    available.push({
      id: 'fingerprint-chromium',
      name: 'Fingerprint-Chromium (C++ 底層防關聯核心)',
      path: fpChromePath,
      isFingerprintCore: true,
    });
  }
  if (settings.customKernelPath && fs.existsSync(settings.customKernelPath)) {
    available.push({
      id: 'custom',
      name: '自訂瀏覽器核心路徑',
      path: settings.customKernelPath,
      isFingerprintCore: true,
    });
  }
  for (const cand of systemCandidates) {
    if (fs.existsSync(cand.path)) {
      available.push({
        id: cand.type,
        name: cand.name,
        path: cand.path,
        isFingerprintCore: false,
      });
    }
  }

  const hasFingerprintChromium = Boolean(fpChromePath && fs.existsSync(fpChromePath));
  let activeKernel = available[0] || null;
  let fallbackReason = null;

  if (settings.kernelMode === 'fingerprint-chromium') {
    const found = available.find((k) => k.id === 'fingerprint-chromium');
    if (found) {
      activeKernel = found;
    } else {
      fallbackReason = '已設定使用 Fingerprint-Chromium 但尚未下載，目前已自動降級使用系統 Chrome';
      activeKernel = available[0] || null;
    }
  } else if (settings.kernelMode === 'system-chrome') {
    activeKernel = available.find((k) => k.id === 'system-chrome') || activeKernel;
  } else if (settings.kernelMode === 'custom') {
    activeKernel = available.find((k) => k.id === 'custom') || activeKernel;
  }

  return {
    activeKernel,
    available,
    hasFingerprintChromium,
    fingerprintChromiumPath: fpChromePath,
    isMissingFingerprintCore: settings.kernelMode === 'fingerprint-chromium' && !hasFingerprintChromium,
    fallbackReason,
    downloadState: kernelDownloadState,
  };
}

/**
 * Download latest fingerprint-chromium Windows x64 zip from GitHub and extract to KERNEL_DIR
 */
async function downloadFingerprintChromium() {
  if (kernelDownloadState.downloading) {
    return kernelDownloadState;
  }
  kernelDownloadState = {
    downloading: true,
    progress: 2,
    downloadedMB: '0.0',
    totalMB: '0.0',
    version: '查詢最新版本中...',
    statusText: '正在連線 GitHub 取得最新 Fingerprint-Chromium 版本資訊...',
    error: null,
  };

  // Run asynchronously so HTTP request returns immediately
  (async () => {
    try {
      const releaseRes = await fetch('https://api.github.com/repos/adryfish/fingerprint-chromium/releases/latest', {
        headers: { 'User-Agent': 'Dolphin-Anty-TW-Desktop' },
      });
      if (!releaseRes.ok) {
        throw new Error(`無法取得 GitHub Release (HTTP ${releaseRes.status})`);
      }
      const releaseData = await releaseRes.json();
      const version = releaseData.tag_name || 'latest';
      const winZipAsset = (releaseData.assets || []).find(
        (a) => a.name && a.name.toLowerCase().includes('windows') && a.name.toLowerCase().endsWith('.zip')
      );
      if (!winZipAsset) {
        throw new Error('在最新 Release 中找不到 Windows .zip 檔案');
      }

      const totalBytes = Number(winZipAsset.size) || 190 * 1024 * 1024;
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
      kernelDownloadState.version = version;
      kernelDownloadState.totalMB = totalMB;
      kernelDownloadState.statusText = `正在下載 Fingerprint-Chromium v${version} (${totalMB} MB)...`;

      const zipFilePath = path.join(KERNEL_DIR, `fp_chromium_${version}.zip`);
      const response = await fetch(winZipAsset.browser_download_url);
      if (!response.ok || !response.body) {
        throw new Error(`下載失敗 (HTTP ${response.status})`);
      }

      const fileStream = fs.createWriteStream(zipFilePath);
      const reader = response.body.getReader();
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.length;
        fileStream.write(Buffer.from(value));
        const pct = Math.min(92, Math.round((receivedBytes / totalBytes) * 90) + 2);
        kernelDownloadState.progress = pct;
        kernelDownloadState.downloadedMB = (receivedBytes / (1024 * 1024)).toFixed(1);
        kernelDownloadState.statusText = `正在下載核心 v${version}... (${kernelDownloadState.downloadedMB} / ${totalMB} MB)`;
      }

      await new Promise((resolve) => fileStream.end(resolve));

      kernelDownloadState.progress = 95;
      kernelDownloadState.statusText = '下載完成，正在解壓縮核心檔案（約需 10~20 秒）...';

      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(KERNEL_DIR, true);
      try {
        fs.unlinkSync(zipFilePath);
      } catch (e) {}

      const exePath = findDownloadedFingerprintChromium(KERNEL_DIR);
      if (!exePath) {
        throw new Error('解壓縮後找不到 chrome.exe');
      }

      store.getState().settings.kernelMode = 'fingerprint-chromium';
      store.save();

      kernelDownloadState = {
        downloading: false,
        progress: 100,
        downloadedMB: totalMB,
        totalMB,
        version,
        statusText: `✅ Fingerprint-Chromium v${version} 安裝完成！已自動設為預設核心`,
        error: null,
      };
    } catch (err) {
      kernelDownloadState = {
        downloading: false,
        progress: 0,
        downloadedMB: '0.0',
        totalMB: '0.0',
        version: '',
        statusText: '下載失敗',
        error: err.message || String(err),
      };
    }
  })();

  return kernelDownloadState;
}

/**
 * Find an available TCP port on 127.0.0.1
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Deterministically compute Chrome's 32-char extension ID ([a-p]{32}) for an unpacked extension path on Windows
 */
function computeChromeExtensionId(extPath) {
  try {
    const resolved = path.resolve(extPath);
    const hash = crypto
      .createHash('sha256')
      .update(Buffer.from(resolved, 'utf16le'))
      .digest('hex')
      .slice(0, 32);
    return hash
      .split('')
      .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
      .join('');
  } catch (e) {
    return '';
  }
}

/**
 * Write custom bookmarks and pinned extension IDs into the profile's Default/Bookmarks & Preferences before launch
 */
function syncProfileBookmarks(profileDir, bookmarks = [], userExtPaths = []) {
  try {
    const defaultDir = path.join(profileDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    const bookmarksPath = path.join(defaultDir, 'Bookmarks');

    const children = (bookmarks || []).map((bm, idx) => ({
      date_added: String(13350000000000000 + idx),
      guid: `00000000-0000-4000-8000-${String(idx + 100).padStart(12, '0')}`,
      id: String(idx + 5),
      name: bm.title || bm.name || '書籤',
      type: 'url',
      url: bm.url || 'https://www.google.com',
    }));

    const bookmarkJson = {
      checksum: '',
      roots: {
        bookmark_bar: {
          children,
          date_added: '13350000000000000',
          date_modified: '13350000000000000',
          guid: '0bc5d13f-2cba-5d74-951f-3f233fe6c908',
          id: '1',
          name: '書籤列',
          type: 'folder',
        },
        other: {
          children: [],
          date_added: '13350000000000000',
          date_modified: '0',
          guid: '82b081ec-3dd3-529c-8475-ab6c344590dd',
          id: '2',
          name: '其他書籤',
          type: 'folder',
        },
        synced: {
          children: [],
          date_added: '13350000000000000',
          date_modified: '0',
          guid: '4cf2e351-0e85-532b-bb37-df045d8f8d0f',
          id: '3',
          name: '行動裝置書籤',
          type: 'folder',
        },
      },
      version: 1,
    };
    fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarkJson, null, 2), 'utf8');

    // Ensure bookmark bar and pinned extensions are visible in Preferences
    const prefsPath = path.join(defaultDir, 'Preferences');
    let prefs = {};
    if (fs.existsSync(prefsPath)) {
      try {
        prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      } catch (e) {}
    }
    prefs.bookmark_bar = { ...(prefs.bookmark_bar || {}), show_on_all_tabs: true };
    prefs.credentials_enable_service = false;
    prefs.profile = {
      ...(prefs.profile || {}),
      password_manager_enabled: false,
    };

    const pinnedIds = userExtPaths
      .map((p) => computeChromeExtensionId(p))
      .filter(Boolean);
    const existingPinned = Array.isArray(prefs.extensions?.pinned_extensions)
      ? prefs.extensions.pinned_extensions
      : [];
    prefs.extensions = {
      ...(prefs.extensions || {}),
      pinned_extensions: Array.from(new Set([...existingPinned, ...pinnedIds])),
      ui: {
        ...(prefs.extensions?.ui || {}),
        developer_mode: true,
      },
    };
    fs.writeFileSync(prefsPath, JSON.stringify(prefs), 'utf8');
  } catch (e) {
    // non-fatal
  }
}

/**
 * Send raw CDP command to browser WebSocket endpoint without calling Runtime.enable
 */
async function sendRawCdpCommand(debugPort, method, params = {}) {
  const versionRes = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
  const versionInfo = await versionRes.json();
  const wsUrl = versionInfo.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('No webSocketDebuggerUrl');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch (e) {}
      reject(new Error('CDP timeout'));
    }, 4000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method, params }));
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {}
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Normalize cookie objects so Storage.setCookies accepts them
 */
function normalizeCookiesForCdp(cookies = []) {
  const valid = [];
  for (const c of cookies) {
    if (!c || !c.name || !c.domain) continue;
    const item = {
      name: String(c.name),
      value: String(c.value ?? ''),
      domain: String(c.domain),
      path: String(c.path || '/'),
      secure: Boolean(c.secure),
      httpOnly: Boolean(c.httpOnly),
    };
    if (c.expirationDate || c.expires) {
      const exp = Number(c.expirationDate || c.expires);
      if (!isNaN(exp) && exp > 0) item.expires = exp;
    }
    if (c.sameSite) {
      const ss = String(c.sameSite).toLowerCase();
      if (ss === 'lax') item.sameSite = 'Lax';
      else if (ss === 'strict') item.sameSite = 'Strict';
      else if (ss === 'none' || ss === 'no_restriction') {
        item.sameSite = 'None';
        item.secure = true;
      }
    }
    valid.push(item);
  }
  return valid;
}

/**
 * Launch a single browser profile
 */
async function launchProfile(profileId, windowBounds = null) {
  if (runningProfiles.has(profileId)) {
    const existing = runningProfiles.get(profileId);
    return {
      alreadyRunning: true,
      profileId,
      pid: existing.pid,
      startedAt: existing.startedAt,
    };
  }

  const state = store.getState();
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error(`找不到環境 ID：${profileId}`);
  }

  const kernelInfo = detectKernels();
  if (!kernelInfo.activeKernel) {
    throw new Error('找不到可用的 Chromium 或 Chrome 瀏覽器核心，請至「核心與系統設定」頁面一鍵下載 Fingerprint-Chromium 或指定路徑。');
  }

  const profileDir = path.join(PROFILES_DIR, profile.id);
  fs.mkdirSync(profileDir, { recursive: true });

  // 1. Build Per-Profile Core Fingerprint & Badge Extension
  const coreExtPath = buildProfileCoreExtension(profileDir, profile, state.settings);

  // 2. Collect all user/builtin extensions to load
  const extPaths = [coreExtPath];
  const userExtPaths = [];
  const profileExtIds = new Set(profile.extensionIds || []);
  for (const ext of state.extensions || []) {
    if ((ext.enabledForAll || profileExtIds.has(ext.id)) && ext.path && fs.existsSync(ext.path)) {
      if (!extPaths.includes(ext.path)) {
        extPaths.push(ext.path);
      }
      if (!userExtPaths.includes(ext.path)) {
        userExtPaths.push(ext.path);
      }
    }
  }

  // 3. Sync Bookmarks & Pinned Extensions in Preferences
  syncProfileBookmarks(profileDir, state.bookmarks || [], userExtPaths);

  // 4. Resolve Proxy if configured
  let effectiveProxy = null;
  if (profile.proxyMode === 'saved' && profile.proxyId) {
    effectiveProxy = (state.proxies || []).find((px) => px.id === profile.proxyId) || null;
  } else if (profile.proxyMode === 'custom' && profile.proxy && profile.proxy.host && profile.proxy.port) {
    effectiveProxy = profile.proxy;
  }

  let anonymizedProxyUrl = null;
  let chromeProxyArg = null;
  if (effectiveProxy && effectiveProxy.host && effectiveProxy.port) {
    let proto = (effectiveProxy.type || 'http').toLowerCase();
    if (proto === 'sock5' || proto === 'socks') proto = 'socks5';
    if (proto === 'sock4') proto = 'socks4';
    const hasAuth = Boolean(effectiveProxy.username && effectiveProxy.password);
    if (hasAuth && ['http', 'https', 'socks5', 'socks4'].includes(proto)) {
      const upstreamUrl = `${proto}://${encodeURIComponent(effectiveProxy.username)}:${encodeURIComponent(
        effectiveProxy.password
      )}@${effectiveProxy.host}:${effectiveProxy.port}`;
      try {
        anonymizedProxyUrl = await proxyChain.anonymizeProxy(upstreamUrl);
        chromeProxyArg = anonymizedProxyUrl;
      } catch (e) {
        chromeProxyArg = `${proto}://${effectiveProxy.host}:${effectiveProxy.port}`;
      }
    } else {
      chromeProxyArg = `${proto}://${effectiveProxy.host}:${effectiveProxy.port}`;
    }
  }

  // 5. Build Chromium launch arguments
  const fp = profile.fingerprint || {};
  const debugPort = await getFreePort();

  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--disable-features=RendererCodeIntegrity',
    '--disable-crash-reporter',
  ];

  // Native fingerprint-chromium C++ flags (harmlessly ignored by standard Chrome, natively used by fingerprint-chromium!)
  if (fp.seed) {
    args.push(`--fingerprint=${fp.seed}`);
  }
  if (fp.os) {
    args.push(`--fingerprint-platform=${fp.os}`);
  }
  if (fp.brand) {
    args.push(`--fingerprint-brand=${fp.brand}`);
  }
  if (fp.cpuCores) {
    args.push(`--fingerprint-hardware-concurrency=${fp.cpuCores}`);
  }
  if (fp.timezone) {
    args.push(`--timezone=${fp.timezone}`);
  }
  if (fp.locale) {
    args.push(`--lang=${fp.locale}`);
    args.push(`--accept-lang=${(fp.languages || [fp.locale]).join(',')}`);
  }
  if (fp.userAgent) {
    args.push(`--user-agent=${fp.userAgent}`);
  }
  if (fp.webrtc === 'disabled') {
    args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  } else if (fp.webrtc === 'altered') {
    args.push('--force-webrtc-ip-handling-policy=default_public_interface_only');
  }

  // Window size & position (supports bulk window tiling!)
  if (windowBounds && windowBounds.width && windowBounds.height) {
    args.push(`--window-size=${windowBounds.width},${windowBounds.height}`);
    args.push(`--window-position=${windowBounds.x || 0},${windowBounds.y || 0}`);
  } else if (fp.resolution) {
    const [w, h] = String(fp.resolution).split('x');
    if (w && h) {
      args.push(`--window-size=${w},${h}`);
    }
  }

  if (chromeProxyArg) {
    args.push(`--proxy-server=${chromeProxyArg}`);
    args.push('--proxy-bypass-list=<-loopback>');
  }

  if (state.settings.muteAudio) {
    args.push('--mute-audio');
  }
  if (state.settings.disableImages) {
    args.push('--blink-settings=imagesEnabled=false');
  }

  // Load extensions (supports both Fingerprint-Chromium --load-extension and Chrome 137+ CDP Extensions.loadUnpacked)
  if (extPaths.length > 0) {
    const joinedExts = extPaths.join(',');
    args.push('--enable-unsafe-extension-debugging');
    args.push(`--load-extension=${joinedExts}`);
  }

  // Extra custom Chromium arguments configured in settings
  if (state.settings.extraChromiumArgs && typeof state.settings.extraChromiumArgs === 'string') {
    const customArgs = state.settings.extraChromiumArgs
      .split(' ')
      .map((s) => s.trim())
      .filter(Boolean);
    args.push(...customArgs);
  }

  // Start pages
  const startUrls =
    Array.isArray(profile.startPages) && profile.startPages.filter(Boolean).length > 0
      ? profile.startPages.filter(Boolean)
      : [state.settings.defaultStartPage || 'https://browserleaks.com/canvas'];

  args.push(...startUrls);

  const proc = spawn(kernelInfo.activeKernel.path, args, {
    detached: false,
    stdio: 'ignore',
  });

  const startedAt = new Date().toISOString();
  runningProfiles.set(profile.id, {
    pid: proc.pid,
    proc,
    debugPort,
    anonymizedProxyUrl,
    startedAt,
    kernelName: kernelInfo.activeKernel.name,
  });

  // Update profile stats
  profile.lastLaunchedAt = startedAt;
  profile.launchCount = (Number(profile.launchCount) || 0) + 1;
  store.save();

  // Inject unpacked extensions & stored cookies via CDP as soon as port is ready
  (async () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 220));
      try {
        const vRes = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        if (!vRes.ok) continue;

        // 1. Load all unpacked extensions via CDP (required for Chrome 137~155+)
        for (const extPath of extPaths) {
          try {
            await sendRawCdpCommand(debugPort, 'Extensions.loadUnpacked', { path: extPath });
          } catch (e) {}
        }

        // 2. Inject stored cookies if any
        if (Array.isArray(profile.cookies) && profile.cookies.length > 0) {
          try {
            const cdpCookies = normalizeCookiesForCdp(profile.cookies);
            if (cdpCookies.length > 0) {
              await sendRawCdpCommand(debugPort, 'Storage.setCookies', { cookies: cdpCookies });
            }
          } catch (e) {}
        }
        break;
      } catch (e) {
        // wait for next poll
      }
    }
  })();

  proc.on('exit', async () => {
    const entry = runningProfiles.get(profile.id);
    runningProfiles.delete(profile.id);
    if (entry && entry.anonymizedProxyUrl) {
      try {
        await proxyChain.closeAnonymizedProxy(entry.anonymizedProxyUrl, true);
      } catch (e) {}
    }
  });

  return {
    profileId: profile.id,
    pid: proc.pid,
    startedAt,
    kernelName: kernelInfo.activeKernel.name,
    extensionsLoaded: extPaths.length,
  };
}

/**
 * Stop a running browser profile (syncing cookies before closing if enabled)
 */
async function stopProfile(profileId) {
  const entry = runningProfiles.get(profileId);
  if (!entry) {
    return { stopped: false, profileId };
  }

  const state = store.getState();
  const profile = state.profiles.find((p) => p.id === profileId);

  // Sync cookies from live browser before killing if enabled
  if (profile && state.settings.syncCookiesOnClose && entry.debugPort) {
    try {
      const res = await sendRawCdpCommand(entry.debugPort, 'Storage.getCookies', {});
      if (res && Array.isArray(res.cookies) && res.cookies.length > 0) {
        profile.cookies = res.cookies;
        store.save();
      }
    } catch (e) {
      // ignore if already closing
    }
  }

  try {
    // Gracefully close via CDP first, then kill process if needed
    try {
      await sendRawCdpCommand(entry.debugPort, 'Browser.close', {});
    } catch (e) {
      entry.proc.kill();
    }
  } catch (e) {}

  runningProfiles.delete(profileId);
  if (entry.anonymizedProxyUrl) {
    try {
      await proxyChain.closeAnonymizedProxy(entry.anonymizedProxyUrl, true);
    } catch (e) {}
  }

  return { stopped: true, profileId };
}

/**
 * Batch launch multiple profiles with optional window tiling (自動網格排列視窗)
 */
async function batchLaunchProfiles(profileIds = [], options = {}) {
  const state = store.getState();
  const delayMs = Number(options.delayMs ?? state.settings.batchLaunchDelayMs ?? 1000);
  const autoTile = Boolean(options.autoTile ?? state.settings.autoTileWindows);
  const cols = Math.max(1, Number(options.cols ?? state.settings.tileColumns ?? 2));

  const screenWidth = Number(options.screenWidth) || 1920;
  const screenHeight = Number(options.screenHeight) || 1040;
  const rows = Math.max(1, Math.ceil(profileIds.length / cols));
  const winW = Math.max(500, Math.floor(screenWidth / cols));
  const winH = Math.max(420, Math.floor(screenHeight / Math.min(rows, 3)));

  const results = [];
  for (let i = 0; i < profileIds.length; i++) {
    const id = profileIds[i];
    let bounds = null;
    if (autoTile) {
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols) % 3;
      bounds = {
        x: colIdx * winW,
        y: rowIdx * winH,
        width: winW,
        height: winH,
      };
    }
    try {
      const res = await launchProfile(id, bounds);
      results.push({ id, ok: true, ...res });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
    if (i < profileIds.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

/**
 * Batch stop multiple profiles
 */
async function batchStopProfiles(profileIds = []) {
  const targets = profileIds.length > 0 ? profileIds : Array.from(runningProfiles.keys());
  const results = [];
  for (const id of targets) {
    const res = await stopProfile(id);
    results.push(res);
  }
  return results;
}

/**
 * Export live cookies (if running) or stored cookies (if stopped) for a profile
 */
async function exportProfileCookies(profileId) {
  const state = store.getState();
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('找不到該環境');

  const entry = runningProfiles.get(profileId);
  if (entry && entry.debugPort) {
    try {
      const res = await sendRawCdpCommand(entry.debugPort, 'Storage.getCookies', {});
      if (res && Array.isArray(res.cookies)) {
        profile.cookies = res.cookies;
        store.save();
      }
    } catch (e) {}
  }
  return profile.cookies || [];
}

/**
 * Test proxy connectivity and fetch exit IP, country, city, timezone, and latency using Windows curl.exe
 */
function testProxyConnection(proxyConfig) {
  return new Promise((resolve) => {
    if (!proxyConfig || !proxyConfig.host || !proxyConfig.port) {
      return resolve({ ok: false, error: '未填寫代理主機與埠號' });
    }
    const startTime = Date.now();
    let proto = (proxyConfig.type || 'http').toLowerCase();
    if (proto === 'sock5' || proto === 'socks') proto = 'socks5';
    if (proto === 'sock4') proto = 'socks4';
    const proxyUrl = `${proto}://${proxyConfig.host}:${proxyConfig.port}`;
    const curlArgs = ['-s', '-m', '7', '-x', proxyUrl];
    if (proxyConfig.username && proxyConfig.password) {
      curlArgs.push('-U', `${proxyConfig.username}:${proxyConfig.password}`);
    }
    curlArgs.push('http://ip-api.com/json/?fields=status,message,countryCode,country,city,timezone,query,isp');

    execFile('curl.exe', curlArgs, { timeout: 8000 }, (err, stdout) => {
      const latency = Date.now() - startTime;
      if (err || !stdout) {
        return resolve({
          ok: false,
          latency,
          error: '代理連線逾時或無法連線，請確認代理伺服器是否啟動',
        });
      }
      try {
        const data = JSON.parse(stdout);
        if (data && data.status === 'success') {
          return resolve({
            ok: true,
            latency,
            ip: data.query,
            country: data.countryCode || 'TW',
            countryName: data.country || '',
            city: data.city || '',
            timezone: data.timezone || 'Asia/Taipei',
            isp: data.isp || '',
          });
        }
        return resolve({ ok: false, latency, error: data.message || '代理回應異常' });
      } catch (e) {
        return resolve({ ok: false, latency, error: '解析代理回應失敗' });
      }
    });
  });
}

function getRunningStatusMap() {
  const out = {};
  for (const [id, info] of runningProfiles.entries()) {
    out[id] = {
      running: true,
      pid: info.pid,
      debugPort: info.debugPort,
      startedAt: info.startedAt,
      kernelName: info.kernelName,
    };
  }
  return out;
}

function getRunningProfilesMap() {
  return runningProfiles;
}

/**
 * Re-adopt any already-running Chromium/Chrome processes that belong to our PROFILES_DIR
 */
function discoverExistingRunningProfiles() {
  try {
    const psCmd =
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--remote-debugging-port=*' -and $_.CommandLine -notlike '*--type=*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress";
    execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { timeout: 6000 }, async (err, stdout) => {
      if (err || !stdout) return;
      try {
        const raw = JSON.parse(stdout.trim());
        const list = Array.isArray(raw) ? raw : [raw];
        for (const item of list) {
          const cmd = String(item?.CommandLine || '');
          if (!cmd.includes('--remote-debugging-port=')) continue;
          const portMatch = cmd.match(/--remote-debugging-port=(\d+)/);
          const dirMatch = cmd.match(/--user-data-dir=([^\s"]+|"[^"]+")/);
          if (!portMatch || !dirMatch) continue;
          const debugPort = Number(portMatch[1]);
          const userDataDir = dirMatch[1].replace(/^"|"$/g, '');
          const profileId = path.basename(userDataDir);
          if (!profileId || runningProfiles.has(profileId)) continue;
          const existsInStore = (store.getState().profiles || []).some((p) => p.id === profileId);
          if (!existsInStore) continue;

          // Verify CDP port responds
          try {
            const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
            if (res.ok) {
              runningProfiles.set(profileId, {
                pid: Number(item.ProcessId),
                proc: { kill: () => { try { process.kill(Number(item.ProcessId)); } catch (e) {} } },
                debugPort,
                anonymizedProxyUrl: null,
                startedAt: new Date().toISOString(),
                kernelName: '已連線瀏覽器',
              });
            }
          } catch (e) {}
        }
      } catch (e) {}
    });
  } catch (e) {}
}

// Run discovery once on module load
discoverExistingRunningProfiles();

/**
 * Tile already-running browser windows into a clean desktop grid via CDP Browser.setWindowBounds
 */
async function tileRunningWindows(options = {}) {
  const state = store.getState();
  const targetIds =
    Array.isArray(options.profileIds) && options.profileIds.length > 0
      ? options.profileIds.filter((id) => runningProfiles.has(id))
      : Array.from(runningProfiles.keys());

  if (targetIds.length === 0) return { tiled: 0 };

  const isTopRowMode = options.mode === 'top-row';
  const cols = isTopRowMode
    ? Math.max(1, targetIds.length)
    : Math.max(1, Number(options.cols ?? state.settings.tileColumns ?? 2));
  const screenWidth = Number(options.screenWidth) || 1920;
  const screenHeight = Number(options.screenHeight) || 1040;
  const rows = isTopRowMode ? 1 : Math.max(1, Math.ceil(targetIds.length / cols));
  const winW = Math.max(400, Math.floor(screenWidth / cols));
  const winH = isTopRowMode
    ? Math.max(460, Math.floor(screenHeight * 0.58))
    : Math.max(400, Math.floor(screenHeight / Math.min(rows, 3)));

  let tiled = 0;
  for (let i = 0; i < targetIds.length; i++) {
    const id = targetIds[i];
    const entry = runningProfiles.get(id);
    if (!entry || !entry.debugPort) continue;

    const colIdx = i % cols;
    const rowIdx = isTopRowMode ? 0 : Math.floor(i / cols) % 3;
    try {
      const listRes = await fetch(`http://127.0.0.1:${entry.debugPort}/json/list`);
      const targets = await listRes.json();
      const pageTarget =
        (targets || []).find(
          (t) =>
            t.type === 'page' &&
            !String(t.url || '').startsWith('chrome://') &&
            !String(t.url || '').startsWith('devtools://')
        ) ||
        (targets || []).find((t) => t.type === 'page') ||
        targets[0];

      if (pageTarget && pageTarget.id) {
        const winInfo = await sendRawCdpCommand(entry.debugPort, 'Browser.getWindowForTarget', {
          targetId: pageTarget.id,
        });
        if (winInfo && winInfo.windowId) {
          try {
            await sendRawCdpCommand(entry.debugPort, 'Browser.setWindowBounds', {
              windowId: winInfo.windowId,
              bounds: { windowState: 'normal' },
            });
          } catch (e) {}

          await sendRawCdpCommand(entry.debugPort, 'Browser.setWindowBounds', {
            windowId: winInfo.windowId,
            bounds: {
              windowState: 'normal',
              left: colIdx * winW,
              top: rowIdx * winH,
              width: winW,
              height: winH,
            },
          });

          // Bring this browser window to the front so it shows above the Dolphin Anty control window
          if (pageTarget.webSocketDebuggerUrl) {
            await new Promise((resolve) => {
              const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
              const timer = setTimeout(() => {
                try { ws.close(); } catch (e) {}
                resolve();
              }, 800);
              ws.on('open', () => {
                ws.send(JSON.stringify({ id: 1, method: 'Page.bringToFront' }));
              });
              ws.on('message', () => {
                clearTimeout(timer);
                try { ws.close(); } catch (e) {}
                resolve();
              });
              ws.on('error', () => {
                clearTimeout(timer);
                resolve();
              });
            });
          }

          tiled++;
        }
      }
    } catch (e) {
      // ignore individual window error
    }
  }
  try {
    await bringRunningWindowsToTop({ profileIds: targetIds, keepTopmost: options.keepTopmost });
  } catch (e) {}

  return { tiled };
}

/**
 * Bring running browser windows to the foreground and topmost via Win32 API
 */
async function bringRunningWindowsToTop(options = {}) {
  const targetIds =
    Array.isArray(options.profileIds) && options.profileIds.length > 0
      ? options.profileIds.filter((id) => runningProfiles.has(id))
      : Array.from(runningProfiles.keys());

  const pids = [];
  for (const id of targetIds) {
    const entry = runningProfiles.get(id);
    if (entry && entry.pid) {
      pids.push(entry.pid);
    }
  }

  if (pids.length === 0) {
    return { broughtToTop: 0 };
  }

  return new Promise((resolve) => {
    let scriptPath = path.join(__dirname, 'bringToTop.ps1');
    if (scriptPath.includes('app.asar')) {
      scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
    }
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Pids',
      pids.join(','),
    ];
    if (options.keepTopmost) {
      args.push('-KeepTopmost');
    }

    execFile('powershell.exe', args, { timeout: 8000 }, (err) => {
      if (err) {
        console.warn('[ChameleonX] bringRunningWindowsToTop warning:', err.message);
      }
      resolve({ broughtToTop: pids.length });
    });
  });
}

module.exports = {
  detectKernels,
  downloadFingerprintChromium,
  launchProfile,
  stopProfile,
  batchLaunchProfiles,
  batchStopProfiles,
  exportProfileCookies,
  testProxyConnection,
  getRunningStatusMap,
  getRunningProfilesMap,
  tileRunningWindows,
  bringRunningWindowsToTop,
};
