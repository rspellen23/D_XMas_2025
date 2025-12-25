(() => {
  const canvas = document.getElementById('playfield');
  const ctx = canvas.getContext('2d');

  const startBtn = document.getElementById('startRun');
  const startMenuBtn = document.getElementById('startGame');
  const restartBtn = document.getElementById('restartButton');
  const toggleAudioBtn = document.getElementById('toggleAudio');
  const themeToggleBtn = document.getElementById('themeToggle');
  const startMenuEl = document.getElementById('startMenu');
  const cutsceneEl = document.getElementById('cutscene');
  const overlayEl = document.getElementById('overlay');
  const messageEl = document.getElementById('message');

  const scoreEl = document.getElementById('scoreDisplay');
  const movesEl = document.getElementById('livesDisplay');
  const linksEl = document.getElementById('waveDisplay');
  const timeEl = document.getElementById('channelDisplay');

  const textures = { aesSedai: null, warder: null, trolloc: null };

  const TILE_SIZE = 80;

  const state = {
    started: false,
    finished: false,
    score: 0,
    moves: 0,
    links: 0,
    time: 0,
    grid: [],
    rows: 6,
    cols: 6,
    startCell: { r: 3, c: 0 },
    goalCell: { r: 3, c: 5 },
    particles: [],
    soundOn: true
  };

  // roundRect fallback for older browsers
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const radius = typeof r === 'number' ? r : 0;
      this.beginPath();
      this.moveTo(x + radius, y);
      this.lineTo(x + w - radius, y);
      this.quadraticCurveTo(x + w, y, x + w, y + radius);
      this.lineTo(x + w, y + h - radius);
      this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      this.lineTo(x + radius, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - radius);
      this.lineTo(x, y + radius);
      this.quadraticCurveTo(x, y, x + radius, y);
    };
  }

  // bitmask edges: top=1, right=2, bottom=4, left=8
  const tileLibrary = {
    straight: { mask: 1 | 4, color: '#e23c64' }, // vertical, rotates to horizontal
    curve: { mask: 1 | 2, color: '#0e7c4b' },
    tee: { mask: 1 | 2 | 8, color: '#f0c35b' },
    cross: { mask: 1 | 2 | 4 | 8, color: '#f7f7fb' }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function playTone(freq = 440, duration = 0.1) {
    if (!state.soundOn || typeof AudioContext === 'undefined') return;
    const ctxAudio = new AudioContext();
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.frequency.value = freq;
    osc.type = 'triangle';
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + duration);
    osc.stop(ctxAudio.currentTime + duration);
    setTimeout(() => ctxAudio.close(), 200);
  }

  function rotateMask(mask, times = 1) {
    let m = mask;
    for (let i = 0; i < times; i++) {
      const top = m & 1;
      const right = m & 2;
      const bottom = m & 4;
      const left = m & 8;
      m = 0;
      if (left) m |= 1; // left becomes top
      if (top) m |= 2; // top becomes right
      if (right) m |= 4; // right becomes bottom
      if (bottom) m |= 8; // bottom becomes left
    }
    return m;
  }

  function randomTile() {
    const keys = ['straight', 'curve', 'tee'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const rot = Math.floor(Math.random() * 4);
    return { type: key, rot };
  }

  function buildGrid() {
    state.grid = [];
    for (let r = 0; r < state.rows; r++) {
      const row = [];
      for (let c = 0; c < state.cols; c++) {
        row.push(randomTile());
      }
      state.grid.push(row);
    }
    // lay guaranteed path on middle row from start to goal (horizontal straights)
    for (let c = 0; c < state.cols; c++) {
      const tile = state.grid[state.startCell.r][c];
      tile.type = 'straight';
      tile.rot = 1; // horizontal
    }
    // start tile as tee open right
    state.grid[state.startCell.r][state.startCell.c] = { type: 'tee', rot: 1 }; // open right/bottom/top
    // goal tile as tee open left
    state.grid[state.goalCell.r][state.goalCell.c] = { type: 'tee', rot: 3 }; // open left/top/bottom
    // scramble: rotate random tiles
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const tile = state.grid[r][c];
        tile.rot = Math.floor(Math.random() * 4);
      }
    }
    state.moves = 0;
    state.links = 0;
    state.time = 0;
    state.finished = false;
  }

  function tileMask(tile) {
    const base = tileLibrary[tile.type].mask;
    return rotateMask(base, tile.rot);
  }

  function isConnected(mask, dir) {
    return (mask & dir) !== 0;
  }

  function checkSolved() {
    const visited = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
    const queue = [[state.startCell.r, state.startCell.c]];
    visited[state.startCell.r][state.startCell.c] = true;
    let reached = false;
    let linkCount = 0;

    const dirs = [
      { dr: -1, dc: 0, bit: 1, opp: 4 },
      { dr: 0, dc: 1, bit: 2, opp: 8 },
      { dr: 1, dc: 0, bit: 4, opp: 1 },
      { dr: 0, dc: -1, bit: 8, opp: 2 }
    ];

    while (queue.length) {
      const [r, c] = queue.shift();
      linkCount += 1;
      const mask = tileMask(state.grid[r][c]);
      for (const d of dirs) {
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
        const nMask = tileMask(state.grid[nr][nc]);
        if (isConnected(mask, d.bit) && isConnected(nMask, d.opp) && !visited[nr][nc]) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }

    state.links = linkCount;
    if (visited[state.goalCell.r][state.goalCell.c]) {
      state.finished = true;
      state.score = Math.max(0, 1000 - state.moves * 5 - Math.floor(state.time) * 2);
      cutsceneEl.style.display = 'flex';
      playTone(800, 0.2);
      messageEl.textContent = 'Path complete! Their vow shines through the snow.';
      overlayEl.style.pointerEvents = 'auto';
    }
  }

  function resetGame() {
    state.started = false;
    state.finished = false;
    state.score = 0;
    state.moves = 0;
    state.links = 0;
    state.time = 0;
    state.grid = [];
    state.particles = [];
    startMenuEl.style.display = 'flex';
    cutsceneEl.style.display = 'none';
    messageEl.textContent = 'Begin when ready.';
    overlayEl.style.pointerEvents = 'none';
    updateStats();
  }

  function startGame() {
    if (state.finished) return;
    state.started = true;
    state.finished = false;
    state.score = 0;
    state.moves = 0;
    state.links = 0;
    state.time = 0;
    state.particles = [];
    buildGrid();
    startMenuEl.style.display = 'none';
    cutsceneEl.style.display = 'none';
    overlayEl.style.pointerEvents = 'none';
    messageEl.textContent = 'Rotate tiles to connect Deedra to Ray.';
    updateStats();
  }

  function handleClick(evt) {
    if (!state.started || state.finished) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
    const tile = state.grid[r][c];
    tile.rot = (tile.rot + 1) % 4;
    state.moves += 1;
    playTone(520, 0.08);
    checkSolved();
    updateStats();
  }

  function spawnHit(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 80;
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.5 + Math.random() * 0.4,
        color
      });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 20 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function drawBackground(ts) {
    ctx.fillStyle = '#0a0a0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, 'rgba(176,0,47,0.16)');
    grad.addColorStop(0.5, 'rgba(14,124,75,0.18)');
    grad.addColorStop(1, 'rgba(240,195,91,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += TILE_SIZE) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += TILE_SIZE) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    // snowfall
    for (let i = 0; i < 60; i++) {
      const x = (i * 71 + ts * 0.02) % canvas.width;
      const y = (i * 37 + ts * 0.04) % canvas.height;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawTile(r, c, tile, connected) {
    const x = c * TILE_SIZE;
    const y = r * TILE_SIZE;
    const mask = tileMask(tile);
    const lib = tileLibrary[tile.type];
    const baseColor = connected ? '#f0c35b' : lib.color;
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#0a0a0d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 12, 10);
    ctx.fill();
    ctx.stroke();
    // channels
    ctx.strokeStyle = '#f7f7fb';
    ctx.lineWidth = 10;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;
    ctx.beginPath();
    if (mask & 1) {
      ctx.moveTo(cx, y + 8);
      ctx.lineTo(cx, cy);
    }
    if (mask & 2) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(x + TILE_SIZE - 8, cy);
    }
    if (mask & 4) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, y + TILE_SIZE - 8);
    }
    if (mask & 8) {
      ctx.moveTo(x + 8, cy);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    // outline for cel-shade
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
  }

  function drawCharacters() {
    const startX = state.startCell.c * TILE_SIZE + TILE_SIZE * 0.2;
    const startY = state.startCell.r * TILE_SIZE + TILE_SIZE * 1.1;
    const goalX = state.goalCell.c * TILE_SIZE + TILE_SIZE * 0.8;
    const goalY = state.goalCell.r * TILE_SIZE + TILE_SIZE * 1.1;

    if (textures.aesSedai) {
      const img = textures.aesSedai;
      const scale = (TILE_SIZE * 2.5) / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, startX - w * 0.4, startY - h + 20, w, h);
    }
    if (textures.warder) {
      const img = textures.warder;
      const scale = (TILE_SIZE * 2.5) / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, goalX - w * 0.6, goalY - h + 20, w, h);
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawUI() {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 16px Space Grotesk, sans-serif';
    ctx.fillText(`Moves: ${state.moves}`, 14, 22);
    ctx.fillText(`Links: ${state.links}`, 14, 44);
    ctx.fillText(`Time: ${Math.floor(state.time)}s`, 14, 66);
    ctx.fillText(`Score: ${Math.round(state.score)}`, 14, 88);
  }

  function drawGridConnections() {
    const connected = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
    const queue = [[state.startCell.r, state.startCell.c]];
    connected[state.startCell.r][state.startCell.c] = true;
    const dirs = [
      { dr: -1, dc: 0, bit: 1, opp: 4 },
      { dr: 0, dc: 1, bit: 2, opp: 8 },
      { dr: 1, dc: 0, bit: 4, opp: 1 },
      { dr: 0, dc: -1, bit: 8, opp: 2 }
    ];
    while (queue.length) {
      const [r, c] = queue.shift();
      const mask = tileMask(state.grid[r][c]);
      for (const d of dirs) {
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
        const nMask = tileMask(state.grid[nr][nc]);
        if (isConnected(mask, d.bit) && isConnected(nMask, d.opp) && !connected[nr][nc]) {
          connected[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
    return connected;
  }

  function drawBoard(ts) {
    drawBackground(ts);
    const connected = state.grid.length ? drawGridConnections() : [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        drawTile(r, c, state.grid[r][c], connected[r]?.[c]);
      }
    }
    drawCharacters();
    drawParticles();
    drawUI();
  }

  function loadTexture(key, path) {
    const img = new Image();
    img.src = path;
    img.onload = () => {
      textures[key] = img;
    };
    img.onerror = () => {
      textures[key] = null;
    };
  }

  function loadAllTextures() {
    loadTexture('aesSedai', 'assets/deedra.png');
    loadTexture('warder', 'assets/ray.png');
    loadTexture('trolloc', 'assets/trolloc.png');
  }

  function update(dt) {
    if (state.started && !state.finished) {
      state.time += dt;
    }
    updateParticles(dt);
    updateStats();
  }

  function gameLoop(ts) {
    const now = ts || performance.now();
    const dt = Math.min(0.05, (now - (gameLoop.last || now)) / 1000);
    gameLoop.last = now;
    update(dt);
    drawBoard(now);
    requestAnimationFrame(gameLoop);
  }

  function initEvents() {
    toggleAudioBtn.addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      toggleAudioBtn.textContent = `SFX: ${state.soundOn ? 'On' : 'Off'}`;
    });
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('theme-light');
      const lightOn = document.body.classList.contains('theme-light');
      themeToggleBtn.textContent = lightOn ? 'Switch to Dark' : 'Switch to Light';
    });
    startBtn.addEventListener('click', startGame);
    startMenuBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', resetGame);
    canvas.addEventListener('click', handleClick);
  }

  function init() {
    initEvents();
    loadAllTextures();
    messageEl.textContent = 'Begin when ready.';
    overlayEl.style.pointerEvents = 'none';
    cutsceneEl.style.display = 'none';
    buildGrid();
    updateStats();
    requestAnimationFrame(gameLoop);
  }

  init();
})();
