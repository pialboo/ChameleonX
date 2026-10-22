const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { WebSocketServer } = require('ws');
const url = require('url');
const { PROFILES_DIR } = require('./store.cjs');
const { getRunningProfilesMap } = require('./browserLauncher.cjs');

/**
 * Map<profileId, {
 *   debugPort: number,
 *   pages: Map<targetId, { ws: WebSocket, url: string, nextMsgId: number }>
 * }>
 */
const cdpProfileSessions = new Map();

// Also keep fallback WS clients in case extension connects
const connectedWsClients = new Map();

let syncState = {
  enabled: false,
  syncClick: true,
  syncInput: true,
  syncScroll: true,
  targetProfileIds: [], // empty = all running profiles
};

function isProfileInSyncGroup(profileId) {
  if (!syncState.targetProfileIds || syncState.targetProfileIds.length === 0) {
    return true;
  }
  return syncState.targetProfileIds.includes(profileId);
}

/**
 * Injected into every page via CDP Page.addScriptToEvaluateOnNewDocument + Runtime.evaluate.
 * Uses CDP Runtime.addBinding ('__dolphinSyncEmit') so it is 100% immune to:
 * - SOCKS5 / HTTP proxies
 * - Webpage Content-Security-Policy (CSP)
 * - Chrome --load-extension restrictions
 */
