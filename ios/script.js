const BOARD_SIZE = 20;
const TICK_MS = 120;
const MIN_TICK_MS = 74;
const SCORE_PER_LEVEL = 5;
const STORAGE_KEY = 'snake_ios_top_scores_v1';
const GAME_OVER_ANIM_MS = 1800;
const GAME_OVER_SKIP_MS = 700;
const GLOBAL_SCORES_TABLE = 'snake_scores';
const USERNAME_MAX_LEN = 12;

const theme = {
  background: '#0b1020',
  grid: '#1b2550',
  snakeHead: '#79f2c0',
  snakeBody: '#2fd3a7',
  food: '#ff5f5f',
  text: '#ffffff',
  accent: '#ffeb3b',
};

const scoreLabel = document.getElementById('score');
const highScoreLabel = document.getElementById('highScore');
const statusLabel = document.getElementById('status');
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const canvasStartBtn = document.getElementById('canvasStartBtn');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');
const swipeZone = document.getElementById('swipeZone');
const card = document.querySelector('.card');
const dpad = document.querySelector('.dpad');
const dpadUp = document.getElementById('dpadUp');
const dpadDown = document.getElementById('dpadDown');
const dpadLeft = document.getElementById('dpadLeft');
const dpadRight = document.getElementById('dpadRight');
const nameModal = document.getElementById('nameModal');
const nameForm = document.getElementById('nameForm');
const nameInput = document.getElementById('nameInput');
const nameLimitMsg = document.getElementById('nameLimitMsg');
const nameCancelBtn = document.getElementById('nameCancelBtn');

let boardPx = 480;
let state = null;
let running = false;
let gameOver = false;
let paused = false;
let topScores = [];
let displayScore = 0;
let ticker = null;
let touchStart = null;
let gameOverAt = 0;
let audioCtx = null;
let audioMaster = null;
let audioMusicGain = null;
let audioSfxGain = null;
let audioCompressor = null;
let audioTimer = null;
let audioRecoveryTimer = null;
let currentTrack = 'none';
let audioUnlocked = false;
let audioMuted = false;
let pendingTopScore = null;
let confetti = [];
let confettiFrames = 0;
let runStartHighScore = 0;
let runTopFiveThreshold = 0;
let confettiTop5Triggered = false;
let confettiHighTriggered = false;
let backendClient = null;
let activeTickMs = TICK_MS;
let nameModalResolve = null;

function normalizePlayerName(name) {
  return String(name || '').trim().slice(0, USERNAME_MAX_LEN).toUpperCase() || 'PLAYER';
}

function isNameModalOpen() {
  return Boolean(nameModal && !nameModal.classList.contains('hidden'));
}

function currentLevel(score) {
  return Math.floor(Math.max(0, score) / SCORE_PER_LEVEL) + 1;
}

function tickMsForScore(score) {
  const level = currentLevel(score);
  return Math.max(MIN_TICK_MS, TICK_MS - (level - 1) * 6);
}

function startTicker(ms) {
  if (ticker) {
    clearInterval(ticker);
  }
  activeTickMs = ms;
  ticker = setInterval(() => {
    if (running && !paused && !gameOver) {
      step();
    }
  }, ms);
}

function syncActionButtons() {
  if (!startBtn || !pauseBtn || !restartBtn) {
    return;
  }
  const inActiveRun = running && !gameOver;
  startBtn.disabled = inActiveRun;
  pauseBtn.disabled = !state || gameOver;
  restartBtn.disabled = inActiveRun || (!state && !gameOver);
}

function setNameLimitMessage() {
  if (!nameInput || !nameLimitMsg) {
    return;
  }
  const len = nameInput.value.trim().length;
  nameLimitMsg.textContent = `${len}/${USERNAME_MAX_LEN}`;
  nameLimitMsg.classList.toggle('at-limit', len >= USERNAME_MAX_LEN);
  if (len >= USERNAME_MAX_LEN) {
    nameLimitMsg.textContent = `${len}/${USERNAME_MAX_LEN} max reached`;
  }
}

function sanitizeNameInputValue() {
  if (!nameInput) {
    return;
  }
  nameInput.value = nameInput.value.toUpperCase().slice(0, USERNAME_MAX_LEN);
  setNameLimitMessage();
}

