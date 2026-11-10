import { isTauri, invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Setup compatibility bridge for Tauri desktop environment.
 * Maps window.electronAPI calls to Tauri v2 native dialogs, opener, and window commands.
 */
export function setupTauriBridge(): void {
  if (typeof window === 'undefined' || !isTauri()) {
    return;
  }

  if (!window.electronAPI) {
    window.electronAPI = {
      isElectron: true, // maintains backward compatibility with UI desktop checks
      selectDirectory: async () => {
        try {
          const selected = await open({
            directory: true,
            multiple: false,
          });
          return typeof selected === 'string' ? selected : null;
        } catch (err) {
          console.error('[TauriBridge] selectDirectory error:', err);
          return null;
        }
      },
      selectFile: async (filters?: any[]) => {
        try {
          const formattedFilters = filters?.map((f) => ({
            name: f.name || 'Files',
            extensions: Array.isArray(f.extensions) ? f.extensions : ['*'],
          }));

          const selected = await open({
            directory: false,
            multiple: false,
            filters: formattedFilters,
          });
          return typeof selected === 'string' ? selected : null;
        } catch (err) {
          console.error('[TauriBridge] selectFile error:', err);
          return null;
        }
      },
      saveFile: async (options?: any) => {
        try {
          const formattedFilters = options?.filters?.map((f: any) => ({
            name: f.name || 'Files',
            extensions: Array.isArray(f.extensions) ? f.extensions : ['*'],
          }));

          const res = await save({
            title: options?.title,
            defaultPath: options?.defaultPath,
            filters: formattedFilters,
          });
          return res || null;
        } catch (err) {
          console.error('[TauriBridge] saveFile error:', err);
          return null;
        }
      },
      windowControl: async (action: 'minimize' | 'maximize' | 'close') => {
        try {
          await invoke('window_control', { action });
        } catch (err) {
          console.error('[TauriBridge] windowControl error:', err);
        }
      },
      getBackendPort: async () => {
        try {
          return await invoke<number>('get_backend_port');
        } catch (err) {
          console.error('[TauriBridge] getBackendPort error:', err);
          return null;
        }
      },
      openExternal: async (url: string) => {
        try {
          await openUrl(url);
        } catch (err) {
          console.warn('[TauriBridge] openUrl failed, falling back to Rust open_external command:', err);
          try {
            await invoke('open_external', { url });
          } catch (e) {
            console.error('[TauriBridge] open_external fallback error:', e);
            window.open(url, '_blank');
          }
        }
      },
    };

    console.log('[ChameleonX] Tauri v2 bridge initialized successfully.');
  }
}
