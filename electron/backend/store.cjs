const fs = require('fs');
const path = require('path');

let app;
try {
  const electron = require('electron');
  app = electron.app;
} catch (e) {
  // Not running inside Electron (e.g. standalone node script)
}

function resolveDataDir() {
  if (app && app.isPackaged) {
    // 打包安裝模式下：儲存在使用者專屬的 AppData 目錄，避免 Program Files 權限不足問題
    return path.join(app.getPath('appData'), 'ChameleonX', 'data');
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
    this.load();
  }

  load() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
        return;
      } catch (e) {
        console.error('Failed to parse db.json, falling back to defaults:', e);
      }
    }
    this.data = getDefaultData();
    this.save();
  }

  save() {
    ensureDirs();
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
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
