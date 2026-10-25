export interface FingerprintConfig {
  seed: string;
  os: 'windows' | 'macos' | 'linux';
  platform: string;
  brand: 'Chrome' | 'Edge' | 'Opera';
  chromeVersion: string;
  userAgent: string;
  webrtc: 'altered' | 'disabled' | 'real';
  canvas: 'noise' | 'real';
  webgl: 'noise' | 'real';
  webglMetadata: 'custom' | 'real';
  webglVendor: string;
  webglRenderer: string;
  audio: 'noise' | 'real';
  clientRects: 'noise' | 'real';
  timezoneMode: 'auto' | 'manual';
  timezone: string;
  localeMode: 'auto' | 'manual';
  locale: string;
  languages: string[];
  geolocationMode: 'auto' | 'manual' | 'prompt';
  latitude: number;
  longitude: number;
  cpuCores: number;
  memory: number;
  resolution: string;
  fontsMode: 'noise' | 'real';
  doNotTrack: boolean;
  macAddress: string;
  deviceName: string;
  portScanProtection: boolean;
}

export interface ProxyItem {
  id: string;
  name: string;
  type: 'http' | 'https' | 'socks5' | 'socks4';
  host: string;
  port: string;
  username?: string;
  password?: string;
  changeIpUrl?: string;
  country?: string;
  city?: string;
  timezone?: string;
  lastIp?: string;
  status?: 'online' | 'offline' | 'untested';
  latency?: number | null;
  createdAt?: string;
}

export interface ExtensionItem {
  id: string;
  name: string;
  version: string;
  description: string;
  path: string;
  iconDataUrl?: string | null;
  enabledForAll: boolean;
  category: string;
  source: 'builtin' | 'folder' | 'archive' | 'webstore';
  webstoreId?: string;
  createdAt: string;
}

export interface StatusItem {
  id: string;
  name: string;
  color: string;
}

export interface FolderItem {
  id: string;
  name: string;
  icon?: string;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
}

export interface ProfileItem {
  id: string;
  serialNumber: number;
  name: string;
  folderId: string;
  statusId: string;
  tags: string[];
  notes: string;
  noteColor?: string;
  os: 'windows' | 'macos' | 'linux';
  startPages: string[];
  proxyMode: 'none' | 'saved' | 'custom';
  proxyId: string;
  proxy?: ProxyItem | null;
  fingerprint: FingerprintConfig;
  extensionIds: string[];
  cookies: any[];
  lastLaunchedAt?: string | null;
  launchCount: number;
  lastPublicIp?: string | null;
  lastCountry?: string | null;
  lastCity?: string | null;
  lastIpCheckedAt?: string | null;
  createdAt: string;
}

export interface AppSettings {
  kernelMode: 'auto' | 'fingerprint-chromium' | 'system-chrome' | 'custom';
  customKernelPath: string;
  defaultStartPage: string;
  batchLaunchDelayMs: number;
  autoTileWindows: boolean;
  tileColumns: number;
  showWindowBadge: boolean;
  syncCookiesOnClose: boolean;
  disableImages: boolean;
  muteAudio: boolean;
  extraChromiumArgs: string;
}

export interface RunningInfo {
  running: boolean;
  pid: number;
  startedAt: string;
  kernelName: string;
  publicIp?: string | null;
  country?: string | null;
  city?: string | null;
  isp?: string | null;
  ipLoading?: boolean;
}

export interface KernelInfo {
  activeKernel: {
    id: string;
    name: string;
    path: string;
    isFingerprintCore: boolean;
  } | null;
  available: Array<{
    id: string;
    name: string;
    path: string;
    isFingerprintCore: boolean;
  }>;
  hasFingerprintChromium: boolean;
  fingerprintChromiumPath: string | null;
  isMissingFingerprintCore?: boolean;
  fallbackReason?: string | null;
  downloadState: {
    downloading: boolean;
    progress: number;
    downloadedMB: string;
    totalMB: string;
    version: string;
    statusText: string;
    error: string | null;
  };
}

export interface SyncState {
  enabled: boolean;
  syncClick: boolean;
  syncInput: boolean;
  syncScroll: boolean;
  targetProfileIds: string[];
  connectedProfileIds: string[];
}

export interface AppState {
  profiles: ProfileItem[];
  proxies: ProxyItem[];
  extensions: ExtensionItem[];
  statuses: StatusItem[];
  folders: FolderItem[];
  tags: string[];
  bookmarks: BookmarkItem[];
  settings: AppSettings;
  runningMap: Record<string, RunningInfo>;
  kernelInfo: KernelInfo;
  syncState?: SyncState;
}

export interface BackupOptions {
  profileIds?: string[] | null;
  includeProfileSettings: boolean;
  includeProfileData: boolean;
  includeProxies: boolean;
  includeExtensions: boolean;
  includeExtensionFiles: boolean;
  includeBookmarks: boolean;
  includeFoldersAndTags: boolean;
  includeSettings: boolean;
  targetFilePath?: string | null;
  saveAsSnapshot?: boolean;
  snapshotNote?: string;
}

export interface BackupManifest {
  version: number;
  app: string;
  createdAt: string;
  note?: string;
  options: {
    includeProfileSettings: boolean;
    includeProfileData: boolean;
    includeProxies: boolean;
    includeExtensions: boolean;
    includeExtensionFiles: boolean;
    includeBookmarks: boolean;
    includeFoldersAndTags: boolean;
    includeSettings: boolean;
  };
  counts: {
    profiles: number;
    profileData: number;
    proxies: number;
    extensions: number;
    extensionFiles: number;
    bookmarks: number;
    folders: number;
    statuses: number;
    tags: number;
    hasSettings: boolean;
  };
  profilesSummary: Array<{
    id: string;
    serialNumber: number;
    name: string;
    hasData: boolean;
  }>;
}

export interface RestoreOptions {
  selectedProfileIds?: string[] | null;
  restoreProfileSettings: boolean;
  restoreProfileData: boolean;
  restoreProxies: boolean;
  restoreExtensions: boolean;
  restoreBookmarks: boolean;
  restoreFoldersAndTags: boolean;
  restoreSettings: boolean;
  conflictStrategy: 'merge_overwrite' | 'merge_skip' | 'clean_restore';
}

export interface SnapshotItem {
  filename: string;
  filePath: string;
  size: number;
  createdAt: string;
  manifest: BackupManifest | null;
}

export interface BackupInspectResult {
  valid: boolean;
  manifest: BackupManifest;
  preview: {
    profiles: ProfileItem[];
    proxies: ProxyItem[];
    extensions: ExtensionItem[];
    bookmarks: BookmarkItem[];
    folders: FolderItem[];
    statuses: StatusItem[];
    tags: string[];
    settings: AppSettings | null;
  };
}

export interface BackupRestoreResult {
  success: boolean;
  manifest: BackupManifest;
  restored: {
    profilesCount: number;
    profileDataCount: number;
    proxiesCount: number;
    extensionsCount: number;
    bookmarksCount: number;
    foldersCount: number;
    statusesCount: number;
    tagsCount: number;
    settingsRestored: boolean;
  };
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      selectDirectory: () => Promise<string | null>;
      selectFile: (filters?: any[]) => Promise<string | null>;
      saveFile: (options?: any) => Promise<string | null>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
    };
  }
}
