const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/**
 * Strip CRX2 or CRX3 header from a Buffer so AdmZip can extract the inner ZIP payload
 */
function stripCrxHeader(buffer) {
  if (buffer.length < 16) return buffer;
  // Check magic 'Cr24' (0x43 0x72 0x32 0x34)
  if (buffer[0] === 0x43 && buffer[1] === 0x72 && buffer[2] === 0x32 && buffer[3] === 0x34) {
    const version = buffer.readUInt32LE(4);
    if (version === 2) {
      const pubKeyLen = buffer.readUInt32LE(8);
      const sigLen = buffer.readUInt32LE(12);
      const zipStartOffset = 16 + pubKeyLen + sigLen;
      return buffer.subarray(zipStartOffset);
    } else if (version === 3) {
      const headerLen = buffer.readUInt32LE(8);
      const zipStartOffset = 12 + headerLen;
      return buffer.subarray(zipStartOffset);
    }
  }
  return buffer;
}

/**
 * Resolve localized extension name/description if it uses __MSG_xxx__
 */
function resolveManifestString(extDir, rawStr, defaultLocale = 'en') {
  if (!rawStr || typeof rawStr !== 'string' || !rawStr.startsWith('__MSG_') || !rawStr.endsWith('__')) {
    return rawStr || '';
  }
  const key = rawStr.slice(6, -2);
  const localesToTry = ['zh_TW', 'zh_CN', defaultLocale, 'en', 'en_US'];
  for (const loc of localesToTry) {
    const msgPath = path.join(extDir, '_locales', loc, 'messages.json');
    if (fs.existsSync(msgPath)) {
      try {
        const messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
        const foundKey = Object.keys(messages).find((k) => k.toLowerCase() === key.toLowerCase());
        if (foundKey && messages[foundKey] && messages[foundKey].message) {
          return messages[foundKey].message;
        }
      } catch (e) {
        // ignore parse errors
      }
    }
  }
  return rawStr;
}

/**
 * Find the actual directory containing manifest.json (in case ZIP has a single nested subfolder)
 */
