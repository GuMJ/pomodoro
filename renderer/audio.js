// ===================================
// 像素番茄钟 - 8-bit 提示音
// ===================================

let audioCtx = null;

/** 旋律音符定义 — 模块级常量，避免每次 alarm 重新分配 */
const ALARM_NOTES = [
  { freq: 523.25, time: 0 },     // C5
  { freq: 659.25, time: 0.12 },  // E5
  { freq: 783.99, time: 0.24 },  // G5
  { freq: 1046.50, time: 0.36 }, // C6
  { freq: 783.99, time: 0.48 },  // G5
  { freq: 1046.50, time: 0.60 }, // C6
  { freq: 1318.51, time: 0.72 }, // E6
];

/**
 * 获取或创建 AudioContext
 * 必须在用户交互后调用（浏览器策略）
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * 预热 AudioContext — 在用户手势中调用，
 * 确保后续定时触发的 alarm 不受 autoplay 策略限制
 */
function warmupAudio() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

/**
 * 播放一个 8-bit 风格的单音
 */
function playTone(freq, duration, type = 'square', volume = 0.15, delay = 0) {
  const ctx = getAudioContext();
  const now = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, now);

  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + duration);
}

/**
 * 播放计时结束的 8-bit 旋律
 * 复古游戏风格的三连音 + 低音持续音
 */
function playAlarm() {
  // 旋律音 — 复用 playTone
  ALARM_NOTES.forEach(({ freq, time }) => {
    playTone(freq, 0.12, 'square', 0.12, time);
  });

  // 低音持续音
  playTone(130.81, 0.9, 'triangle', 0.08);
}
