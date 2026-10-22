const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  windowControl: (action) => ipcRenderer.invoke('window:control', action),
});
