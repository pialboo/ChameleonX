import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { BrowsersPage } from './components/BrowsersPage';
import { ProxiesPage } from './components/ProxiesPage';
import { ExtensionsPage } from './components/ExtensionsPage';
import { BookmarksPage, TagsAndStatusesPage } from './components/MetaPages';
import { KernelSettingsPage } from './components/KernelSettingsPage';
import { BackupRestorePage } from './components/BackupRestorePage';
import { ProfileModal } from './components/ProfileModal';
import { AppState, ProfileItem } from './types';
import { api } from './api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('browsers');
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'single' | 'mass'>('single');
  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null);

  // Backup & Restore preselection
  const [backupSelectedProfileIds, setBackupSelectedProfileIds] = useState<string[]>([]);

  // Toast Notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 3500);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const data = await api.getState();
      setState(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const handleOpenCreateModal = (mode: 'single' | 'mass' = 'single') => {
    setEditingProfile(null);
    setModalMode(mode);
    setModalOpen(true);
  };

  const handleOpenEditModal = (profile: ProfileItem) => {
    setEditingProfile(profile);
    setModalMode('single');
    setModalOpen(true);
  };

  if (!state) {
    return (
      <div className="h-screen w-screen bg-[#0c0e12] flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-10 h-10 rounded-full border-3 border-sky-400 border-t-transparent animate-spin" />
        <div className="text-sm font-bold">正在啟動 ChameleonX 本地防關聯引擎...</div>
        {error && <div className="text-xs text-rose-400">連線本地服務中：{error}</div>}
      </div>
    );
  }

  const runningCount = Object.keys(state.runningMap || {}).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0c0e12] text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCreateModal={handleOpenCreateModal}
        profileCount={state.profiles.length}
        runningCount={runningCount}
        proxyCount={state.proxies.length}
        extensionCount={state.extensions.length}
        kernelInfo={state.kernelInfo}
      />

      {activeTab === 'browsers' && (
        <BrowsersPage
          profiles={state.profiles}
          proxies={state.proxies}
          extensions={state.extensions}
          statuses={state.statuses}
          folders={state.folders}
          tags={state.tags}
          bookmarks={state.bookmarks}
          runningMap={state.runningMap}
          settings={state.settings}
          syncState={state.syncState}
          kernelInfo={state.kernelInfo}
          onGoToSettings={() => setActiveTab('settings')}
          onGoToBackup={(profileIds) => {
            setBackupSelectedProfileIds(profileIds || []);
            setActiveTab('backup');
          }}
          onOpenCreate={handleOpenCreateModal}
          onOpenEdit={handleOpenEditModal}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      {activeTab === 'proxies' && (
        <ProxiesPage
          proxies={state.proxies}
          profiles={state.profiles}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      {activeTab === 'extensions' && (
        <ExtensionsPage
          extensions={state.extensions}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      {activeTab === 'bookmarks' && (
        <BookmarksPage
          bookmarks={state.bookmarks}
          profileCount={state.profiles.length}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      {activeTab === 'tags' && (
        <TagsAndStatusesPage
          statuses={state.statuses}
          folders={state.folders}
          tags={state.tags}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      {activeTab === 'settings' && (
        <KernelSettingsPage
          settings={state.settings}
          kernelInfo={state.kernelInfo}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      {activeTab === 'backup' && (
        <BackupRestorePage
          profiles={state.profiles}
          proxies={state.proxies}
          extensions={state.extensions}
          bookmarks={state.bookmarks}
          folders={state.folders}
          statuses={state.statuses}
          tags={state.tags}
          settings={state.settings}
          preSelectedProfileIds={backupSelectedProfileIds}
          onRefresh={fetchState}
          showToast={showToast}
        />
      )}

      <ProfileModal
        isOpen={modalOpen}
        initialMode={modalMode}
        editingProfile={editingProfile}
        profiles={state.profiles}
        proxies={state.proxies}
        extensions={state.extensions}
        statuses={state.statuses}
        folders={state.folders}
        availableTags={state.tags}
        defaultStartPage={state.settings.defaultStartPage}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          fetchState();
          showToast(
            editingProfile
              ? `✅ 已儲存環境設定：${editingProfile.name}`
              : modalMode === 'mass'
              ? '🚀 批量建立環境完成！'
              : '✨ 已建立新指紋環境！'
          );
        }}
      />

      {/* Toast Banner */}
      {toast && (
        <div
          className={`fixed top-5 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 transition-all ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
              : 'bg-[#181d24]/95 border-sky-500/50 text-white shadow-sky-950/20'
          }`}
        >
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
};