function closeNameModal(name) {
  if (!nameModal || !nameModalResolve) {
    return;
  }
  const resolve = nameModalResolve;
  nameModalResolve = null;
  nameModal.classList.add('hidden');
  nameModal.setAttribute('aria-hidden', 'true');
  resolve(normalizePlayerName(name));
}

function requestPlayerName(suggested = 'PLAYER') {
  if (!nameModal || !nameInput || !nameForm) {
    const fallback = window.prompt(
      `Top 5 Score!\nEnter username (max ${USERNAME_MAX_LEN} chars):`,
      suggested
    );
    return Promise.resolve(normalizePlayerName(fallback || 'PLAYER'));
  }
  if (nameModalResolve) {
    closeNameModal(suggested);
  }
  return new Promise((resolve) => {
    nameModalResolve = resolve;
    nameModal.classList.remove('hidden');
    nameModal.setAttribute('aria-hidden', 'false');
    nameInput.value = normalizePlayerName(suggested);
    sanitizeNameInputValue();
    nameInput.focus();
    nameInput.select();
  });
}

function syncCanvasStartButton() {
  if (!canvasStartBtn) {
    return;
  }
  if (!state && !running && !gameOver) {
    canvasStartBtn.classList.remove('hidden');
    canvasStartBtn.style.display = '';
  } else {
    canvasStartBtn.classList.add('hidden');
    canvasStartBtn.style.display = 'none';
  }
}

function getBackendConfig() {
  const cfg = window.SNAKE_BACKEND_CONFIG || {};
  return {
    supabaseUrl: typeof cfg.supabaseUrl === 'string' ? cfg.supabaseUrl.trim() : '',
    supabaseAnonKey: typeof cfg.supabaseAnonKey === 'string' ? cfg.supabaseAnonKey.trim() : '',
  };
}

function isBackendEnabled() {
  const cfg = getBackendConfig();
  return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
}

function getBackendClient() {
  if (backendClient) {
    return backendClient;
  }
  if (!isBackendEnabled()) {
    return null;
  }
  const cfg = getBackendConfig();
  backendClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return backendClient;
}

