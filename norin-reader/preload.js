const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('readerAPI', {
  openFile: () => ipcRenderer.invoke('open-file-dialog'),
  openPhoneticMap: () => ipcRenderer.invoke('open-phonetic-map-dialog'),
  exportPdf: () => ipcRenderer.invoke('export-pdf'),
  openFileByPath: (p) => ipcRenderer.invoke('open-file-by-path', p)
});