const CDP_SYNC_AGENT_SCRIPT = `(function() {
  if (window.__dolphinCdpSyncInstalled) return;
  window.__dolphinCdpSyncInstalled = true;
  window.__dolphinReplaying = false;
  window.__dolphinLastTarget = null;

  function emitSync(payload) {
    if (window.__dolphinReplaying) return;
    try {
      if (typeof window.__dolphinSyncEmit === 'function') {
        window.__dolphinSyncEmit(JSON.stringify(payload));
      }
    } catch (e) {}
  }

  function getCssSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) {
      try {
        return '#' + CSS.escape(el.id);
      } catch (e) {
        return '#' + el.id;
      }
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement && parts.length < 6) {
      let tag = cur.tagName.toLowerCase();
      if (cur.name && (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button')) {
        parts.unshift(tag + '[name="' + String(cur.name).replace(/"/g, '\\\\"') + '"]');
        break;
      }
      let idx = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) idx++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function showRipple(x, y) {
    try {
      const dot = document.createElement('div');
      dot.style.cssText =
        'position:fixed;left:' + (x - 12) + 'px;top:' + (y - 12) +
        'px;width:24px;height:24px;border-radius:50%;background:rgba(16,185,129,0.45);border:2px solid #10b981;pointer-events:none;z-index:2147483647;transition:transform 0.35s ease,opacity 0.35s ease;';
      document.documentElement.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transform = 'scale(1.9)';
        dot.style.opacity = '0';
      });
      setTimeout(() => dot.remove(), 380);
    } catch (e) {}
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const proto =
      tag === 'textarea'
        ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement && window.HTMLInputElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')
      ? Object.getOwnPropertyDescriptor(proto, 'value').set
      : null;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 1. Capture Mouse Click
  document.addEventListener('click', (e) => {
    if (window.__dolphinReplaying || !e.isTrusted) return;
    if (e.target && e.target.closest && e.target.closest('#__anty_profile_badge__')) return;
    window.__dolphinLastTarget = e.target;
    const rx = e.clientX / Math.max(1, window.innerWidth);
    const ry = e.clientY / Math.max(1, window.innerHeight);
    emitSync({
      action: 'click',
      selector: getCssSelector(e.target),
      rx,
      ry,
      checked: e.target.checked,
      inputType: e.target.type || '',
    });
  }, true);

  // 2. Capture Input Value Changes
  document.addEventListener('input', (e) => {
    if (window.__dolphinReplaying || !e.isTrusted) return;
    const el = e.target;
    if (!el) return;
    window.__dolphinLastTarget = el;
    emitSync({
      action: 'input',
      selector: getCssSelector(el),
      value: el.value !== undefined ? el.value : (el.innerText || ''),
      isContentEditable: Boolean(el.isContentEditable),
    });
  }, true);

  // 3. Capture Special Keydowns (Enter, Tab, Escape, Backspace, Arrows)
  document.addEventListener('keydown', (e) => {
    if (window.__dolphinReplaying || !e.isTrusted) return;
    if (['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      emitSync({
        action: 'keydown',
        selector: getCssSelector(e.target),
        key: e.key,
        code: e.code,
        keyCode: e.keyCode || (e.key === 'Enter' ? 13 : 0),
      });
    }
  }, true);

  // 4. Capture Scroll (throttled)
  let lastScrollAt = 0;
  window.addEventListener('scroll', () => {
    if (window.__dolphinReplaying) return;
    const now = Date.now();
    if (now - lastScrollAt < 35) return;
    lastScrollAt = now;
    const maxX = Math.max(1, document.documentElement.scrollWidth - window.innerWidth);
    const maxY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    emitSync({
      action: 'scroll',
      rx: window.scrollX / maxX,
      ry: window.scrollY / maxY,
    });
  }, { capture: true, passive: true });

  // 5. Replay Incoming Sync Commands from CDP
  window.__dolphinSyncReplay = function(cmd) {
    if (!cmd) return;
    window.__dolphinReplaying = true;
    try {
      if (cmd.action === 'click') {
        const x = Math.round((cmd.rx || 0.5) * window.innerWidth);
        const y = Math.round((cmd.ry || 0.5) * window.innerHeight);
        showRipple(x, y);

        let target = null;
        if (cmd.selector) {
          try { target = document.querySelector(cmd.selector); } catch (e) {}
        }
        if (!target) {
          target = document.elementFromPoint(x, y);
        }
        if (target) {
          window.__dolphinLastTarget = target;
          if (typeof target.focus === 'function') target.focus();
          const evOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
          target.dispatchEvent(new MouseEvent('mousedown', evOpts));
          target.dispatchEvent(new MouseEvent('mouseup', evOpts));
          if (typeof target.click === 'function') {
            target.click();
          } else {
            target.dispatchEvent(new MouseEvent('click', evOpts));
          }
          if ((cmd.inputType === 'checkbox' || cmd.inputType === 'radio') && typeof cmd.checked === 'boolean') {
            target.checked = cmd.checked;
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      } else if (cmd.action === 'input') {
        let target = null;
        if (cmd.selector) {
          try { target = document.querySelector(cmd.selector); } catch (e) {}
        }
        if (!target) {
          target = window.__dolphinLastTarget || document.activeElement;
        }
        if (target) {
          if (typeof target.focus === 'function') target.focus();
          if (cmd.isContentEditable || target.isContentEditable) {
            target.innerText = cmd.value || '';
            target.dispatchEvent(new InputEvent('input', { bubbles: true }));
          } else {
            setNativeValue(target, cmd.value ?? '');
          }
        }
      } else if (cmd.action === 'fill_text') {
        const target = window.__dolphinLastTarget || document.activeElement;
        if (target) {
          if (typeof target.focus === 'function') target.focus();
          if (target.isContentEditable) {
            target.innerText = cmd.text ?? '';
            target.dispatchEvent(new InputEvent('input', { bubbles: true }));
          } else {
            setNativeValue(target, cmd.text ?? '');
          }
        }
      } else if (cmd.action === 'keydown') {
        let target = null;
        if (cmd.selector) {
          try { target = document.querySelector(cmd.selector); } catch (e) {}
        }
        if (!target) {
          target = window.__dolphinLastTarget || document.activeElement || document.body;
        }
        if (target) {
          const kOpts = {
            key: cmd.key,
            code: cmd.code,
            keyCode: cmd.keyCode || (cmd.key === 'Enter' ? 13 : 0),
            which: cmd.keyCode || (cmd.key === 'Enter' ? 13 : 0),
            bubbles: true,
            cancelable: true,
          };
          const notCancelled = target.dispatchEvent(new KeyboardEvent('keydown', kOpts));
          target.dispatchEvent(new KeyboardEvent('keypress', kOpts));
          target.dispatchEvent(new KeyboardEvent('keyup', kOpts));
          if (cmd.key === 'Enter' && notCancelled && target.form) {
            if (typeof target.form.requestSubmit === 'function') {
              target.form.requestSubmit();
            } else {
              target.form.submit();
            }
          }
        }
      } else if (cmd.action === 'scroll') {
        const maxX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({
          left: (cmd.rx || 0) * maxX,
          top: (cmd.ry || 0) * maxY,
          behavior: 'auto',
        });
      }
    } catch (e) {
    } finally {
      setTimeout(() => { window.__dolphinReplaying = false; }, 15);
    }
  };
})();`;