async function fetchGlobalTopScores() {
  const client = getBackendClient();
  if (!client) {
    return null;
  }
  const { data, error } = await client
    .from(GLOBAL_SCORES_TABLE)
    .select('name,score')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(5);
  if (error || !Array.isArray(data)) {
    return null;
  }
  return data
    .map((entry) => ({
      name: normalizePlayerName(entry.name),
      score: Math.max(0, Math.floor(Number(entry.score) || 0)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function pushGlobalScore(name, score) {
  const client = getBackendClient();
  if (!client) {
    return false;
  }
  const { error } = await client.from(GLOBAL_SCORES_TABLE).insert({
    name,
    score,
  });
  return !error;
}

function ensureAudio() {
  if (audioCtx) {
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return;
  }
  audioCtx = new Ctx();
  audioCompressor = audioCtx.createDynamicsCompressor();
  audioCompressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
  audioCompressor.knee.setValueAtTime(14, audioCtx.currentTime);
  audioCompressor.ratio.setValueAtTime(8, audioCtx.currentTime);
  audioCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
  audioCompressor.release.setValueAtTime(0.16, audioCtx.currentTime);

  audioMaster = audioCtx.createGain();
  audioMaster.gain.value = audioMuted ? 0.00001 : 0.06;

  audioMusicGain = audioCtx.createGain();
  audioMusicGain.gain.value = 0.42;
  audioSfxGain = audioCtx.createGain();
  audioSfxGain.gain.value = 0.78;

  audioMusicGain.connect(audioMaster);
  audioSfxGain.connect(audioMaster);
  audioMaster.connect(audioCompressor);
  audioCompressor.connect(audioCtx.destination);
}

function syncMuteButton() {
  if (!muteBtn) {
    return;
  }
  muteBtn.textContent = audioMuted ? 'Sound Off' : 'Sound On';
}

async function unlockAudio() {
  ensureAudio();
  if (!audioCtx) {
    return;
  }
  if (audioCtx.state !== 'running') {
    try {
      await audioCtx.resume();
    } catch {
      return;
    }
  }
  audioUnlocked = true;
  syncMusicState();
}

function stopTrack() {
  if (audioTimer) {
    clearInterval(audioTimer);
    audioTimer = null;
  }
}

function playTone(freq, durationMs, type = 'square', gain = 0.9, bus = 'sfx') {
  if (!audioCtx || !audioMaster || !audioUnlocked || !freq) {
    return;
  }
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  const now = audioCtx.currentTime;
  const duration = durationMs / 1000;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.08, gain), now + 0.014);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.03, duration));
  osc.connect(amp);
  if (bus === 'music' && audioMusicGain) {
    amp.connect(audioMusicGain);
  } else if (audioSfxGain) {
    amp.connect(audioSfxGain);
  } else {
    amp.connect(audioMaster);
  }
  osc.start(now);
  osc.stop(now + duration + 0.01);
}

function startLoopTrack(trackName, notes, bpm, wave = 'square') {
  if (!audioUnlocked) {
    return;
  }
  if (currentTrack === trackName) {
    return;
  }
  stopTrack();
  currentTrack = trackName;
  const stepMs = Math.round((60000 / bpm) / 2);
  let step = 0;
  const tick = () => {
    const note = notes[step % notes.length];
    if (note > 0) {
      playTone(note, Math.max(90, stepMs - 16), wave, 0.6, 'music');
    }
    step += 1;
  };
  tick();
  audioTimer = setInterval(tick, stepMs);
}

function playGameOverJingle() {
  if (!audioUnlocked) {
    return;
  }
  stopTrack();
  currentTrack = 'gameover';
  const seq = [
    [659, 140],
    [523, 140],
    [392, 140],
    [330, 260],
    [262, 380],
  ];
  let delay = 0;
  seq.forEach(([freq, dur]) => {
    setTimeout(() => playTone(freq, dur, 'square', 1.0), delay);
    delay += dur - 20;
  });
}

function playMunchSfx() {
  if (!audioUnlocked) {
    return;
  }
  playTone(880, 70, 'square', 0.9);
  setTimeout(() => playTone(1175, 60, 'square', 0.9), 55);
}

function playStartSfx() {
  if (!audioUnlocked) {
    return;
  }
  playTone(523, 70, 'square', 0.95);
  setTimeout(() => playTone(659, 70, 'square', 0.95), 65);
  setTimeout(() => playTone(784, 95, 'square', 0.95), 130);
}

function playYaySfx(wild = false) {
  if (!audioUnlocked) {
    return;
  }
  const chirps = wild
    ? [990, 1320, 1180, 1480, 1260, 1650, 1420, 1860]
    : [990, 1320, 1180, 1480, 1260];
  if (audioCtx && audioMusicGain) {
    const now = audioCtx.currentTime;
    audioMusicGain.gain.cancelScheduledValues(now);
    audioMusicGain.gain.setValueAtTime(audioMusicGain.gain.value, now);
    audioMusicGain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    audioMusicGain.gain.exponentialRampToValueAtTime(0.42, now + (wild ? 0.5 : 0.36));
  }
  let delay = 0;
  chirps.forEach((freq, idx) => {
    const dur = wild ? 85 : 70;
    setTimeout(() => playTone(freq, dur, 'triangle', 0.95, 'sfx'), delay);
    setTimeout(() => playTone(freq * 0.5, 46, 'square', 0.42, 'sfx'), delay + 12);
    delay += idx % 2 === 0 ? 52 : 58;
  });
}

function syncMusicState() {
  if (!audioUnlocked) {
    return;
  }
  if (gameOver) {
    if (currentTrack !== 'gameover') {
      playGameOverJingle();
    }
    return;
  }
  if (running && !paused) {
    startLoopTrack(
      'game',
      [392, 0, 523, 0, 659, 523, 392, 0, 440, 0, 587, 0, 698, 587, 440, 0],
      150,
      'square'
    );
    return;
  }
  if (!running && !gameOver) {
    startLoopTrack(
      'menu',
      [262, 330, 392, 523, 392, 330, 262, 0, 294, 349, 440, 587, 440, 349, 294, 0],
      118,
      'square'
    );
    return;
  }
  stopTrack();
  currentTrack = 'none';
}

function forceMenuMusicStart() {
  if (!audioUnlocked) {
    return;
  }
  if (audioRecoveryTimer) {
    clearInterval(audioRecoveryTimer);
    audioRecoveryTimer = null;
  }
  stopTrack();
  currentTrack = 'none';

  let attempts = 0;
  const tryStart = () => {
    attempts += 1;
    if (audioCtx && audioCtx.state !== 'running') {
      audioCtx.resume().catch(() => {});
    }
    if (!running && !gameOver && !paused) {
      syncMusicState();
      if (currentTrack === 'menu') {
        if (audioRecoveryTimer) {
          clearInterval(audioRecoveryTimer);
          audioRecoveryTimer = null;
        }
        return;
      }
    }
    if (attempts >= 20 && audioRecoveryTimer) {
      clearInterval(audioRecoveryTimer);
      audioRecoveryTimer = null;
    }
  };

  tryStart();
  audioRecoveryTimer = setInterval(tryStart, 150);
}

function setMuted(nextMuted) {
  audioMuted = nextMuted;
  ensureAudio();
  if (audioMaster) {
    audioMaster.gain.value = audioMuted ? 0.00001 : 0.06;
  }
  syncMuteButton();
}

function syncViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--app-vh', `${vh}px`);
}

