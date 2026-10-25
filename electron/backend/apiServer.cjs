const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { store, PROFILES_DIR, EXTENSIONS_DIR } = require('./store.cjs');
const { generateFingerprint, generateSeed } = require('./fingerprintGenerator.cjs');
const {
  inspectExtensionDir,
  importExtensionArchive,
  installFromChromeWebStore,
  updateExtension,
} = require('./extensionManager.cjs');
const {
  detectKernels,
  downloadFingerprintChromium,
  launchProfile,
  stopProfile,
  batchLaunchProfiles,
  batchStopProfiles,
  exportProfileCookies,
  testProxyConnection,
  getRunningStatusMap,
  tileRunningWindows,
  bringRunningWindowsToTop,
} = require('./browserLauncher.cjs');
const {
  getSyncState,
  updateSyncState,
  broadcastSyncCommand,
  distributeDiffText,
} = require('./syncHub.cjs');
const {
  createBackup,
  inspectBackup,
  restoreBackup,
  listSnapshots,
  deleteSnapshot,
  BACKUPS_DIR,
} = require('./backupManager.cjs');

/**
 * Parse Netscape or JSON cookies string into standard Cookie array
 */
function parseCookieInput(rawInput) {
  if (!rawInput) return [];
  if (Array.isArray(rawInput)) return rawInput;
  const text = String(rawInput).trim();
  if (!text) return [];

  // Try JSON first
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      // fall through to Netscape parser
    }
  }

  // Netscape HTTP Cookie File format
  const cookies = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('\t');
    if (parts.length >= 7) {
      cookies.push({
        domain: parts[0],
        httpOnly: parts[1].toUpperCase() === 'TRUE',
        path: parts[2] || '/',
        secure: parts[3].toUpperCase() === 'TRUE',
        expirationDate: Number(parts[4]) || undefined,
        name: parts[5],
        value: parts[6],
      });
    }
  }
  return cookies;
}

function normalizeProtocol(rawProto, fallback = 'http') {
  const p = String(rawProto || '').toLowerCase().trim();
  if (p === 'sock5' || p === 'socks5' || p === 'socks5h' || p === 'socks') return 'socks5';
  if (p === 'sock4' || p === 'socks4' || p === 'socks4a') return 'socks4';
  if (p === 'http' || p === 'https') return 'http';
  if (p === 'ssh') return 'ssh';
  return fallback;
}

/**
 * Smartly parse any Dolphin Anty supported proxy string format:
 * - sock5://user:password:192.168.2.1:1081
 * - socks5://user:password@192.168.2.1:1081
 * - host:port:login:password
 * - login:password:host:port
 * - login:password@host:port
 * - host:port@login:password
 */
