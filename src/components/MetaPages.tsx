import React, { useState, useMemo } from 'react';
import {
  Bookmark,
  Tags,
  Plus,
  Trash2,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderKanban,
  RefreshCw,
  Loader2,
  Info,
  ChevronDown,
  ChevronRight,
  Edit3,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { BookmarkItem, StatusItem, FolderItem } from '../types';
import { api } from '../api';

interface BookmarksPageProps {
  bookmarks: BookmarkItem[];
  profileCount?: number;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const BookmarksPage: React.FC<BookmarksPageProps> = ({
  bookmarks,
  profileCount = 0,
  onRefresh,
  showToast,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [isCustomFolder, setIsCustomFolder] = useState(false);
  const [customFolderName, setCustomFolderName] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);

  // Tab filter
  const [activeFolderTab, setActiveFolderTab] = useState<'all' | string>('all');
  // Collapsed folders state
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  // Editing bookmark state
  const [editingBmId, setEditingBmId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingFolder, setEditingFolder] = useState('');

  // Extract all existing folders
  const existingFolders = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((bm) => {
      const f = (bm.folder || '').trim();
      if (f) set.add(f);
    });
    return Array.from(set).sort();
  }, [bookmarks]);

  // Grouped bookmarks
  const { rootBookmarks, folderGroups } = useMemo(() => {
    const root: BookmarkItem[] = [];
    const groups = new Map<string, BookmarkItem[]>();

    existingFolders.forEach((f) => groups.set(f, []));

    bookmarks.forEach((bm) => {
      const f = (bm.folder || '').trim();
      if (!f) {
        root.push(bm);
      } else {
        const list = groups.get(f) || [];
        list.push(bm);
        groups.set(f, list);
      }
    });

    return { rootBookmarks: root, folderGroups: groups };
  }, [bookmarks, existingFolders]);

  const toggleCollapse = (folderName: string) => {
    setCollapsedMap((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const handleAdd = async () => {
    if (!title.trim() || !url.trim()) {
      showToast('請輸入書籤名稱與網址', 'error');
      return;
    }

    const targetFolder = isCustomFolder
      ? customFolderName.trim()
      : selectedFolder.trim();

    await api.createBookmark(title.trim(), url.trim(), targetFolder || undefined);
    setTitle('');
    setUrl('');
    if (isCustomFolder) {
      setIsCustomFolder(false);
      setCustomFolderName('');
      setSelectedFolder(targetFolder);
    }
    showToast(
      targetFolder
        ? `已將書籤新增至「📁 ${targetFolder}」資料夾`
        : '已將書籤新增至書籤列根目錄'
    );
    onRefresh();
  };

  const handleStartEdit = (bm: BookmarkItem) => {
    setEditingBmId(bm.id);
    setEditingTitle(bm.title);
    setEditingUrl(bm.url);
    setEditingFolder(bm.folder || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingTitle.trim() || !editingUrl.trim()) {
      showToast('書籤名稱與網址不能為空', 'error');
      return;
    }
    try {
      await api.updateBookmark(id, {
        title: editingTitle.trim(),
        url: editingUrl.trim(),
        folder: editingFolder.trim() || '',
      });
      setEditingBmId(null);
      showToast('書籤已更新');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteFolder = async (folderName: string) => {
    const bmsInFolder = folderGroups.get(folderName) || [];
    if (bmsInFolder.length === 0) return;
    if (!confirm(`確定要刪除「${folderName}」資料夾及底下的 ${bmsInFolder.length} 個書籤嗎？`)) {
      return;
    }
    for (const bm of bmsInFolder) {
      await api.deleteBookmark(bm.id);
    }
    showToast(`已刪除「${folderName}」資料夾`);
    onRefresh();
  };

  const handleSyncAll = async () => {
    try {
      setSyncingAll(true);
      const res = await api.syncAllBookmarks();
      showToast(
        `✅ 已成功同步 ${bookmarks.length} 個書籤至全部 ${res.count || profileCount || 0} 個環境${
          res.liveCount > 0 ? `（含 ${res.liveCount} 個運行中視窗即時生效）` : ''
        }！`
      );
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      {/* 頂部功能列 */}
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] shrink-0 flex items-center justify-between">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-sky-400" />
          <span>書籤與階層管理</span>
          <span className="text-xs font-normal text-slate-400">
            ({bookmarks.length} 個書籤 · {existingFolders.length} 個資料夾)
          </span>
        </h1>

        <button
          onClick={handleSyncAll}
          disabled={syncingAll || bookmarks.length === 0}
          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-sm transition"
        >
          {syncingAll ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span>同步書籤至所有環境</span>
          {profileCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-800 text-[10px] font-mono">
              {profileCount} 個環境
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* 提示說明 */}
        <div className="bg-[#12161c] border border-sky-500/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-300">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="text-sky-300 font-bold">階層式書籤說明：</span>
            在此為書籤指定<span className="text-emerald-400 font-semibold">「資料夾」</span>後，系統會自動在 Chrome 的書籤列建立對應的下拉資料夾結構！點擊「同步書籤至所有環境」可即時寫入現有瀏覽器，在已開啟的瀏覽器中也能即時更新生效。
          </div>
        </div>

        {/* 新增書籤表單 */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4">
          <div className="text-xs font-bold text-white mb-3 flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>新增書籤</span>
          </div>

          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-3">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">書籤名稱</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如: Facebook 後台"
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-sky-500"
              />
            </div>

            <div className="col-span-5">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">網址</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none focus:border-sky-500"
              />
            </div>

            <div className="col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">所屬資料夾</label>
                <button
                  type="button"
                  onClick={() => setIsCustomFolder(!isCustomFolder)}
                  className="text-[11px] text-sky-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>{isCustomFolder ? '選擇現有' : '+ 新資料夾'}</span>
                </button>
              </div>

              {isCustomFolder ? (
                <input
                  type="text"
                  autoFocus
                  value={customFolderName}
                  onChange={(e) => setCustomFolderName(e.target.value)}
                  placeholder="輸入新資料夾名稱..."
                  className="w-full bg-[#0c0e12] border border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              ) : (
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="">🔖 書籤列根目錄 (無資料夾)</option>
                  {existingFolders.map((f) => (
                    <option key={f} value={f}>
                      📁 {f}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="col-span-1">
              <button
                onClick={handleAdd}
                className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增</span>
              </button>
            </div>
          </div>
        </div>

        {/* 分類檢視 Tab */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveFolderTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderTab === 'all'
                ? 'bg-sky-500 text-white'
                : 'bg-[#12161c] text-slate-400 hover:text-white border border-[#262f3c]'
            }`}
          >
            <span>全部書籤</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
              {bookmarks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveFolderTab('__root__')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderTab === '__root__'
                ? 'bg-sky-500 text-white'
                : 'bg-[#12161c] text-slate-400 hover:text-white border border-[#262f3c]'
            }`}
          >
            <span>🔖 書籤列根目錄</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
              {rootBookmarks.length}
            </span>
          </button>

          {existingFolders.map((f) => {
            const count = (folderGroups.get(f) || []).length;
            return (
              <button
                key={f}
                onClick={() => setActiveFolderTab(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeFolderTab === f
                    ? 'bg-sky-500 text-white'
                    : 'bg-[#12161c] text-slate-400 hover:text-white border border-[#262f3c]'
                }`}
              >
                <Folder className="w-3 h-3 text-amber-400" />
                <span>{f}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 資料夾階層清單區 */}
        <div className="space-y-4">
          {/* 1. 資料夾分組 */}
          {existingFolders
            .filter((f) => activeFolderTab === 'all' || activeFolderTab === f)
            .map((fName) => {
              const items = folderGroups.get(fName) || [];
              const isCollapsed = Boolean(collapsedMap[fName]);

              return (
                <div
                  key={fName}
                  className="bg-[#12161c] border border-[#262f3c] rounded-xl overflow-hidden"
                >
                  {/* 資料夾標題欄 */}
                  <div
                    onClick={() => toggleCollapse(fName)}
                    className="px-4 py-3 bg-[#161c24] border-b border-[#262f3c] flex items-center justify-between cursor-pointer hover:bg-[#1a212b] transition select-none"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                      <Folder className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white">{fName}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-600/40 text-[10px] text-amber-300 font-mono">
                        {items.length} 個書籤
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(fName);
                        }}
                        title={`刪除整個「${fName}」資料夾`}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 資料夾內書籤項目 */}
                  {!isCollapsed && (
                    <div className="p-3 grid grid-cols-2 gap-2.5">
                      {items.map((bm) => renderBookmarkCard(bm))}
                      {items.length === 0 && (
                        <div className="col-span-2 py-6 text-center text-xs text-slate-500">
                          此資料夾尚無書籤
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {/* 2. 根目錄 (無資料夾) 的書籤 */}
          {(activeFolderTab === 'all' || activeFolderTab === '__root__') && (
            <div className="bg-[#12161c] border border-[#262f3c] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#161c24] border-b border-[#262f3c] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-white">書籤列根目錄（未歸類到資料夾）</span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-950/60 border border-sky-600/40 text-[10px] text-sky-300 font-mono">
                    {rootBookmarks.length} 個書籤
                  </span>
                </div>
              </div>

              <div className="p-3 grid grid-cols-2 gap-2.5">
                {rootBookmarks.map((bm) => renderBookmarkCard(bm))}
                {rootBookmarks.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-xs text-slate-500">
                    書籤列根目錄無未歸類書籤
                  </div>
                )}
              </div>
            </div>
          )}

          {bookmarks.length === 0 && (
            <div className="py-16 text-center text-xs text-slate-500">
              尚未建立任何預設書籤，請在上方的輸入框新增！
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderBookmarkCard(bm: BookmarkItem) {
    const isEditing = editingBmId === bm.id;

    if (isEditing) {
      return (
        <div
          key={bm.id}
          className="bg-[#0e1217] border border-sky-500/60 rounded-xl p-3 flex flex-col gap-2 animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              placeholder="書籤名稱"
              className="flex-1 bg-[#161c24] border border-[#262f3c] rounded px-2 py-1 text-xs text-white outline-none focus:border-sky-500"
            />
            <select
              value={editingFolder}
              onChange={(e) => setEditingFolder(e.target.value)}
              className="w-32 bg-[#161c24] border border-[#262f3c] rounded px-2 py-1 text-xs text-white outline-none"
            >
              <option value="">🔖 根目錄</option>
              {existingFolders.map((f) => (
                <option key={f} value={f}>
                  📁 {f}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={editingUrl}
            onChange={(e) => setEditingUrl(e.target.value)}
            placeholder="網址"
            className="w-full bg-[#161c24] border border-[#262f3c] rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-sky-500"
          />

          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              onClick={() => handleSaveEdit(bm.id)}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>儲存</span>
            </button>
            <button
              onClick={() => setEditingBmId(null)}
              className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>取消</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={bm.id}
        className="bg-[#12161c] hover:bg-[#161c24] border border-[#262f3c] rounded-xl p-3 flex items-center justify-between transition group"
      >
        <div className="min-w-0 pr-2 flex-1">
          <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
            <span>{bm.folder ? '📁' : '🔖'}</span>
            <span className="truncate">{bm.title}</span>
            {bm.folder && (
              <span className="text-[10px] text-amber-400 font-normal px-1.5 py-0.2 rounded bg-amber-950/60 border border-amber-600/30 shrink-0">
                {bm.folder}
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate mt-1 flex items-center gap-1">
            <span className="truncate">{bm.url}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleStartEdit(bm)}
            title="編輯書籤"
            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 cursor-pointer transition opacity-0 group-hover:opacity-100"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={async () => {
              await api.deleteBookmark(bm.id);
              onRefresh();
            }}
            title="刪除書籤"
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }
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
