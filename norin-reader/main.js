const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open text file',
    properties: ['openFile'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'json', 'html', 'csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  try {
    const content = await fs.readFile(filePaths[0], 'utf8');
    return { canceled: false, filePath: filePaths[0], content };
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});

ipcMain.handle('export-pdf', async () => {
  if (!mainWindow) return { canceled: true };

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to PDF',
    defaultPath: 'export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) return { canceled: true };

  try {
    // ensure window contents are up-to-date before printing
    const pdfOptions = { printBackground: true };
    const data = await mainWindow.webContents.printToPDF(pdfOptions);
    await fs.writeFile(filePath, data);
    return { canceled: false, filePath };
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});

ipcMain.handle('open-phonetic-map-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open phonetic map JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  try {
    const fileText = await fs.readFile(filePaths[0], 'utf8');
    const map = JSON.parse(fileText);
    return { canceled: false, filePath: filePaths[0], map };
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});

ipcMain.handle('open-file-by-path', async (event, filePath) => {
  if (!filePath) return { canceled: true };
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { canceled: false, filePath, content };
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});
