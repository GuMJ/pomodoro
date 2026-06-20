# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run**: `npm start` — launches the Electron app
- **Dependencies**: `npm install` — Electron is the sole devDependency

## Architecture

```
main.js          → Electron main process: BrowserWindow, 独立托盘倒计时器 (setInterval), IPC handlers
preload.js       → contextBridge: exposes `window.electronAPI.{sendNotification, updateTray, trayStart, trayStop, onTrayTick}`
renderer/
  index.html     → DOM: main-row (mode text + timer digits + action buttons) + bottom-bar (settings panel + tomato stat)
  style.css      → Neon bar theme: CSS variables on :root, max-width slide animation for settings panel
  timer.js       → PomodoroTimer class — state machine, wall-clock tick, tray sync (~400 lines)
  audio.js       → Web Audio API 8-bit alarm: module-level ALARM_NOTES constant, warmupAudio(), playAlarm()
```

## Key Design Details

### State machine (timer.js)

```
State: IDLE → RUNNING ⇄ PAUSED → FINISHED → (auto after 5s) → RUNNING
Mode:  WORK ⇄ BREAK
```

`workTimeSeconds` / `breakTimeSeconds` are **module-level** variables (not class fields) — mutated by `applySettings()`. `totalSeconds` is a computed getter that reads them based on current mode.

**Wall-clock timing**：计时使用 `_tickStartTime` / `_tickBaseRemaining` 记录真实时钟基准，`tick()` 用 `Date.now()` 计算流逝秒数，而非递减计数器。这确保即使 Chromium 节流 `setInterval`，时间也始终准确。`applySettings()` 在 RUNNING 状态下会重置这两个基准值。

### Actions & invariants

- **start()**: calls `warmupAudio()` during user gesture to satisfy AudioContext autoplay policy. Records `_tickBaseRemaining` / `_tickStartTime` for wall-clock tracking. On fresh start (not resume from pause), records `sessionWorkSeconds` / `sessionBreakSeconds`. Calls `electronAPI.trayStart()` to launch main-process tray countdown.
- **reset() (重记)**: discards current progress, returns to IDLE/WORK at `totalSeconds`. Total time and tomato count are **not** affected.
- **skip()**: banks elapsed time into `totalCompletedSeconds`, switches mode. No tomato increment.
- **tick()**: wall-clock based — computes `elapsed = floor((Date.now() - _tickStartTime) / 1000)`, sets `remainingSeconds = max(0, _tickBaseRemaining - elapsed)`. Immune to `setInterval` throttling. Tray icon is NOT updated here; it's driven by main-process `tray-tick` IPC.
- **timesUp()**: increments `completedCount`, adds full `sessionWorkSeconds` to `totalCompletedSeconds`, plays alarm, fires notification, sets 5s auto-transition. Stops main-process tray timer + draws `0` tray.
- **settings**: cancel-if-unchanged guard (`newWork === workTimeSeconds && newBreak === breakTimeSeconds` → close only). On change, elapsed time from current session is banked before resetting to new duration.

### Alarm audio

`warmupAudio()` creates/resumes the AudioContext. Must be called during a user gesture (click handler) — the AudioContext is stored in a module-level `audioCtx` variable, created lazily on first use. `playAlarm()` plays 7-note melody via `playTone()` with staggered delays.

### Tray / 菜单栏图标

**macOS Sequoia (Apple Silicon) Electron bug 约束**：
1. `app.setActivationPolicy('accessory')` — 必须在创建 Tray 之前调用（无 Dock 图标）
2. Tray 必须在 BrowserWindow 之前创建
3. 初始图标必须是 16×16 像素（`createFromBuffer` raw RGBA），否则托盘不可见
4. **禁止**调用 `tray.setTitle()` — 会导致托盘消失
5. `tray.setImage()` 允许小幅扩大（16→22✅），但不能大幅跳变（16→76❌）

**图标渲染**：
- 渲染进程 44×44 Canvas 绘制番茄剪影（椭圆 + 茎 + 两片叶子）
- `destination-out` 复合操作镂空分钟数字
- `toDataURL()` 发主进程 → `createFromDataURL()` → `resize({ width: 22, height: 22 })` → `setTemplateImage(true)` → `tray.setImage()`
- 44→22 下采样提供 Retina 抗锯齿
- 深色模式自动反色为白色剪影

**性能优化**：`_lastTrayMins` 守卫，分钟值未变时跳过重绘（~1500 次/周期 → ~25 次）

**托盘倒计时驱动**（v4）：
- 渲染进程 `start()`/`pause()`/`reset()`/`skip()`/`applySettings()` 时通过 IPC 向主进程同步状态
- **主进程**独立运行 `setInterval` 倒计时（绝不节流），每秒通过 `tray-tick` IPC 推送给渲染进程
- 渲染进程 `onTrayTick` 监听器收到分钟数后调用 `drawTrayIcon(mins)` 更新托盘
- 主进程 `backgroundThrottling = false` 确保渲染进程能及时处理 IPC
- 渲染进程计时器同步使用真实时钟（wall-clock），避免因节流导致时间偏差

**交互**：
- 左键托盘 = 切换窗口显示/隐藏（定位左上角 `setPosition(0, tray.getBounds().y + ...)`）
- 右键托盘 = 退出
- 窗口关闭按钮 = 隐藏到后台（`before-quit` 标记放行真正退出）
- 启动时窗口初始定位左上角（`setPosition(0, 0)`，macOS 自动卡菜单栏下方）

### Settings panel

CSS `max-width` transition (0 → 280px) for slide animation. Four inputs navigable with arrow keys, Enter confirms. No `value` attributes in HTML — values are populated by `toggleSettings()` from the module-level variables.
