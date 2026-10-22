import {
  AppState,
  FingerprintConfig,
  ProfileItem,
  ProxyItem,
  ExtensionItem,
  BackupOptions,
  BackupInspectResult,
  BackupRestoreResult,
  SnapshotItem,
  RestoreOptions,
} from './types';

const API_BASE = 'http://127.0.0.1:19888/api';

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }
  return data as T;
}

export const api = {
  getState: () => request<AppState>('/state'),

  generateFingerprint: (params: Partial<FingerprintConfig>) =>
    request<FingerprintConfig>('/fingerprint/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  createProfile: (payload: Partial<ProfileItem>) =>
    request<ProfileItem>('/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  massCreateProfiles: (payload: any) =>
    request<{ createdCount: number; profiles: ProfileItem[] }>('/profiles/mass-create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProfile: (id: string, payload: Partial<ProfileItem>) =>
    request<ProfileItem>(`/profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  cloneProfile: (id: string) =>
    request<ProfileItem>(`/profiles/${id}/clone`, {
      method: 'POST',
    }),

  deleteProfile: (id: string) =>
    request(`/profiles/${id}`, {
      method: 'DELETE',
    }),

  launchProfile: (id: string) =>
    request(`/profiles/${id}/launch`, {
      method: 'POST',
    }),

  stopProfile: (id: string) =>
    request(`/profiles/${id}/stop`, {
      method: 'POST',
    }),

  clearProfileCache: (id: string) =>
    request(`/profiles/${id}/clear-cache`, {
      method: 'POST',
    }),

  openProfileFolder: (id: string) =>
    request(`/profiles/${id}/open-folder`, {
      method: 'POST',
    }),

  exportCookies: (id: string) =>
    request<{ cookies: any[] }>(`/profiles/${id}/cookies`),

  importCookies: (id: string, cookies: any) =>
    request(`/profiles/${id}/cookies`, {
      method: 'POST',
      body: JSON.stringify({ cookies }),
    }),

  bulkAction: (action: string, profileIds: string[], payload: any = {}) =>
    request('/profiles/bulk', {
      method: 'POST',
      body: JSON.stringify({ action, profileIds, payload }),
    }),

  // Proxies
  addProxies: (payload: any) =>
    request('/proxies', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProxy: (id: string, payload: Partial<ProxyItem>) =>
    request(`/proxies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProxy: (id: string) =>
    request(`/proxies/${id}`, {
      method: 'DELETE',
    }),

  bulkDeleteProxies: (ids: string[]) =>
    request('/proxies/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  testProxy: (payload: { proxyId?: string; proxyConfig?: Partial<ProxyItem> }) =>
    request('/proxies/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  testAllProxies: (ids?: string[]) =>
    request('/proxies/test-all', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // Extensions
  importExtensionFolder: (folderPath: string, category?: string, enabledForAll = true) =>
    request<ExtensionItem>('/extensions/folder', {
      method: 'POST',
      body: JSON.stringify({ folderPath, category, enabledForAll }),
    }),

  importExtensionArchive: (payload: { filePath?: string; fileName?: string; base64Data?: string }) =>
    request<ExtensionItem>('/extensions/archive', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  installExtensionWebStore: (urlOrId: string) =>
    request<ExtensionItem>('/extensions/webstore', {
      method: 'POST',
      body: JSON.stringify({ urlOrId }),
    }),

  updateExtension: (id: string, payload: Partial<ExtensionItem>) =>
    request<ExtensionItem>(`/extensions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteExtension: (id: string) =>
    request(`/extensions/${id}`, {
      method: 'DELETE',
    }),

  // Folders, Statuses, Tags, Bookmarks, Settings, Kernel
  createFolder: (name: string) =>
    request('/folders', { method: 'POST', body: JSON.stringify({ name }) }),

  deleteFolder: (id: string) =>
    request(`/folders/${id}`, { method: 'DELETE' }),

  createStatus: (name: string, color: string) =>
    request('/statuses', { method: 'POST', body: JSON.stringify({ name, color }) }),

  deleteStatus: (id: string) =>
    request(`/statuses/${id}`, { method: 'DELETE' }),

  createTag: (name: string) =>
    request('/tags', { method: 'POST', body: JSON.stringify({ name }) }),

  deleteTag: (name: string) =>
    request(`/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  createBookmark: (title: string, url: string) =>
    request('/bookmarks', { method: 'POST', body: JSON.stringify({ title, url }) }),

  deleteBookmark: (id: string) =>
    request(`/bookmarks/${id}`, { method: 'DELETE' }),

  updateSettings: (payload: any) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  downloadKernel: () =>
    request('/kernel/download', { method: 'POST' }),

  getKernelStatus: () =>
    request('/kernel/status'),

  // Synchronizer (多視窗同步操作)
  updateSyncState: (payload: any) =>
    request('/sync/state', { method: 'POST', body: JSON.stringify(payload) }),

  sendSyncCommand: (
    actionOrPayload: string | { action: string; url?: string; text?: string },
    urlOrProfileIds?: string | string[],
    profileIds?: string[]
  ) => {
    const payload =
      typeof actionOrPayload === 'string'
        ? { action: actionOrPayload, url: typeof urlOrProfileIds === 'string' ? urlOrProfileIds : undefined }
        : actionOrPayload;
    const finalProfileIds = Array.isArray(urlOrProfileIds) ? urlOrProfileIds : profileIds;
    return request<{ sentCount: number; targetCount: number }>('/sync/command', {
      method: 'POST',
      body: JSON.stringify({ payload, profileIds: finalProfileIds }),
    });
  },

  distributeDiffText: (lines: string[], profileIds?: string[]) =>
    request<{ sentCount: number; targetCount: number }>('/sync/distribute-text', {
      method: 'POST',
      body: JSON.stringify({ lines, profileIds }),
    }),

  distributeSyncText: (lines: string[], profileIds?: string[]) =>
    request<{ sentCount: number; targetCount: number }>('/sync/distribute-text', {
      method: 'POST',
      body: JSON.stringify({ lines, profileIds }),
    }),

  tileRunningWindows: (payload: any = {}) =>
    request<{ tiled: number }>('/sync/tile-windows', { method: 'POST', body: JSON.stringify(payload) }),

  bringToTop: (payload: any = {}) =>
    request<{ broughtToTop: number }>('/sync/bring-to-top', { method: 'POST', body: JSON.stringify(payload) }),

  // Backup & Restore
  createBackup: (options: BackupOptions) =>
    request<{
      success: boolean;
      filename: string;
      filePath?: string | null;
      downloadUrl?: string;
      size: number;
      manifest: any;
    }>('/backup/create', {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  inspectBackup: (payload: { filePath?: string; base64Data?: string }) =>
    request<BackupInspectResult>('/backup/inspect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  restoreBackup: (payload: { filePath?: string; base64Data?: string; options: RestoreOptions }) =>
    request<BackupRestoreResult>('/backup/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listSnapshots: () =>
    request<SnapshotItem[]>('/backup/snapshots'),

  deleteSnapshot: (filename: string) =>
    request<{ success: boolean }>(`/backup/snapshots/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  restoreSnapshot: (filename: string, options?: Partial<RestoreOptions>) =>
    request<BackupRestoreResult>(`/backup/snapshots/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ options }),
    }),

  selectSaveFile: async (options?: { title?: string; defaultPath?: string; filters?: any[] }) => {
    if (window.electronAPI && typeof window.electronAPI.saveFile === 'function') {
      return await window.electronAPI.saveFile(options);
    }
    return null;
  },
};