function toDirection(input) {
  switch (input) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    default:
      return null;
  }
}

function opposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function loadScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => {
        return (
          entry &&
          typeof entry.name === 'string' &&
          Number.isFinite(entry.score)
        );
      })
      .map((entry) => ({
        name: normalizePlayerName(entry.name),
        score: Math.max(0, Math.floor(entry.score)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function saveScores() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topScores.slice(0, 5)));
}

async function refreshTopScores() {
  const global = await fetchGlobalTopScores();
  if (global) {
    topScores = global;
    saveScores();
    updateHud();
    return;
  }
  topScores = loadScores();
  updateHud();
}

function currentHighScore() {
  return topScores[0]?.score ?? 0;
}

function updateHud() {
  scoreLabel.textContent = String(state?.score ?? displayScore);
  highScoreLabel.textContent = String(currentHighScore());
}

function isTopFive(score) {
  if (score <= 0) {
    return false;
  }
  if (topScores.length < 5) {
    return true;
  }
  return score > topScores[topScores.length - 1].score;
}

async function submitTopScore(score) {
  if (!isTopFive(score)) {
    return;
  }

  const name = await requestPlayerName('PLAYER');

  const existingIndex = topScores.findIndex((entry) => entry.name === name);
  if (existingIndex >= 0) {
    if (topScores[existingIndex].score >= score) {
      return;
    }
    topScores[existingIndex].score = score;
  } else {
    topScores.push({ name, score });
  }

  topScores = topScores.sort((a, b) => b.score - a.score).slice(0, 5);
  saveScores();
  await pushGlobalScore(name, score);
  const global = await fetchGlobalTopScores();
  if (global) {
    topScores = global;
    saveScores();
  }
  updateHud();
  syncCanvasStartButton();
}

function triggerConfetti(rank) {
  const wild = rank === 1;
  const pieces = wild ? 228 : 34;
  confettiFrames = wild ? 95 : 65;
  const colors = ['#ff5f5f', '#ffeb3b', '#79f2c0', '#4fc3f7', '#ff9f43', '#c084fc'];
  for (let i = 0; i < pieces; i += 1) {
    confetti.push({
      x: Math.random() * boardPx,
      y: Math.random() * (boardPx * 0.25),
      vx: (Math.random() - 0.5) * (wild ? 6.2 : 4.2),
      vy: Math.random() * (wild ? 3.2 : 2.2) + 0.5,
      size: Math.random() * (wild ? 6 : 4) + 2,
      life: Math.floor(Math.random() * (wild ? 80 : 50)) + (wild ? 70 : 50),
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  playYaySfx(wild);
}

function advanceConfetti() {
  if (confettiFrames > 0) {
    confettiFrames -= 1;
  }
  if (!confetti.length) {
    return;
  }
  const next = [];
  for (let i = 0; i < confetti.length; i += 1) {
    const p = confetti[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.14;
    p.life -= 1;
    if (p.life > 0 && p.y < boardPx + 24) {
      next.push(p);
    }
  }
  confetti = next;
}

function drawConfetti() {
  if (!confetti.length) {
    return;
  }
  for (let i = 0; i < confetti.length; i += 1) {
    const p = confetti[i];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
}

function emptyCells(occupied) {
  const set = new Set(occupied.map((cell) => `${cell.x},${cell.y}`));
  while (true) {
    const food = {
      x: Math.floor(Math.random() * BOARD_SIZE),
      y: Math.floor(Math.random() * BOARD_SIZE),
    };
    if (!set.has(`${food.x},${food.y}`)) {
      return food;
    }
  }
}

function startGame() {
  unlockAudio().then(() => {
    playStartSfx();
  });
  if (ticker) {
    clearInterval(ticker);
  }

  const center = {
    x: Math.floor(BOARD_SIZE / 2),
    y: Math.floor(BOARD_SIZE / 2),
  };
  const head = { ...center };
  const body = { x: center.x - 1, y: center.y };
  const direction = { x: 1, y: 0 };

  state = {
    snake: [head, body],
    direction,
    nextDirection: { ...direction },
    directionQueue: [],
    food: emptyCells([head, body]),
    score: 0,
  };

  displayScore = 0;
  running = true;
  gameOver = false;
  paused = false;
  gameOverAt = 0;
  confetti = [];
  confettiFrames = 0;
  runStartHighScore = currentHighScore();
  runTopFiveThreshold = topScores.length < 5 ? 0 : topScores[topScores.length - 1].score;
  confettiTop5Triggered = false;
  confettiHighTriggered = false;
  pauseBtn.textContent = 'Pause';
  statusLabel.textContent = 'Swipe anywhere to steer or tap the arrows';
  updateHud();
  pendingTopScore = null;
  startTicker(tickMsForScore(0));
  syncActionButtons();

  syncMusicState();
  render();
}

function endGame() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  running = false;
  gameOver = true;
  paused = false;
  gameOverAt = Date.now();
  pauseBtn.textContent = 'Pause';
  statusLabel.textContent = 'Game Over...';
  displayScore = state ? state.score : displayScore;
  pendingTopScore = state ? state.score : null;
  updateHud();
  syncActionButtons();
  syncCanvasStartButton();
  syncMusicState();
}

function returnToStartScreen() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  state = null;
  running = false;
  gameOver = false;
  paused = false;
  gameOverAt = 0;
  pendingTopScore = null;
  pauseBtn.textContent = 'Pause';
  statusLabel.textContent = 'Press Start to Play';
  updateHud();
  syncActionButtons();
  syncCanvasStartButton();
  forceMenuMusicStart();
  void refreshTopScores();
}

function finishGameOverFlow() {
  if (!gameOver) {
    return;
  }
  if (pendingTopScore !== null) {
    const scoreToSubmit = pendingTopScore;
    pendingTopScore = null;
    void submitTopScore(scoreToSubmit);
  }
  returnToStartScreen();
}

function trySkipGameOver() {
  if (!gameOver || gameOverAt <= 0) {
    return false;
  }
  if (Date.now() - gameOverAt < GAME_OVER_SKIP_MS) {
    return false;
  }
  finishGameOverFlow();
  return true;
}

function step() {
  if (!state || !running || gameOver || paused) {
    return;
  }

  if (!Array.isArray(state.directionQueue)) {
    state.directionQueue = [];
  }
  const queuedDir = state.directionQueue.length ? state.directionQueue.shift() : null;
  const dir = queuedDir || state.nextDirection || state.direction;
  const nextHead = {
    x: state.snake[0].x + dir.x,
    y: state.snake[0].y + dir.y,
  };

  if (
    nextHead.x < 0 ||
    nextHead.x >= BOARD_SIZE ||
    nextHead.y < 0 ||
    nextHead.y >= BOARD_SIZE
  ) {
    endGame();
    return;
  }

  const grows = sameCell(nextHead, state.food);
  const collisionBody = grows ? state.snake : state.snake.slice(0, -1);
  const hit = collisionBody.some((segment) => sameCell(segment, nextHead));
  if (hit) {
    endGame();
    return;
  }

  const nextSnake = [nextHead, ...state.snake];
  if (!grows) {
    nextSnake.pop();
  }

  state.snake = nextSnake;
  state.direction = dir;
  state.nextDirection = state.directionQueue.length ? state.directionQueue[0] : dir;

  if (grows) {
    playMunchSfx();
    state.score += 1;
    displayScore = state.score;
    state.food = emptyCells(state.snake);
    const nextTickMs = tickMsForScore(state.score);
    if (nextTickMs !== activeTickMs) {
      startTicker(nextTickMs);
      statusLabel.textContent = `LEVEL ${currentLevel(state.score)} SPEED UP`;
    }
    if (!confettiHighTriggered && state.score > runStartHighScore) {
      triggerConfetti(1);
      confettiHighTriggered = true;
      statusLabel.textContent = 'NEW #1 HIGH SCORE!';
    } else if (
      !confettiTop5Triggered &&
      state.score > runTopFiveThreshold &&
      state.score <= runStartHighScore
    ) {
      triggerConfetti(3);
      confettiTop5Triggered = true;
      statusLabel.textContent = 'TOP 5 SCORE!';
    } else if (state.score > currentHighScore()) {
      statusLabel.textContent = 'New High Score';
    }
  }

  updateHud();
}

function setDirection(input) {
  if (!state || gameOver || !running) {
    return;
  }

  const requested = toDirection(input);
  if (!requested) {
    return;
  }
  if (!Array.isArray(state.directionQueue)) {
    state.directionQueue = [];
  }

  const lastIntended = state.directionQueue.length
    ? state.directionQueue[state.directionQueue.length - 1]
    : state.direction;
  if (opposite(requested, lastIntended)) {
    return;
  }
  const duplicate = lastIntended.x === requested.x && lastIntended.y === requested.y;
  if (!duplicate && state.directionQueue.length < 2) {
    state.directionQueue.push(requested);
    state.nextDirection = state.directionQueue[0];
  }
}

function getCellSize() {
  return boardPx / BOARD_SIZE;
}

function drawGrid() {
  const cell = getCellSize();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, boardPx, boardPx);

  ctx.strokeStyle = theme.grid;
  for (let i = 0; i <= BOARD_SIZE; i += 1) {
    const p = i * cell;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, boardPx);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(boardPx, p);
    ctx.stroke();
  }

  ctx.strokeStyle = theme.snakeBody;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, boardPx - 2, boardPx - 2);
}

function drawCell(cell, color) {
  const size = getCellSize();
  ctx.fillStyle = color;
  ctx.fillRect(cell.x * size, cell.y * size, size, size);
}

function drawStartScreen() {
  const center = boardPx / 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(boardPx * 0.078)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText('S N A K E', center, boardPx * 0.24);

  ctx.fillStyle = theme.snakeHead;
  ctx.font = `bold ${Math.round(boardPx * 0.032)}px Courier New`;
  ctx.fillText('by CHRIS GOYETTE', center, boardPx * 0.30);

  drawStartLeaderboardPanel();
}

function drawStartLeaderboardPanel() {
  const panelW = boardPx * 0.86;
  const panelH = boardPx * 0.36;
  const x0 = (boardPx - panelW) / 2;
  const y0 = boardPx * 0.56;
  const x1 = x0 + panelW;
  const y1 = y0 + panelH;

  ctx.fillStyle = '#0e1630';
  ctx.strokeStyle = theme.snakeHead;
  ctx.lineWidth = 1;
  ctx.fillRect(x0, y0, panelW, panelH);
  ctx.strokeRect(x0, y0, panelW, panelH);

  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${Math.round(boardPx * 0.05)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText('LEADERBOARD', boardPx / 2, y0 + boardPx * 0.08);

  if (!topScores.length) {
    ctx.fillStyle = theme.text;
    ctx.font = `${Math.round(boardPx * 0.043)}px Courier New`;
    ctx.fillText('NO SCORES YET', boardPx / 2, y0 + panelH * 0.62);
    return;
  }

  const visible = topScores.slice(0, 5);
  visible.forEach((entry, index) => {
    const y = y0 + boardPx * 0.145 + index * boardPx * 0.046;
    ctx.fillStyle = theme.text;
    ctx.font = `${Math.round(boardPx * 0.043)}px Courier New`;
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}. ${entry.name}`, x0 + 10, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.snakeHead;
    ctx.fillText(String(entry.score), x1 - 10, y);
  });
}

function drawGameOver(elapsedMs) {
  const progress = Math.min(1, elapsedMs / GAME_OVER_ANIM_MS);
  const centerY = boardPx / 2;
  const maxBand = boardPx / 2;
  const band = Math.min(maxBand, progress * (boardPx * 0.65));
  const pulse = Math.floor(Date.now() / 140) % 2 === 0;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, boardPx, Math.max(0, centerY - band));
  ctx.fillRect(0, Math.min(boardPx, centerY + band), boardPx, boardPx - (centerY + band));

  ctx.fillStyle = pulse ? theme.food : theme.accent;
  ctx.font = `bold ${Math.round(boardPx * 0.08)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', boardPx / 2, centerY - 26);

  ctx.fillStyle = theme.text;
  ctx.font = `bold ${Math.round(boardPx * 0.03)}px Courier New`;
  ctx.fillText(elapsedMs >= GAME_OVER_SKIP_MS ? 'TAP TO CONTINUE' : 'GET READY...', boardPx / 2, centerY + 8);
}

function drawPausedOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.66)';
  ctx.fillRect(0, 0, boardPx, boardPx);
  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${Math.round(boardPx * 0.075)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', boardPx / 2, boardPx / 2 - 8);
}

function render() {
  syncCanvasStartButton();
  drawGrid();

  if (!state || (!running && !gameOver)) {
    drawStartScreen();
    return;
  }

  drawCell(state.food, theme.food);
  state.snake.forEach((segment, index) => {
    drawCell(segment, index === 0 ? theme.snakeHead : theme.snakeBody);
  });

  if (paused && !gameOver) {
    drawPausedOverlay();
  }

  if (gameOver) {
    drawGameOver(Date.now() - gameOverAt);
  }

  drawConfetti();
}

function handleStartEnd() {
  if (gameOver) {
    statusLabel.textContent = 'Tap Restart';
  }
}

function renderLoop() {
  if (gameOver && gameOverAt > 0 && Date.now() - gameOverAt >= GAME_OVER_ANIM_MS) {
    finishGameOverFlow();
  }
  advanceConfetti();
  render();
  requestAnimationFrame(renderLoop);
}

function handleTouchStart(event) {
  if (!event.changedTouches[0]) {
    return;
  }
  if (shouldIgnoreSwipeTarget(event.target)) {
    touchStart = null;
    return;
  }
  if (event.cancelable) {
    event.preventDefault();
  }
  const touch = event.changedTouches[0];
  touchStart = {
    x: touch.clientX,
    y: touch.clientY,
  };
}

function handleTouchMove(event) {
  if (!touchStart) {
    return;
  }
  if (event.cancelable) {
    event.preventDefault();
  }
}

function preventPagePan(event) {
  if (event.cancelable) {
    event.preventDefault();
  }
}

function handleTouchEnd(event) {
  if (trySkipGameOver()) {
    return;
  }
  if (!touchStart || !event.changedTouches[0]) {
    return;
  }
  event.preventDefault();

  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  touchStart = null;

  if (Math.max(absX, absY) < 16) {
    return;
  }

  const swipeDirection = absX > absY
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');

  setDirection(swipeDirection);
}

function handleKeyDown(event) {
  if (!event) {
    return;
  }

  if (isNameModalOpen()) {
    if (event.key === 'Escape') {
      closeNameModal('PLAYER');
    }
    return;
  }

  const lowered = event.key.toLowerCase();
  if ((event.key === ' ' || lowered === 'enter') && trySkipGameOver()) {
    return;
  }

  if (!state && event.key === 'Enter') {
    startGame();
    return;
  }

  if (!state && !gameOver && event.key === ' ') {
    return;
  }

  switch (lowered) {
    case 'arrowup':
    case 'w':
      setDirection('up');
      break;
    case 'arrowdown':
    case 's':
      setDirection('down');
      break;
    case 'arrowleft':
    case 'a':
      setDirection('left');
      break;
    case 'arrowright':
    case 'd':
      setDirection('right');
      break;
    case ' ':
      togglePause();
      break;
    case 'enter':
      startGame();
      break;
    default:
      break;
  }
}

function shouldIgnoreSwipeTarget(target) {
  if (!target) {
    return false;
  }
  return Boolean(target.closest('button, input, textarea, select, a, .name-modal-card'));
}

function bindDpadButton(button, direction) {
  if (!button) {
    return;
  }
  const steer = (event) => {
    if (event && event.cancelable) {
      event.preventDefault();
    }
    setDirection(direction);
  };
  button.addEventListener('click', steer);
  button.addEventListener('touchstart', steer, { passive: false });
}

function directionFromPadPoint(clientX, clientY, rect) {
  const relX = clientX - (rect.left + rect.width / 2);
  const relY = clientY - (rect.top + rect.height / 2);
  if (Math.abs(relX) >= Math.abs(relY)) {
    return relX >= 0 ? 'right' : 'left';
  }
  return relY >= 0 ? 'down' : 'up';
}

function handleDpadZoneTap(event) {
  if (!dpad) {
    return;
  }
  if (event.target && event.target.closest('.dpad-btn')) {
    return;
  }
  let point = null;
  if (event.changedTouches && event.changedTouches[0]) {
    point = event.changedTouches[0];
  } else if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    point = event;
  }
  if (!point) {
    return;
  }
  if (event.cancelable) {
    event.preventDefault();
  }
  const rect = dpad.getBoundingClientRect();
  const direction = directionFromPadPoint(point.clientX, point.clientY, rect);
  setDirection(direction);
}

function togglePause() {
  if (!state || gameOver) {
    statusLabel.textContent = 'Start game first.';
    return;
  }
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  statusLabel.textContent = paused ? 'PAUSED' : 'Running';
  syncActionButtons();
  syncMusicState();
}

function fitCanvas() {
  const width = canvas.clientWidth;
  if (!width) {
    return;
  }
  boardPx = width;
  canvas.width = width;
  canvas.height = width;
  ctx.imageSmoothingEnabled = false;
  render();
}

function attachControls() {
  startBtn.addEventListener('click', startGame);
  canvasStartBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', togglePause);
  muteBtn.addEventListener('click', () => {
    setMuted(!audioMuted);
  });

  const touchArea = card || canvas || swipeZone;
  touchArea.addEventListener('touchstart', handleTouchStart, { passive: false });
  touchArea.addEventListener('touchmove', handleTouchMove, { passive: false });
  touchArea.addEventListener('touchend', handleTouchEnd, { passive: false });
  bindDpadButton(dpadUp, 'up');
  bindDpadButton(dpadDown, 'down');
  bindDpadButton(dpadLeft, 'left');
  bindDpadButton(dpadRight, 'right');
  if (dpad) {
    dpad.addEventListener('click', handleDpadZoneTap);
    dpad.addEventListener('touchstart', handleDpadZoneTap, { passive: false });
  }
  document.body.addEventListener('touchmove', preventPagePan, { passive: false });
  document.addEventListener('touchmove', preventPagePan, { passive: false });
  window.addEventListener('keydown', handleKeyDown);

  if (nameInput) {
    nameInput.addEventListener('input', sanitizeNameInputValue);
  }
  if (nameForm) {
    nameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      closeNameModal(nameInput ? nameInput.value : 'PLAYER');
    });
  }
  if (nameCancelBtn) {
    nameCancelBtn.addEventListener('click', () => {
      closeNameModal('PLAYER');
    });
  }
  if (nameModal) {
    nameModal.addEventListener('click', (event) => {
      if (event.target === nameModal) {
        closeNameModal('PLAYER');
      }
    });
  }
  window.addEventListener('resize', () => {
    syncViewportHeight();
    fitCanvas();
  });
  window.addEventListener('orientationchange', () => {
    syncViewportHeight();
    fitCanvas();
  });
  window.addEventListener('pageshow', () => {
    syncViewportHeight();
    fitCanvas();
    syncMusicState();
  });

  const unlockOnce = () => {
    unlockAudio();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('touchstart', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
  };
  document.addEventListener('pointerdown', unlockOnce, { passive: true });
  document.addEventListener('touchstart', unlockOnce, { passive: true });
  document.addEventListener('keydown', unlockOnce);
}

async function init() {
  syncViewportHeight();
  topScores = loadScores();
  updateHud();
  await refreshTopScores();
  syncCanvasStartButton();
  syncMuteButton();
  attachControls();
  syncActionButtons();
  fitCanvas();
  syncMusicState();
  render();
  renderLoop();
}

void init();