function sendCdp(pageEntry, method, params = {}) {
  if (!pageEntry || !pageEntry.ws) return;
  const id = pageEntry.nextMsgId++;
  const payloadStr = JSON.stringify({ id, method, params });
  if (pageEntry.ws.readyState === 1) {
    try {
      pageEntry.ws.send(payloadStr);
    } catch (e) {}
  } else if (pageEntry.ws.readyState === 0) {
    pageEntry.ws.once('open', () => {
      try {
        pageEntry.ws.send(payloadStr);
      } catch (e) {}
    });
  }
}

function getPrimaryPageEntries(session) {
  if (!session || session.pages.size === 0) return [];
  const all = Array.from(session.pages.values());
  const webPages = all.filter(
    (p) => !String(p.url || '').startsWith('chrome://') && !String(p.url || '').startsWith('edge://')
  );
  return webPages.length > 0 ? webPages : [all[0]];
}

/**
 * Broadcast a user interaction from `sourceProfileId` to all other running profiles
 */
function handleIncomingUserSyncEvent(sourceProfileId, payload) {
  if (!syncState.enabled || !payload) return;
  if (!isProfileInSyncGroup(sourceProfileId)) return;

  const action = payload.action;
  if (action === 'click' && !syncState.syncClick) return;
  if ((action === 'input' || action === 'keydown') && !syncState.syncInput) return;
  if (action === 'scroll' && !syncState.syncScroll) return;

  const expr = `if (window.__dolphinSyncReplay) window.__dolphinSyncReplay(${JSON.stringify(payload)});`;

  for (const [targetProfileId, session] of cdpProfileSessions.entries()) {
    if (targetProfileId === sourceProfileId) continue;
    if (!isProfileInSyncGroup(targetProfileId)) continue;

    for (const pageEntry of getPrimaryPageEntries(session)) {
      sendCdp(pageEntry, 'Runtime.evaluate', {
        expression: expr,
        userGesture: true,
      });
    }
  }
}

/**
 * Connect and maintain CDP WebSocket sessions to all page targets of all running profiles
 */
