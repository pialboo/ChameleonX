import React, { useState, useRef } from 'react';
import {
  Puzzle,
  FolderOpen,
  Upload,
  Globe,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { ExtensionItem } from '../types';
import { api } from '../api';

interface ExtensionsPageProps {
  extensions: ExtensionItem[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ExtensionsPage: React.FC<ExtensionsPageProps> = ({
  extensions,
  onRefresh,
  showToast,
}) => {
  const [folderPath, setFolderPath] = useState('');
  const [webstoreInput, setWebstoreInput] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleBrowseFolder = async () => {
    if (window.electronAPI?.selectDirectory) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        setFolderPath(selected);
      }
    }
  };

  const handleImportFolder = async () => {
    if (!folderPath.trim()) {
      showToast('請輸入或選擇擴充功能資料夾路徑', 'error');
      return;
    }
    setLoadingAction('folder');
    try {
      const ext = await api.importExtensionFolder(folderPath.trim(), '本地擴充', true);
      showToast(`已載入擴充功能：${ext.name}`);
      setFolderPath('');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUploadArchive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingAction('archive');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const ext = await api.importExtensionArchive({
            fileName: file.name,
            base64Data,
          });
          showToast(`已安裝擴充功能：${ext.name}`);
          onRefresh();
        } catch (err: any) {
          showToast(err.message, 'error');
        } finally {
          setLoadingAction(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showToast(err.message, 'error');
      setLoadingAction(null);
    }
    e.target.value = '';
  };

  const handleInstallWebStore = async () => {
    const input = webstoreInput.trim();
    if (!input) {
      showToast('請輸入 Chrome 線上應用程式商店網址或 ID', 'error');
      return;
    }
    setLoadingAction('webstore');
    try {
      const ext = await api.installExtensionWebStore(input);
      showToast(`已下載並安裝：${ext.name}`);
      setWebstoreInput('');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleToggleGlobal = async (ext: ExtensionItem) => {
    try {
      await api.updateExtension(ext.id, { enabledForAll: !ext.enabledForAll });
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (ext: ExtensionItem) => {
    try {
      await api.deleteExtension(ext.id);
      showToast(`已移除：${ext.name}`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] flex items-center justify-between shrink-0">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-sky-400" />
          <span>擴充功能</span>
        </h1>
        <div className="text-xs text-slate-400">
          已安裝 <strong className="text-white">{extensions.length}</strong> 個
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {/* Local Folder */}
          <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <FolderOpen className="w-4 h-4 text-sky-400" />
                <span>載入本地擴充資料夾</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="選擇包含 manifest.json 的資料夾"
                  className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500"
                />
                {window.electronAPI?.isElectron && (
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="px-2.5 py-1.5 rounded-lg bg-[#262f3c] hover:bg-[#262f3c] text-xs font-semibold text-slate-200 shrink-0 cursor-pointer"
                  >
                    瀏覽
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={loadingAction === 'folder'}
              onClick={handleImportFolder}
              className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-500 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
            >
              {loadingAction === 'folder' ? '載入中...' : '載入資料夾'}
            </button>
          </div>

          {/* CRX / ZIP */}
          <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Upload className="w-4 h-4 text-sky-400" />
                <span>匯入 CRX / ZIP 檔案</span>
              </div>
              <div className="text-xs text-slate-400 py-1.5">
                自動解壓縮 .crx 或 .zip 擴充套件包
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".crx,.zip"
                onChange={handleUploadArchive}
                className="hidden"
              />
            </div>
            <button
              type="button"
              disabled={loadingAction === 'archive'}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
            >
              {loadingAction === 'archive' ? '安裝中...' : '選擇檔案安裝'}
            </button>
          </div>

          {/* Chrome Web Store */}
          <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Chrome 商店網址 / ID 安裝</span>
              </div>
              <input
                type="text"
                value={webstoreInput}
                onChange={(e) => setWebstoreInput(e.target.value)}
                placeholder="輸入商店網址或 32 位元 ID"
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="button"
              disabled={loadingAction === 'webstore'}
              onClick={handleInstallWebStore}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
            >
              {loadingAction === 'webstore' ? '下載中...' : '下載並安裝'}
            </button>
          </div>
        </div>

        {/* Extensions List */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl overflow-hidden">
          <div className="divide-y divide-[#181d24]">
            {extensions.map((ext) => (
              <div
                key={ext.id}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-[#12161c] transition"
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  {ext.iconDataUrl ? (
                    <img
                      src={ext.iconDataUrl}
                      alt={ext.name}
                      className="w-9 h-9 rounded-lg object-contain bg-[#1f2438] p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-300 shrink-0 text-sm">
                      🧩
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{ext.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#181d24] text-slate-300 font-mono">
                        v{ext.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{ext.path}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleGlobal(ext)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      ext.enabledForAll
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#181d24] border-[#262f3c] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{ext.enabledForAll ? '全域自動掛載' : '手動指定掛載'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(ext)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    title="移除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {extensions.length === 0 && (
              <div className="py-14 text-center text-xs text-slate-500">
                尚未新增任何擴充功能
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
