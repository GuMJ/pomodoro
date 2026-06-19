// ===================================
// 番茄钟 — 核心计时逻辑 v3
// ===================================

let workTimeSeconds = 25 * 60;
let breakTimeSeconds = 5 * 60;

const State = { IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused', FINISHED: 'finished' };
const Mode = { WORK: 'work', BREAK: 'break' };

const MODE_LABEL = { [Mode.WORK]: '工作', [Mode.BREAK]: '休息' };

class PomodoroTimer {
  constructor() {
    this.state = State.IDLE;
    this.mode = Mode.WORK;
    this.remainingSeconds = workTimeSeconds;
    this.completedCount = 0;
    this.totalCompletedSeconds = 0;
    this.sessionWorkSeconds = 0;
    this.sessionBreakSeconds = 0;
    this.sessionContribution = 0;
    this.showTotal = false;
    this.intervalId = null;
    this.autoTransitionId = null;

    this.el = {
      minuteTens: document.getElementById('minuteTens'),
      minuteOnes: document.getElementById('minuteOnes'),
      secondTens: document.getElementById('secondTens'),
      secondOnes: document.getElementById('secondOnes'),
      timerDisplay: document.getElementById('timerDisplay'),
      statToggle: document.getElementById('statToggle'),
      modeText: document.getElementById('modeText'),
      btnStart: document.getElementById('btnStart'),
      btnPause: document.getElementById('btnPause'),
      btnReset: document.getElementById('btnReset'),
      btnSkip: document.getElementById('btnSkip'),
      btnSettings: document.getElementById('btnSettings'),
      settingsPanel: document.getElementById('settingsPanel'),
    };

    this.bindEvents();
    this.bindSettingsKeys();
    this.updateDisplay();
  }

  get totalSeconds() {
    return this.mode === Mode.WORK ? workTimeSeconds : breakTimeSeconds;
  }

  bindEvents() {
    this.el.btnStart.addEventListener('click', () => this.start());
    this.el.btnPause.addEventListener('click', () => this.pause());
    this.el.btnReset.addEventListener('click', () => this.reset());
    this.el.btnSkip.addEventListener('click', () => this.skip());
    this.el.btnSettings.addEventListener('click', () => this.toggleSettings());
    this.el.statToggle.addEventListener('click', () => this.toggleStatDisplay());
  }

  // --- UI helpers ---

  setUIForState() {
    const running = this.state === State.RUNNING;
    this.el.btnStart.style.display = running ? 'none' : '';
    this.el.btnPause.style.display = running ? '' : 'none';
    this.el.timerDisplay.classList.toggle('finished', this.state === State.FINISHED);
  }

  stopTimer() {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  cancelAutoTransition() {
    clearTimeout(this.autoTransitionId);
    this.autoTransitionId = null;
  }

  // --- stat toggle ---

  toggleStatDisplay() {
    this.showTotal = !this.showTotal;
    this.formatStatDisplay();
  }

  formatStatDisplay() {
    if (this.showTotal) {
      let t = this.totalCompletedSeconds;
      // 当前正在进行的工作周期，已耗时也计入（用原始时长，不受设置变动影响）
      if (this.mode === Mode.WORK && this.state === State.RUNNING && this.sessionWorkSeconds > 0) {
        t += Math.max(0, this.sessionWorkSeconds - this.remainingSeconds);
      }
      const h = String(Math.floor(t / 3600)).padStart(2, '0');
      const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
      const s = String(t % 60).padStart(2, '0');
      this.el.statToggle.textContent = `${h}:${m}:${s}`;
    } else {
      this.el.statToggle.textContent = `🍅 ${this.completedCount}`;
    }
  }

  // --- settings ---

  bindSettingsKeys() {
    const inputs = [
      document.getElementById('workMin'),
      document.getElementById('workSec'),
      document.getElementById('breakMin'),
      document.getElementById('breakSec'),
    ];

    inputs.forEach((input, i) => {
      input.addEventListener('keydown', (e) => {
        const cursor = input.selectionStart;
        const len = input.value.length;

        if (e.key === 'Enter') {
          e.preventDefault();
          this.applySettings();
          this.el.settingsPanel.classList.remove('open');
          return;
        }
        if (e.key === 'ArrowRight' && cursor === len && i < inputs.length - 1) {
          e.preventDefault();
          inputs[i + 1].focus();
          inputs[i + 1].select();
        }
        if (e.key === 'ArrowLeft' && cursor === 0 && i > 0) {
          e.preventDefault();
          inputs[i - 1].focus();
          inputs[i - 1].select();
        }
      });
    });
  }

  toggleSettings() {
    const isOpen = this.el.settingsPanel.classList.toggle('open');

    if (isOpen) {
      // 展开：填入当前值
      this.el.btnSettings.textContent = '确定';
      document.getElementById('workMin').value = String(Math.floor(workTimeSeconds / 60)).padStart(2, '0');
      document.getElementById('workSec').value = String(workTimeSeconds % 60).padStart(2, '0');
      document.getElementById('breakMin').value = String(Math.floor(breakTimeSeconds / 60)).padStart(2, '0');
      document.getElementById('breakSec').value = String(breakTimeSeconds % 60).padStart(2, '0');
    } else {
      // 收起：应用设置
      this.applySettings();
    }
  }

  applySettings() {
    const wm = parseInt(document.getElementById('workMin').value, 10) || 0;
    const ws = parseInt(document.getElementById('workSec').value, 10) || 0;
    const bm = parseInt(document.getElementById('breakMin').value, 10) || 0;
    const bs = parseInt(document.getElementById('breakSec').value, 10) || 0;

    let newWork = wm * 60 + ws;
    let newBreak = bm * 60 + bs;

    // 最少 1 秒，最多 99 分 59 秒
    if (newWork < 1) newWork = 1;
    if (newBreak < 1) newBreak = 1;
    if (newWork > 5999) newWork = 5999;
    if (newBreak > 5999) newBreak = 5999;

    workTimeSeconds = newWork;
    breakTimeSeconds = newBreak;

    // 如果正在工作中，已耗时计入总时长
    if (this.mode === Mode.WORK && (this.state === State.RUNNING || this.state === State.PAUSED)) {
      const elapsed = this.sessionWorkSeconds - this.remainingSeconds;
      this.totalCompletedSeconds += elapsed;
      this.sessionContribution += elapsed;
    }

    // 倒计时从新时长重新开始
    if (this.mode === Mode.WORK || this.state === State.IDLE) {
      this.mode = Mode.WORK;
      this.sessionWorkSeconds = newWork;
      this.remainingSeconds = newWork;
    } else {
      this.sessionBreakSeconds = newBreak;
      this.remainingSeconds = newBreak;
    }

    // 空闲或刚完成设置时立即更新显示
    if (this.state === State.IDLE) {
      this.mode = Mode.WORK;
      this.remainingSeconds = this.totalSeconds;
    }
    this.updateDisplay();

    this.el.btnSettings.textContent = '设置';
  }

  // --- actions ---

  start() {
    if (this.state === State.RUNNING) return;
    this.cancelAutoTransition();
    if (this.state === State.FINISHED) {
      this.switchMode();
    }
    warmupAudio(); // 在用户手势中预热 AudioContext，避免 autoplay 拦截
    // 仅在全新启动（非暂停恢复）时记录本周期原始时长
    if (this.state !== State.PAUSED) {
      this.sessionContribution = 0;
      if (this.mode === Mode.WORK) {
        this.sessionWorkSeconds = this.totalSeconds;
      } else {
        this.sessionBreakSeconds = this.totalSeconds;
      }
    }
    this.state = State.RUNNING;
    this.setUIForState();
    this.updateDisplay();
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  pause() {
    if (this.state !== State.RUNNING) return;
    this.state = State.PAUSED;
    this.setUIForState();
    this.stopTimer();
  }

  reset() {
    this.cancelAutoTransition();
    this.stopTimer();
    // 重记：放弃当前周期进度，回到本轮初始时长；总时长和番茄数不变
    this.state = State.IDLE;
    this.mode = Mode.WORK;
    this.remainingSeconds = this.totalSeconds;
    this.setUIForState();
    this.formatStatDisplay();
    this.updateDisplay();
  }

  skip() {
    this.cancelAutoTransition();
    this.stopTimer();
    // 跳过当前工作周期：已耗时计入总时长，但不增加番茄数（已完成状态已计入，跳过）
    if (this.mode === Mode.WORK && this.state !== State.FINISHED) {
      const elapsed = Math.max(0, this.sessionWorkSeconds - this.remainingSeconds);
      this.totalCompletedSeconds += elapsed;
      this.sessionContribution += elapsed;
    }
    this.switchMode();
    this.state = State.IDLE;
    this.setUIForState();
    this.formatStatDisplay();
    this.updateDisplay();
  }

  tick() {
    this.remainingSeconds--;
    if (this.remainingSeconds <= 0) {
      this.timesUp();
      return;
    }
    this.updateDisplay();
  }

  timesUp() {
    this.stopTimer();
    this.state = State.FINISHED;
    this.remainingSeconds = 0;

    // Acknowledge completed work session
    if (this.mode === Mode.WORK) {
      this.completedCount++;
      this.totalCompletedSeconds += this.sessionWorkSeconds;
      this.sessionContribution += this.sessionWorkSeconds;
    }
    this.formatStatDisplay();

    this.setUIForState();
    this.updateDisplay();
    playAlarm();

    const title = this.mode === Mode.WORK ? '🍅 工作时间结束！' : '☕ 休息时间结束！';
    const body = this.mode === Mode.WORK ? '干得好！休息一下吧~' : '休息够了，继续加油！';
    if (window.electronAPI) {
      window.electronAPI.sendNotification(title, body);
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }

    // 闪烁 5 秒后自动进入下一阶段
    this.autoTransitionId = setTimeout(() => this.start(), 5000);
  }

  switchMode() {
    this.mode = this.mode === Mode.WORK ? Mode.BREAK : Mode.WORK;
    this.remainingSeconds = this.totalSeconds;
  }

  updateDisplay() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const minStr = String(mins).padStart(2, '0');
    const secStr = String(secs).padStart(2, '0');
    this.el.minuteTens.textContent = minStr[0];
    this.el.minuteOnes.textContent = minStr[1];
    this.el.secondTens.textContent = secStr[0];
    this.el.secondOnes.textContent = secStr[1];
    this.el.modeText.textContent = MODE_LABEL[this.mode];
    if (this.showTotal) this.formatStatDisplay();
  }
}

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

const pomodoro = new PomodoroTimer();
