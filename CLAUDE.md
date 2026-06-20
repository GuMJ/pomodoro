# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run**: `npm start` — launches the Electron app
- **Dependencies**: `npm install` — Electron is the sole devDependency

## Architecture

```
main.js          → Electron main process: BrowserWindow, Tray (menu bar countdown), IPC handlers
preload.js       → contextBridge: exposes `window.electronAPI.{sendNotification, updateTray}`
renderer/
  index.html     → DOM: main-row (mode text + timer digits + action buttons) + bottom-bar (settings panel + tomato stat)
  style.css      → Neon bar theme: CSS variables on :root, max-width slide animation for settings panel
  timer.js       → PomodoroTimer class — state machine, core logic (~300 lines)
  audio.js       → Web Audio API 8-bit alarm: module-level ALARM_NOTES constant, warmupAudio(), playAlarm()
```

## Key Design Details

### State machine (timer.js)

```
State: IDLE → RUNNING ⇄ PAUSED → FINISHED → (auto after 5s) → RUNNING
Mode:  WORK ⇄ BREAK
```

`workTimeSeconds` / `breakTimeSeconds` are **module-level** variables (not class fields) — mutated by `applySettings()`. `totalSeconds` is a computed getter that reads them based on current mode.

### Actions & invariants

- **start()**: calls `warmupAudio()` during user gesture to satisfy AudioContext autoplay policy. On fresh start (not resume from pause), records `sessionWorkSeconds` / `sessionBreakSeconds` for elapsed-time tracking.
- **reset() (重记)**: discards current progress, returns to IDLE/WORK at `totalSeconds`. Total time and tomato count are **not** affected.
- **skip()**: banks elapsed time into `totalCompletedSeconds`, switches mode. No tomato increment.
- **timesUp()**: increments `completedCount`, adds full `sessionWorkSeconds` to `totalCompletedSeconds`, plays alarm, fires notification, sets 5s auto-transition.
- **settings**: cancel-if-unchanged guard (`newWork === workTimeSeconds && newBreak === breakTimeSeconds` → close only). On change, elapsed time from current session is banked before resetting to new duration.

### Alarm audio

`warmupAudio()` creates/resumes the AudioContext. Must be called during a user gesture (click handler) — the AudioContext is stored in a module-level `audioCtx` variable, created lazily on first use. `playAlarm()` plays 7-note melody via `playTone()` with staggered delays.

### Tray / 菜单栏图标

- **macOS Sequoia (Apple Silicon) Electron bug**：托盘仅在以下条件全部满足时可见：
  1. `app.setActivationPolicy('accessory')` — 必须在创建 Tray 之前调用
  2. Tray 必须在 BrowserWindow 之前创建
  3. 初始图标必须是 16×16 像素（`createFromBuffer` raw RGBA）
  4. **禁止**调用 `tray.setTitle()` — 会导致托盘消失
  5. `tray.setImage()` 仅接受与初始图标同尺寸的图像
- 渲染进程在 32×32 Canvas 上绘制时间文字 → `toDataURL()` 发主进程 → `nativeImage.createFromDataURL()` → `img.resize({ width: 16, height: 16 })` → `tray.setImage()`
- Retina 屏上 32→16 缩放在菜单栏中以 @2x 渲染，文字清晰可读
- 左键托盘 = 切换窗口显示/隐藏，右键托盘 = 退出
- 窗口关闭按钮 = 隐藏到后台（不退出）

### Settings panel

CSS `max-width` transition (0 → 280px) for slide animation. Four inputs navigable with arrow keys, Enter confirms. No `value` attributes in HTML — values are populated by `toggleSettings()` from the module-level variables.
