const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendNotification: (title, body) =>
    ipcRenderer.invoke('send-notification', { title, body }),
  updateTray: (dataUrl) =>
    ipcRenderer.invoke('update-tray', dataUrl),
});
