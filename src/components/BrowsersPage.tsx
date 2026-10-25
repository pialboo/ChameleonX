import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Search,
  Plus,
  Layers,
  Shield,
  Puzzle,
  Cookie,
  Dices,
  Copy,
  FolderOpen,
  Trash2,
  Edit3,
  Check,
  X,
  LayoutGrid,
  Eraser,
  Folder,
  RefreshCw,
  Radio,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  FileText,
  AlertTriangle,
  AlertCircle,
  Info,
  Archive,
  Globe,
  ChevronDown,
  Bookmark,
  Loader2,
} from 'lucide-react';
import {
  ProfileItem,
  ProxyItem,
  ExtensionItem,
  StatusItem,
  FolderItem,
  BookmarkItem,
  RunningInfo,
  AppSettings,
  SyncState,
  KernelInfo,
} from '../types';
import { api } from '../api';

interface BrowsersPageProps {
  profiles: ProfileItem[];
  proxies: ProxyItem[];
  extensions: ExtensionItem[];
  statuses: StatusItem[];
  folders: FolderItem[];
  tags: string[];
  bookmarks?: BookmarkItem[];
  runningMap: Record<string, RunningInfo>;
  settings: AppSettings;
  syncState?: SyncState;
  kernelInfo?: KernelInfo | null;
  onGoToSettings?: () => void;
  onGoToBackup?: (profileIds?: string[]) => void;
  onOpenCreate: (mode: 'single' | 'mass') => void;
  onOpenEdit: (profile: ProfileItem) => void;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const BrowsersPage: React.FC<BrowsersPageProps> = ({
  profiles,
  proxies,
  extensions,
  statuses,
  folders,
  tags,
  bookmarks = [],
  runningMap,
  settings,
  syncState,
  kernelInfo,
  onGoToSettings,
  onGoToBackup,
  onOpenCreate,
  onOpenEdit,
  onRefresh,
  showToast,
}) => {
  const [activeFolderId, setActiveFolderId] = useState('fld-all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatusId, setFilterStatusId] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterRunningOnly, setFilterRunningOnly] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [autoTileBatch, setAutoTileBatch] = useState(settings.autoTileWindows ?? true);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const [cookieModalProfile, setCookieModalProfile] = useState<ProfileItem | null>(null);
  const [cookieModalText, setCookieModalText] = useState('');

  const [bulkModalType, setBulkModalType] = useState<
    'proxy' | 'extensions' | 'tags' | 'status' | 'folder' | null
  >(null);
  const [bulkProxyMode, setBulkProxyMode] = useState<'sequential' | 'random' | 'single' | 'none'>('sequential');
  const [bulkSingleProxyId, setBulkSingleProxyId] = useState('');
  const [bulkExtMode, setBulkExtMode] = useState<'add' | 'set' | 'remove'>('add');
  const [bulkSelectedExtIds, setBulkSelectedExtIds] = useState<string[]>([]);
  const [bulkSelectedTags, setBulkSelectedTags] = useState<string[]>([]);
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'set' | 'clear'>('add');
  const [bulkStatusId, setBulkStatusId] = useState('');
  const [bulkFolderId, setBulkFolderId] = useState('fld-all');

  const [syncUrlInput, setSyncUrlInput] = useState('');
  const [isUrlDropdownOpen, setIsUrlDropdownOpen] = useState(false);
  const [highlightedBmIndex, setHighlightedBmIndex] = useState(-1);
  const urlComboboxRef = useRef<HTMLDivElement>(null);

  // Click outside to close the URL combobox dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (urlComboboxRef.current && !urlComboboxRef.current.contains(e.target as Node)) {
        setIsUrlDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBookmarks = useMemo(() => {
    const q = syncUrlInput.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(
      (bm) => bm.title.toLowerCase().includes(q) || bm.url.toLowerCase().includes(q)
    );
  }, [bookmarks, syncUrlInput]);

  const handleSelectBookmark = (url: string, autoNavigate = false) => {
    setSyncUrlInput(url);
    setIsUrlDropdownOpen(false);
    setHighlightedBmIndex(-1);
    if (autoNavigate) {
      api
        .sendSyncCommand({ action: 'navigate', url })
        .then((res) => {
          showToast(`已同步導覽 ${res.sentCount} 個視窗至 ${url}`);
        })
        .catch((err) => showToast(err.message, 'error'));
    }
  };

  const handleRefreshIp = async (profileId: string) => {
    try {
      showToast('正在偵測外網 IP...');
      const res = await api.refreshRunningIp(profileId);
      if (res.publicIp) {
        const thisProfile = profiles.find((p) => p.id === profileId);
        const thisName = thisProfile?.name || '此環境';
        const conflict = profiles.find(
          (p) => p.id !== profileId && runningMap[p.id]?.running && runningMap[p.id]?.publicIp === res.publicIp
        );
        if (conflict) {
          showToast(`⚠️ 嚴重警告！「${thisName}」的外網 IP (${res.publicIp}) 與運行中的「${conflict.name}」相同！`, 'error');
        } else {
          showToast(`外網 IP：${res.publicIp} (${res.country || ''} ${res.city || ''})`);
        }
      } else {
        showToast('無法取得外網 IP，請確認網路或代理設定', 'error');
      }
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const [diffTextModalOpen, setDiffTextModalOpen] = useState(false);
  const [diffTextContent, setDiffTextContent] = useState('');
  const [sortRunningFirst, setSortRunningFirst] = useState(false);

  const isSyncEnabled = Boolean(syncState?.enabled);
  const runningCount = Object.keys(runningMap).length;
  const syncedWindowCount = Math.max(runningCount, syncState?.connectedProfiles?.length || 0);

  const handleToggleSync = async () => {
    try {
      const next = !isSyncEnabled;
      await api.updateSyncState({ enabled: next });
      if (next) {
        showToast('已開啟多視窗同步操作（操作將同步至所有開啟的瀏覽器）');
      } else {
        showToast('已停止同步操作');
      }
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleSyncOption = async (key: 'syncClick' | 'syncInput' | 'syncScroll') => {
    if (!syncState) return;
    try {
      await api.updateSyncState({ [key]: !syncState[key] });
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSyncCommand = async (action: 'navigate' | 'reload' | 'back' | 'forward') => {
    try {
      if (action === 'navigate') {
        if (!syncUrlInput.trim()) {
          showToast('請先輸入要同步前往的網址', 'error');
          return;
        }
        const res = await api.sendSyncCommand({ action: 'navigate', url: syncUrlInput.trim() });
        showToast(`已同步導覽 ${res.sentCount} 個視窗`);
      } else {
        await api.sendSyncCommand({ action });
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleBringToTop = async () => {
    try {
      const res = await api.bringToTop();
      if (res.broughtToTop > 0) {
        showToast(`已將 ${res.broughtToTop} 個運行中視窗全部拉至最上層顯示`);
      } else {
        showToast('目前沒有運行中的視窗', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleTileRunningWindows = async (mode: 'grid' | 'top-row' = 'grid') => {
    try {
      const res = await api.tileRunningWindows({
        mode,
        cols: settings.tileColumns || 2,
        screenWidth: window.screen.availWidth || 1920,
        screenHeight: window.screen.availHeight || 1040,
      });
      // Explicitly invoke Windows OS-level Bring to Top to guarantee foreground
      await api.bringToTop();
      if (res.tiled > 0) {
        showToast(`已自動並排並將 ${res.tiled} 個視窗強制移至最上層`);
      } else {
        showToast('目前沒有運行中的視窗可排列', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDistributeDiffText = async () => {
    const lines = diffTextContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast('請輸入至少一行文字', 'error');
      return;
    }
    try {
      const res = await api.distributeDiffText(lines);
      showToast(`已依序填入 ${res.sentCount} 個視窗`);
      setDiffTextModalOpen(false);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // ================= 外網 IP 重複檢測與警示邏輯 =================
  const [filterDuplicateIpOnly, setFilterDuplicateIpOnly] = useState(false);
  const warnedDuplicatePairsRef = useRef<Set<string>>(new Set());

  // 1. 運行中環境的 IP 分組 (Map<ip, ProfileItem[]>)
  const runningIpGroups = useMemo(() => {
    const groups = new Map<string, ProfileItem[]>();
    for (const p of profiles) {
      const run = runningMap[p.id];
      if (run?.running && run.publicIp && run.publicIp.trim()) {
        const ip = run.publicIp.trim();
        const list = groups.get(ip) || [];
        list.push(p);
        groups.set(ip, list);
      }
    }
    return groups;
  }, [profiles, runningMap]);

  // 運行中 IP 重複的清單 (同一個 IP >= 2 個運行中環境)
  const duplicateRunningIpMap = useMemo(() => {
    const map = new Map<string, ProfileItem[]>();
    for (const [ip, list] of runningIpGroups.entries()) {
      if (list.length > 1) {
        map.set(ip, list);
      }
    }
    return map;
  }, [runningIpGroups]);

  // 屬於運行中重複環境的 ID 集合
  const duplicateRunningProfileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of duplicateRunningIpMap.values()) {
      for (const p of list) {
        ids.add(p.id);
      }
    }
    return ids;
  }, [duplicateRunningIpMap]);

  // 2. 所有環境（包含最後記錄的 lastPublicIp）的分組
  const allIpGroups = useMemo(() => {
    const groups = new Map<string, ProfileItem[]>();
    for (const p of profiles) {
      const run = runningMap[p.id];
      const effectiveIp = (run?.running && run.publicIp ? run.publicIp : p.lastPublicIp)?.trim();
      if (effectiveIp) {
        const list = groups.get(effectiveIp) || [];
        list.push(p);
        groups.set(effectiveIp, list);
      }
    }
    return groups;
  }, [profiles, runningMap]);

  const duplicateAllIpMap = useMemo(() => {
    const map = new Map<string, ProfileItem[]>();
    for (const [ip, list] of allIpGroups.entries()) {
      if (list.length > 1) {
        map.set(ip, list);
      }
    }
    return map;
  }, [allIpGroups]);

  const duplicateAllProfileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of duplicateAllIpMap.values()) {
      for (const p of list) {
        ids.add(p.id);
      }
    }
    return ids;
  }, [duplicateAllIpMap]);

  // 自動警告通知：當偵測到有運行中環境外網 IP 衝突時，立即彈出 Toast 與系統通知
  useEffect(() => {
    if (duplicateRunningIpMap.size === 0) {
      warnedDuplicatePairsRef.current.clear();
      return;
    }

    duplicateRunningIpMap.forEach((conflictProfiles, ip) => {
      for (let i = 0; i < conflictProfiles.length; i++) {
        for (let j = i + 1; j < conflictProfiles.length; j++) {
          const pA = conflictProfiles[i];
          const pB = conflictProfiles[j];
          const pairKey = `${[pA.id, pB.id].sort().join('::')}::${ip}`;
          if (!warnedDuplicatePairsRef.current.has(pairKey)) {
            warnedDuplicatePairsRef.current.add(pairKey);
            showToast(
              `⚠️ 警告！環境「${pA.name}」與「${pB.name}」外網 IP 相同 (${ip})！請注意防關聯風險！`,
              'error'
            );

            // 支援系統桌面通知
            try {
              if (typeof window !== 'undefined' && 'Notification' in window) {
                if (Notification.permission === 'granted') {
                  new Notification('ChameleonX 外網 IP 重複警告', {
                    body: `環境「${pA.name}」與「${pB.name}」外網 IP 皆為 ${ip}，請立即檢查代理！`,
                  });
                } else if (Notification.permission !== 'denied') {
                  Notification.requestPermission();
                }
              }
            } catch (e) {}
          }
        }
      }
    });
  }, [duplicateRunningIpMap, showToast]);

  const filteredProfiles = useMemo(() => {
    const list = profiles.filter((p) => {
      if (activeFolderId !== 'fld-all' && p.folderId !== activeFolderId) return false;
      if (filterStatusId && p.statusId !== filterStatusId) return false;
      if (filterTag && !(p.tags || []).includes(filterTag)) return false;
      if (filterRunningOnly && !runningMap[p.id]?.running) return false;
      if (filterDuplicateIpOnly && !duplicateRunningProfileIds.has(p.id) && !duplicateAllProfileIds.has(p.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchNote = (p.notes || '').toLowerCase().includes(q);
        const matchSeed = (p.fingerprint?.seed || '').includes(q);
        const matchTag = (p.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchNote && !matchSeed && !matchTag) return false;
      }
      return true;
    });
    if (sortRunningFirst) {
      return [...list].sort((a, b) => {
        const aRun = runningMap[a.id]?.running ? 1 : 0;
        const bRun = runningMap[b.id]?.running ? 1 : 0;
        if (bRun !== aRun) return bRun - aRun;
        const aSel = selectedIds.includes(a.id) ? 1 : 0;
        const bSel = selectedIds.includes(b.id) ? 1 : 0;
        return bSel - aSel;
      });
    }
    return list;
  }, [
    profiles,
    activeFolderId,
    filterStatusId,
    filterTag,
    filterRunningOnly,
    filterDuplicateIpOnly,
    duplicateRunningProfileIds,
    duplicateAllProfileIds,
    searchQuery,
    runningMap,
    sortRunningFirst,
    selectedIds,
  ]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (
      filteredProfiles.length > 0 &&
      filteredProfiles.every((p) => selectedIds.includes(p.id))
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProfiles.map((p) => p.id));
    }
  };

  const handleLaunchOrStop = async (profile: ProfileItem) => {
    const isRunning = Boolean(runningMap[profile.id]?.running);
    setLoadingMap((prev) => ({ ...prev, [profile.id]: true }));
    try {
      if (isRunning) {
        await api.stopProfile(profile.id);
        showToast(`已關閉：${profile.name}`);
      } else {
        await api.launchProfile(profile.id);
        showToast(`已啟動：${profile.name}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingMap((prev) => ({ ...prev, [profile.id]: false }));
    }
  };

  const handleInlineStatusChange = async (profileId: string, newStatusId: string) => {
    await api.updateProfile(profileId, { statusId: newStatusId });
    onRefresh();
  };

  const handleSaveInlineNote = async (profileId: string) => {
    await api.updateProfile(profileId, { notes: editingNoteText });
    setEditingNoteId(null);
    onRefresh();
  };

  const handleOpenCookieModal = async (profile: ProfileItem) => {
    setCookieModalProfile(profile);
    try {
      const res = await api.exportCookies(profile.id);
      setCookieModalText(
        res.cookies && res.cookies.length > 0 ? JSON.stringify(res.cookies, null, 2) : ''
      );
    } catch (e) {
      setCookieModalText(
        profile.cookies && profile.cookies.length > 0 ? JSON.stringify(profile.cookies, null, 2) : ''
      );
    }
  };

  const handleSaveCookies = async () => {
    if (!cookieModalProfile) return;
    try {
      const res = await api.importCookies(cookieModalProfile.id, cookieModalText);
      showToast(`已更新「${cookieModalProfile.name}」Cookie (${res.count} 筆)`);
      setCookieModalProfile(null);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleBulkLaunch = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await api.bulkAction('launch', selectedIds, {
        autoTile: autoTileBatch,
        cols: settings.tileColumns || 2,
        delayMs: settings.batchLaunchDelayMs ?? 800,
        screenWidth: window.screen.availWidth || 1920,
        screenHeight: window.screen.availHeight || 1040,
      });
      showToast(`已批量啟動 ${selectedIds.length} 個環境`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStop = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await api.bulkAction('stop', selectedIds);
      showToast('已批量關閉所選環境');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkNewFingerprint = async () => {
    if (selectedIds.length === 0) return;
    await api.bulkAction('new-fingerprint', selectedIds);
    showToast(`已為 ${selectedIds.length} 個環境更換新指紋`);
    onRefresh();
  };

  const handleBulkExportCookies = async () => {
    if (selectedIds.length === 0) return;
    const res = await api.bulkAction('export-cookies', selectedIds);
    const jsonStr = JSON.stringify(res.cookiesByProfile, null, 2);
    navigator.clipboard.writeText(jsonStr);
    showToast(`已匯出 ${selectedIds.length} 個環境的 Cookie 至剪貼簿`);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    await api.bulkAction('delete', selectedIds);
    showToast(`已刪除 ${selectedIds.length} 個環境`);
    setSelectedIds([]);
    onRefresh();
  };

  const handleExecuteBulkModal = async () => {
    if (!bulkModalType || selectedIds.length === 0) return;
    try {
      if (bulkModalType === 'proxy') {
        await api.bulkAction('proxy', selectedIds, {
          mode: bulkProxyMode,
          proxyId: bulkSingleProxyId,
        });
        showToast('已批量更新代理設定');
      } else if (bulkModalType === 'extensions') {
        await api.bulkAction('extensions', selectedIds, {
          mode: bulkExtMode,
          extensionIds: bulkSelectedExtIds,
        });
        showToast('已批量套用擴充功能');
      } else if (bulkModalType === 'tags') {
        await api.bulkAction('tags', selectedIds, {
          mode: bulkTagMode,
          tags: bulkSelectedTags,
        });
        showToast('已批量更新標籤');
      } else if (bulkModalType === 'status') {
        await api.bulkAction('status', selectedIds, { statusId: bulkStatusId });
        showToast('已批量更新狀態');
      } else if (bulkModalType === 'folder') {
        await api.bulkAction('folder', selectedIds, { folderId: bulkFolderId });
        showToast('已移動至指定資料夾');
      }
      setBulkModalType(null);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12] relative">
      {/* Top Action Bars (整併為極致緊湊的 2 行工具列) */}
      <div className="shrink-0 bg-[#12161c] border-b border-[#262f3c] flex flex-col z-20">
        {/* 第 1 行：同步操作 & 視窗控制 & 建立環境 */}
        <div className="px-6 py-2 flex items-center justify-between gap-3 border-b border-[#1f2631]">
          {/* 左側：同步操作主開關與導覽 (展開式) */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleToggleSync}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-sm ${
                isSyncEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950 ring-2 ring-emerald-400/30'
                  : 'bg-[#181d24] hover:bg-[#262f3c] text-slate-300 border border-[#262f3c]'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isSyncEnabled ? 'text-white animate-pulse' : 'text-slate-400'}`} />
              <span>{isSyncEnabled ? `同步中 (${syncedWindowCount} 視窗)` : '啟動同步操作'}</span>
            </button>

            {/* 啟動同步時在旁邊平滑展開導覽控制列 */}
            {isSyncEnabled && (
              <div className="flex items-center gap-1.5 animate-in fade-in">
                <button
                  onClick={() => handleSyncCommand('back')}
                  title="所有視窗上一頁"
                  className="p-1.5 rounded-lg bg-[#181d24] hover:bg-[#202731] text-slate-300 cursor-pointer transition border border-[#262f3c]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleSyncCommand('forward')}
                  title="所有視窗下一頁"
                  className="p-1.5 rounded-lg bg-[#181d24] hover:bg-[#202731] text-slate-300 cursor-pointer transition border border-[#262f3c]"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleSyncCommand('reload')}
                  title="所有視窗重新整理"
                  className="p-1.5 rounded-lg bg-[#181d24] hover:bg-[#202731] text-slate-300 cursor-pointer transition border border-[#262f3c]"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {/* 搜尋、選擇、輸入合一的網址 Combobox */}
                <div ref={urlComboboxRef} className="relative flex items-center">
                  <div className="relative flex items-center">
                    <Bookmark className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={syncUrlInput}
                      onFocus={() => setIsUrlDropdownOpen(true)}
                      onChange={(e) => {
                        setSyncUrlInput(e.target.value);
                        setIsUrlDropdownOpen(true);
                        setHighlightedBmIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setIsUrlDropdownOpen(true);
                          setHighlightedBmIndex((prev) =>
                            prev < filteredBookmarks.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setIsUrlDropdownOpen(true);
                          setHighlightedBmIndex((prev) =>
                            prev > 0 ? prev - 1 : filteredBookmarks.length - 1
                          );
                        } else if (e.key === 'Enter') {
                          if (
                            isUrlDropdownOpen &&
                            highlightedBmIndex >= 0 &&
                            filteredBookmarks[highlightedBmIndex]
                          ) {
                            handleSelectBookmark(
                              filteredBookmarks[highlightedBmIndex].url,
                              true
                            );
                          } else {
                            setIsUrlDropdownOpen(false);
                            handleSyncCommand('navigate');
                          }
                        } else if (e.key === 'Escape') {
                          setIsUrlDropdownOpen(false);
                        }
                      }}
                      placeholder="搜尋書籤或輸入網址..."
                      className="w-56 bg-[#0c0e12] border border-[#202731] rounded-l-lg pl-8 pr-12 py-1 text-xs text-white outline-none focus:border-emerald-500 transition"
                    />
                    <div className="absolute right-1.5 flex items-center gap-0.5">
                      {syncUrlInput && (
                        <button
                          type="button"
                          onClick={() => {
                            setSyncUrlInput('');
                            setHighlightedBmIndex(-1);
                          }}
                          className="p-0.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                          title="清除輸入"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsUrlDropdownOpen((prev) => !prev)}
                        className="p-0.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                        title="展開預設書籤選單"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            isUrlDropdownOpen ? 'rotate-180 text-emerald-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsUrlDropdownOpen(false);
                      handleSyncCommand('navigate');
                    }}
                    className="px-2.5 py-1 rounded-r-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition border border-l-0 border-emerald-500/50 shrink-0"
                  >
                    前往
                  </button>

                  {/* 下拉選擇面板 */}
                  {isUrlDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-80 bg-[#12161c] border border-[#2b3543] rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-[#1e2530] animate-in fade-in duration-150">
                      <div className="px-3 py-1.5 bg-[#161b22] flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Bookmark className="w-3 h-3 text-emerald-400" />
                          <span>快速選擇書籤 ({filteredBookmarks.length})</span>
                        </span>
                        <span className="text-[10px] text-slate-500">Enter 前往</span>
                      </div>

                      <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                        {filteredBookmarks.length > 0 ? (
                          filteredBookmarks.map((bm, idx) => {
                            const isHighlighted = idx === highlightedBmIndex;
                            return (
                              <div
                                key={bm.id}
                                onMouseEnter={() => setHighlightedBmIndex(idx)}
                                onClick={() => handleSelectBookmark(bm.url, false)}
                                className={`group px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition ${
                                  isHighlighted
                                    ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/30'
                                    : 'text-slate-200 hover:bg-[#1a212b]'
                                }`}
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="font-bold flex items-center gap-1.5 truncate">
                                    <span>🔖</span>
                                    <span>{bm.title}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                                    {bm.url}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectBookmark(bm.url, true);
                                  }}
                                  className="px-2 py-0.5 rounded bg-emerald-600/40 hover:bg-emerald-500 text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition shrink-0 cursor-pointer"
                                  title="直接跳轉至此書籤"
                                >
                                  直接前往
                                </button>
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-3 py-4 text-center text-xs text-slate-400">
                            無相符書籤
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setDiffTextModalOpen(true)}
                  title="依序填入不同文字到各個視窗焦點輸入框"
                  className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/40 text-sky-200 border border-sky-500/30 text-xs font-medium cursor-pointer transition flex items-center gap-1"
                >
                  <FileText className="w-3 h-3 text-sky-400" />
                  <span>差異文字</span>
                </button>
              </div>
            )}
          </div>

          {/* 右側：排列視窗 & 置頂最上層 & 批量建立 & 建立環境 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleTileRunningWindows('grid')}
              title="將所有開啟中的瀏覽器視窗自動網格並排並強制跳到最上層"
              className="px-2.5 py-1.5 rounded-lg bg-[#181d24] hover:bg-[#262f3c] text-sky-300 border border-sky-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
              <span>並排視窗</span>
            </button>

            <button
              onClick={handleBringToTop}
              title="破除 Windows 前台鎖定，立即將所有運行中的瀏覽器視窗還原並拉至最上層"
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>跳到最上層</span>
            </button>

            <div className="h-4 w-[1px] bg-[#262f3c]" />

            <button
              onClick={() => onOpenCreate('mass')}
              className="px-3 py-1.5 rounded-lg bg-[#181d24] hover:bg-[#202731] text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>批量建立</span>
            </button>

            <button
              onClick={() => onOpenCreate('single')}
              className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-sky-950"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>建立環境</span>
            </button>
          </div>
        </div>

        {/* 第 2 行：平時為【搜尋 & 篩選列】，有勾選時無縫切換為【批量操作列】 */}
        {selectedIds.length > 0 ? (
          <div className="px-6 py-2 bg-[#12161c] flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-lg bg-sky-500 text-white text-xs font-bold">
                已選 {selectedIds.length} 個
              </span>
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-slate-400 hover:text-white cursor-pointer transition"
              >
                取消
              </button>
              <button
                onClick={toggleSelectAll}
                className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer transition"
              >
                {selectedIds.length === filteredProfiles.length ? '取消全選' : '全選全部'}
              </button>
              <div className="h-4 w-[1px] bg-[#262f3c]" />
              <label className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoTileBatch}
                  onChange={(e) => setAutoTileBatch(e.target.checked)}
                  className="accent-sky-500 rounded cursor-pointer"
                />
                <span>自動並排視窗</span>
              </label>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                disabled={bulkLoading}
                onClick={handleBulkLaunch}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-sm"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>批量啟動</span>
              </button>

              <button
                disabled={bulkLoading}
                onClick={handleBulkStop}
                className="px-2.5 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>批量關閉</span>
              </button>

              <button
                onClick={() => {
                  setBulkSingleProxyId(proxies[0]?.id || '');
                  setBulkModalType('proxy');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#181d24] hover:bg-sky-500 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                <span>分配代理</span>
              </button>

              <button
                onClick={() => {
                  setBulkSelectedExtIds(extensions.map((e) => e.id));
                  setBulkModalType('extensions');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#181d24] hover:bg-sky-500 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <Puzzle className="w-3.5 h-3.5 text-sky-400" />
                <span>擴充功能</span>
              </button>

              <button
                onClick={handleBulkNewFingerprint}
                className="px-2.5 py-1 rounded-lg bg-[#181d24] hover:bg-sky-500 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <Dices className="w-3.5 h-3.5 text-amber-400" />
                <span>換指紋</span>
              </button>

              <button
                onClick={handleBulkExportCookies}
                className="px-2.5 py-1 rounded-lg bg-[#181d24] hover:bg-sky-500 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <Cookie className="w-3.5 h-3.5 text-amber-400" />
                <span>匯出 Cookie</span>
              </button>

              <button
                onClick={() => onGoToBackup && onGoToBackup(selectedIds)}
                className="px-2.5 py-1 rounded-lg bg-[#181d24] hover:bg-sky-500 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                title="打包備份選取的環境"
              >
                <Archive className="w-3.5 h-3.5 text-sky-400" />
                <span>備份</span>
              </button>

              <button
                onClick={handleBulkDelete}
                className="p-1 rounded-lg bg-rose-500/15 hover:bg-rose-600 text-rose-400 hover:text-white transition cursor-pointer"
                title="批量刪除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-2 bg-[#12161c] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋名稱、備註、標籤或 Seed..."
                  className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={filterStatusId}
                onChange={(e) => setFilterStatusId(e.target.value)}
                className="bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="">全部狀態</option>
                {statuses.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>

              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="">全部標籤</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    # {t}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setFilterRunningOnly(!filterRunningOnly)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                  filterRunningOnly
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-[#0c0e12] border-[#262f3c] text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>運行中 ({Object.keys(runningMap).length})</span>
              </button>

              <button
                onClick={() => setSortRunningFirst(!sortRunningFirst)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                  sortRunningFirst
                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                    : 'bg-[#0c0e12] border-[#262f3c] text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>置頂運行中</span>
              </button>

              {/* IP 重複篩選快捷按鈕 */}
              {(duplicateRunningProfileIds.size > 0 || duplicateAllProfileIds.size > 0) && (
                <button
                  onClick={() => setFilterDuplicateIpOnly(!filterDuplicateIpOnly)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                    filterDuplicateIpOnly
                      ? 'bg-rose-500 text-white border-rose-400 shadow-sm shadow-rose-950'
                      : duplicateRunningProfileIds.size > 0
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30 animate-pulse'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                  }`}
                  title="僅顯示外網 IP 重複/衝突的環境"
                >
                  <AlertTriangle className="w-3 h-3 text-current" />
                  <span>
                    {duplicateRunningProfileIds.size > 0
                      ? `IP 重複 (${duplicateRunningProfileIds.size})`
                      : `歷史 IP 重複 (${duplicateAllProfileIds.size})`}
                  </span>
                </button>
              )}
            </div>

            <div className="text-xs text-slate-400 shrink-0">
              共 <strong className="text-white">{filteredProfiles.length}</strong> 個環境
            </div>
          </div>
        )}
      </div>

      {/* Duplicate Egress IP Warning Bar (緊湊型單行提醒，不佔多餘高度) */}
      {duplicateRunningIpMap.size > 0 && (
        <div className="mx-6 mt-2 px-3.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/40 flex items-center justify-between text-xs text-rose-200 shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
            <span className="font-bold text-rose-300">
              ⚠️ 警告：偵測到執行中的環境外網 IP 相同！
            </span>
            <span className="text-[11px] text-rose-300/80 hidden sm:inline">
              (共 {duplicateRunningProfileIds.size} 個環境衝突，有防關聯風險)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilterDuplicateIpOnly((prev) => !prev)}
            className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition cursor-pointer border ${
              filterDuplicateIpOnly
                ? 'bg-rose-500 text-white border-rose-400'
                : 'bg-rose-900/40 hover:bg-rose-900/60 text-rose-200 border-rose-700/60'
            }`}
          >
            {filterDuplicateIpOnly ? '顯示全部環境' : '僅篩選衝突環境'}
          </button>
        </div>
      )}

      {/* Profiles Table */}
      <div className="flex-1 overflow-y-auto px-6 py-4 pb-6">
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#12161c] border-b border-[#262f3c] text-[11px] font-bold text-slate-400">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredProfiles.length > 0 &&
                      filteredProfiles.every((p) => selectedIds.includes(p.id))
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-600 accent-sky-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">名稱</th>
                <th className="py-3 px-3 w-28">狀態</th>
                <th className="py-3 px-3">代理</th>
                <th className="py-3 px-3">標籤</th>
                <th className="py-3 px-3 w-60">備註</th>
                <th className="py-3 px-4 text-right">管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181d24] text-xs">
              {filteredProfiles.map((profile) => {
                const isSelected = selectedIds.includes(profile.id);
                const runInfo = runningMap[profile.id];
                const isRunning = Boolean(runInfo?.running);
                const isBusy = Boolean(loadingMap[profile.id]);
                const statusObj = statuses.find((s) => s.id === profile.statusId) || statuses[0];

                // IP 重複檢測資訊
                const isDuplicateRunning = duplicateRunningProfileIds.has(profile.id);
                const runningIp = runInfo?.publicIp?.trim();
                const duplicateRunningProfiles = runningIp
                  ? (duplicateRunningIpMap.get(runningIp) || []).filter((p) => p.id !== profile.id)
                  : [];
                const effectiveIp = (runningIp || profile.lastPublicIp)?.trim();
                const duplicateAllProfiles = effectiveIp
                  ? (duplicateAllIpMap.get(effectiveIp) || []).filter((p) => p.id !== profile.id)
                  : [];

                let resolvedProxy: ProxyItem | null = null;
                if (profile.proxyMode === 'saved' && profile.proxyId) {
                  resolvedProxy = proxies.find((px) => px.id === profile.proxyId) || null;
                } else if (profile.proxyMode === 'custom' && profile.proxy) {
                  resolvedProxy = profile.proxy;
                }

                const extSet = new Set([
                  ...extensions.filter((e) => e.enabledForAll).map((e) => e.id),
                  ...(profile.extensionIds || []),
                ]);

                return (
                  <tr
                    key={profile.id}
                    className={`transition ${
                      isDuplicateRunning
                        ? 'bg-rose-950/25 hover:bg-rose-950/35 border-l-2 border-l-rose-500'
                        : isSelected
                        ? 'bg-sky-950/25 hover:bg-sky-950/35'
                        : isRunning
                        ? 'bg-emerald-950/10 hover:bg-[#12161c]'
                        : 'hover:bg-[#12161c]'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(profile.id)}
                        className="rounded border-slate-600 accent-sky-500 cursor-pointer"
                      />
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {profile.os === 'macos' ? '🍎' : profile.os === 'linux' ? '🐧' : '🪟'}
                        </span>
                        <div>
                          <div
                            onClick={() => onOpenEdit(profile)}
                            className="font-bold text-white hover:text-sky-300 cursor-pointer transition flex items-center gap-1.5"
                          >
                            <span>{profile.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Seed: {profile.fingerprint?.seed}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <select
                        value={profile.statusId}
                        onChange={(e) => handleInlineStatusChange(profile.id, e.target.value)}
                        style={{
                          borderColor: `${statusObj?.color || '#8b5cf6'}55`,
                          color: statusObj?.color || '#c4b5fd',
                        }}
                        className="bg-[#0c0e12] border rounded-lg px-2 py-1 text-[11px] font-bold outline-none cursor-pointer"
                      >
                        {statuses.map((st) => (
                          <option key={st.id} value={st.id} className="bg-[#12161c] text-white">
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1">
                        {resolvedProxy ? (
                          <span
                            className="font-medium text-slate-200 text-xs truncate max-w-[150px]"
                            title={resolvedProxy.name || `${resolvedProxy.host}:${resolvedProxy.port}`}
                          >
                            {resolvedProxy.name || `${resolvedProxy.host}:${resolvedProxy.port}`}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">直連</span>
                        )}

                        {/* 若運行中發生 IP 重複，保留警示標籤 */}
                        {isDuplicateRunning && duplicateRunningProfiles.length > 0 && (
                          <div
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-500/40 text-[10px] text-rose-300 font-semibold w-fit"
                            title={`與環境「${duplicateRunningProfiles.map((p) => p.name).join('、')}」外網 IP 相同！`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                            <span className="truncate max-w-[150px]">
                              ⚠️ 與「{duplicateRunningProfiles[0].name}」同 IP
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {(profile.tags || []).length > 0 ? (
                          profile.tags.map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-full bg-[#181d24] text-slate-300 text-[10px]"
                            >
                              #{t}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {editingNoteId === profile.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveInlineNote(profile.id);
                              if (e.key === 'Escape') setEditingNoteId(null);
                            }}
                            className="flex-1 bg-[#0c0e12] border border-sky-500 rounded px-2 py-1 text-xs text-white outline-none"
                          />
                          <button
                            onClick={() => handleSaveInlineNote(profile.id)}
                            className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingNoteId(null)}
                            className="p-1 rounded bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditingNoteId(profile.id);
                            setEditingNoteText(profile.notes || '');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#12161c] hover:bg-[#181d24] cursor-pointer text-[11px] text-slate-300 truncate max-w-[220px]"
                        >
                          {profile.notes || <span className="text-slate-500">+ 備註</span>}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          disabled={isBusy}
                          onClick={() => handleLaunchOrStop(profile)}
                          title={isBusy ? '處理中' : isRunning ? '停止環境' : '啟動環境'}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isBusy
                              ? 'bg-[#181d24] text-slate-500 opacity-60'
                              : isRunning
                              ? 'bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40'
                              : 'bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/40'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isRunning ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>
                        <button
                          onClick={() => onOpenEdit(profile)}
                          title="編輯"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-sky-500 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenCookieModal(profile)}
                          title="Cookie"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-amber-600 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Cookie className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await api.bulkAction('new-fingerprint', [profile.id]);
                            showToast(`已更換「${profile.name}」的指紋`);
                            onRefresh();
                          }}
                          title="隨機更換指紋"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-sky-600 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Dices className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await api.cloneProfile(profile.id);
                            showToast(`已複製：${profile.name}`);
                            onRefresh();
                          }}
                          title="複製環境"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-emerald-600 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await api.openProfileFolder(profile.id);
                          }}
                          title="開啟環境資料夾"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-slate-600 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await api.clearProfileCache(profile.id);
                            showToast(`已清除「${profile.name}」快取`);
                          }}
                          title="清除快取"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-indigo-600 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await api.deleteProfile(profile.id);
                            showToast(`已刪除：${profile.name}`);
                            setSelectedIds((prev) => prev.filter((x) => x !== profile.id));
                            onRefresh();
                          }}
                          title="刪除"
                          className="p-1.5 rounded-lg bg-[#181d24] hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProfiles.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500 text-xs">
                    尚無瀏覽器環境，請點擊右上角「建立環境」或「批量建立」
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cookie Modal */}
      {cookieModalProfile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cookie className="w-4 h-4 text-amber-400" />
                <span>Cookie — {cookieModalProfile.name}</span>
              </h3>
              <button
                onClick={() => setCookieModalProfile(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={9}
              value={cookieModalText}
              onChange={(e) => setCookieModalText(e.target.value)}
              placeholder="貼上 JSON 或 Netscape 格式 Cookie..."
              className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-xl p-3 text-xs font-mono text-white outline-none focus:border-sky-500"
            />
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(cookieModalText || '[]');
                  showToast('已複製 Cookie 至剪貼簿');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#262f3c] hover:bg-[#262f3c] text-xs font-semibold text-slate-200 cursor-pointer"
              >
                複製 Cookie
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setCookieModalProfile(null)}
                  className="px-4 py-1.5 rounded-lg bg-[#262f3c] text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveCookies}
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Sub-Modal */}
      {bulkModalType && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {bulkModalType === 'proxy' && `批量設定代理 (${selectedIds.length} 個環境)`}
                {bulkModalType === 'extensions' && `批量掛載擴充功能 (${selectedIds.length} 個環境)`}
                {bulkModalType === 'tags' && `批量設定標籤 (${selectedIds.length} 個環境)`}
                {bulkModalType === 'status' && `批量修改狀態 (${selectedIds.length} 個環境)`}
                {bulkModalType === 'folder' && `批量移動資料夾 (${selectedIds.length} 個環境)`}
              </h3>
              <button
                onClick={() => setBulkModalType(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {bulkModalType === 'proxy' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'sequential', label: '從代理池依序分配' },
                    { id: 'random', label: '從代理池隨機分配' },
                    { id: 'single', label: '指定單一代理' },
                    { id: 'none', label: '清除代理 (直連)' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setBulkProxyMode(opt.id as any)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border text-left transition cursor-pointer ${
                        bulkProxyMode === opt.id
                          ? 'bg-sky-500/20 border-sky-500 text-white'
                          : 'bg-[#12161c] border-[#262f3c] text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {bulkProxyMode === 'single' && (
                  <select
                    value={bulkSingleProxyId}
                    onChange={(e) => setBulkSingleProxyId(e.target.value)}
                    className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  >
                    {proxies.map((px) => (
                      <option key={px.id} value={px.id}>
                        [{px.type.toUpperCase()}] {px.name} ({px.host}:{px.port})
                      </option>
                    ))}
                  </select>
                )}

                {/* 批量代理設定事前提醒 */}
                {bulkProxyMode === 'single' && selectedIds.length > 1 && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      注意：您將把同一個代理指派給 {selectedIds.length} 個環境，這將造成這些環境的外網 IP 完全相同！
                    </span>
                  </div>
                )}

                {bulkProxyMode === 'sequential' && selectedIds.length > proxies.length && proxies.length > 0 && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      注意：勾選了 {selectedIds.length} 個環境，但目前可用代理僅 {proxies.length} 組，將有 {selectedIds.length - proxies.length} 個環境重複分配到相同 IP！
                    </span>
                  </div>
                )}

                {bulkProxyMode === 'none' && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-sky-500/15 border border-sky-500/35 text-sky-300 text-xs">
                    <Info className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
                    <span>
                      提示：清除代理後，所有被勾選的環境將以本機網路直連，共用您的真實寬頻外網 IP。
                    </span>
                  </div>
                )}
              </div>
            )}

            {bulkModalType === 'extensions' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[
                    { id: 'add', label: '追加掛載' },
                    { id: 'set', label: '覆蓋設定' },
                    { id: 'remove', label: '移除所選' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setBulkExtMode(m.id as any)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                        bulkExtMode === m.id
                          ? 'bg-sky-500 text-white border-sky-500'
                          : 'bg-[#12161c] text-slate-400 border-[#262f3c]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {extensions.length === 0 && (
                    <div className="text-xs text-slate-500 py-4 text-center">尚未新增任何擴充功能</div>
                  )}
                  {extensions.map((ext) => {
                    const checked = bulkSelectedExtIds.includes(ext.id);
                    return (
                      <div
                        key={ext.id}
                        onClick={() =>
                          setBulkSelectedExtIds((prev) =>
                            prev.includes(ext.id) ? prev.filter((x) => x !== ext.id) : [...prev, ext.id]
                          )
                        }
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer ${
                          checked
                            ? 'bg-sky-500/15 border-sky-500/50 text-white'
                            : 'bg-[#12161c] border-[#262f3c] text-slate-400'
                        }`}
                      >
                        <div className="text-xs font-bold">🧩 {ext.name}</div>
                        <input type="checkbox" checked={checked} onChange={() => {}} className="accent-sky-500" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {bulkModalType === 'status' && (
              <select
                value={bulkStatusId}
                onChange={(e) => setBulkStatusId(e.target.value)}
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {statuses.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            )}

            {bulkModalType === 'folder' && (
              <select
                value={bulkFolderId}
                onChange={(e) => setBulkFolderId(e.target.value)}
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}

            {bulkModalType === 'tags' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[
                    { id: 'add', label: '追加標籤' },
                    { id: 'set', label: '覆蓋標籤' },
                    { id: 'clear', label: '清空標籤' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setBulkTagMode(m.id as any)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        bulkTagMode === m.id
                          ? 'bg-sky-500 text-white border-sky-500'
                          : 'bg-[#12161c] text-slate-400 border-[#262f3c]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {bulkTagMode !== 'clear' && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const active = bulkSelectedTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() =>
                            setBulkSelectedTags((prev) =>
                              prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                            )
                          }
                          className={`px-2.5 py-1 rounded-full text-xs cursor-pointer ${
                            active ? 'bg-sky-500 text-white' : 'bg-[#181d24] text-slate-400'
                          }`}
                        >
                          # {t}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBulkModalType(null)}
                className="px-4 py-1.5 rounded-lg bg-[#262f3c] text-xs font-semibold text-slate-300 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleExecuteBulkModal}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
              >
                套用
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Differentiated Text Distribution Modal */}
      {diffTextModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">差異化文字填入（一視窗一行）</h3>
              <button
                onClick={() => setDiffTextModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              先透過「同步點擊」點選所有視窗中的輸入框，再於下方每行輸入一筆資料（例如不同帳號、錢包地址或驗證碼），系統會自動將第 1 行填入第 1 個視窗、第 2 行填入第 2 個視窗。
            </p>
            <textarea
              value={diffTextContent}
              onChange={(e) => setDiffTextContent(e.target.value)}
              rows={8}
              placeholder={`帳號1_內容\n帳號2_內容\n帳號3_內容`}
              className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-xl p-3 text-xs font-mono text-slate-200 outline-none focus:border-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDiffTextModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-[#262f3c] text-xs font-semibold text-slate-300 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleDistributeDiffText}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
              >
                依序填入各視窗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
