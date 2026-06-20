const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendNotification: (title, body) =>
    ipcRenderer.invoke('send-notification', { title, body }),
  updateTray: (dataUrl) =>
    ipcRenderer.invoke('update-tray', dataUrl),
  // 托盘倒计时器由主进程驱动（不受 Chromium 后台节流影响）
  trayStart: (seconds) =>
    ipcRenderer.invoke('tray-start', seconds),
  trayStop: () =>
    ipcRenderer.invoke('tray-stop'),
  onTrayTick: (callback) =>
    ipcRenderer.on('tray-tick', (_event, mins) => callback(mins)),
});