async function ensureAllCdpConnections() {
  const runningMap = getRunningProfilesMap();

  // Remove closed profiles
  for (const existingId of Array.from(cdpProfileSessions.keys())) {
    if (!runningMap.has(existingId)) {
      const sess = cdpProfileSessions.get(existingId);
      if (sess) {
        for (const p of sess.pages.values()) {
          try { p.ws.close(); } catch (e) {}
        }
      }
      cdpProfileSessions.delete(existingId);
    }
  }

  // Attach to all running profiles
  for (const [profileId, info] of runningMap.entries()) {
    if (!info || !info.debugPort) continue;

    let session = cdpProfileSessions.get(profileId);
    if (!session) {
      session = {
        debugPort: info.debugPort,
        pages: new Map(),
      };
      cdpProfileSessions.set(profileId, session);
    }

    try {
      const res = await fetch(`http://127.0.0.1:${info.debugPort}/json/list`);
      if (!res.ok) continue;
      const targets = await res.json();
      const pageTargets = (targets || []).filter(
        (t) =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          !String(t.url || '').startsWith('devtools://') &&
          !String(t.url || '').startsWith('chrome-extension://')
      );

      const activeTargetIds = new Set(pageTargets.map((t) => t.id));
      for (const oldTargetId of Array.from(session.pages.keys())) {
        if (!activeTargetIds.has(oldTargetId)) {
          const oldEntry = session.pages.get(oldTargetId);
          try { oldEntry.ws.close(); } catch (e) {}
          session.pages.delete(oldTargetId);
        }
      }

      // Read profile's fingerprint script if present on disk
      let fpScript = '';
      try {
        const fpPath = path.join(PROFILES_DIR, profileId, '_anty_core_ext', 'inject_main.js');
        if (fs.existsSync(fpPath)) {
          fpScript = fs.readFileSync(fpPath, 'utf8');
        }
      } catch (e) {}

      for (const target of pageTargets) {
        if (session.pages.has(target.id)) {
          const existingPage = session.pages.get(target.id);
          existingPage.url = target.url;
          if (existingPage.ws && existingPage.ws.readyState === 1) {
            continue;
          }
        }

        const ws = new WebSocket(target.webSocketDebuggerUrl);
        const pageEntry = {
          ws,
          targetId: target.id,
          url: target.url,
          nextMsgId: 1,
        };
        session.pages.set(target.id, pageEntry);

        ws.on('open', () => {
          sendCdp(pageEntry, 'Page.enable');
          sendCdp(pageEntry, 'Runtime.enable');
          sendCdp(pageEntry, 'Runtime.addBinding', { name: '__dolphinSyncEmit' });

          if (fpScript) {
            sendCdp(pageEntry, 'Page.addScriptToEvaluateOnNewDocument', { source: fpScript });
            sendCdp(pageEntry, 'Runtime.evaluate', { expression: fpScript });
          }

          sendCdp(pageEntry, 'Page.addScriptToEvaluateOnNewDocument', {
            source: CDP_SYNC_AGENT_SCRIPT,
          });
          sendCdp(pageEntry, 'Runtime.evaluate', {
            expression: CDP_SYNC_AGENT_SCRIPT,
          });
        });

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__dolphinSyncEmit') {
              const payload = JSON.parse(msg.params.payload);
              handleIncomingUserSyncEvent(profileId, payload);
            } else if (
              msg.method === 'Page.loadEventFired' ||
              (msg.method === 'Page.frameNavigated' && !msg.params?.frame?.parentId)
            ) {
              // Ensure sync script remains active across top-level page transitions
              sendCdp(pageEntry, 'Runtime.evaluate', {
                expression: CDP_SYNC_AGENT_SCRIPT,
              });
            }
          } catch (e) {}
        });

        ws.on('close', () => {
          session.pages.delete(target.id);
        });

        ws.on('error', () => {
          session.pages.delete(target.id);
        });
      }
    } catch (e) {
      // Browser might still be starting up
    }
  }
}

// Keep CDP synchronizer connections alive automatically
setInterval(() => {
  ensureAllCdpConnections().catch(() => {});
}, 1000);

function attachSyncWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const parsedUrl = url.parse(request.url, true);
    if (parsedUrl.pathname === '/ws-sync') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, parsedUrl.query);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, _req, query) => {
    const profileId = String(query?.profileId || '');
    if (!profileId) {
      ws.close();
      return;
    }
    if (!connectedWsClients.has(profileId)) {
      connectedWsClients.set(profileId, new Set());
    }
    connectedWsClients.get(profileId).add(ws);
    ws.on('close', () => {
      const set = connectedWsClients.get(profileId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) connectedWsClients.delete(profileId);
      }
    });
  });

  // Trigger initial scan
  ensureAllCdpConnections().catch(() => {});
  return wss;
}

