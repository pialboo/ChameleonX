const fs = require('fs');
const path = require('path');

function resolveDataDir() {
  if (process.env.APPDATA) {
    const execPath = (process.execPath || '').toLowerCase();
    const isPackaged =
      process.env.NODE_ENV === 'production' ||
      process.env.TAURI_ENV_ARCH ||
      process.pkg ||
      execPath.includes('chameleon-backend') ||
      execPath.includes('chameleonx') ||
      process.cwd().toLowerCase().includes('program files');

    if (isPackaged) {
      return path.join(process.env.APPDATA, 'ChameleonX', 'data');
    }
  }
  // 開發模式或獨立執行腳本：使用專案目錄下的 data
  return path.join(process.cwd(), 'data');
}

const DATA_DIR = resolveDataDir();
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const EXTENSIONS_DIR = path.join(DATA_DIR, 'extensions');
const KERNEL_DIR = path.join(DATA_DIR, 'kernel');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  fs.mkdirSync(KERNEL_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function getDefaultData() {
  const defaultStatuses = [
    { id: 'st-new', name: '新環境', color: '#38bdf8' },
    { id: 'st-ready', name: '正常', color: '#10b981' },
    { id: 'st-warming', name: '養號中', color: '#f59e0b' },
    { id: 'st-check', name: '需驗證', color: '#a855f7' },
    { id: 'st-banned', name: '已封鎖', color: '#ef4444' },
  ];

  const defaultFolders = [
    { id: 'fld-all', name: '全部環境', icon: 'Layers' },
  ];

  return {
    profiles: [],
    proxies: [],
    extensions: [],
    statuses: defaultStatuses,
    folders: defaultFolders,
    tags: [],
    bookmarks: [],
    bookmarkFolders: [],
    settings: {
      kernelMode: 'auto',
      customKernelPath: '',
      defaultStartPage: 'https://www.google.com',
      batchLaunchDelayMs: 1000,
      autoTileWindows: true,
      tileColumns: 2,
      showWindowBadge: true,
      syncCookiesOnClose: true,
      disableImages: false,
      muteAudio: false,
      extraChromiumArgs: '',
    },
  };
}

class DataStore {
  constructor() {
    ensureDirs();
    this.data = null;
    this._saveTimer = null;
    this.load();

    // Ensure pending changes are written before process exits
    const flushOnExit = () => this.saveImmediate();
    process.on('beforeExit', flushOnExit);
    process.on('exit', flushOnExit);
  }

  load() {
    const defaults = getDefaultData();
    const tryParse = (filepath) => {
      if (fs.existsSync(filepath)) {
        try {
          const raw = fs.readFileSync(filepath, 'utf8');
          const parsed = JSON.parse(raw);
          return {
            ...defaults,
            ...parsed,
            settings: { ...defaults.settings, ...(parsed.settings || {}) },
            profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
            proxies: Array.isArray(parsed.proxies) ? parsed.proxies : [],
            extensions: Array.isArray(parsed.extensions) ? parsed.extensions : [],
            statuses: Array.isArray(parsed.statuses) && parsed.statuses.length > 0 ? parsed.statuses : defaults.statuses,
            folders: Array.isArray(parsed.folders) && parsed.folders.length > 0 ? parsed.folders : defaults.folders,
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
            bookmarkFolders: Array.isArray(parsed.bookmarkFolders) ? parsed.bookmarkFolders : [],
          };
        } catch (e) {
          console.error(`Failed to parse ${filepath}:`, e);
        }
      }
      return null;
    };

    // 1. Try reading primary db.json
    let loaded = tryParse(DB_FILE);

    // 2. If corrupted or missing, try recovering from db.json.bak
    if (!loaded) {
      const bakFile = `${DB_FILE}.bak`;
      loaded = tryParse(bakFile);
      if (loaded) {
        console.warn('[ChameleonX] Successfully recovered database from db.json.bak');
      }
    }

    this.data = loaded || defaults;
    this.saveImmediate();
  }

  save(immediate = false) {
    if (immediate) {
      this.saveImmediate();
      return;
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveImmediate();
    }, 250);
  }

  saveImmediate() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    ensureDirs();
    const dataStr = JSON.stringify(this.data, null, 2);
    const tmpFile = `${DB_FILE}.tmp`;
    const bakFile = `${DB_FILE}.bak`;

    try {
      // 1. Keep a safe backup copy before writing
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, bakFile);
        } catch (e) {}
      }

      // 2. Write to temp file first
      fs.writeFileSync(tmpFile, dataStr, 'utf8');

      // 3. Atomically replace db.json on Windows
      try {
        fs.renameSync(tmpFile, DB_FILE);
      } catch (renameErr) {
        // Fallback for Windows EPERM / EBUSY locks
        fs.copyFileSync(tmpFile, DB_FILE);
        try { fs.unlinkSync(tmpFile); } catch (e) {}
      }
    } catch (err) {
      console.error('[ChameleonX] Critical error saving db.json:', err);
    }
  }

  getState() {
    return this.data;
  }

  getNextSerialNumber() {
    const max = this.data.profiles.reduce((acc, p) => Math.max(acc, Number(p.serialNumber) || 0), 0);
    return max + 1;
  }
}

const store = new DataStore();

module.exports = {
  store,
  DATA_DIR,
  PROFILES_DIR,
  EXTENSIONS_DIR,
  KERNEL_DIR,
  BACKUPS_DIR,
  DB_FILE,
};
