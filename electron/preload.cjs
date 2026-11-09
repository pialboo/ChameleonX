const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getBackendPort: () => ipcRenderer.invoke('app:getBackendPort'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  windowControl: (action) => ipcRenderer.invoke('window:control', action),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
});