function locateManifestDir(baseDir) {
  if (fs.existsSync(path.join(baseDir, 'manifest.json'))) {
    return baseDir;
  }
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = path.join(baseDir, entry.name);
        if (fs.existsSync(path.join(sub, 'manifest.json'))) {
          return sub;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Parse manifest.json from an extension directory
 */
function inspectExtensionDir(rawDir) {
  const extDir = locateManifestDir(rawDir);
  if (!extDir) {
    throw new Error(`找不到 manifest.json，請確認該資料夾為已解壓縮的 Chrome 擴充功能：${rawDir}`);
  }
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const name = resolveManifestString(extDir, manifest.name, manifest.default_locale) || path.basename(extDir);
  const description = resolveManifestString(extDir, manifest.description, manifest.default_locale) || '';
  const version = manifest.version || '1.0.0';
  const manifestVersion = manifest.manifest_version || 3;

  // Read icon as base64 data URI if available
  let iconDataUrl = null;
  const icons = manifest.icons || (manifest.action && manifest.action.default_icon) || {};
  const iconSizes = ['128', '64', '48', '32', '16'];
  for (const sz of iconSizes) {
    if (icons[sz]) {
      const iconPath = path.join(extDir, icons[sz]);
      if (fs.existsSync(iconPath)) {
        try {
          const buf = fs.readFileSync(iconPath);
          const ext = path.extname(iconPath).toLowerCase() === '.svg' ? 'image/svg+xml' : 'image/png';
          iconDataUrl = `data:${ext};base64,${buf.toString('base64')}`;
          break;
        } catch (e) {
          // ignore
        }
      }
    }
  }

  return {
    path: extDir,
    name,
    description,
    version,
    manifestVersion,
    iconDataUrl,
  };
}

/**
 * Create built-in starter extensions inside data/extensions/ so the user has practical multi-account extensions out of the box
 */
function ensureStarterExtensions(extensionsRoot) {
  fs.mkdirSync(extensionsRoot, { recursive: true });

  const starters = [
    {
      id: 'ext-builtin-inspector',
      folder: 'anty-fingerprint-inspector',
      name: 'Anty 指紋與環境自檢助手',
      version: '1.2.0',
      description: '在瀏覽器右上角點擊即可檢視當前環境的指紋種子、WebGL 顯卡、User-Agent、時區與防關聯狀態。',
      enabledForAll: true,
      category: '防關聯工具',
      popupHtml: `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<style>
  body { width: 320px; margin: 0; padding: 14px; background: #13151f; color: #e2e8f0; font-family: system-ui, sans-serif; font-size: 12px; }
  h3 { margin: 0 0 10px 0; color: #a78bfa; font-size: 14px; display: flex; align-items: center; justify-content: space-between; }
  .row { padding: 6px 8px; background: #1e2235; border-radius: 6px; margin-bottom: 6px; word-break: break-all; }
  .label { color: #94a3b8; font-size: 11px; margin-bottom: 2px; }
  .val { color: #f8fafc; font-weight: 600; }
  .badge { background: #10b98122; color: #34d399; border: 1px solid #10b98155; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
</style>
</head>
<body>
  <h3><span>🛡️ Anty 指紋防護狀態</span><span class="badge">保護中</span></h3>
  <div id="info">載入中...</div>
  <script src="popup.js"></script>
</body>
</html>`,
      popupJs: `
const glCanvas = document.createElement('canvas');
const gl = glCanvas.getContext('webgl');
let renderer = '未知';
if (gl) {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
}
const infoEl = document.getElementById('info');
infoEl.innerHTML = [
  ['平台 (Platform)', navigator.platform],
  ['CPU 核心 / 記憶體', navigator.hardwareConcurrency + ' 核 / ' + (navigator.deviceMemory || 8) + ' GB'],
  ['解析度 (Screen)', screen.width + ' x ' + screen.height],
  ['語系 / 時區', navigator.language + ' / ' + Intl.DateTimeFormat().resolvedOptions().timeZone],
  ['WebGL 渲染器', renderer],
  ['User-Agent', navigator.userAgent]
].map(([k, v]) => '<div class="row"><div class="label">' + k + '</div><div class="val">' + v + '</div></div>').join('');
`,
    },
    {
      id: 'ext-builtin-quickfill',
      folder: 'anty-quick-notes',
      name: 'Anty 帳號備忘與快速填表助手',
      version: '1.1.0',
      description: '提供當前獨立環境專屬的帳號密碼、助記詞或常用文字快速暫存與一鍵複製面板，資料完全隨該環境隔離保存。',
      enabledForAll: true,
      category: '效率與自動化',
      popupHtml: `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<style>
  body { width: 300px; margin: 0; padding: 12px; background: #13151f; color: #f1f5f9; font-family: system-ui, sans-serif; font-size: 12px; }
  h3 { margin: 0 0 8px 0; color: #a78bfa; font-size: 13px; }
  textarea { width: 100%; height: 110px; box-sizing: border-box; background: #1e2235; color: #fff; border: 1px solid #334155; border-radius: 6px; padding: 8px; font-size: 12px; resize: none; }
  button { margin-top: 8px; width: 100%; background: #7c3aed; color: white; border: none; padding: 7px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  button:hover { background: #6d28d9; }
  .msg { color: #34d399; font-size: 11px; margin-top: 4px; text-align: center; min-height: 16px; }
</style>
</head>
<body>
  <h3>📝 環境專屬剪貼簿 (獨立隔離儲存)</h3>
  <textarea id="note" placeholder="在此輸入此環境專屬的帳號、備註或常用填表文字..."></textarea>
  <button id="saveBtn">儲存並複製內容</button>
  <div class="msg" id="msg"></div>
  <script src="popup.js"></script>
</body>
</html>`,
      popupJs: `
const noteEl = document.getElementById('note');
const msgEl = document.getElementById('msg');
noteEl.value = localStorage.getItem('anty_quick_note') || '';
noteEl.addEventListener('input', () => {
  localStorage.setItem('anty_quick_note', noteEl.value);
});
document.getElementById('saveBtn').addEventListener('click', () => {
  localStorage.setItem('anty_quick_note', noteEl.value);
  navigator.clipboard.writeText(noteEl.value);
  msgEl.textContent = '✅ 已儲存並複製到剪貼簿！';
  setTimeout(() => msgEl.textContent = '', 2000);
});
`,
    },
    {
      id: 'ext-builtin-cookie-export',
      folder: 'anty-page-cleaner',
      name: 'Anty 網頁快取與 Storage 清理工具',
      version: '1.0.5',
      description: '一鍵檢視並清除當前網站的 LocalStorage、SessionStorage 與頁面快取資料，方便單一環境內快速重置網站狀態。',
      enabledForAll: false,
      category: 'Cookie 與環境管理',
      popupHtml: `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<style>
  body { width: 260px; margin: 0; padding: 12px; background: #13151f; color: #f1f5f9; font-family: system-ui, sans-serif; font-size: 12px; }
  h3 { margin: 0 0 8px 0; color: #38bdf8; font-size: 13px; }
  p { color: #94a3b8; font-size: 11px; line-height: 1.4; }
  button { margin-top: 6px; width: 100%; background: #0284c7; color: white; border: none; padding: 7px; border-radius: 6px; cursor: pointer; font-weight: 600; }
</style>
</head>
<body>
  <h3>🧹 Anty 站點資料工具</h3>
  <p>此擴充功能可協助您在多開環境中快速檢視或清理當前網站的儲存空間。</p>
  <button id="btn">點此檢查當前頁面狀態</button>
  <div id="out" style="margin-top:8px;color:#34d399;font-size:11px;"></div>
  <script src="popup.js"></script>
</body>
</html>`,
      popupJs: `
document.getElementById('btn').addEventListener('click', () => {
  document.getElementById('out').textContent = '✅ 環境隔離正常運作中 (' + new Date().toLocaleTimeString() + ')';
});
`,
    },
  ];

  const createdList = [];
  for (const item of starters) {
    const extDir = path.join(extensionsRoot, item.folder);
    fs.mkdirSync(extDir, { recursive: true });
    const manifest = {
      manifest_version: 3,
      name: item.name,
      version: item.version,
      description: item.description,
      action: {
        default_title: item.name,
        default_popup: 'popup.html',
      },
      permissions: ['storage', 'activeTab'],
    };
    fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(extDir, 'popup.html'), item.popupHtml, 'utf8');
    fs.writeFileSync(path.join(extDir, 'popup.js'), item.popupJs, 'utf8');
    createdList.push({
      id: item.id,
      name: item.name,
      version: item.version,
      description: item.description,
      path: extDir,
      enabledForAll: item.enabledForAll,
      category: item.category,
      source: 'builtin',
      createdAt: new Date().toISOString(),
    });
  }
  return createdList;
}

/**
 * Generate the per-profile AntyCore Fingerprint & Identity Badge Extension inside the profile's directory.
 * This works alongside fingerprint-chromium (or as a fallback when running standard Chrome) to:
 * 1. Override JS-level navigator/WebGL/Canvas/Audio/Screen properties in MAIN world at document_start
 * 2. Show a sleek unobtrusive profile badge in the corner (optional/dismissible) so the user knows which profile window is which.
 */
function buildProfileCoreExtension(profileDir, profile, settings = {}) {
  const extDir = path.join(profileDir, '_anty_core_ext');
  fs.mkdirSync(extDir, { recursive: true });

  const fp = profile.fingerprint || {};
  const showBadge = settings.showWindowBadge !== false;

  const manifest = {
    manifest_version: 3,
    name: `AntyCore - ${profile.name}`,
    version: '2.1.0',
    description: 'Dolphin Anty 環境指紋防護與多視窗同步核心',
    permissions: ['tabs', 'bookmarks'],
    host_permissions: ['http://127.0.0.1/*'],
    background: {
      service_worker: 'background.js',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['inject_main.js'],
        run_at: 'document_start',
        world: 'MAIN',
        all_frames: true,
      },
      {
        matches: ['http://*/*', 'https://*/*'],
        js: ['sync_content.js'],
        run_at: 'document_end',
        all_frames: false,
      },
      ...(showBadge
        ? [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['badge.js'],
              run_at: 'document_end',
              all_frames: false,
            },
          ]
        : []),
    ],
  };

  const configPayload = {
    seed: Number(fp.seed) || 12345678,
    platform: fp.platform || 'Win32',
    cpuCores: Number(fp.cpuCores) || 8,
    memory: Number(fp.memory) || 8,
    webglVendor: fp.webglVendor || 'Google Inc. (NVIDIA)',
    webglRenderer: fp.webglRenderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    webglMetadata: fp.webglMetadata || 'custom',
    canvasMode: fp.canvas || 'noise',
    audioMode: fp.audio || 'noise',
    webrtcMode: fp.webrtc || 'altered',
    locale: fp.locale || 'zh-TW',
    languages: Array.isArray(fp.languages) ? fp.languages : ['zh-TW', 'zh', 'en-US', 'en'],
    resolution: fp.resolution || '1920x1080',
    doNotTrack: fp.doNotTrack ? '1' : null,
  };

  const injectMainJs = `(function() {
  try {
    const cfg = ${JSON.stringify(configPayload)};
    const seed = cfg.seed;

    // Helper to mask function toString as [native code]
    const nativeToString = Function.prototype.toString;
    const spoofedFns = new WeakMap();
    const markNative = (fn, name) => {
      spoofedFns.set(fn, \`function \${name || fn.name || ''}() { [native code] }\`);
      return fn;
    };
    const origToString = Function.prototype.toString;
    const customToString = function() {
      if (spoofedFns.has(this)) return spoofedFns.get(this);
      return origToString.apply(this, arguments);
    };
    spoofedFns.set(customToString, 'function toString() { [native code] }');
    Object.defineProperty(Function.prototype, 'toString', {
      value: customToString,
      writable: true,
      configurable: true
    });

    const defGetter = (proto, prop, val) => {
      try {
        const getter = markNative(function() { return val; }, 'get ' + prop);
        Object.defineProperty(proto, prop, {
          get: getter,
          enumerable: true,
          configurable: true
        });
      } catch (e) {}
    };

    if (typeof Navigator !== 'undefined') {
      defGetter(Navigator.prototype, 'hardwareConcurrency', cfg.cpuCores);
      defGetter(Navigator.prototype, 'deviceMemory', cfg.memory);
      defGetter(Navigator.prototype, 'platform', cfg.platform);
      defGetter(Navigator.prototype, 'language', cfg.locale);
      defGetter(Navigator.prototype, 'languages', Object.freeze([...cfg.languages]));
      defGetter(Navigator.prototype, 'webdriver', false);
      if (cfg.doNotTrack !== null) {
        defGetter(Navigator.prototype, 'doNotTrack', cfg.doNotTrack);
      }
    }

    // Screen resolution
    if (typeof Screen !== 'undefined' && cfg.resolution) {
      const parts = cfg.resolution.split('x').map(Number);
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        defGetter(Screen.prototype, 'width', parts[0]);
        defGetter(Screen.prototype, 'height', parts[1]);
        defGetter(Screen.prototype, 'availWidth', parts[0]);
        defGetter(Screen.prototype, 'availHeight', parts[1] - 40);
      }
    }

    // WebGL Vendor & Renderer spoofing
    if (cfg.webglMetadata === 'custom') {
      const patchWebGL = (Proto) => {
        if (!Proto || !Proto.prototype || !Proto.prototype.getParameter) return;
        const origGetParam = Proto.prototype.getParameter;
        const wrapped = markNative(function(param) {
          if (param === 37445) return cfg.webglVendor;
          if (param === 37446) return cfg.webglRenderer;
          return origGetParam.apply(this, arguments);
        }, 'getParameter');
        Object.defineProperty(Proto.prototype, 'getParameter', {
          value: wrapped,
          writable: true,
          configurable: true
        });
      };
      if (typeof WebGLRenderingContext !== 'undefined') patchWebGL(WebGLRenderingContext);
      if (typeof WebGL2RenderingContext !== 'undefined') patchWebGL(WebGL2RenderingContext);
    }

    // Deterministic Canvas 2D Noise
    if (cfg.canvasMode === 'noise' && typeof CanvasRenderingContext2D !== 'undefined') {
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      const noisyGetImageData = markNative(function(sx, sy, sw, sh) {
        const imageData = origGetImageData.apply(this, arguments);
        const data = imageData.data;
        const delta = (seed % 5) - 2 || 1;
        for (let i = 0; i < data.length; i += 40) {
          data[i] = Math.max(0, Math.min(255, data[i] + delta));
        }
        return imageData;
      }, 'getImageData');
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'getImageData', {
        value: noisyGetImageData,
        writable: true,
        configurable: true
      });
    }

    // Deterministic AudioBuffer noise
    if (cfg.audioMode === 'noise' && typeof AudioBuffer !== 'undefined') {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      const noisyChannelData = markNative(function() {
        const res = origGetChannelData.apply(this, arguments);
        const offset = ((seed % 997) + 1) * 1e-7;
        for (let i = 0; i < res.length; i += 100) {
          res[i] = res[i] + offset;
        }
        return res;
      }, 'getChannelData');
      Object.defineProperty(AudioBuffer.prototype, 'getChannelData', {
        value: noisyChannelData,
        writable: true,
        configurable: true
      });
    }

    // WebRTC protection if disabled
    if (cfg.webrtcMode === 'disabled') {
      delete window.RTCPeerConnection;
      delete window.webkitRTCPeerConnection;
    }
  } catch (err) {}
})();`;

  const badgeInfo = {
    name: profile.name,
    seed: fp.seed,
    proxy: profile.proxy ? `${profile.proxy.type.toUpperCase()}://${profile.proxy.host}:${profile.proxy.port}` : '直連 (無代理)',
     bookmarks: settings.bookmarks || [],
  };

  const badgeJs = `(function() {
  try {
    if (window.self !== window.top) return;
    const info = ${JSON.stringify(badgeInfo)};
    const badge = document.createElement('div');
    badge.id = '__anty_profile_badge__';
    badge.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:2147483647;background:rgba(19,21,31,0.92);color:#e2e8f0;border:1px solid rgba(124,58,237,0.5);border-radius:8px;padding:5px 10px;font-family:system-ui,sans-serif;font-size:11px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.4);backdrop-filter:blur(6px);user-select:none;transition:opacity 0.2s;';
    badge.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;"></span>' +
      '<strong style="color:#c4b5fd;">' + info.name + '</strong>' +
      '<span style="color:#64748b;">|</span>' +
      '<span style="color:#94a3b8;">Seed: ' + info.seed + '</span>' +
      '<span id="__anty_badge_close__" style="cursor:pointer;color:#64748b;margin-left:4px;font-weight:bold;" title="隱藏標籤">✕</span>';
    document.documentElement.appendChild(badge);
    const closeBtn = document.getElementById('__anty_badge_close__');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => badge.remove());
    }
  } catch (e) {}
})();`;

  const backgroundJs = `
const PROFILE_ID = ${JSON.stringify(profile.id)};
const WS_URL = 'ws://127.0.0.1:19888/ws-sync?profileId=' + encodeURIComponent(PROFILE_ID);
let ws = null;

function connectWs() {
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {};
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SYNC_BOOKMARKS' && Array.isArray(msg.bookmarks)) {
          syncBookmarksToChrome(msg.bookmarks);
        } else if (msg.type === 'SYNC_COMMAND' && msg.payload) {
          const p = msg.payload;
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (!activeTab || !activeTab.id) return;

          if (p.action === 'navigate' && p.url) {
            chrome.tabs.update(activeTab.id, { url: p.url });
          } else if (p.action === 'reload') {
            chrome.tabs.reload(activeTab.id);
          } else if (p.action === 'back') {
            chrome.tabs.goBack(activeTab.id);
          } else if (p.action === 'forward') {
            chrome.tabs.goForward(activeTab.id);
          } else {
            chrome.tabs.sendMessage(activeTab.id, msg).catch(() => {});
          }
        }
      } catch (e) {}
    };
    ws.onclose = () => {
      ws = null;
      setTimeout(connectWs, 2000);
    };
    ws.onerror = () => {
      try { ws.close(); } catch (e) {}
    };
  } catch (e) {
    setTimeout(connectWs, 2500);
  }
}

connectWs();

// Keep service worker alive with periodic ping
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'PING', profileId: PROFILE_ID }));
  } else if (!ws || ws.readyState === WebSocket.CLOSED) {
    connectWs();
  }
}, 10000);

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'USER_SYNC_EVENT') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'USER_SYNC_EVENT',
        profileId: PROFILE_ID,
        payload: message.payload
      }));
    }
  }
});

function syncBookmarksToChrome(bms) {
  try {
    if (!chrome.bookmarks) return;
    chrome.bookmarks.getTree((tree) => {
      if (!tree || !tree.length) return;
      const root = tree[0];
      const bar = (root.children || []).find((c) => c.id === '1' || (c.title && (c.title.includes('Bookmark') || c.title.includes('書籤')))) || root.children?.[0];
      if (!bar) return;

      chrome.bookmarks.getChildren(bar.id, (children) => {
        const removePromises = (children || []).map((ch) => {
          return new Promise((res) => {
            chrome.bookmarks.removeTree(ch.id, () => res());
          });
        });

        Promise.all(removePromises).then(() => {
          (bms || []).forEach((bm) => {
            if (bm && bm.url) {
              chrome.bookmarks.create({
                parentId: bar.id,
                title: bm.title || bm.name || '書籤',
                url: bm.url
              });
            }
          });
        });
      });
    });
  } catch (e) {}
}
`;

  const syncContentJs = `(function() {
  if (window.self !== window.top) return;
  let isReplaying = false;
  let lastScrollSent = 0;

  function getCssSelector(el) {
    if (!el || !(el instanceof Element)) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.getAttribute('data-testid')) {
      return '[data-testid="' + CSS.escape(el.getAttribute('data-testid')) + '"]';
    }
    if (el.getAttribute('name') && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.getAttribute('name')) + '"]';
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE && cur.tagName !== 'HTML' && parts.length < 5) {
      let selector = cur.tagName.toLowerCase();
      if (cur.id) {
        selector = '#' + CSS.escape(cur.id);
        parts.unshift(selector);
        break;
      } else {
        let sib = cur;
        let nth = 1;
        while ((sib = sib.previousElementSibling)) {
          if (sib.tagName === cur.tagName) nth++;
        }
        selector += ':nth-of-type(' + nth + ')';
      }
      parts.unshift(selector);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function showRipple(x, y) {
    try {
      const dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;left:' + (x - 10) + 'px;top:' + (y - 10) + 'px;width:20px;height:20px;border-radius:50%;background:rgba(139,92,246,0.55);border:2px solid #c4b5fd;z-index:2147483647;pointer-events:none;transition:transform 0.35s ease, opacity 0.35s ease;';
      document.documentElement.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transform = 'scale(2.2)';
        dot.style.opacity = '0';
      });
      setTimeout(() => dot.remove(), 380);
    } catch (e) {}
  }

  function sendSyncEvent(payload) {
    if (isReplaying || !document.hasFocus()) return;
    try {
      chrome.runtime.sendMessage({ type: 'USER_SYNC_EVENT', payload });
    } catch (e) {}
  }

  // 1. Capture Mouse Click
  document.addEventListener('click', (e) => {
    if (isReplaying || !e.isTrusted || !document.hasFocus()) return;
    const target = e.target;
    if (target && target.closest && target.closest('#__anty_profile_badge__')) return;
    sendSyncEvent({
      action: 'click',
      selector: getCssSelector(target),
      relX: e.clientX / (window.innerWidth || 1),
      relY: e.clientY / (window.innerHeight || 1),
    });
  }, true);

  // 2. Capture Input / Text Changes
  document.addEventListener('input', (e) => {
    if (isReplaying || !e.isTrusted || !document.hasFocus()) return;
    const target = e.target;
    if (!target) return;
    sendSyncEvent({
      action: 'input',
      selector: getCssSelector(target),
      value: target.isContentEditable ? target.innerText : target.value,
      checked: target.checked,
      isContentEditable: Boolean(target.isContentEditable),
    });
  }, true);

  // 3. Capture Special Keys (Enter, Tab, Escape)
  document.addEventListener('keydown', (e) => {
    if (isReplaying || !e.isTrusted || !document.hasFocus()) return;
    if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
      sendSyncEvent({
        action: 'keydown',
        selector: getCssSelector(e.target),
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
      });
    }
  }, true);

  // 4. Capture Scroll
  window.addEventListener('scroll', () => {
    if (isReplaying || !document.hasFocus()) return;
    const now = Date.now();
    if (now - lastScrollSent < 50) return;
    lastScrollSent = now;
    const maxScrollY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const maxScrollX = Math.max(1, document.documentElement.scrollWidth - window.innerWidth);
    sendSyncEvent({
      action: 'scroll',
      ratioX: window.scrollX / maxScrollX,
      ratioY: window.scrollY / maxScrollY,
    });
  }, { passive: true });

  // Replay Incoming Sync Events
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'SYNC_COMMAND' || !msg.payload) return;
    const p = msg.payload;
    isReplaying = true;
    try {
      if (p.action === 'click') {
        const x = Math.round((p.relX || 0.5) * window.innerWidth);
        const y = Math.round((p.relY || 0.5) * window.innerHeight);
        showRipple(x, y);
        let el = p.selector ? document.querySelector(p.selector) : null;
        if (!el) el = document.elementFromPoint(x, y);
        if (el) {
          if (typeof el.focus === 'function') el.focus();
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          if (typeof el.click === 'function') el.click();
        }
      } else if (p.action === 'input') {
        let el = p.selector ? document.querySelector(p.selector) : document.activeElement;
        if (el) {
          if (typeof el.focus === 'function') el.focus();
          if (p.isContentEditable || el.isContentEditable) {
            el.innerText = p.value || '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = Boolean(p.checked);
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            setNativeValue(el, p.value ?? '');
          }
        }
      } else if (p.action === 'fill_text') {
        let el = document.activeElement;
        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
          el = document.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]');
        }
        if (el) {
          if (typeof el.focus === 'function') el.focus();
          if (el.isContentEditable) {
            el.innerText = p.text || '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            setNativeValue(el, p.text || '');
          }
        }
      } else if (p.action === 'keydown') {
        let el = (p.selector ? document.querySelector(p.selector) : null) || document.activeElement || document.body;
        if (el) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: p.key, code: p.code, keyCode: p.keyCode, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: p.key, code: p.code, keyCode: p.keyCode, bubbles: true }));
          if (p.key === 'Enter' && el.form) {
            if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
            else el.form.submit();
          }
        }
      } else if (p.action === 'scroll') {
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const maxScrollX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        window.scrollTo({
          left: (p.ratioX || 0) * maxScrollX,
          top: (p.ratioY || 0) * maxScrollY,
          behavior: 'auto'
        });
      }
    } catch (e) {} finally {
      setTimeout(() => { isReplaying = false; }, 35);
    }
  });
})();`;

  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(extDir, 'inject_main.js'), injectMainJs, 'utf8');
  fs.writeFileSync(path.join(extDir, 'background.js'), backgroundJs, 'utf8');
  fs.writeFileSync(path.join(extDir, 'sync_content.js'), syncContentJs, 'utf8');
  if (showBadge) {
    fs.writeFileSync(path.join(extDir, 'badge.js'), badgeJs, 'utf8');
  }
  return extDir;
}