function parseProxyLine(line, defaultType = 'http', index = 1) {
  let raw = String(line || '').trim();
  if (!raw) return null;

  let customName = '';
  if (raw.includes('#')) {
    const idx = raw.indexOf('#');
    customName = raw.slice(idx + 1).trim();
    raw = raw.slice(0, idx).trim();
  }

  let type = normalizeProtocol(defaultType, 'http');
  const schemeMatch = raw.match(/^([a-zA-Z0-9+-]+):\/\//);
  if (schemeMatch) {
    type = normalizeProtocol(schemeMatch[1], type);
    raw = raw.slice(schemeMatch[0].length).trim();
  }

  const isLikelyHost = (str) => {
    if (!str) return false;
    return str.includes('.') || str === 'localhost' || /^\[?[0-9a-fA-F:]+\]?$/.test(str);
  };

  const isPort = (str) => {
    if (!/^\d{1,5}$/.test(str || '')) return false;
    const n = Number(str);
    return n >= 1 && n <= 65535;
  };

  const isHostPort = (str) => {
    const parts = str.split(':');
    if (parts.length !== 2) return false;
    return isLikelyHost(parts[0]) && isPort(parts[1]);
  };

  let host = '';
  let port = '';
  let username = '';
  let password = '';

  if (raw.includes('@')) {
    const [left, right] = raw.split('@');
    if (isHostPort(right)) {
      const [h, pt] = right.split(':');
      host = h;
      port = pt;
      const [u, ...pRest] = left.split(':');
      username = decodeURIComponent(u || '');
      password = decodeURIComponent(pRest.join(':') || '');
    } else if (isHostPort(left)) {
      const [h, pt] = left.split(':');
      host = h;
      port = pt;
      const [u, ...pRest] = right.split(':');
      username = decodeURIComponent(u || '');
      password = decodeURIComponent(pRest.join(':') || '');
    } else {
      const [u, ...pRest] = left.split(':');
      username = decodeURIComponent(u || '');
      password = decodeURIComponent(pRest.join(':') || '');
      const [h, pt] = right.split(':');
      host = h || '';
      port = pt || '';
    }
  } else {
    const parts = raw.split(':');
    if (parts.length === 2) {
      host = parts[0];
      port = parts[1];
    } else if (parts.length === 3) {
      if (isLikelyHost(parts[0]) && isPort(parts[1])) {
        host = parts[0];
        port = parts[1];
        username = parts[2];
      } else if (isLikelyHost(parts[1]) && isPort(parts[2])) {
        username = parts[0];
        host = parts[1];
        port = parts[2];
      }
    } else if (parts.length >= 4) {
      const firstIsHostPort = isLikelyHost(parts[0]) && isPort(parts[1]);
      const lastTwoIsHostPort =
        isLikelyHost(parts[parts.length - 2]) && isPort(parts[parts.length - 1]);

      if (lastTwoIsHostPort && !firstIsHostPort) {
        host = parts[parts.length - 2];
        port = parts[parts.length - 1];
        username = parts[0];
        password = parts.slice(1, parts.length - 2).join(':');
      } else {
        host = parts[0];
        port = parts[1];
        username = parts[2];
        password = parts.slice(3).join(':');
      }
    }
  }

  if (!host || !port) return null;
  return {
    id: 'px-' + crypto.randomBytes(4).toString('hex'),
    name: customName || `${host}:${port}`,
    type,
    host,
    port: String(port),
    username,
    password,
    changeIpUrl: '',
    country: '',
    city: '',
    timezone: '',
    lastIp: '',
    status: 'untested',
    latency: null,
    createdAt: new Date().toISOString(),
  };
}

function createApiServer(electronDialogHandler = null) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Full application state
  app.get('/api/state', (req, res) => {
    const state = store.getState();
    res.json({
      ...state,
      runningMap: getRunningStatusMap(),
      kernelInfo: detectKernels(),
      syncState: getSyncState(),
    });
  });

  // Generate a fingerprint preview
  app.post('/api/fingerprint/generate', (req, res) => {
    const fp = generateFingerprint(req.body || {});
    res.json(fp);
  });

  // Create single profile
  app.post('/api/profiles', (req, res) => {
    const state = store.getState();
    const body = req.body || {};
    const serialNumber = store.getNextSerialNumber();
    const id = 'prf-' + crypto.randomBytes(4).toString('hex');
    const os = body.os || 'windows';
    const fp = body.fingerprint ? generateFingerprint({ ...body.fingerprint, os }) : generateFingerprint({ os });

    const newProfile = {
      id,
      serialNumber,
      name: body.name || `環境 #${String(serialNumber).padStart(2, '0')}`,
      folderId: body.folderId || 'fld-all',
      statusId: body.statusId || (state.statuses[0] ? state.statuses[0].id : 'st-new'),
      tags: Array.isArray(body.tags) ? body.tags : [],
      notes: body.notes || '',
      noteColor: body.noteColor || 'slate',
      os,
      startPages: Array.isArray(body.startPages) && body.startPages.length > 0 ? body.startPages : [state.settings.defaultStartPage],
      proxyMode: body.proxyMode || 'none',
      proxyId: body.proxyId || '',
      proxy: body.proxy || null,
      fingerprint: fp,
      extensionIds: Array.isArray(body.extensionIds)
        ? body.extensionIds
        : state.extensions.filter((e) => e.enabledForAll).map((e) => e.id),
      cookies: parseCookieInput(body.cookies),
      lastLaunchedAt: null,
      launchCount: 0,
      createdAt: new Date().toISOString(),
    };

    state.profiles.unshift(newProfile);
    store.save();
    res.json(newProfile);
  });

  // Mass create profiles (批量建立環境)
  app.post('/api/profiles/mass-create', (req, res) => {
    const state = store.getState();
    const body = req.body || {};
    const count = Math.min(200, Math.max(1, Number(body.count) || 5));
    const prefix = body.namePrefix || '批量環境';
    const startNum = Number(body.startNumber) || store.getNextSerialNumber();
    const os = body.os || 'windows';
    const brand = body.brand || 'Chrome';
    const folderId = body.folderId || 'fld-all';
    const statusId = body.statusId || 'st-new';
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const notes = body.notes || '';
    const proxyAssignMode = body.proxyAssignMode || 'none'; // 'none' | 'sequential' | 'random'
    const extensionIds = Array.isArray(body.extensionIds)
      ? body.extensionIds
      : state.extensions.filter((e) => e.enabledForAll).map((e) => e.id);

    const savedProxies = state.proxies || [];
    const created = [];

    for (let i = 0; i < count; i++) {
      const serialNumber = store.getNextSerialNumber();
      const numLabel = String(startNum + i).padStart(2, '0');
      const id = 'prf-' + crypto.randomBytes(4).toString('hex');

      let proxyMode = 'none';
      let proxyId = '';
      if (savedProxies.length > 0 && proxyAssignMode === 'sequential') {
        proxyMode = 'saved';
        proxyId = savedProxies[i % savedProxies.length].id;
      } else if (savedProxies.length > 0 && proxyAssignMode === 'random') {
        proxyMode = 'saved';
        proxyId = savedProxies[Math.floor(Math.random() * savedProxies.length)].id;
      }

      const prof = {
        id,
        serialNumber,
        name: `${prefix} #${numLabel}`,
        folderId,
        statusId,
        tags: [...tags],
        notes,
        noteColor: 'violet',
        os,
        startPages: [body.startPage || state.settings.defaultStartPage],
        proxyMode,
        proxyId,
        proxy: null,
        fingerprint: generateFingerprint({ os, brand, seed: generateSeed() }),
        extensionIds: [...extensionIds],
        cookies: [],
        lastLaunchedAt: null,
        launchCount: 0,
        createdAt: new Date().toISOString(),
      };
      state.profiles.unshift(prof);
      created.push(prof);
    }

    store.save();
    res.json({ createdCount: created.length, profiles: created });
  });

  // Update single profile
  app.put('/api/profiles/:id', (req, res) => {
    const state = store.getState();
    const idx = state.profiles.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '找不到該環境' });

    const existing = state.profiles[idx];
    const body = req.body || {};
    const updated = {
      ...existing,
      ...body,
      id: existing.id,
      fingerprint: body.fingerprint ? { ...existing.fingerprint, ...body.fingerprint } : existing.fingerprint,
      cookies: body.cookies !== undefined ? parseCookieInput(body.cookies) : existing.cookies,
    };
    state.profiles[idx] = updated;
    store.save();
    res.json(updated);
  });

  // Clone profile
  app.post('/api/profiles/:id/clone', (req, res) => {
    const state = store.getState();
    const orig = state.profiles.find((p) => p.id === req.params.id);
    if (!orig) return res.status(404).json({ error: '找不到該環境' });

    const serialNumber = store.getNextSerialNumber();
    const cloned = {
      ...JSON.parse(JSON.stringify(orig)),
      id: 'prf-' + crypto.randomBytes(4).toString('hex'),
      serialNumber,
      name: `${orig.name} (副本)`,
      fingerprint: generateFingerprint({
        ...orig.fingerprint,
        seed: generateSeed(),
      }),
      lastLaunchedAt: null,
      launchCount: 0,
      createdAt: new Date().toISOString(),
    };
    state.profiles.unshift(cloned);
    store.save();
    res.json(cloned);
  });

  // Delete single profile
  app.delete('/api/profiles/:id', async (req, res) => {
    const state = store.getState();
    const id = req.params.id;
    await stopProfile(id);
    state.profiles = state.profiles.filter((p) => p.id !== id);
    store.save();
    const dir = path.join(PROFILES_DIR, id);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {}
    }
    res.json({ deleted: true, id });
  });

  // Launch single profile
  app.post('/api/profiles/:id/launch', async (req, res) => {
    try {
      const result = await launchProfile(req.params.id, req.body?.windowBounds || null);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stop single profile
  app.post('/api/profiles/:id/stop', async (req, res) => {
    try {
      const result = await stopProfile(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clear profile cache
  app.post('/api/profiles/:id/clear-cache', (req, res) => {
    const defaultDir = path.join(PROFILES_DIR, req.params.id, 'Default');
    const cacheDirs = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache'];
    let cleared = 0;
    for (const sub of cacheDirs) {
      const target = path.join(defaultDir, sub);
      if (fs.existsSync(target)) {
        try {
          fs.rmSync(target, { recursive: true, force: true });
          cleared++;
        } catch (e) {}
      }
    }
    res.json({ ok: true, cleared });
  });

  // Open profile directory in Windows Explorer
  app.post('/api/profiles/:id/open-folder', (req, res) => {
    const dir = path.join(PROFILES_DIR, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    execFile('explorer.exe', [dir]);
    res.json({ ok: true, path: dir });
  });

  // Export cookies for profile
  app.get('/api/profiles/:id/cookies', async (req, res) => {
    try {
      const cookies = await exportProfileCookies(req.params.id);
      res.json({ cookies });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Import cookies for profile
  app.post('/api/profiles/:id/cookies', (req, res) => {
    const state = store.getState();
    const profile = state.profiles.find((p) => p.id === req.params.id);
    if (!profile) return res.status(404).json({ error: '找不到該環境' });
    const parsed = parseCookieInput(req.body?.cookies);
    profile.cookies = parsed;
    store.save();
    res.json({ ok: true, count: parsed.length, cookies: parsed });
  });

  // Bulk Actions on Profiles (批量操作中心)
  app.post('/api/profiles/bulk', async (req, res) => {
    const state = store.getState();
    const { action, profileIds = [], payload = {} } = req.body || {};
    const idSet = new Set(profileIds);

    try {
      if (action === 'launch') {
        const results = await batchLaunchProfiles(profileIds, payload);
        return res.json({ ok: true, results });
      }
      if (action === 'stop') {
        const results = await batchStopProfiles(profileIds);
        return res.json({ ok: true, results });
      }
      if (action === 'delete') {
        await batchStopProfiles(profileIds);
        state.profiles = state.profiles.filter((p) => !idSet.has(p.id));
        store.save();
        for (const id of profileIds) {
          const dir = path.join(PROFILES_DIR, id);
          if (fs.existsSync(dir)) {
            try {
              fs.rmSync(dir, { recursive: true, force: true });
            } catch (e) {}
          }
        }
        return res.json({ ok: true, deletedCount: profileIds.length });
      }
      if (action === 'status') {
        for (const p of state.profiles) {
          if (idSet.has(p.id)) p.statusId = payload.statusId;
        }
        store.save();
        return res.json({ ok: true });
      }
      if (action === 'folder') {
        for (const p of state.profiles) {
          if (idSet.has(p.id)) p.folderId = payload.folderId;
        }
        store.save();
        return res.json({ ok: true });
      }
      if (action === 'tags') {
        const mode = payload.mode || 'add'; // 'add' | 'set' | 'clear'
        const newTags = Array.isArray(payload.tags) ? payload.tags : [];
        for (const p of state.profiles) {
          if (!idSet.has(p.id)) continue;
          if (mode === 'clear') p.tags = [];
          else if (mode === 'set') p.tags = [...newTags];
          else p.tags = Array.from(new Set([...(p.tags || []), ...newTags]));
        }
        store.save();
        return res.json({ ok: true });
      }
      if (action === 'proxy') {
        const mode = payload.mode || 'single'; // 'none' | 'single' | 'sequential' | 'random'
        const savedProxies = state.proxies || [];
        let seqIdx = 0;
        for (const p of state.profiles) {
          if (!idSet.has(p.id)) continue;
          if (mode === 'none') {
            p.proxyMode = 'none';
            p.proxyId = '';
            p.proxy = null;
          } else if (mode === 'single' && payload.proxyId) {
            p.proxyMode = 'saved';
            p.proxyId = payload.proxyId;
          } else if (mode === 'sequential' && savedProxies.length > 0) {
            p.proxyMode = 'saved';
            p.proxyId = savedProxies[seqIdx % savedProxies.length].id;
            seqIdx++;
          } else if (mode === 'random' && savedProxies.length > 0) {
            p.proxyMode = 'saved';
            p.proxyId = savedProxies[Math.floor(Math.random() * savedProxies.length)].id;
          }
        }
        store.save();
        return res.json({ ok: true });
      }
      if (action === 'extensions') {
        const mode = payload.mode || 'add'; // 'add' | 'set' | 'remove'
        const extIds = Array.isArray(payload.extensionIds) ? payload.extensionIds : [];
        for (const p of state.profiles) {
          if (!idSet.has(p.id)) continue;
          const current = new Set(p.extensionIds || []);
          if (mode === 'set') {
            p.extensionIds = [...extIds];
          } else if (mode === 'add') {
            extIds.forEach((id) => current.add(id));
            p.extensionIds = Array.from(current);
          } else if (mode === 'remove') {
            extIds.forEach((id) => current.delete(id));
            p.extensionIds = Array.from(current);
          }
        }
        store.save();
        return res.json({ ok: true });
      }
      if (action === 'new-fingerprint') {
        for (const p of state.profiles) {
          if (idSet.has(p.id)) {
            p.fingerprint = generateFingerprint({
              os: p.os || 'windows',
              brand: p.fingerprint?.brand || 'Chrome',
              seed: generateSeed(),
            });
          }
        }
        store.save();
        return res.json({ ok: true });
      }
      if (action === 'export-cookies') {
        const exportBundle = {};
        for (const id of profileIds) {
          const p = state.profiles.find((x) => x.id === id);
          if (p) {
            exportBundle[p.name] = await exportProfileCookies(id);
          }
        }
        return res.json({ ok: true, cookiesByProfile: exportBundle });
      }

      res.status(400).json({ error: `未知的批量操作：${action}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxies Management
  app.post('/api/proxies', (req, res) => {
    const state = store.getState();
    const body = req.body || {};

    // Support batch text import (multiple lines)
    if (body.rawText) {
      const lines = String(body.rawText).split(/\r?\n/);
      const added = [];
      lines.forEach((line, idx) => {
        const parsed = parseProxyLine(line, body.defaultType || 'http', idx + 1);
        if (parsed) {
          state.proxies.unshift(parsed);
          added.push(parsed);
        }
      });
      store.save();
      return res.json({ addedCount: added.length, proxies: added });
    }

    // Single proxy creation
    const px = {
      id: 'px-' + crypto.randomBytes(4).toString('hex'),
      name: body.name || `代理 ${body.host}:${body.port}`,
      type: body.type || 'http',
      host: body.host || '127.0.0.1',
      port: String(body.port || '8080'),
      username: body.username || '',
      password: body.password || '',
      changeIpUrl: body.changeIpUrl || '',
      country: body.country || '',
      city: body.city || '',
      timezone: body.timezone || '',
      lastIp: '',
      status: 'untested',
      latency: null,
      createdAt: new Date().toISOString(),
    };
    state.proxies.unshift(px);
    store.save();
    res.json(px);
  });

  app.put('/api/proxies/:id', (req, res) => {
    const state = store.getState();
    const idx = state.proxies.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '找不到該代理' });
    state.proxies[idx] = { ...state.proxies[idx], ...req.body, id: state.proxies[idx].id };
    store.save();
    res.json(state.proxies[idx]);
  });

  app.delete('/api/proxies/:id', (req, res) => {
    const state = store.getState();
    state.proxies = state.proxies.filter((p) => p.id !== req.params.id);
    store.save();
    res.json({ deleted: true });
  });

  app.post('/api/proxies/bulk-delete', (req, res) => {
    const state = store.getState();
    const ids = new Set(req.body?.ids || []);
    state.proxies = state.proxies.filter((p) => !ids.has(p.id));
    store.save();
    res.json({ deleted: true });
  });

  app.post('/api/proxies/test', async (req, res) => {
    const state = store.getState();
    const { proxyId, proxyConfig } = req.body || {};
    let target = proxyConfig;
    let savedProxy = null;
    if (proxyId) {
      savedProxy = state.proxies.find((p) => p.id === proxyId);
      target = savedProxy;
    }
    if (!target) return res.status(400).json({ error: '找不到要測試的代理設定' });

    const result = await testProxyConnection(target);
    if (savedProxy) {
      savedProxy.status = result.ok ? 'online' : 'offline';
      savedProxy.latency = result.latency;
      if (result.ok) {
        savedProxy.lastIp = result.ip;
        savedProxy.country = result.country;
        savedProxy.city = result.city;
        savedProxy.timezone = result.timezone;
      }
      store.save();
    }
    res.json({ ...result, proxy: savedProxy });
  });

  app.post('/api/proxies/test-all', async (req, res) => {
    const state = store.getState();
    const ids = req.body?.ids;
    const targets = Array.isArray(ids) && ids.length > 0
      ? state.proxies.filter((p) => ids.includes(p.id))
      : state.proxies;

    const results = [];
    for (const px of targets) {
      const r = await testProxyConnection(px);
      px.status = r.ok ? 'online' : 'offline';
      px.latency = r.latency;
      if (r.ok) {
        px.lastIp = r.ip;
        px.country = r.country;
        px.city = r.city;
        px.timezone = r.timezone;
      }
      results.push({ id: px.id, ...r });
    }
    store.save();
    res.json({ results });
  });

  // Extensions Management
  app.post('/api/extensions/folder', (req, res) => {
    try {
      const { folderPath, category, enabledForAll } = req.body || {};
      if (!folderPath) return res.status(400).json({ error: '請提供擴充功能資料夾路徑' });
      const info = inspectExtensionDir(folderPath);
      const state = store.getState();
      const newExt = {
        id: 'ext-' + crypto.randomBytes(4).toString('hex'),
        name: info.name,
        version: info.version,
        description: info.description,
        path: info.path,
        iconDataUrl: info.iconDataUrl,
        enabledForAll: enabledForAll !== false,
        category: category || '本地資料夾',
        source: 'folder',
        createdAt: new Date().toISOString(),
      };
      state.extensions.unshift(newExt);
      store.save();
      res.json(newExt);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/extensions/archive', (req, res) => {
    try {
      const { filePath, fileName, base64Data } = req.body || {};
      let targetFile = filePath;
      let tempFile = null;

      if (!targetFile && base64Data) {
        tempFile = path.join(EXTENSIONS_DIR, `_upload_${Date.now()}_${fileName || 'ext.zip'}`);
        const cleaned = String(base64Data).replace(/^data:.*?;base64,/, '');
        fs.writeFileSync(tempFile, Buffer.from(cleaned, 'base64'));
        targetFile = tempFile;
      }

      if (!targetFile) return res.status(400).json({ error: '請選擇 .zip 或 .crx 擴充功能檔案' });

      const newExt = importExtensionArchive(targetFile, EXTENSIONS_DIR);
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
      }

      const state = store.getState();
      state.extensions.unshift(newExt);
      store.save();
      res.json(newExt);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/extensions/webstore', async (req, res) => {
    try {
      const { urlOrId } = req.body || {};
      if (!urlOrId) return res.status(400).json({ error: '請輸入 Chrome 線上應用程式商店網址或擴充功能 ID' });
      const newExt = await installFromChromeWebStore(urlOrId, EXTENSIONS_DIR);
      const state = store.getState();
      // Replace if already exists
      state.extensions = state.extensions.filter((e) => e.id !== newExt.id);
      state.extensions.unshift(newExt);
      store.save();
      res.json(newExt);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/extensions/:id/update', async (req, res) => {
    try {
      const state = store.getState();
      const ext = state.extensions.find((e) => e.id === req.params.id);
      if (!ext) return res.status(404).json({ error: '找不到該擴充功能' });
      const { filePath, fileName, base64Data } = req.body || {};
      const result = await updateExtension(ext, EXTENSIONS_DIR, { filePath, fileName, base64Data });
      store.save();
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/extensions/:id', (req, res) => {
    const state = store.getState();
    const ext = state.extensions.find((e) => e.id === req.params.id);
    if (!ext) return res.status(404).json({ error: '找不到該擴充功能' });
    Object.assign(ext, req.body, { id: ext.id });
    store.save();
    res.json(ext);
  });

  app.delete('/api/extensions/:id', (req, res) => {
    const state = store.getState();
    state.extensions = state.extensions.filter((e) => e.id !== req.params.id);
    store.save();
    res.json({ deleted: true });
  });

  // Native Dialog helper (when running inside Electron)
  app.post('/api/dialog/select', async (req, res) => {
    if (!electronDialogHandler) {
      return res.status(400).json({ error: '目前非 Electron 桌面對話框環境，請直接輸入路徑或拖曳檔案上傳' });
    }
    try {
      const selectedPath = await electronDialogHandler(req.body || {});
      res.json({ path: selectedPath });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Folders, Statuses, Tags, Bookmarks, Settings
  app.post('/api/folders', (req, res) => {
    const state = store.getState();
    const folder = {
      id: 'fld-' + crypto.randomBytes(3).toString('hex'),
      name: req.body?.name || '新資料夾',
      icon: req.body?.icon || 'Folder',
    };
    state.folders.push(folder);
    store.save();
    res.json(folder);
  });

  app.delete('/api/folders/:id', (req, res) => {
    const state = store.getState();
    if (req.params.id === 'fld-all') return res.status(400).json({ error: '無法刪除預設全部環境分類' });
    state.folders = state.folders.filter((f) => f.id !== req.params.id);
    state.profiles.forEach((p) => {
      if (p.folderId === req.params.id) p.folderId = 'fld-all';
    });
    store.save();
    res.json({ deleted: true });
  });

  app.post('/api/statuses', (req, res) => {
    const state = store.getState();
    const st = {
      id: 'st-' + crypto.randomBytes(3).toString('hex'),
      name: req.body?.name || '自訂狀態',
      color: req.body?.color || '#8b5cf6',
    };
    state.statuses.push(st);
    store.save();
    res.json(st);
  });

  app.delete('/api/statuses/:id', (req, res) => {
    const state = store.getState();
    state.statuses = state.statuses.filter((s) => s.id !== req.params.id);
    store.save();
    res.json({ deleted: true });
  });

  app.post('/api/tags', (req, res) => {
    const state = store.getState();
    const name = String(req.body?.name || '').trim();
    if (name && !state.tags.includes(name)) {
      state.tags.push(name);
      store.save();
    }
    res.json({ tags: state.tags });
  });

  app.delete('/api/tags/:name', (req, res) => {
    const state = store.getState();
    const target = decodeURIComponent(req.params.name);
    state.tags = state.tags.filter((t) => t !== target);
    state.profiles.forEach((p) => {
      p.tags = (p.tags || []).filter((t) => t !== target);
    });
    store.save();
    res.json({ tags: state.tags });
  });

  app.post('/api/bookmarks', (req, res) => {
    const state = store.getState();
    const bm = {
      id: 'bm-' + crypto.randomBytes(3).toString('hex'),
      title: req.body?.title || '常用網站',
      url: req.body?.url || 'https://',
    };
    state.bookmarks.push(bm);
    store.save();
    res.json(bm);
  });

  app.delete('/api/bookmarks/:id', (req, res) => {
    const state = store.getState();
    state.bookmarks = state.bookmarks.filter((b) => b.id !== req.params.id);
    store.save();
    res.json({ deleted: true });
  });

  app.put('/api/settings', (req, res) => {
    const state = store.getState();
    state.settings = { ...state.settings, ...(req.body || {}) };
    store.save();
    res.json({ settings: state.settings, kernelInfo: detectKernels() });
  });

  // Kernel Management
  app.get('/api/kernel/status', (req, res) => {
    res.json(detectKernels());
  });

  app.post('/api/kernel/download', async (req, res) => {
    const status = await downloadFingerprintChromium();
    res.json(status);
  });

  // Synchronizer (多視窗同步操作) Endpoints
  app.post('/api/sync/state', (req, res) => {
    const updated = updateSyncState(req.body || {});
    res.json(updated);
  });

  app.post('/api/sync/command', async (req, res) => {
    try {
      const body = req.body || {};
      const payload =
        typeof body.payload === 'string'
          ? { action: body.payload, url: typeof body.profileIds === 'string' ? body.profileIds : body.url }
          : body.payload || { action: body.action, url: body.url, text: body.text };
      const profileIds = Array.isArray(body.profileIds) ? body.profileIds : null;
      const result = await broadcastSyncCommand(payload, profileIds);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sync/distribute-text', async (req, res) => {
    try {
      const { lines, profileIds } = req.body || {};
      const result = await distributeDiffText(Array.isArray(lines) ? lines : [], profileIds);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sync/tile-windows', async (req, res) => {
    try {
      const result = await tileRunningWindows(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sync/bring-to-top', async (req, res) => {
    try {
      const result = await bringRunningWindowsToTop(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Backup & Restore Routes ---
  app.post('/api/backup/create', async (req, res) => {
    try {
      const options = req.body || {};
      const result = await createBackup(options);
      if (result.zipBuffer && !result.filePath) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
        const tempName = `_export_${Date.now()}_${result.filename}`;
        const tempPath = path.join(BACKUPS_DIR, tempName);
        fs.writeFileSync(tempPath, result.zipBuffer);
        return res.json({
          success: true,
          filename: result.filename,
          downloadUrl: `/api/backup/download/${tempName}`,
          size: result.size,
          manifest: result.manifest,
        });
      }
      res.json({
        success: true,
        filename: result.filename,
        filePath: result.filePath,
        size: result.size,
        manifest: result.manifest,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/backup/download/:filename', (req, res) => {
    try {
      const safeName = path.basename(req.params.filename);
      const filePath = path.join(BACKUPS_DIR, safeName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '找不到該備份檔案' });
      }
      const downloadName = safeName.startsWith('_export_')
        ? safeName.replace(/^_export_\d+_/, '')
        : safeName;
      res.download(filePath, downloadName, (err) => {
        if (safeName.startsWith('_export_')) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {}
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/backup/inspect', (req, res) => {
    try {
      const { filePath, base64Data } = req.body || {};
      let input = null;
      if (filePath) {
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: '找不到指定的檔案路徑' });
        }
        input = filePath;
      } else if (base64Data) {
        const cleaned = String(base64Data).replace(/^data:.*?;base64,/, '');
        input = Buffer.from(cleaned, 'base64');
      } else {
        return res.status(400).json({ error: '請提供備份檔案路徑或檔案內容' });
      }

      const result = inspectBackup(input);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/backup/restore', async (req, res) => {
    try {
      const { filePath, base64Data, options } = req.body || {};
      let input = null;
      if (filePath) {
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: '找不到指定的備份檔案路徑' });
        }
        input = filePath;
      } else if (base64Data) {
        const cleaned = String(base64Data).replace(/^data:.*?;base64,/, '');
        input = Buffer.from(cleaned, 'base64');
      } else {
        return res.status(400).json({ error: '請提供要還原的備份檔案' });
      }

      const result = await restoreBackup(input, options || {}, stopProfile);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/backup/snapshots', (req, res) => {
    try {
      const list = listSnapshots();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/backup/snapshots/:filename', (req, res) => {
    try {
      const ok = deleteSnapshot(req.params.filename);
      if (!ok) return res.status(404).json({ error: '找不到該快照檔案' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/backup/snapshots/:filename/restore', async (req, res) => {
    try {
      const safeName = path.basename(req.params.filename);
      const fullPath = path.join(BACKUPS_DIR, safeName);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: '找不到該快照檔案' });
      }
      const options = req.body?.options || {};
      const result = await restoreBackup(fullPath, options, stopProfile);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

module.exports = {
  createApiServer,
};
