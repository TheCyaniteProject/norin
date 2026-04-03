const { contextBridge, ipcRenderer } = require('electron');

// Expose minimal Electron methods; web adapter will wrap to call server APIs
contextBridge.exposeInMainWorld('readerAPI', {
  openFile: () => ipcRenderer.invoke('open-file-dialog'),
  openPhoneticMap: () => ipcRenderer.invoke('open-phonetic-map-dialog'),
  exportPdf: () => ({ canceled: false, ok: (typeof window !== 'undefined' && window.print && window.print(), true) }),
  openFileByPath: (p) => ({ canceled: true, error: 'not supported' })
});
