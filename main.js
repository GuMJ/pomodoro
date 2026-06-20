const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 115,
    resizable: false,
    fullscreenable: false,
    title: 'Pomodoro',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 初始定位在屏幕左上角
  mainWindow.setPosition(0, 0);

  // 关闭窗口 → 隐藏到后台
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // 16×16 蓝色方块占位图标
  // macOS Sequoia (Apple Silicon) Electron bug：托盘仅接受 16×16 初始图标
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0xFF);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 1] = 80;  // G
    buf[i * 4 + 2] = 80;  // B
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size });

  tray = new Tray(icon);
  tray.setToolTip('Pomodoro');

  // 左键单击 → 切换窗口显示/隐藏
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      // 弹窗定位在屏幕左上角，菜单栏下方
      const trayBounds = tray.getBounds();
      const y = Math.round(trayBounds.y + trayBounds.height);
      mainWindow.setPosition(0, y);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 右键菜单 — accessory 模式下无 Dock 图标，靠这里退出
  const contextMenu = Menu.buildFromTemplate([
    { label: '退出 Pomodoro', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });
}

// IPC: 接收渲染进程 44×44 Canvas 图像 → 缩至 22×22 托盘图标（Retina 抗锯齿）
ipcMain.handle('update-tray', async (_event, dataUrl) => {
  if (tray) {
    const img = nativeImage.createFromDataURL(dataUrl);
    const resized = img.resize({ width: 22, height: 22 });
    resized.setTemplateImage(true);
    tray.setImage(resized);
  }
});

// IPC: 桌面通知
ipcMain.handle('send-notification', async (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: false });
    notification.show();
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  // macOS Sequoia 托盘 workaround：
  // 1. accessory 模式必须在托盘创建前设置
  // 2. 托盘必须在 BrowserWindow 前创建
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
  }
  createTray();
  createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});
