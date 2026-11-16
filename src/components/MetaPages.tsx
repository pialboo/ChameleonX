import React, { useState, useMemo } from 'react';
import {
  Bookmark,
  Tags,
  Plus,
  Trash2,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
  FolderKanban,
  RefreshCw,
  Loader2,
  Info,
  ChevronDown,
  ChevronRight,
  Edit2,
  Edit3,
  Check,
  X,
  ExternalLink,
  Copy,
  Search,
  Globe,
  MoreVertical,
  AlertCircle,
} from 'lucide-react';
import { BookmarkItem, StatusItem, FolderItem } from '../types';
import { api } from '../api';

interface BookmarksPageProps {
  bookmarks: BookmarkItem[];
  bookmarkFolders?: string[];
  profileCount?: number;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const BookmarksPage: React.FC<BookmarksPageProps> = ({
  bookmarks,
  bookmarkFolders = [],
  profileCount = 0,
  onRefresh,
  showToast,
}) => {
  // Navigation: 'all' | '__root__' | folderName
  const [selectedFolderKey, setSelectedFolderKey] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Folder Modals
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renamedFolderName, setRenamedFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  // Bookmark Modals
  const [isAddBookmarkOpen, setIsAddBookmarkOpen] = useState(false);
  const [newBmTitle, setNewBmTitle] = useState('');
  const [newBmUrl, setNewBmUrl] = useState('');
  const [newBmFolder, setNewBmFolder] = useState('');

  const [editingBookmark, setEditingBookmark] = useState<BookmarkItem | null>(null);
  const [editBmTitle, setEditBmTitle] = useState('');
  const [editBmUrl, setEditBmUrl] = useState('');
  const [editBmFolder, setEditBmFolder] = useState('');

  // Extract all distinct folder names
  const allFolders = useMemo(() => {
    const set = new Set<string>();
    (bookmarkFolders || []).forEach((f) => {
      const trimmed = (f || '').trim();
      if (trimmed) set.add(trimmed);
    });
    (bookmarks || []).forEach((bm) => {
      const trimmed = (bm.folder || '').trim();
      if (trimmed) set.add(trimmed);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [bookmarks, bookmarkFolders]);

  // Counts per folder
  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    let rootCount = 0;
    (bookmarks || []).forEach((bm) => {
      const f = (bm.folder || '').trim();
      if (!f) {
        rootCount += 1;
      } else {
        map.set(f, (map.get(f) || 0) + 1);
      }
    });
    return { map, rootCount };
  }, [bookmarks]);

  // Filtered bookmarks for main pane
  const displayedBookmarks = useMemo(() => {
    let list = bookmarks || [];
    if (selectedFolderKey === '__root__') {
      list = list.filter((b) => !b.folder || !b.folder.trim());
    } else if (selectedFolderKey !== 'all') {
      list = list.filter((b) => (b.folder || '').trim() === selectedFolderKey);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (b) =>
          (b.title || '').toLowerCase().includes(q) ||
          (b.url || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [bookmarks, selectedFolderKey, searchTerm]);

  // Folder Actions
  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      showToast('請輸入資料夾名稱', 'error');
      return;
    }
    try {
      await api.createBookmarkFolder(name);
      setNewFolderName('');
      setIsAddFolderOpen(false);
      setSelectedFolderKey(name);
      showToast(`已建立資料夾「${name}」`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '建立資料夾失敗', 'error');
    }
  };

  const handleRenameFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!folderToRename) return;
    const newName = renamedFolderName.trim();
    if (!newName) {
      showToast('資料夾名稱不能為空', 'error');
      return;
    }
    try {
      await api.renameBookmarkFolder(folderToRename, newName);
      if (selectedFolderKey === folderToRename) {
        setSelectedFolderKey(newName);
      }
      setFolderToRename(null);
      setRenamedFolderName('');
      showToast(`已將「${folderToRename}」更名為「${newName}」`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '更名失敗', 'error');
    }
  };

  const handleDeleteFolderConfirm = async (deleteBookmarks: boolean) => {
    if (!folderToDelete) return;
    const name = folderToDelete;
    try {
      await api.deleteBookmarkFolder(name, deleteBookmarks);
      if (selectedFolderKey === name) {
        setSelectedFolderKey('all');
      }
      setFolderToDelete(null);
      showToast(
        deleteBookmarks
          ? `已刪除「${name}」資料夾及內部書籤`
          : `已刪除「${name}」資料夾（書籤已移至書籤列根目錄）`
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '刪除失敗', 'error');
    }
  };

  // Bookmark Actions
  const handleOpenAddBookmark = () => {
    setNewBmTitle('');
    setNewBmUrl('');
    // Default folder to current folder if one is actively selected
    if (selectedFolderKey !== 'all' && selectedFolderKey !== '__root__') {
      setNewBmFolder(selectedFolderKey);
    } else {
      setNewBmFolder('');
    }
    setIsAddBookmarkOpen(true);
  };

  const handleCreateBookmark = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newBmTitle.trim() || !newBmUrl.trim()) {
      showToast('請輸入書籤名稱與網址', 'error');
      return;
    }
    let validUrl = newBmUrl.trim();
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = 'https://' + validUrl;
    }

    try {
      await api.createBookmark(newBmTitle.trim(), validUrl, newBmFolder.trim() || undefined);
      setIsAddBookmarkOpen(false);
      showToast(
        newBmFolder.trim()
          ? `已將書籤新增至「${newBmFolder.trim()}」`
          : '已將書籤新增至書籤列根目錄'
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '新增書籤失敗', 'error');
    }
  };

  const handleStartEdit = (bm: BookmarkItem) => {
    setEditingBookmark(bm);
    setEditBmTitle(bm.title);
    setEditBmUrl(bm.url);
    setEditBmFolder(bm.folder || '');
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingBookmark) return;
    if (!editBmTitle.trim() || !editBmUrl.trim()) {
      showToast('書籤名稱與網址不能為空', 'error');
      return;
    }
    let validUrl = editBmUrl.trim();
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = 'https://' + validUrl;
    }

    try {
      await api.updateBookmark(editingBookmark.id, {
        title: editBmTitle.trim(),
        url: validUrl,
        folder: editBmFolder.trim() || '',
      });
      setEditingBookmark(null);
      showToast('書籤已更新');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '更新書籤失敗', 'error');
    }
  };

  const handleDeleteBookmark = async (id: string, title: string) => {
    if (!confirm(`確定要刪除書籤「${title}」嗎？`)) return;
    try {
      await api.deleteBookmark(id);
      showToast(`已刪除「${title}」`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '刪除失敗', 'error');
    }
  };

  const handleQuickMoveFolder = async (bm: BookmarkItem, targetFolder: string) => {
    try {
      await api.updateBookmark(bm.id, { folder: targetFolder });
      showToast(
        targetFolder
          ? `已將書籤移至「${targetFolder}」`
          : '已將書籤移至書籤列根目錄'
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || '移動失敗', 'error');
    }
  };

  const handleCopyUrl = (bm: BookmarkItem) => {
    navigator.clipboard.writeText(bm.url);
    setCopiedId(bm.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('已複製網址到剪貼簿');
  };

  const handleSyncAll = async () => {
    try {
      setSyncingAll(true);
      const res = await api.syncAllBookmarks();
      showToast(
        `✅ 已同步 ${bookmarks.length} 個書籤至全部 ${res.count || profileCount || 0} 個環境${
          res.liveCount > 0 ? `（含 ${res.liveCount} 個運行中瀏覽器即時生效）` : ''
        }！`
      );
    } catch (err: any) {
      showToast(err.message || '同步失敗', 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      {/* 頂部全域功能列 */}
      <div className="px-6 py-3.5 bg-[#12161c] border-b border-[#262f3c] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <Bookmark className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              <span>書籤管理員</span>
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                Chrome 體驗 · 階層式資料夾
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              集中管理所有指紋環境共用的書籤與資料夾，變更自動即時同步至各環境瀏覽器書籤列。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2 cursor-pointer shadow-sm transition"
          >
            {syncingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>同步至所有環境</span>
            {profileCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-800 text-[10px] font-mono">
                {profileCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 主體左右分割視窗 (左側樹狀目錄 + 右側書籤清單) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左側：資料夾導覽面版 */}
        <div className="w-64 bg-[#12161c] border-r border-[#262f3c] flex flex-col shrink-0">
          {/* 左側頂部：新增資料夾按鈕 */}
          <div className="p-3 border-b border-[#262f3c] flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              書籤目錄
            </span>
            <button
              onClick={() => {
                setNewFolderName('');
                setIsAddFolderOpen(true);
              }}
              className="px-2 py-1 rounded bg-[#1a212b] hover:bg-[#222b38] border border-[#2d3748] text-xs font-medium text-sky-400 flex items-center gap-1 cursor-pointer transition"
              title="新增資料夾"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>新增資料夾</span>
            </button>
          </div>

          {/* 資料夾樹狀列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 select-none">
            {/* 全部書籤 */}
            <div
              onClick={() => setSelectedFolderKey('all')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition ${
                selectedFolderKey === 'all'
                  ? 'bg-sky-500 text-white font-bold'
                  : 'text-slate-300 hover:bg-[#1a212b]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Bookmark className="w-4 h-4 shrink-0" />
                <span className="truncate">全部書籤</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  selectedFolderKey === 'all' ? 'bg-sky-700 text-white' : 'bg-black/30 text-slate-400'
                }`}
              >
                {bookmarks.length}
              </span>
            </div>

            {/* 書籤列根目錄 */}
            <div
              onClick={() => setSelectedFolderKey('__root__')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition ${
                selectedFolderKey === '__root__'
                  ? 'bg-sky-500 text-white font-bold'
                  : 'text-slate-300 hover:bg-[#1a212b]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Globe className="w-4 h-4 shrink-0 text-sky-400" />
                <span className="truncate">書籤列根目錄</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  selectedFolderKey === '__root__' ? 'bg-sky-700 text-white' : 'bg-black/30 text-slate-400'
                }`}
              >
                {folderCounts.rootCount}
              </span>
            </div>

            {/* 自訂資料夾分隔線 */}
            <div className="pt-2 pb-1 px-3 flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span>資料夾 ({allFolders.length})</span>
            </div>

            {allFolders.map((fName) => {
              const count = folderCounts.map.get(fName) || 0;
              const isSelected = selectedFolderKey === fName;

              return (
                <div
                  key={fName}
                  onClick={() => setSelectedFolderKey(fName)}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition ${
                    isSelected
                      ? 'bg-sky-500 text-white font-bold'
                      : 'text-slate-300 hover:bg-[#1a212b]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <Folder
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-white' : 'text-amber-400'
                      }`}
                    />
                    <span className="truncate">{fName}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                        isSelected
                          ? 'bg-sky-700 text-white'
                          : 'bg-black/30 text-slate-400'
                      } ${isSelected ? '' : 'group-hover:hidden'}`}
                    >
                      {count}
                    </span>

                    {/* 資料夾操作按鈕 (滑鼠移入時顯示) */}
                    <div
                      className={`items-center gap-0.5 ${
                        isSelected ? 'flex' : 'hidden group-hover:flex'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFolderToRename(fName);
                          setRenamedFolderName(fName);
                        }}
                        title="重新命名資料夾"
                        className={`p-1 rounded ${
                          isSelected
                            ? 'hover:bg-sky-600 text-white'
                            : 'hover:bg-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFolderToDelete(fName)}
                        title="刪除資料夾"
                        className={`p-1 rounded ${
                          isSelected
                            ? 'hover:bg-sky-600 text-white'
                            : 'hover:bg-rose-500/20 text-slate-400 hover:text-rose-400'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {allFolders.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                尚未建立任何資料夾
                <div className="mt-2">
                  <button
                    onClick={() => {
                      setNewFolderName('');
                      setIsAddFolderOpen(true);
                    }}
                    className="text-sky-400 hover:underline text-xs"
                  >
                    + 點此建立第一個資料夾
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右側：書籤清單檢視視窗 */}
        <div className="flex-1 flex flex-col bg-[#0c0e12] overflow-hidden">
          {/* 右側頂部導航與搜尋列 */}
          <div className="px-6 py-3 bg-[#12161c] border-b border-[#262f3c] flex items-center justify-between shrink-0 gap-4">
            {/* 麵包屑路徑 */}
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="text-slate-400">書籤</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="font-bold text-white flex items-center gap-1.5 truncate">
                {selectedFolderKey === 'all' && <span>📑 全部書籤</span>}
                {selectedFolderKey === '__root__' && <span>🔖 書籤列根目錄</span>}
                {selectedFolderKey !== 'all' && selectedFolderKey !== '__root__' && (
                  <>
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    <span>{selectedFolderKey}</span>
                  </>
                )}
              </span>
              <span className="text-xs font-normal text-slate-400">
                ({displayedBookmarks.length} 項)
              </span>
            </div>

            {/* 搜尋框與新增按鈕 */}
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜尋書籤名稱或網址..."
                  className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500 transition"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={handleOpenAddBookmark}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-sm transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增書籤</span>
              </button>
            </div>
          </div>

          {/* 書籤內容區 */}
          <div className="flex-1 overflow-y-auto p-6">
            {displayedBookmarks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-[#12161c] border border-[#262f3c] flex items-center justify-center mb-4">
                  {searchTerm ? (
                    <Search className="w-8 h-8 text-slate-600" />
                  ) : (
                    <Folder className="w-8 h-8 text-slate-600" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  {searchTerm ? '找不到相符的書籤' : '此資料夾尚無任何書籤'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  {searchTerm
                    ? '請嘗試使用其他關鍵字搜尋，或清空搜尋條件。'
                    : '點擊下方按鈕新增常用網站書籤，啟動環境時將自動出現在瀏覽器中。'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={handleOpenAddBookmark}
                    className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>在此新增書籤</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-[#12161c] border border-[#262f3c] rounded-xl overflow-hidden divide-y divide-[#1e2633]">
                {displayedBookmarks.map((bm) => {
                  const domain = getDomain(bm.url);
                  const isCopied = copiedId === bm.id;

                  return (
                    <div
                      key={bm.id}
                      className="px-4 py-3 flex items-center justify-between hover:bg-[#161c24] transition group"
                    >
                      {/* 左側：Favicon + 標題與網址 */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                        <div className="w-7 h-7 rounded-lg bg-[#0c0e12] border border-[#262f3c] flex items-center justify-center shrink-0 overflow-hidden">
                          {domain ? (
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                              alt=""
                              className="w-4 h-4"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Globe className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition">
                              {bm.title}
                            </span>
                            {/* 所屬資料夾標籤 */}
                            {bm.folder ? (
                              <span
                                onClick={() => setSelectedFolderKey(bm.folder!)}
                                className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-medium px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/30 hover:border-amber-500 cursor-pointer transition shrink-0"
                                title="點擊切換至此資料夾"
                              >
                                <Folder className="w-2.5 h-2.5" />
                                <span>{bm.folder}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-normal shrink-0">
                                (根目錄)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                            {bm.url}
                          </div>
                        </div>
                      </div>

                      {/* 右側操作按鈕群 */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* 快速移動至其他資料夾下拉選單 */}
                        <div className="relative">
                          <select
                            value={bm.folder || ''}
                            onChange={(e) => handleQuickMoveFolder(bm, e.target.value)}
                            title="移動至其他資料夾"
                            className="bg-[#0c0e12] hover:bg-[#161c24] border border-[#262f3c] text-[11px] text-slate-300 rounded px-2 py-1 outline-none focus:border-sky-500 cursor-pointer transition opacity-80 group-hover:opacity-100"
                          >
                            <option value="">🔖 根目錄</option>
                            {allFolders.map((f) => (
                              <option key={f} value={f}>
                                📁 {f}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* 開啟連結 */}
                        <a
                          href={bm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="在瀏覽器開啟"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#202733] transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        {/* 複製網址 */}
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(bm)}
                          title="複製網址"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#202733] transition"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* 編輯書籤 */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(bm)}
                          title="編輯"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* 刪除書籤 */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBookmark(bm.id, bm.title)}
                          title="刪除"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= 彈跳視窗 (Modals) ================= */}

      {/* 1. 新增資料夾 Modal */}
      {isAddFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-sky-400" />
                <span>新增書籤資料夾</span>
              </h3>
              <button
                onClick={() => setIsAddFolderOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  資料夾名稱
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="例如: 社交帳號、電商後台、交易所..."
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddFolderOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition shadow-sm"
                >
                  建立資料夾
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. 重新命名資料夾 Modal */}
      {folderToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-400" />
                <span>重新命名資料夾</span>
              </h3>
              <button
                onClick={() => setFolderToRename(null)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameFolder}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  新名稱
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renamedFolderName}
                  onChange={(e) => setRenamedFolderName(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFolderToRename(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition shadow-sm"
                >
                  儲存更名
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. 刪除資料夾確認 Modal */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">
                刪除「{folderToDelete}」資料夾
              </h3>
            </div>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              請選擇如何處理資料夾內包含的書籤項目：
            </p>

            <div className="space-y-2.5 mb-5">
              <button
                type="button"
                onClick={() => handleDeleteFolderConfirm(false)}
                className="w-full text-left p-3 rounded-xl bg-[#161c24] hover:bg-[#1c242f] border border-[#262f3c] transition group cursor-pointer"
              >
                <div className="text-xs font-bold text-white group-hover:text-sky-300">
                  📁 僅刪除資料夾（保留書籤）
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  將原本屬於此資料夾的書籤移至「書籤列根目錄」，不刪除任何書籤。
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleDeleteFolderConfirm(true)}
                className="w-full text-left p-3 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 transition group cursor-pointer"
              >
                <div className="text-xs font-bold text-rose-300 group-hover:text-rose-200">
                  🗑️ 連同資料夾與書籤全部刪除
                </div>
                <div className="text-[11px] text-rose-400/80 mt-1">
                  徹底刪除此資料夾，並同時刪除裡面所有儲存的書籤。
                </div>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 新增書籤 Modal */}
      {isAddBookmarkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-sky-400" />
                <span>新增書籤</span>
              </h3>
              <button
                onClick={() => setIsAddBookmarkOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBookmark} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  書籤名稱
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newBmTitle}
                  onChange={(e) => setNewBmTitle(e.target.value)}
                  placeholder="例如: Google、ChatGPT、幣安後台..."
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  網址 (URL)
                </label>
                <input
                  type="text"
                  value={newBmUrl}
                  onChange={(e) => setNewBmUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  存放資料夾
                </label>
                <select
                  value={newBmFolder}
                  onChange={(e) => setNewBmFolder(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="">🔖 書籤列根目錄 (無資料夾)</option>
                  {allFolders.map((f) => (
                    <option key={f} value={f}>
                      📁 {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddBookmarkOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition shadow-sm"
                >
                  新增書籤
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. 編輯書籤 Modal */}
      {editingBookmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-sky-400" />
                <span>編輯書籤</span>
              </h3>
              <button
                onClick={() => setEditingBookmark(null)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  書籤名稱
                </label>
                <input
                  type="text"
                  autoFocus
                  value={editBmTitle}
                  onChange={(e) => setEditBmTitle(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  網址 (URL)
                </label>
                <input
                  type="text"
                  value={editBmUrl}
                  onChange={(e) => setEditBmUrl(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  存放資料夾
                </label>
                <select
                  value={editBmFolder}
                  onChange={(e) => setEditBmFolder(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="">🔖 書籤列根目錄 (無資料夾)</option>
                  {allFolders.map((f) => (
                    <option key={f} value={f}>
                      📁 {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBookmark(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition shadow-sm"
                >
                  儲存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

interface TagsAndStatusesPageProps {
  statuses: StatusItem[];
  folders: FolderItem[];
  tags?: string[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const TagsAndStatusesPage: React.FC<TagsAndStatusesPageProps> = ({
  statuses,
  folders,
  onRefresh,
  showToast,
}) => {
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#10b981');
  const [newFolderName, setNewFolderName] = useState('');

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] shrink-0">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-sky-400" />
          <span>環境分類與狀態</span>
          <span className="text-xs font-normal text-slate-400">
            ({statuses.length} 個狀態 · {folders.length} 個資料夾)
          </span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-6 max-w-5xl">
        {/* 1. 環境狀態 */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>環境狀態管理</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              設定每個帳號當前的生命週期階段（如正常、養號中、已封鎖）。定義後可在瀏覽器列表直接下拉快速切換。
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="color"
              value={newStatusColor}
              onChange={(e) => setNewStatusColor(e.target.value)}
              className="w-9 h-9 rounded-lg bg-transparent cursor-pointer shrink-0 border border-[#262f3c]"
              title="選擇狀態識別色彩"
            />
            <input
              type="text"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              placeholder="輸入新狀態名稱（例如: 養號中）..."
              className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500"
            />
            <button
              onClick={async () => {
                if (!newStatusName.trim()) return;
                await api.createStatus(newStatusName.trim(), newStatusColor);
                setNewStatusName('');
                showToast('已新增環境狀態');
                onRefresh();
              }}
              className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white cursor-pointer transition shrink-0"
            >
              新增
            </button>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {statuses.map((st) => (
              <div
                key={st.id}
                className="p-3 rounded-lg bg-[#0e1217] border border-[#262f3c] flex items-center justify-between hover:border-slate-600 transition"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: st.color }}
                  />
                  <span className="text-xs font-semibold text-white">{st.name}</span>
                </div>
                <button
                  onClick={async () => {
                    await api.deleteStatus(st.id);
                    onRefresh();
                  }}
                  title="刪除狀態"
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2. 資料夾分類 */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Folder className="w-4 h-4 text-sky-400" />
              <span>環境資料夾分類</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              依專案、團隊或業務進行帳號分組。建立後可在「瀏覽器環境」左側側邊欄一鍵切換檢視。
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="輸入資料夾名稱（例如: Facebook 專案組）..."
              className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500"
            />
            <button
              onClick={async () => {
                if (!newFolderName.trim()) return;
                await api.createFolder(newFolderName.trim());
                setNewFolderName('');
                showToast('已新增資料夾');
                onRefresh();
              }}
              className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white cursor-pointer transition shrink-0"
            >
              新增
            </button>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {folders.map((f) => (
              <div
                key={f.id}
                className="p-3 rounded-lg bg-[#0e1217] border border-[#262f3c] flex items-center justify-between hover:border-slate-600 transition"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Folder className="w-3.5 h-3.5 text-sky-400" />
                  <span>{f.name}</span>
                </div>
                {f.id !== 'fld-all' && (
                  <button
                    onClick={async () => {
                      await api.deleteFolder(f.id);
                      onRefresh();
                    }}
                    title="刪除資料夾"
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