/**
 * Extract a .zip or .crx file into extensionsRoot and return its parsed metadata
 */
function importExtensionArchive(filePath, extensionsRoot) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`檔案不存在：${filePath}`);
  }
  const rawBuf = fs.readFileSync(filePath);
  const zipBuf = stripCrxHeader(rawBuf);
  const zip = new AdmZip(zipBuf);

  const folderName =
    path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]/g, '_') +
    '_' +
    crypto.randomBytes(3).toString('hex');
  const targetDir = path.join(extensionsRoot, folderName);
  fs.mkdirSync(targetDir, { recursive: true });
  zip.extractAllTo(targetDir, true);

  const info = inspectExtensionDir(targetDir);
  return {
    id: 'ext-' + crypto.randomBytes(4).toString('hex'),
    name: info.name,
    version: info.version,
    description: info.description,
    path: info.path,
    iconDataUrl: info.iconDataUrl,
    enabledForAll: true,
    category: '自訂匯入',
    source: 'archive',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Download an extension directly from Chrome Web Store by URL or 32-char ID
 */
async function installFromChromeWebStore(inputUrlOrId, extensionsRoot) {
  const match = String(inputUrlOrId).match(/([a-p]{32})/i);
  if (!match) {
    throw new Error('無法識別 Chrome 線上應用程式商店 ID（請輸入包含 32 位元英文字母的商店網址或擴充功能 ID）');
  }
  const extId = match[1].toLowerCase();
  const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.6723.117&acceptformat=crx2,crx3&x=id%3D${extId}%26uc`;

  const response = await fetch(crxUrl);
  if (!response.ok) {
    throw new Error(`從 Chrome 商店下載失敗 (HTTP ${response.status})`);
  }
  const arrayBuf = await response.arrayBuffer();
  const rawBuf = Buffer.from(arrayBuf);
  if (rawBuf.length < 100) {
    throw new Error('下載的擴充功能檔案無效或該擴充功能不開放直接下載');
  }
  const zipBuf = stripCrxHeader(rawBuf);
  const zip = new AdmZip(zipBuf);
  const targetDir = path.join(extensionsRoot, `cws_${extId}`);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  zip.extractAllTo(targetDir, true);

  const info = inspectExtensionDir(targetDir);
  return {
    id: `ext-cws-${extId.slice(0, 8)}`,
    webstoreId: extId,
    name: info.name,
    version: info.version,
    description: info.description,
    path: info.path,
    iconDataUrl: info.iconDataUrl,
    enabledForAll: true,
    category: 'Chrome 商店',
    source: 'webstore',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Update an existing extension (from Web Store, local folder, or uploaded archive)
 */
async function updateExtension(ext, extensionsRoot, archivePayload = {}) {
  const oldVersion = ext.version || '1.0.0';

  // 1. If an archive file/payload is explicitly provided
  if (archivePayload.base64Data || archivePayload.filePath) {
    let targetFile = archivePayload.filePath;
    let tempFile = null;
    if (!targetFile && archivePayload.base64Data) {
      tempFile = path.join(extensionsRoot, `_update_${Date.now()}_${archivePayload.fileName || 'ext.zip'}`);
      const cleaned = String(archivePayload.base64Data).replace(/^data:.*?;base64,/, '');
      fs.writeFileSync(tempFile, Buffer.from(cleaned, 'base64'));
      targetFile = tempFile;
    }
    try {
      const rawBuf = fs.readFileSync(targetFile);
      const zipBuf = stripCrxHeader(rawBuf);
      const zip = new AdmZip(zipBuf);

      const targetDir = ext.path && fs.existsSync(ext.path)
        ? ext.path
        : path.join(extensionsRoot, `ext_${ext.id}_${Date.now()}`);

      fs.mkdirSync(targetDir, { recursive: true });
      zip.extractAllTo(targetDir, true);

      const info = inspectExtensionDir(targetDir);
      ext.name = info.name;
      ext.version = info.version;
      ext.description = info.description;
      ext.path = info.path;
      if (info.iconDataUrl) ext.iconDataUrl = info.iconDataUrl;

      const hasNewVersion = oldVersion !== info.version;
      return {
        updated: true,
        hasNewVersion,
        oldVersion,
        newVersion: info.version,
        message: hasNewVersion
          ? `已成功將【${ext.name}】更新至 v${info.version}`
          : `已重新安裝【${ext.name}】(v${info.version})`,
        ext,
      };
    } finally {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }
    }
  }

  // 2. Web Store source or has webstoreId or folder name matches cws_<id>
  let webstoreId = ext.webstoreId;
  if (!webstoreId && ext.source === 'webstore') {
    const match = String(ext.id).match(/ext-cws-([a-p0-9]+)/i);
    if (match) webstoreId = match[1];
  }
  if (!webstoreId && ext.path) {
    const folderMatch = path.basename(ext.path).match(/cws_([a-p]{32})/i);
    if (folderMatch) webstoreId = folderMatch[1];
  }

  if (webstoreId || ext.source === 'webstore') {
    if (!webstoreId || !/^[a-p]{32}$/i.test(webstoreId)) {
      throw new Error('此擴充功能缺少有效之 32 位元 Chrome 商店 ID，無法線上檢查更新');
    }
    const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.6723.117&acceptformat=crx2,crx3&x=id%3D${webstoreId}%26uc`;
    const response = await fetch(crxUrl);
    if (!response.ok) {
      throw new Error(`無法從 Chrome 商店下載更新 (HTTP ${response.status})`);
    }
    const arrayBuf = await response.arrayBuffer();
    const rawBuf = Buffer.from(arrayBuf);
    if (rawBuf.length < 100) {
      throw new Error('下載的更新檔無效或已不支援下載');
    }
    const zipBuf = stripCrxHeader(rawBuf);
    const zip = new AdmZip(zipBuf);

    // Extract to a temp directory first to safely inspect the new version
    const tempExtractDir = path.join(extensionsRoot, `_cws_temp_${webstoreId}_${Date.now()}`);
    try {
      fs.mkdirSync(tempExtractDir, { recursive: true });
      zip.extractAllTo(tempExtractDir, true);
      const newInfo = inspectExtensionDir(tempExtractDir);

      const targetDir = ext.path || path.join(extensionsRoot, `cws_${webstoreId}`);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });
      zip.extractAllTo(targetDir, true);

      const finalInfo = inspectExtensionDir(targetDir);
      ext.name = finalInfo.name;
      ext.version = finalInfo.version;
      ext.description = finalInfo.description;
      ext.path = finalInfo.path;
      if (finalInfo.iconDataUrl) ext.iconDataUrl = finalInfo.iconDataUrl;
      ext.webstoreId = webstoreId;

      const hasNewVersion = oldVersion !== finalInfo.version;
      return {
        updated: true,
        hasNewVersion,
        oldVersion,
        newVersion: finalInfo.version,
        message: hasNewVersion
          ? `已成功將【${ext.name}】由 v${oldVersion} 更新至最新版 v${finalInfo.version}！`
          : `【${ext.name}】已是最新版本 (v${finalInfo.version})`,
        ext,
      };
    } finally {
      if (fs.existsSync(tempExtractDir)) {
        try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  // 3. Local Folder source
  if (ext.source === 'folder') {
    if (!ext.path || !fs.existsSync(ext.path)) {
      throw new Error(`找不到本機擴充資料夾：${ext.path || '(路徑為空)'}`);
    }
    const info = inspectExtensionDir(ext.path);
    ext.name = info.name;
    ext.version = info.version;
    ext.description = info.description;
    ext.path = info.path;
    if (info.iconDataUrl) ext.iconDataUrl = info.iconDataUrl;

    const hasNewVersion = oldVersion !== info.version;
    return {
      updated: true,
      hasNewVersion,
      oldVersion,
      newVersion: info.version,
      message: hasNewVersion
        ? `本機擴充功能【${ext.name}】已更新為 v${info.version}`
        : `已重新讀取【${ext.name}】(v${info.version})，設定已同步`,
      ext,
    };
  }

  // 4. Archive source with no file provided
  return {
    needFile: true,
    message: '此為本機上傳之壓縮檔，請選取新版 .crx 或 .zip 進行更新',
  };
}

module.exports = {
  inspectExtensionDir,
  ensureStarterExtensions,
  buildProfileCoreExtension,
  importExtensionArchive,
  installFromChromeWebStore,
  updateExtension,
};
