import React, { useState, useEffect, useRef } from 'react';
import {
  Archive,
  Download,
  Upload,
  RotateCcw,
  Clock,
  Shield,
  Globe,
  Puzzle,
  Bookmark,
  Tags,
  Settings,
  HardDrive,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ProfileItem,
  ProxyItem,
  ExtensionItem,
  BookmarkItem,
  FolderItem,
  StatusItem,
  AppSettings,
  SnapshotItem,
  BackupInspectResult,
  BackupOptions,
  RestoreOptions,
} from '../types';
import { api } from '../api';

interface BackupRestorePageProps {
  profiles: ProfileItem[];
  proxies: ProxyItem[];
  extensions: ExtensionItem[];
  bookmarks: BookmarkItem[];
  folders: FolderItem[];
  statuses: StatusItem[];
  tags: string[];
  settings: AppSettings;
  preSelectedProfileIds?: string[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const BackupRestorePage: React.FC<BackupRestorePageProps> = ({
  profiles,
  proxies,
  extensions,
  bookmarks,
  folders,
  statuses,
  tags,
  settings,
  preSelectedProfileIds = [],
  onRefresh,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'restore' | 'snapshots'>('create');

  // --- Create Backup State ---
  const [scope, setScope] = useState<'all' | 'custom'>(
    preSelectedProfileIds.length > 0 ? 'custom' : 'all'
  );
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(
    preSelectedProfileIds.length > 0 ? preSelectedProfileIds : profiles.map((p) => p.id)
  );
  const [profileSearch, setProfileSearch] = useState('');

  // Items to include
  const [incProfileSettings, setIncProfileSettings] = useState(true);
  const [incProfileData, setIncProfileData] = useState(true);
  const [incProxies, setIncProxies] = useState(true);
  const [incExtensions, setIncExtensions] = useState(true);
  const [incExtensionFiles, setIncExtensionFiles] = useState(true);
  const [incBookmarks, setIncBookmarks] = useState(true);
  const [incFoldersAndTags, setIncFoldersAndTags] = useState(true);
  const [incSettings, setIncSettings] = useState(true);

  // Storage targets
  const [saveAsSnapshot, setSaveAsSnapshot] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccessInfo, setBackupSuccessInfo] = useState<{
    filename: string;
    filePath?: string | null;
    downloadUrl?: string;
    size: number;
    counts: any;
  } | null>(null);

  // --- Restore State ---
  const [inspecting, setInspecting] = useState(false);
  const [inspectedData, setInspectedData] = useState<BackupInspectResult | null>(null);
  const [selectedInspectFilePath, setSelectedInspectFilePath] = useState<string | null>(null);
  const [inspectedBase64, setInspectedBase64] = useState<string | null>(null);

  // Restore options
  const [resProfileSettings, setResProfileSettings] = useState(true);
  const [resProfileData, setResProfileData] = useState(true);
  const [resProxies, setResProxies] = useState(true);
  const [resExtensions, setResExtensions] = useState(true);
  const [resBookmarks, setResBookmarks] = useState(true);
  const [resFoldersAndTags, setResFoldersAndTags] = useState(true);
  const [resSettings, setResSettings] = useState(false);
  const [conflictStrategy, setConflictStrategy] = useState<'merge_overwrite' | 'merge_skip' | 'clean_restore'>('merge_overwrite');
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Snapshots State ---
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [isTakingQuickSnapshot, setIsTakingQuickSnapshot] = useState(false);

  // Load snapshots when tab is snapshots
  const fetchSnapshots = async () => {
    try {
      setLoadingSnapshots(true);
      const list = await api.listSnapshots();
      setSnapshots(list);
    } catch (err: any) {
      showToast('載入本機快照失敗：' + err.message, 'error');
    } finally {
      setLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'snapshots') {
      fetchSnapshots();
    }
  }, [activeTab]);

  // When profiles list changes or preSelectedProfileIds change
  useEffect(() => {
    if (preSelectedProfileIds.length > 0) {
      setScope('custom');
      setSelectedProfileIds(preSelectedProfileIds);
    }
  }, [preSelectedProfileIds]);

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Toggle single profile in custom scope
  const toggleProfileSelect = (id: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFilteredProfiles = (filtered: ProfileItem[]) => {
    const ids = filtered.map((p) => p.id);
    setSelectedProfileIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const deselectAllFilteredProfiles = (filtered: ProfileItem[]) => {
    const ids = new Set(filtered.map((p) => p.id));
    setSelectedProfileIds((prev) => prev.filter((id) => !ids.has(id)));
  };

  // --- Execute Backup ---
  const handleStartBackup = async () => {
    try {
      setIsBackingUp(true);
      setBackupSuccessInfo(null);

      const targetProfiles = scope === 'all' ? null : selectedProfileIds;
      if (scope === 'custom' && selectedProfileIds.length === 0 && (incProfileSettings || incProfileData)) {
        showToast('請至少選擇一個要備份的瀏覽器環境', 'error');
        setIsBackingUp(false);
        return;
      }

      // Check if user is in Electron and NOT saving as snapshot
      let targetFilePath: string | null = null;
      if (!saveAsSnapshot && window.electronAPI && typeof window.electronAPI.saveFile === 'function') {
        try {
          const defaultName = `ChameleonX_Backup_${new Date().toISOString().slice(0, 10)}.zip`;
          const chosen = await window.electronAPI.saveFile({
            title: '選擇備份 ZIP 檔案儲存位置',
            defaultPath: defaultName,
            filters: [
              { name: 'ZIP 備份壓縮檔', extensions: ['zip'] },
              { name: '所有檔案', extensions: ['*'] },
            ],
          });
          if (chosen === null) {
            // User canceled file dialog
            setIsBackingUp(false);
            return;
          }
          targetFilePath = chosen;
        } catch (dialogErr) {
          console.warn('saveFile dialog unavailable, fallback to download:', dialogErr);
          targetFilePath = null;
        }
      }

      const options: BackupOptions = {
        profileIds: targetProfiles,
        includeProfileSettings: incProfileSettings,
        includeProfileData: incProfileData,
        includeProxies: incProxies,
        includeExtensions: incExtensions,
        includeExtensionFiles: incExtensionFiles,
        includeBookmarks: incBookmarks,
        includeFoldersAndTags: incFoldersAndTags,
        includeSettings: incSettings,
        targetFilePath,
        saveAsSnapshot,
        snapshotNote: snapshotNote.trim(),
      };

      const result = await api.createBackup(options);
      setBackupSuccessInfo({
        filename: result.filename,
        filePath: result.filePath,
        downloadUrl: result.downloadUrl,
        size: result.size,
        counts: result.manifest?.counts || {},
      });

      // Auto trigger download if browser download URL is returned
      if (result.downloadUrl) {
        try {
          const link = document.createElement('a');
          link.href = result.downloadUrl;
          link.download = result.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (dlErr) {}
      }

      showToast(saveAsSnapshot ? '✅ 本機快照建立成功！' : '🎉 備份打包完成！');
      if (saveAsSnapshot) {
        fetchSnapshots();
      }
    } catch (err: any) {
      showToast('備份失敗：' + err.message, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  // --- Handle File Select for Restore ---
  const handleSelectFileForRestore = async () => {
    try {
      if (window.electronAPI?.selectFile) {
        const filePath = await window.electronAPI.selectFile([
          { name: 'ChameleonX 備份檔 (*.zip)', extensions: ['zip'] },
          { name: '所有檔案', extensions: ['*'] },
        ]);
        if (filePath) {
          await inspectFile(filePath, undefined);
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (err: any) {
      showToast('選擇檔案失敗：' + err.message, 'error');
    }
  };

  const handleWebFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await inspectFile(undefined, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const inspectFile = async (filePath?: string, base64Data?: string) => {
    try {
      setInspecting(true);
      setInspectedData(null);
      setSelectedInspectFilePath(filePath || null);
      setInspectedBase64(base64Data || null);

      const result = await api.inspectBackup({ filePath, base64Data });
      setInspectedData(result);

      // Auto-configure options based on what's in the backup
      setResProfileSettings(result.manifest.counts.profiles > 0);
      setResProfileData(result.manifest.counts.profileData > 0);
      setResProxies(result.manifest.counts.proxies > 0);
      setResExtensions(result.manifest.counts.extensions > 0);
      setResBookmarks(result.manifest.counts.bookmarks > 0);
      setResFoldersAndTags(result.manifest.counts.folders > 0 || result.manifest.counts.tags > 0);
      setResSettings(result.manifest.counts.hasSettings);

      showToast(`已成功讀取備份檔，包含 ${result.manifest.counts.profiles} 個環境與配置`);
    } catch (err: any) {
      showToast('解析備份檔失敗：' + err.message, 'error');
    } finally {
      setInspecting(false);
    }
  };

  // --- Execute Restore ---
  const handleStartRestore = async () => {
    if (!inspectedData) return;

    const confirmMsg =
      conflictStrategy === 'clean_restore'
        ? '⚠️ 您選擇了【全新覆蓋】模式，系統現有對應的資料將被清除並以備份檔覆蓋。確定要繼續嗎？'
        : '確定要將此備份檔的資料還原至系統中嗎？';

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsRestoring(true);
      const restoreOptions: RestoreOptions = {
        restoreProfileSettings: resProfileSettings,
        restoreProfileData: resProfileData,
        restoreProxies: resProxies,
        restoreExtensions: resExtensions,
        restoreBookmarks: resBookmarks,
        restoreFoldersAndTags: resFoldersAndTags,
        restoreSettings: resSettings,
        conflictStrategy,
      };

      const result = await api.restoreBackup({
        filePath: selectedInspectFilePath || undefined,
        base64Data: inspectedBase64 || undefined,
        options: restoreOptions,
      });

      showToast(
        `🎉 還原成功！已恢復 ${result.restored.profilesCount} 個環境、${result.restored.proxiesCount} 個代理、${result.restored.bookmarksCount} 個書籤`
      );
      onRefresh();
    } catch (err: any) {
      showToast('還原失敗：' + err.message, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // --- Quick Snapshot ---
  const handleTakeQuickSnapshot = async () => {
    try {
      setIsTakingQuickSnapshot(true);
      const dateStr = new Date().toLocaleString('zh-TW');
      await api.createBackup({
        includeProfileSettings: true,
        includeProfileData: true,
        includeProxies: true,
        includeExtensions: true,
        includeExtensionFiles: true,
        includeBookmarks: true,
        includeFoldersAndTags: true,
        includeSettings: true,
        saveAsSnapshot: true,
        snapshotNote: `一鍵快速快照 (${dateStr})`,
      });
      showToast('⚡ 一鍵快速快照建立完成！');
      fetchSnapshots();
      onRefresh();
    } catch (err: any) {
      showToast('建立快照失敗：' + err.message, 'error');
    } finally {
      setIsTakingQuickSnapshot(false);
    }
  };

  // Filter profiles for custom selection
  const filteredProfiles = profiles.filter((p) => {
    const s = profileSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      String(p.serialNumber).includes(s) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(s))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      {/* Top Header */}
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
            <Archive className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">備份與還原中心</h1>
            <p className="text-xs text-slate-400">完整備份瀏覽器指紋、快取登入資料、代理、擴充功能與書籤，支援一鍵還原與跨機遷移</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#0c0e12] p-1 rounded-xl border border-[#262f3c]">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>建立備份</span>
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'restore'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>還原資料</span>
          </button>
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'snapshots'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>本機快照庫</span>
            {snapshots.length > 0 && (
              <span className="px-1.5 py-0.2 bg-sky-950 text-sky-300 rounded-full text-[10px] font-mono border border-violet-700/50">
                {snapshots.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Hidden Web File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleWebFileInputChange}
        className="hidden"
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ================= TAB 1: CREATE BACKUP ================= */}
        {activeTab === 'create' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Step 1: Backup Scope */}
            <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                    1
                  </div>
                  <h2 className="text-sm font-bold text-white">選擇備份環境範圍</h2>
                </div>
                <div className="text-xs text-slate-400">目前共有 {profiles.length} 個環境</div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition flex items-start gap-3 ${
                    scope === 'all'
                      ? 'bg-sky-500/15 border-sky-500 text-white ring-1 ring-sky-500'
                      : 'bg-[#0c0e12] border-[#262f3c] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <Globe className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-white">全部環境 ({profiles.length} 個)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">完整備份系統內所有瀏覽器環境與設定</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('custom')}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition flex items-start gap-3 ${
                    scope === 'custom'
                      ? 'bg-sky-500/15 border-sky-500 text-white ring-1 ring-sky-500'
                      : 'bg-[#0c0e12] border-[#262f3c] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <Layers className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      自訂選取環境 ({selectedProfileIds.length} / {profiles.length} 個)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">自選需要備份的特定瀏覽器環境</div>
                  </div>
                </button>
              </div>

              {/* Custom selection list */}
              {scope === 'custom' && (
                <div className="bg-[#0c0e12] border border-[#262f3c] rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={profileSearch}
                        onChange={(e) => setProfileSearch(e.target.value)}
                        placeholder="搜尋環境名稱、序號、標籤..."
                        className="w-full bg-[#12161c] border border-[#262f3c] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => selectAllFilteredProfiles(filteredProfiles)}
                        className="px-2.5 py-1 text-[11px] rounded bg-[#1f2438] hover:bg-[#2b324d] text-slate-200 transition"
                      >
                        全選 ({filteredProfiles.length})
                      </button>
                      <button
                        onClick={() => deselectAllFilteredProfiles(filteredProfiles)}
                        className="px-2.5 py-1 text-[11px] rounded bg-[#1f2438] hover:bg-[#2b324d] text-slate-400 transition"
                      >
                        清除選取
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {filteredProfiles.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-500">找不到符合條件的環境</div>
                    ) : (
                      filteredProfiles.map((p) => {
                        const isSelected = selectedProfileIds.includes(p.id);
                        const status = statuses.find((s) => s.id === p.statusId);
                        return (
                          <div
                            key={p.id}
                            onClick={() => toggleProfileSelect(p.id)}
                            className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition ${
                              isSelected
                                ? 'bg-sky-950/40 border border-sky-500/40 text-white'
                                : 'bg-[#12161c] border border-transparent text-slate-300 hover:bg-[#181d24]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-sky-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <span className="font-mono text-slate-400 text-[11px]">
                                #{String(p.serialNumber).padStart(2, '0')}
                              </span>
                              <span className="font-bold truncate">{p.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {status && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{
                                    backgroundColor: `${status.color}20`,
                                    color: status.color,
                                    borderColor: `${status.color}40`,
                                  }}
                                >
                                  {status.name}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 font-mono">
                                {p.fingerprint?.chromeVersion ? `v${p.fingerprint.chromeVersion.split('.')[0]}` : 'Chrome'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Select Items to Include */}
            <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                    2
                  </div>
                  <h2 className="text-sm font-bold text-white">勾選備份內容項目</h2>
                </div>
                <div className="text-xs text-slate-400">可自由勾選需導出的模組</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. Browser Profiles */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incProfileSettings}
                    onChange={(e) => setIncProfileSettings(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>瀏覽器環境設置 (指紋與配置)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      包含 Canvas、WebGL、音訊、字型等完整防關聯參數與名稱備忘
                    </div>
                  </div>
                </label>

                {/* 2. Profile Local Data */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incProfileData}
                    onChange={(e) => setIncProfileData(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                      <span>瀏覽器本機快取與登入狀態 (Profile Data)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      保留登入 Cookie、IndexedDB 與儲存資料 (自動排除龐大無效暫存)
                    </div>
                  </div>
                </label>

                {/* 3. Proxies */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incProxies}
                    onChange={(e) => setIncProxies(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span>代理伺服器清單 ({proxies.length} 個)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">包含所有已設定之 HTTP / SOCKS5 代理及連線帳密</div>
                  </div>
                </label>

                {/* 4. Extensions */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incExtensions}
                    onChange={(e) => setIncExtensions(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Puzzle className="w-3.5 h-3.5 text-sky-400" />
                      <span>擴充功能設定 ({extensions.length} 個)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      包含擴充套件列表、自動全域啟用或環境指定掛載規則
                    </div>
                  </div>
                </label>

                {/* 5. Extension Files */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incExtensionFiles}
                    onChange={(e) => setIncExtensionFiles(e.target.checked)}
                    disabled={!incExtensions}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500 disabled:opacity-40"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileArchive className="w-3.5 h-3.5 text-purple-400" />
                      <span>打包擴充功能實體檔案</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      打包本地外掛程式資料夾，還原到新電腦無須重新由線上商店下載
                    </div>
                  </div>
                </label>

                {/* 6. Bookmarks */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incBookmarks}
                    onChange={(e) => setIncBookmarks(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-rose-400" />
                      <span>全域書籤設定 ({bookmarks.length} 個)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">預載於所有瀏覽器視窗書籤列的常用網址</div>
                  </div>
                </label>

                {/* 7. Folders, Statuses & Tags */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incFoldersAndTags}
                    onChange={(e) => setIncFoldersAndTags(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Tags className="w-3.5 h-3.5 text-pink-400" />
                      <span>分組資料夾、狀態與標籤</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {folders.length} 個資料夾、{statuses.length} 種狀態標記、{tags.length} 個標籤
                    </div>
                  </div>
                </label>

                {/* 8. Kernel & System Settings */}
                <label className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="checkbox"
                    checked={incSettings}
                    onChange={(e) => setIncSettings(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-cyan-400" />
                      <span>系統核心與偏好設定</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      核心模式 ({settings.kernelMode})、啟動預設頁、視窗排列設定
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Step 3: Destination and Actions */}
            <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                    3
                  </div>
                  <h2 className="text-sm font-bold text-white">儲存方式與備註</h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="radio"
                    name="destType"
                    checked={!saveAsSnapshot}
                    onChange={() => setSaveAsSnapshot(false)}
                    className="mt-0.5 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-sky-400" />
                      <span>匯出 ZIP 壓縮檔至電腦</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      可指定儲存至桌面或隨身碟，適合遷移備份或離線存檔
                    </div>
                  </div>
                </label>

                <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                  <input
                    type="radio"
                    name="destType"
                    checked={saveAsSnapshot}
                    onChange={() => setSaveAsSnapshot(true)}
                    className="mt-0.5 text-sky-500 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>儲存為系統本機快照</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      保存在本機快照庫中，誤操作或更新時可一秒立即回滾
                    </div>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">備份備忘說明 (選填)</label>
                <input
                  type="text"
                  value={snapshotNote}
                  onChange={(e) => setSnapshotNote(e.target.value)}
                  placeholder="例如：2026/10 批次養號前完整備份、搬家至新工作機"
                  className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                />
              </div>

              {/* Action Button */}
              <div className="pt-2 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  即將打包：
                  <span className="text-white font-bold ml-1">
                    {scope === 'all' ? profiles.length : selectedProfileIds.length}
                  </span>{' '}
                  個環境、
                  <span className="text-white font-bold ml-1">{incProxies ? proxies.length : 0}</span> 個代理、
                  <span className="text-white font-bold ml-1">{incExtensions ? extensions.length : 0}</span> 個擴充
                </div>

                <button
                  onClick={handleStartBackup}
                  disabled={isBackingUp}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/30 cursor-pointer transition"
                >
                  {isBackingUp ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>正在壓縮打包備份檔...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>開始打包備份</span>
                    </>
                  )}
                </button>
              </div>

              {/* Backup Result Banner */}
              {backupSuccessInfo && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>備份已成功建立！</span>
                  </div>
                  <div className="text-[11px] text-emerald-300/80 space-y-0.5">
                    <div>
                      檔案名稱：<span className="font-mono text-white">{backupSuccessInfo.filename}</span> (
                      {formatBytes(backupSuccessInfo.size)})
                    </div>
                    {backupSuccessInfo.filePath && (
                      <div>
                        儲存路徑：<span className="font-mono text-white">{backupSuccessInfo.filePath}</span>
                      </div>
                    )}
                  </div>
                  {backupSuccessInfo.downloadUrl && (
                    <div className="pt-2">
                      <a
                        href={backupSuccessInfo.downloadUrl}
                        download={backupSuccessInfo.filename}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>點擊立即下載 ZIP 檔案</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: RESTORE DATA ================= */}
        {activeTab === 'restore' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* File Selector Card */}
            <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-sky-400" />
                  <h2 className="text-sm font-bold text-white">選擇 ChameleonX 備份檔 (.zip)</h2>
                </div>
              </div>

              <div
                onClick={handleSelectFileForRestore}
                className="border-2 border-dashed border-[#2b3149] hover:border-sky-500/80 rounded-2xl p-8 text-center cursor-pointer transition bg-[#0c0e12]/60 hover:bg-sky-950/10 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
                  {inspecting ? (
                    <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FileArchive className="w-6 h-6" />
                  )}
                </div>
                <div className="text-xs font-bold text-white">點擊選擇本機備份壓縮檔</div>
                <div className="text-[11px] text-slate-400 mt-1">支援由 ChameleonX 匯出的 .zip 格式備份檔</div>
                {selectedInspectFilePath && (
                  <div className="mt-3 inline-block px-3 py-1 rounded bg-[#1c2136] text-sky-300 text-[11px] font-mono border border-sky-500/30">
                    已選擇：{selectedInspectFilePath}
                  </div>
                )}
              </div>
            </div>

            {/* Inspected Data Preview */}
            {inspectedData && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Backup Summary Header */}
                <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white">備份檔案內容已成功解析</h3>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        建立時間：{new Date(inspectedData.manifest.createdAt).toLocaleString('zh-TW')}
                        {inspectedData.manifest.note && (
                          <span className="ml-3 text-slate-300">備忘：{inspectedData.manifest.note}</span>
                        )}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-sky-950/60 text-sky-300 text-xs font-mono border border-violet-700/50">
                      {inspectedData.manifest.app} 備份檔
                    </span>
                  </div>

                  {/* Summary Badges */}
                  <div className="grid grid-cols-4 gap-2.5 mt-4">
                    <div className="bg-[#0c0e12] p-3 rounded-xl border border-[#262f3c]">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span>環境數量</span>
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {inspectedData.manifest.counts.profiles} 個
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {inspectedData.manifest.counts.profileData > 0 ? '含本機登入資料' : '僅指紋設置'}
                      </div>
                    </div>

                    <div className="bg-[#0c0e12] p-3 rounded-xl border border-[#262f3c]">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        <span>代理伺服器</span>
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {inspectedData.manifest.counts.proxies} 個
                      </div>
                      <div className="text-[10px] text-slate-500">含連線帳號密碼</div>
                    </div>

                    <div className="bg-[#0c0e12] p-3 rounded-xl border border-[#262f3c]">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Puzzle className="w-3.5 h-3.5 text-sky-400" />
                        <span>擴充功能</span>
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {inspectedData.manifest.counts.extensions} 個
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {inspectedData.manifest.counts.extensionFiles > 0 ? '含本地安裝包檔案' : '規則配置'}
                      </div>
                    </div>

                    <div className="bg-[#0c0e12] p-3 rounded-xl border border-[#262f3c]">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-rose-400" />
                        <span>書籤與標籤</span>
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {inspectedData.manifest.counts.bookmarks} 個書籤
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {inspectedData.manifest.counts.folders} 分組 / {inspectedData.manifest.counts.tags} 標籤
                      </div>
                    </div>
                  </div>
                </div>

                {/* Restoration Components Selection */}
                <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg space-y-4">
                  <h3 className="text-sm font-bold text-white">選擇本次要還原的項目</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                      <input
                        type="checkbox"
                        checked={resProfileSettings}
                        onChange={(e) => setResProfileSettings(e.target.checked)}
                        disabled={inspectedData.manifest.counts.profiles === 0}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">
                          還原瀏覽器環境指紋與配置 ({inspectedData.manifest.counts.profiles} 個)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">恢復環境名稱、指紋參數與代理關聯</div>
                      </div>
                    </label>

                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                      <input
                        type="checkbox"
                        checked={resProfileData}
                        onChange={(e) => setResProfileData(e.target.checked)}
                        disabled={inspectedData.manifest.counts.profileData === 0}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">
                          還原瀏覽器本機資料 (登入態/Cookies/快取)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {inspectedData.manifest.counts.profileData > 0
                            ? '解壓縮環境資料夾覆蓋本機 Profile 資料'
                            : '此備份檔未包含本機資料'}
                        </div>
                      </div>
                    </label>

                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                      <input
                        type="checkbox"
                        checked={resProxies}
                        onChange={(e) => setResProxies(e.target.checked)}
                        disabled={inspectedData.manifest.counts.proxies === 0}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">
                          還原代理伺服器 ({inspectedData.manifest.counts.proxies} 個)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">匯入代理伺服器連線主機與認證資料</div>
                      </div>
                    </label>

                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                      <input
                        type="checkbox"
                        checked={resExtensions}
                        onChange={(e) => setResExtensions(e.target.checked)}
                        disabled={inspectedData.manifest.counts.extensions === 0}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">
                          還原擴充功能與實體檔案 ({inspectedData.manifest.counts.extensions} 個)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">外掛程式解壓縮並自動註冊</div>
                      </div>
                    </label>

                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                      <input
                        type="checkbox"
                        checked={resBookmarks}
                        onChange={(e) => setResBookmarks(e.target.checked)}
                        disabled={inspectedData.manifest.counts.bookmarks === 0}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">
                          還原全域書籤 ({inspectedData.manifest.counts.bookmarks} 個)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">匯入書籤列與導航清單</div>
                      </div>
                    </label>

                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition">
                      <input
                        type="checkbox"
                        checked={resFoldersAndTags}
                        onChange={(e) => setResFoldersAndTags(e.target.checked)}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">還原分組資料夾與標籤狀態</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">分類資料夾與狀態自訂顏色</div>
                      </div>
                    </label>

                    <label className="p-3 rounded-xl bg-[#0c0e12] border border-[#262f3c] flex items-start gap-3 cursor-pointer hover:border-slate-600 transition col-span-2">
                      <input
                        type="checkbox"
                        checked={resSettings}
                        onChange={(e) => setResSettings(e.target.checked)}
                        disabled={!inspectedData.manifest.counts.hasSettings}
                        className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">還原系統核心與偏好設定</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          覆蓋核心模式、開機預設首頁等偏好（非必要建議不勾選）
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Conflict Strategy */}
                  <div className="pt-2 border-t border-[#262f3c]">
                    <div className="text-xs font-bold text-white mb-2">當遇到相同 ID 或名稱之衝突時處理原則：</div>
                    <div className="grid grid-cols-3 gap-3">
                      <label
                        className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                          conflictStrategy === 'merge_overwrite'
                            ? 'bg-sky-950/40 border-sky-500 text-white ring-1 ring-sky-500'
                            : 'bg-[#0c0e12] border-[#262f3c] text-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="conflict"
                          checked={conflictStrategy === 'merge_overwrite'}
                          onChange={() => setConflictStrategy('merge_overwrite')}
                          className="hidden"
                        />
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>合併並覆蓋 (推薦)</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          保留未衝突之項目，相同 ID 項目以備份檔內容為準更新
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                          conflictStrategy === 'merge_skip'
                            ? 'bg-sky-950/40 border-sky-500 text-white ring-1 ring-sky-500'
                            : 'bg-[#0c0e12] border-[#262f3c] text-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="conflict"
                          checked={conflictStrategy === 'merge_skip'}
                          onChange={() => setConflictStrategy('merge_skip')}
                          className="hidden"
                        />
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                          <span>略過衝突項目</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          僅匯入電腦目前不存在的新項目，現有相同項目保持原樣
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                          conflictStrategy === 'clean_restore'
                            ? 'bg-rose-950/40 border-rose-500 text-white ring-1 ring-rose-500'
                            : 'bg-[#0c0e12] border-[#262f3c] text-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="conflict"
                          checked={conflictStrategy === 'clean_restore'}
                          onChange={() => setConflictStrategy('clean_restore')}
                          className="hidden"
                        />
                        <div className="text-xs font-bold flex items-center gap-1.5 text-rose-300">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>全新覆蓋</span>
                        </div>
                        <div className="text-[10px] text-rose-300/70 mt-1">
                          清空勾選項目的現有本機資料，完全以備份內容替換
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Submit Restore */}
                  <div className="pt-3 flex items-center justify-between border-t border-[#262f3c]">
                    <div className="text-xs text-slate-400">
                      即將還原至目前 ChameleonX 系統資料庫中
                    </div>
                    <button
                      onClick={handleStartRestore}
                      disabled={isRestoring}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/30 cursor-pointer transition"
                    >
                      {isRestoring ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>正在解壓縮並寫入資料庫...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>確認執行還原</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: LOCAL SNAPSHOTS ================= */}
        {activeTab === 'snapshots' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-5 shadow-lg flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>本機快照庫 (Local Snapshots)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  保存在軟體本機 data/backups 目錄，可隨時一秒回滾特定版本，防止重要帳號被誤刪或配置錯誤
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={fetchSnapshots}
                  disabled={loadingSnapshots}
                  className="p-2 rounded-xl bg-[#0c0e12] border border-[#262f3c] hover:bg-[#1f2438] text-slate-300 transition cursor-pointer"
                  title="重新整理快照清單"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSnapshots ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleTakeQuickSnapshot}
                  disabled={isTakingQuickSnapshot}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-500/30 transition cursor-pointer"
                >
                  {isTakingQuickSnapshot ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>正在建立快照...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>立即建立目前快照</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Snapshots List */}
            {loadingSnapshots ? (
              <div className="text-center py-12 text-xs text-slate-400 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                <span>正在讀取快照庫...</span>
              </div>
            ) : snapshots.length === 0 ? (
              <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-12 text-center text-slate-400">
                <Archive className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <div className="text-sm font-bold text-white">尚無本機快照</div>
                <div className="text-xs text-slate-500 mt-1">
                  您可以點擊右上角「立即建立目前快照」或在建立備份時勾選儲存為本機快照
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snap) => {
                  const m = snap.manifest;
                  const c = m?.counts;
                  return (
                    <div
                      key={snap.filename}
                      className="bg-[#12161c] border border-[#262f3c] rounded-2xl p-4.5 flex items-center justify-between hover:border-sky-500/40 transition group"
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-bold text-white truncate">
                            {m?.note || snap.filename}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950/60 text-sky-300 border border-violet-700/40">
                            {formatBytes(snap.size)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5 font-mono">
                          <span>{new Date(snap.createdAt).toLocaleString('zh-TW')}</span>
                          {c && (
                            <span className="text-slate-500">
                              • {c.profiles} 環境 • {c.proxies} 代理 • {c.extensions} 擴充 • {c.bookmarks} 書籤
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Quick Restore */}
                        <button
                          onClick={async () => {
                            await inspectFile(snap.filePath, undefined);
                            setActiveTab('restore');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-white border border-sky-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>載入還原</span>
                        </button>

                        {/* Export / Download */}
                        <a
                          href={`/api/backup/download/${encodeURIComponent(snap.filename)}`}
                          download={snap.filename}
                          className="p-1.5 rounded-lg bg-[#0c0e12] hover:bg-[#1f2438] text-slate-400 hover:text-white border border-[#262f3c] transition"
                          title="下載或匯出 ZIP"
                        >
                          <Download className="w-4 h-4" />
                        </a>

                        {/* Delete */}
                        <button
                          onClick={async () => {
                            if (!window.confirm(`確定要刪除快照【${snap.filename}】嗎？`)) return;
                            try {
                              await api.deleteSnapshot(snap.filename);
                              showToast('已刪除快照');
                              fetchSnapshots();
                            } catch (err: any) {
                              showToast('刪除失敗：' + err.message, 'error');
                            }
                          }}
                          className="p-1.5 rounded-lg bg-[#0c0e12] hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-[#262f3c] hover:border-rose-500/40 transition cursor-pointer"
                          title="刪除快照"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
