
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
      const b = Math.round(170 + (224 - 170) * ratio);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    }
    
    roundRect(ctx, x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2, radius);
    ctx.fill();
  });
function handleKeydown(e) {
  const key = e.key.toLowerCase();
  
  if (key === ' ') {
    e.preventDefault();
    if (isGameOver) {
      initGame();
    } else {
      isPaused = !isPaused;
      if (isPaused) {
        overlayTitle.textContent = 'Paused';
        finalScoreEl.textContent = score;
        document.querySelector('.overlay-content p').innerHTML = 'Current Score: <span id="finalScore">' + score + '</span>';
        restartBtn.textContent = 'Resume';
      } else {
        overlayTitle.textContent = 'Game Over';
        document.querySelector('.overlay-content p').innerHTML = 'Final Score: <span id="finalScore">' + score + '</span>';
        restartBtn.textContent = 'Play Again';
      }
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
  
  if (key === 'enter' && isGameOver) {
    initGame();
  }
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
  document.querySelector('.overlay-content p').innerHTML = 'Final Score: <span id="finalScore">' + score + '</span>';
  restartBtn.textContent = 'Play Again';
  overlay.classList.remove('hidden');
}