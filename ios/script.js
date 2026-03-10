const BOARD_SIZE = 20;
const TICK_MS = 120;
const STORAGE_KEY = 'snake_ios_top_scores_v1';

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
const leaderboardEl = document.getElementById('leaderboard');
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const resetBtn = document.getElementById('resetBtn');
const card = document.querySelector('.card');

let boardPx = 480;
let state = null;
let running = false;
let gameOver = false;
let paused = false;
let topScores = [];
let ticker = null;
let touchStart = null;

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
        name: entry.name.trim().slice(0, 12) || 'PLAYER',
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

function renderLeaderboard() {
  leaderboardEl.innerHTML = '';
  if (!topScores.length) {
    const li = document.createElement('li');
    li.textContent = 'NO SCORES YET';
    leaderboardEl.appendChild(li);
    return;
  }

  for (const entry of topScores) {
    const li = document.createElement('li');
    li.textContent = `${entry.name} — ${entry.score}`;
    leaderboardEl.appendChild(li);
  }
}

function currentHighScore() {
  return topScores[0]?.score ?? 0;
}

function updateHud() {
  scoreLabel.textContent = String(state?.score ?? 0);
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

function submitTopScore(score) {
  if (!isTopFive(score)) {
    return;
  }

  let name = window.prompt('Top 5 Score!\nEnter username (max 12 chars):', 'PLAYER');
  if (name === null) {
    name = 'PLAYER';
  }
  name = name.trim().slice(0, 12).toUpperCase() || 'PLAYER';

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
  renderLeaderboard();
  updateHud();
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
    food: emptyCells([head, body]),
    score: 0,
  };

  running = true;
  gameOver = false;
  paused = false;
  pauseBtn.textContent = 'Pause';
  statusLabel.textContent = 'Use swipe to steer';
  updateHud();

  ticker = setInterval(() => {
    if (running && !paused && !gameOver) {
      step();
    }
  }, TICK_MS);

  render();
}

function endGame() {
  running = false;
  gameOver = true;
  pauseBtn.textContent = 'Pause';
  statusLabel.textContent = 'Game Over';
  updateHud();
  submitTopScore(state.score);
}

function step() {
  if (!state || !running || gameOver || paused) {
    return;
  }

  const dir = state.nextDirection || state.direction;
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
  state.nextDirection = dir;

  if (grows) {
    state.score += 1;
    state.food = emptyCells(state.snake);
    if (state.score > currentHighScore()) {
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
  if (!opposite(requested, state.direction)) {
    state.nextDirection = requested;
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
  const blink = Math.floor(Date.now() / 900) % 2 === 0;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(boardPx * 0.078)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText('S N A K E', center, boardPx * 0.30);

  ctx.fillStyle = theme.snakeHead;
  ctx.font = `bold ${Math.round(boardPx * 0.032)}px Courier New`;
  ctx.fillText('by CHRIS GOYETTE', center, boardPx * 0.37);

  if (blink) {
    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${Math.round(boardPx * 0.032)}px Courier New`;
    ctx.fillText('PRESS START TO PLAY', center, boardPx * 0.45);
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.66)';
  ctx.fillRect(0, 0, boardPx, boardPx);

  const phase = Math.floor(Date.now() / 120) % 2 === 0;
  ctx.fillStyle = phase ? theme.food : theme.accent;
  ctx.font = `bold ${Math.round(boardPx * 0.075)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', boardPx / 2, boardPx / 2 - 12);

  ctx.fillStyle = theme.text;
  ctx.font = `bold ${Math.round(boardPx * 0.036)}px Courier New`;
  ctx.fillText('GAME SAVED', boardPx / 2, boardPx / 2 + 18);
}

function render() {
  drawGrid();

  if (!state || (!running && !gameOver)) {
    drawStartScreen();
    return;
  }

  drawCell(state.food, theme.food);
  state.snake.forEach((segment, index) => {
    drawCell(segment, index === 0 ? theme.snakeHead : theme.snakeBody);
  });

  if (gameOver) {
    drawGameOver();
  }
}

function handleStartEnd() {
  if (gameOver) {
    statusLabel.textContent = 'Tap Restart';
  }
}

function renderLoop() {
  render();
  requestAnimationFrame(renderLoop);
}

function handleTouchStart(event) {
  if (!event.changedTouches[0]) {
    return;
  }
  if (event.target.closest && event.target.closest('.btn')) {
    return;
  }
  event.preventDefault();
  const touch = event.changedTouches[0];
  touchStart = {
    x: touch.clientX,
    y: touch.clientY,
  };
}

function handleTouchMove(event) {
  event.preventDefault();
}

function preventPagePan(event) {
  if (event.cancelable) {
    event.preventDefault();
  }
}

function handleTouchEnd(event) {
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

  if (!state && !running && !gameOver) {
    startGame();
  }

  setDirection(swipeDirection);
}

function handleKeyDown(event) {
  if (!event) {
    return;
  }

  if (!state && event.key === 'Enter') {
    startGame();
    return;
  }

  if (!state && !gameOver && event.key === ' ') {
    return;
  }

  switch (event.key.toLowerCase()) {
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

function togglePause() {
  if (!state || gameOver) {
    statusLabel.textContent = 'Start game first.';
    return;
  }
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  statusLabel.textContent = paused ? 'Paused' : 'Running';
}

function resetScores() {
  topScores = [];
  saveScores();
  renderLeaderboard();
  updateHud();
  statusLabel.textContent = 'Scores reset';
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
  restartBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', togglePause);
  resetBtn.addEventListener('click', resetScores);

  const touchArea = card || canvas;
  touchArea.addEventListener('touchstart', handleTouchStart, { passive: false });
  touchArea.addEventListener('touchmove', handleTouchMove, { passive: false });
  touchArea.addEventListener('touchend', handleTouchEnd, { passive: false });
  document.body.addEventListener('touchmove', preventPagePan, { passive: false });
  document.addEventListener('touchmove', preventPagePan, { passive: false });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', fitCanvas);
}

function init() {
  topScores = loadScores();
  renderLeaderboard();
  updateHud();
  attachControls();
  fitCanvas();
  render();
  renderLoop();
}

init();
