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
  const endingBtn = document.getElementById('endingButton');
  const outerBtn = document.getElementById('outerButton');
  const middleBtn = document.getElementById('middleButton');
  const innerBtn = document.getElementById('innerButton');
  const wheelCanvas = document.getElementById('wheelCanvas');
  const wctx = wheelCanvas ? wheelCanvas.getContext('2d') : null;

  const scoreEl = document.getElementById('scoreDisplay');
  const movesEl = document.getElementById('livesDisplay');
  const linksEl = document.getElementById('waveDisplay');
  const timeEl = document.getElementById('channelDisplay');

  const textures = { aesSedai: null, warder: null, trolloc: null };

  const TILE_SIZE = 88;
  const board = {
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0
  };

  const state = {
    started: false,
    finished: false,
    score: 0,
    moves: 0,
    links: 0,
    time: 0,
    grid: [],
    rows: 5,
    cols: 5,
    empty: { r: 4, c: 4 },
    startCell: { r: 2, c: 0 },
    goalCell: { r: 2, c: 4 },
    particles: [],
    wheel: { rings: [0, 0, 0], solved: false, anim: [null, null, null], active: false, glowUntil: 0 },
    soundOn: true
  };
  const ringColors = ['#e65f7a', '#3fa66f', '#f5d17a'];

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
    straight: { mask: 1 | 4, color: '#e65f7a' }, // vertical, rotates to horizontal
    curve: { mask: 1 | 2, color: '#3fa66f' },
    tee: { mask: 1 | 2 | 8, color: '#f5d17a' },
    cross: { mask: 1 | 2 | 4 | 8, color: '#f7f7fb' },
    empty: { mask: 0, color: '#111722' }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  let sharedAudio = null;
  let audioUnlocked = false;

  function enableAudio() {
    if (audioUnlocked || typeof AudioContext === 'undefined') return;
    sharedAudio = new AudioContext();
    audioUnlocked = true;
  }

  function playTone(freq = 440, duration = 0.1) {
    if (!state.soundOn || typeof AudioContext === 'undefined') return;
    if (!audioUnlocked || !sharedAudio) return;
    const ctxAudio = sharedAudio;
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
  }

  function updateStats() {
    if (scoreEl) scoreEl.textContent = Math.round(state.score);
    if (movesEl) movesEl.textContent = state.moves;
    if (linksEl) linksEl.textContent = state.links;
    if (timeEl) timeEl.textContent = `${Math.floor(state.time)}s`;
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
    const keys = ['straight', 'curve', 'tee', 'cross'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const rot = Math.floor(Math.random() * 4);
    return { type: key, rot };
  }

  function segAngle() {
    return (Math.PI * 2) / 6;
  }

  function normAngle(a) {
    let v = a % (Math.PI * 2);
    if (v < 0) v += Math.PI * 2;
    return v;
  }

  function buildGrid() {
    // set canvas to fit grid
    board.width = state.cols * TILE_SIZE;
    board.height = state.rows * TILE_SIZE;
    const bottomPadding = TILE_SIZE * 2.4; // room for portraits below
    canvas.width = board.width + 40;
    canvas.height = board.height + 40 + bottomPadding;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    board.offsetX = (canvas.width - board.width) / 2;
    board.offsetY = (canvas.height - bottomPadding - board.height) / 2;

    // solved layout
    state.grid = [];
    for (let r = 0; r < state.rows; r++) {
      const row = [];
      for (let c = 0; c < state.cols; c++) {
        row.push(randomTile());
      }
      state.grid.push(row);
    }
    // carve a guaranteed path on middle row
    for (let c = 0; c < state.cols; c++) {
      state.grid[state.startCell.r][c] = { type: 'straight', rot: 1 };
    }
    state.grid[state.startCell.r][state.startCell.c] = { type: 'tee', rot: 1 };
    state.grid[state.goalCell.r][state.goalCell.c] = { type: 'tee', rot: 3 };
    // place empty tile bottom right
    state.grid[state.empty.r][state.empty.c] = { type: 'empty', rot: 0 };
    // scramble by performing valid slides from solved state
    scrambleSlides(200);
    state.moves = 0;
    state.links = 0;
    state.time = 0;
    state.finished = false;
  }

  function tileMask(tile) {
    if (!tile) return 0;
    if (tile.type === 'empty') return 0;
    const base = tileLibrary[tile.type].mask;
    return rotateMask(base, tile.rot);
  }

  function isConnected(mask, dir) {
    return (mask & dir) !== 0;
  }

  function checkSolved() {
    if (!state.grid.length) return;
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
      playTone(800, 0.2);
      messageEl.textContent = 'Path complete! Align the three rings to turn gold and see Ray\'s vow. When the rings glow the "See the Vow" button will be unlocked.';
      // randomize rings so the user must align them
      for (let i = 0; i < 3; i++) {
        const steps = Math.floor(Math.random() * 6);
        state.wheel.rings[i] = (steps * segAngle()) % (Math.PI * 2);
        state.wheel.anim[i] = null;
      }
      state.wheel.solved = false;
      state.wheel.active = true;
      if (endingBtn) {
        endingBtn.disabled = true; // will enable after wheel solve
        endingBtn.style.display = 'inline-flex';
      }
      if (overlayEl) {
        overlayEl.style.display = 'flex';
        overlayEl.style.pointerEvents = 'auto';
      }
    }
  }

  function slideTile(r, c) {
    const er = state.empty.r;
    const ec = state.empty.c;
    const temp = state.grid[er][ec];
    state.grid[er][ec] = state.grid[r][c];
    state.grid[r][c] = temp;
    state.empty = { r, c };
  }

  function attemptSlide(r, c) {
    const er = state.empty.r;
    const ec = state.empty.c;
    if (Math.abs(er - r) + Math.abs(ec - c) !== 1) return; // must be adjacent
    slideTile(r, c);
    state.moves += 1;
    playTone(520, 0.08);
    checkSolved();
    updateStats();
    drawBoard(performance.now());
  }

  function scrambleSlides(count) {
    for (let i = 0; i < count; i++) {
      const er = state.empty.r;
      const ec = state.empty.c;
      const neighbors = [];
      if (er > 0) neighbors.push({ r: er - 1, c: ec });
      if (er < state.rows - 1) neighbors.push({ r: er + 1, c: ec });
      if (ec > 0) neighbors.push({ r: er, c: ec - 1 });
      if (ec < state.cols - 1) neighbors.push({ r: er, c: ec + 1 });
      const choice = neighbors[Math.floor(Math.random() * neighbors.length)];
      slideTile(choice.r, choice.c);
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
    state.wheel = { rings: [0, 0, 0], solved: false, anim: [null, null, null], active: false, glowUntil: 0 };
    startMenuEl.style.display = 'flex';
    cutsceneEl.style.display = 'none';
    startMenuEl.style.display = 'flex';
    startMenuEl.classList.remove('hidden');
    messageEl.textContent = 'Begin when ready.';
    overlayEl.style.pointerEvents = 'none';
    overlayEl.style.display = 'none';
    if (endingBtn) {
      endingBtn.disabled = true;
      endingBtn.style.display = 'inline-flex';
    }
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
    state.wheel = { rings: [0, 0, 0], solved: false, anim: [null, null, null], active: false, glowUntil: 0 };
    buildGrid();
    drawBoard(performance.now());
    startMenuEl.style.display = 'none';
    startMenuEl.classList.add('hidden');
    cutsceneEl.style.display = 'none';
    overlayEl.style.display = 'none';
    overlayEl.style.pointerEvents = 'none';
    messageEl.textContent = '';
    if (endingBtn) {
      endingBtn.disabled = true;
      endingBtn.style.display = 'inline-flex';
    }
    drawBoard(performance.now());
    updateStats();
  }

  function handleClick(evt) {
    if (!state.started || state.finished) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (evt.clientX - rect.left) * scaleX - board.offsetX;
    const y = (evt.clientY - rect.top) * scaleY - board.offsetY;
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
    attemptSlide(r, c);
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
    if (!tile) return;
    const x = board.offsetX + c * TILE_SIZE;
    const y = board.offsetY + r * TILE_SIZE;
    const mask = tileMask(tile);
    const lib = tileLibrary[tile.type];
    if (tile.type === 'empty') {
      ctx.fillStyle = '#0d121c';
      ctx.strokeStyle = '#0a0a0d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 12, 10);
      ctx.fill();
      ctx.stroke();
      return;
    }
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
    // place small portraits below the board
    const portraitSize = TILE_SIZE * 1.6;
    const yPos = board.offsetY + board.height + 12;
    if (textures.aesSedai) {
      const img = textures.aesSedai;
      const scale = portraitSize / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, board.offsetX, yPos, w, h);
    }
    if (textures.warder) {
      const img = textures.warder;
      const scale = portraitSize / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, board.offsetX + board.width - w, yPos, w, h);
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

  function drawWheel(ts) {
    if (!wctx || !wheelCanvas) return;
    const { width, height } = wheelCanvas;
    wctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(cx, cy) - 6;
    const segAngle = (Math.PI * 2) / 6;

    // animate rings if needed
    for (let i = 0; i < 3; i++) {
      const anim = state.wheel.anim[i];
      if (anim) {
        const t = clamp((performance.now() - anim.start) / anim.duration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        state.wheel.rings[i] = anim.from + (anim.to - anim.from) * ease;
        if (t >= 1) state.wheel.anim[i] = null;
      }
    }

    // three rings
    const radii = [baseRadius, baseRadius * 0.72, baseRadius * 0.44];
    for (let rIndex = 0; rIndex < 3; rIndex++) {
      const angleOffset = state.wheel.rings[rIndex];
      const radius = radii[rIndex];
      const aligned = (() => {
        const v = normAngle(angleOffset);
        return v < 0.02 || v > Math.PI * 2 - 0.02;
      })();
      for (let i = 0; i < 6; i++) {
        const start = i * segAngle + angleOffset;
        const end = start + segAngle;
        wctx.beginPath();
        wctx.arc(cx, cy, radius, start, end);
        wctx.arc(cx, cy, radius * 0.7, end, start, true);
        wctx.closePath();
        wctx.fillStyle = aligned ? '#f5d17a' : ringColors[rIndex];
        wctx.fill();
        wctx.strokeStyle = 'rgba(0,0,0,0.4)';
        wctx.lineWidth = 3;
        wctx.stroke();
      }
      // spoke lines for alignment cues
      wctx.strokeStyle = 'rgba(255,255,255,0.5)';
      wctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ang = i * segAngle + state.wheel.rings[rIndex];
        wctx.beginPath();
        wctx.moveTo(cx, cy);
        wctx.lineTo(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
        wctx.stroke();
      }
    }

    // center hub
    wctx.beginPath();
    wctx.arc(cx, cy, radii[2] * 0.5, 0, Math.PI * 2);
    wctx.fillStyle = '#f7f7fb';
    wctx.fill();
    wctx.strokeStyle = '#0a0a0d';
    wctx.stroke();
    wctx.fillStyle = '#0a0a0d';
    wctx.font = '700 9px Space Grotesk, sans-serif';
    wctx.textAlign = 'center';
    wctx.fillText('WHEEL OF', cx, cy - 1);
    wctx.fillText('TIME', cx, cy + 10);

    // glow overlay when solved
    if (state.wheel.glowUntil && performance.now() < state.wheel.glowUntil) {
      const rem = (state.wheel.glowUntil - performance.now()) / 700;
      const alpha = clamp(rem, 0, 1);
      const grad = wctx.createRadialGradient(cx, cy, radii[2] * 0.2, cx, cy, baseRadius);
      grad.addColorStop(0, `rgba(31,158,111,${alpha * 0.6})`);
      grad.addColorStop(1, 'rgba(31,158,111,0)');
      wctx.fillStyle = grad;
      wctx.beginPath();
      wctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      wctx.fill();
    }

    checkWheelSolved();
  }

  function checkWheelSolved() {
    if (!state.wheel.active) return;
    const aligned = state.wheel.rings.every((a) => {
      const v = normAngle(a);
      return v < 0.02 || v > Math.PI * 2 - 0.02;
    });
    if (aligned) {
      // snap to exact alignment
      state.wheel.rings = [0, 0, 0];
      state.wheel.solved = true;
      messageEl.textContent = 'The three rings align. Click See the Vow.';
      if (endingBtn) endingBtn.disabled = false;
      state.wheel.glowUntil = performance.now() + 700;
      playTone(880, 0.2);
    } else {
      state.wheel.solved = false;
      if (endingBtn) endingBtn.disabled = true;
    }
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
    if (!state.grid.length) return;
    const connected = drawGridConnections();
    // frame
    ctx.strokeStyle = '#f7f7fb';
    ctx.lineWidth = 4;
    ctx.strokeRect(board.offsetX - 6, board.offsetY - 6, board.width + 12, board.height + 12);

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        drawTile(r, c, state.grid[r][c], connected[r][c]);
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
    drawWheel(now);
    requestAnimationFrame(gameLoop);
  }

  function initEvents() {
    if (toggleAudioBtn) {
      toggleAudioBtn.addEventListener('click', () => {
        state.soundOn = !state.soundOn;
        toggleAudioBtn.textContent = `SFX: ${state.soundOn ? 'On' : 'Off'}`;
      });
    }
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('theme-light');
        const lightOn = document.body.classList.contains('theme-light');
        themeToggleBtn.textContent = lightOn ? 'Switch to Dark' : 'Switch to Light';
      });
    }
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (startMenuBtn) startMenuBtn.addEventListener('click', startGame);
    if (restartBtn) restartBtn.addEventListener('click', resetGame);
    if (endingBtn) endingBtn.addEventListener('click', () => {
      overlayEl.style.display = 'none';
      cutsceneEl.style.display = 'flex';
    });
    const rotate = (idx) => {
      if (state.wheel.anim[idx]) return;
      const seg = segAngle();
      const from = state.wheel.rings[idx];
      const to = from + seg;
      state.wheel.anim[idx] = { from, to, start: performance.now(), duration: 180 };
      playTone(620 - idx * 60, 0.08);
    };
    if (outerBtn) outerBtn.addEventListener('click', () => rotate(0));
    if (middleBtn) middleBtn.addEventListener('click', () => rotate(1));
    if (innerBtn) innerBtn.addEventListener('click', () => rotate(2));
    if (canvas) canvas.addEventListener('click', handleClick);
    // unlock audio on first user gesture
    const unlock = () => {
      enableAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
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