function getConnectedProfileIds() {
  const runningMap = getRunningProfilesMap();
  const ids = new Set();
  for (const id of runningMap.keys()) {
    ids.add(id);
  }
  for (const [id, sess] of cdpProfileSessions.entries()) {
    if (sess.pages.size > 0) ids.add(id);
  }
  return Array.from(ids);
}

function getSyncState() {
  const connectedProfiles = getConnectedProfileIds();
  return {
    ...syncState,
    connectedProfiles,
    connectedProfileIds: connectedProfiles,
  };
}

function updateSyncState(patch = {}) {
  syncState = {
    ...syncState,
    ...patch,
  };
  ensureAllCdpConnections().catch(() => {});
  return getSyncState();
}

function normalizeUrlInput(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z]+:\/\//.test(trimmed) || trimmed.startsWith('about:')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Broadcast a command (navigate, reload, back, forward, fill_text) to all running profiles via CDP
 */
async function broadcastSyncCommand(payload, specificProfileIds = null) {
  await ensureAllCdpConnections();

  const runningMap = getRunningProfilesMap();
  const allCandidateIds = Array.from(runningMap.keys());
  const targets =
    Array.isArray(specificProfileIds) && specificProfileIds.length > 0
      ? specificProfileIds.filter((id) => runningMap.has(id))
      : allCandidateIds.filter(isProfileInSyncGroup);

  let sentCount = 0;
  for (const targetId of targets) {
    const sess = cdpProfileSessions.get(targetId);
    const primaryPages = getPrimaryPageEntries(sess);
    if (primaryPages.length === 0) continue;

    const pageEntry = primaryPages[0];
    if (payload.action === 'navigate' && payload.url) {
      const finalUrl = normalizeUrlInput(payload.url);
      if (finalUrl) {
        sendCdp(pageEntry, 'Page.navigate', { url: finalUrl });
        sentCount++;
      }
    } else if (payload.action === 'reload') {
      sendCdp(pageEntry, 'Page.reload', {});
      sentCount++;
    } else if (payload.action === 'back') {
      sendCdp(pageEntry, 'Runtime.evaluate', {
        expression: 'window.history.back();',
      });
      sentCount++;
    } else if (payload.action === 'forward') {
      sendCdp(pageEntry, 'Runtime.evaluate', {
        expression: 'window.history.forward();',
      });
      sentCount++;
    } else if (payload.action === 'fill_text') {
      sendCdp(pageEntry, 'Runtime.evaluate', {
        expression: `if (window.__dolphinSyncReplay) window.__dolphinSyncReplay(${JSON.stringify(payload)});`,
        userGesture: true,
      });
      sentCount++;
    }
  }

  return { sentCount, targetCount: targets.length };
}

/**
 * Distribute different lines of text 1-to-1 across running synced windows via CDP
 */
async function distributeDiffText(lines = [], specificProfileIds = null) {
  await ensureAllCdpConnections();

  const runningMap = getRunningProfilesMap();
  const allCandidateIds = Array.from(runningMap.keys());
  const targets =
    Array.isArray(specificProfileIds) && specificProfileIds.length > 0
      ? specificProfileIds.filter((id) => runningMap.has(id))
      : allCandidateIds.filter(isProfileInSyncGroup);

  let sentCount = 0;
  targets.forEach((targetId, idx) => {
    const text = lines[idx % lines.length] ?? '';
    const sess = cdpProfileSessions.get(targetId);
    const primaryPages = getPrimaryPageEntries(sess);
    if (primaryPages.length === 0) return;

    const cmd = { action: 'fill_text', text };
    for (const pageEntry of primaryPages) {
      sendCdp(pageEntry, 'Runtime.evaluate', {
        expression: `if (window.__dolphinSyncReplay) window.__dolphinSyncReplay(${JSON.stringify(cmd)});`,
        userGesture: true,
      });
      sentCount++;
    }
  });

  return { sentCount, targetCount: targets.length };
}

module.exports = {
  attachSyncWebSocketServer,
  getSyncState,
  updateSyncState,
  broadcastSyncCommand,
  distributeDiffText,
};
