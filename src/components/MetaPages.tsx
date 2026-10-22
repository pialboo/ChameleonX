import React, { useState } from 'react';
import { Bookmark, Tags, Plus, Trash2, Folder } from 'lucide-react';
import { BookmarkItem, StatusItem, FolderItem } from '../types';
import { api } from '../api';

interface BookmarksPageProps {
  bookmarks: BookmarkItem[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const BookmarksPage: React.FC<BookmarksPageProps> = ({
  bookmarks,
  onRefresh,
  showToast,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = async () => {
    if (!title.trim() || !url.trim()) {
      showToast('請輸入書籤名稱與網址', 'error');
      return;
    }
    await api.createBookmark(title.trim(), url.trim());
    setTitle('');
    setUrl('');
    showToast('已新增書籤');
    onRefresh();
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] shrink-0">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-sky-400" />
          <span>書籤設定</span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">書籤名稱</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="輸入名稱"
              className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-sky-500"
            />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">網址</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-500 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="bg-[#12161c] border border-[#262f3c] rounded-xl p-3.5 flex items-center justify-between"
            >
              <div className="min-w-0 pr-3">
                <div className="text-xs font-bold text-white">🔖 {bm.title}</div>
                <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">{bm.url}</div>
              </div>
              <button
                onClick={async () => {
                  await api.deleteBookmark(bm.id);
                  onRefresh();
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {bookmarks.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-500">尚未設定預設書籤</div>
        )}
      </div>
    </div>
  );
};

interface TagsAndStatusesPageProps {
  statuses: StatusItem[];
  folders: FolderItem[];
  tags: string[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const TagsAndStatusesPage: React.FC<TagsAndStatusesPageProps> = ({
  statuses,
  folders,
  tags,
  onRefresh,
  showToast,
}) => {
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#10b981');
  const [newFolderName, setNewFolderName] = useState('');
  const [newTagName, setNewTagName] = useState('');

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] shrink-0">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <Tags className="w-4 h-4 text-sky-400" />
          <span>狀態、資料夾與標籤</span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-3 gap-5">
        {/* Statuses */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex flex-col">
          <h3 className="text-xs font-bold text-white mb-3">環境狀態</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="color"
              value={newStatusColor}
              onChange={(e) => setNewStatusColor(e.target.value)}
              className="w-8 h-8 rounded bg-transparent cursor-pointer shrink-0"
            />
            <input
              type="text"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              placeholder="狀態名稱..."
              className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
            />
            <button
              onClick={async () => {
                if (!newStatusName.trim()) return;
                await api.createStatus(newStatusName.trim(), newStatusColor);
                setNewStatusName('');
                showToast('已新增狀態');
                onRefresh();
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-xs font-bold text-white cursor-pointer"
            >
              新增
            </button>
          </div>
          <div className="space-y-1.5 flex-1 overflow-y-auto">
            {statuses.map((st) => (
              <div
                key={st.id}
                className="p-2 rounded-lg bg-[#12161c] border border-[#262f3c] flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                  <span className="text-xs font-semibold text-white">{st.name}</span>
                </div>
                <button
                  onClick={async () => {
                    await api.deleteStatus(st.id);
                    onRefresh();
                  }}
                  className="text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Folders */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex flex-col">
          <h3 className="text-xs font-bold text-white mb-3">資料夾</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="資料夾名稱..."
              className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
            />
            <button
              onClick={async () => {
                if (!newFolderName.trim()) return;
                await api.createFolder(newFolderName.trim());
                setNewFolderName('');
                showToast('已新增資料夾');
                onRefresh();
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-xs font-bold text-white cursor-pointer"
            >
              新增
            </button>
          </div>
          <div className="space-y-1.5 flex-1 overflow-y-auto">
            {folders.map((f) => (
              <div
                key={f.id}
                className="p-2 rounded-lg bg-[#12161c] border border-[#262f3c] flex items-center justify-between"
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
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex flex-col">
          <h3 className="text-xs font-bold text-white mb-3">標籤</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="標籤名稱..."
              className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
            />
            <button
              onClick={async () => {
                if (!newTagName.trim()) return;
                await api.createTag(newTagName.trim());
                setNewTagName('');
                showToast('已新增標籤');
                onRefresh();
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-xs font-bold text-white cursor-pointer"
            >
              新增
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 content-start flex-1 overflow-y-auto">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#12161c] border border-[#262f3c] text-xs text-slate-200"
              >
                <span># {t}</span>
                <button
                  onClick={async () => {
                    await api.deleteTag(t);
                    onRefresh();
                  }}
                  className="text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
