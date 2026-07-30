const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const finalScoreEl = document.getElementById('finalScore');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const restartBtn = document.getElementById('restartBtn');

const GRID_SIZE = 25;
const CELL_SIZE = canvas.width / GRID_SIZE;
const INITIAL_SPEED = 130;
const SPEED_INCREMENT = 2;
const MIN_SPEED = 60;

let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let score = 0;
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
let gameLoop = null;
let currentSpeed = INITIAL_SPEED;
let isPaused = false;
let isGameOver = false;

const COLORS = {
  bg: '#0f0f1a',
  grid: '#1a1a3a',
  snakeHead: '#00d4aa',
  snakeBody: '#00a3e0',
  snakeTail: '#007acc',
  food: '#ff6b6b',
  foodGlow: '#ff4757'
};

highScoreEl.textContent = highScore;

function initGame() {
  snake = [
    { x: 12, y: 12 },
    { x: 11, y: 12 },
    { x: 10, y: 12 }
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  currentSpeed = INITIAL_SPEED;
  isGameOver = false;
  isPaused = false;
  scoreEl.textContent = '0';
  spawnFood();
  overlay.classList.add('hidden');
  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(gameStep, currentSpeed);
}

function spawnFood() {
  let newFood;
  do {
    newFood = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE)
    };
  } while (snake.some(seg => seg.x === newFood.x && seg.y === newFood.y));
  food = newFood;
}

function gameStep() {
  if (isPaused || isGameOver) return;
  
  direction = { ...nextDirection };
  
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  
  if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
    return gameOver();
  }
  
  if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
    return gameOver();
  }
  
  snake.unshift(head);
  
  if (head.x === food.x && head.y === food.y) {
    score += 10;
    scoreEl.textContent = score;
    currentSpeed = Math.max(MIN_SPEED, currentSpeed - SPEED_INCREMENT);
    clearInterval(gameLoop);
    gameLoop = setInterval(gameStep, currentSpeed);
    spawnFood();
  } else {
    snake.pop();
  }
  
  draw();
}

function gameOver() {
  isGameOver = true;
  clearInterval(gameLoop);
  
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('snakeHighScore', highScore);
    highScoreEl.textContent = highScore;
  }
  
  finalScoreEl.textContent = score;
  overlayTitle.textContent = 'Game Over';
  overlay.classList.remove('hidden');
}

function draw() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(canvas.width, i * CELL_SIZE);
    ctx.stroke();
  }
  
  const foodX = food.x * CELL_SIZE + CELL_SIZE / 2;
  const foodY = food.y * CELL_SIZE + CELL_SIZE / 2;
  const foodRadius = CELL_SIZE * 0.35;
  
  const gradient = ctx.createRadialGradient(foodX, foodY, 0, foodX, foodY, foodRadius);
  gradient.addColorStop(0, COLORS.foodGlow);
  gradient.addColorStop(1, COLORS.food);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(foodX, foodY, foodRadius, 0, Math.PI * 2);
  ctx.fill();
  
  snake.forEach((seg, i) => {
    const x = seg.x * CELL_SIZE;
    const y = seg.y * CELL_SIZE;
    const padding = 1.5;
    const radius = 4;
    
    if (i === 0) {
      ctx.fillStyle = COLORS.snakeHead;
    } else if (i === snake.length - 1) {
      ctx.fillStyle = COLORS.snakeTail;
    } else {
      const ratio = i / (snake.length - 1);
      const r = Math.round(0 + (0 - 0) * ratio);
      const g = Math.round(212 + (163 - 212) * ratio);
      const b = Math.round(170 + (192 - 170) * ratio);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    }
    
    roundRect(ctx, x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2, radius);
    ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function handleKeydown(e) {
  const key = e.key.toLowerCase();
  
  if (key === ' ') {
    e.preventDefault();
    if (!isGameOver) {
      isPaused = !isPaused;
      overlayTitle.textContent = isPaused ? 'Paused' : 'Game Over';
      overlay.classList.toggle('hidden', !isPaused);
    }
    return;
  }
  
  const dirMap = {
    'arrowup': { x: 0, y: -1 }, 'w': { x: 0, y: -1 },
    'arrowdown': { x: 0, y: 1 }, 's': { x: 0, y: 1 },
    'arrowleft': { x: -1, y: 0 }, 'a': { x: -1, y: 0 },
    'arrowright': { x: 1, y: 0 }, 'd': { x: 1, y: 0 }
  };
  
  if (dirMap[key]) {
    e.preventDefault();
    const newDir = dirMap[key];
    if (newDir.x !== -direction.x || newDir.y !== -direction.y) {
      nextDirection = newDir;
    }
  }
  
  if ((key === 'enter' || key === ' ') && isGameOver) {
    initGame();
  }
}

restartBtn.addEventListener('click', initGame);
document.addEventListener('keydown', handleKeydown);

initGame();