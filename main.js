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
  const livesEl = document.getElementById('livesDisplay');
  const waveEl = document.getElementById('waveDisplay');
  const channelEl = document.getElementById('channelDisplay');

  const textures = {
    aesSedai: null,
    warder: null,
    trolloc: null
  };

  const state = {
    started: false,
    finished: false,
    score: 0,
    lives: 4,
    wave: 1,
    maxWaves: 3,
    channel: 100,
    channelCooldown: 0,
    slashCooldown: 0,
    trollocs: [],
    spawnRemaining: 0,
    projectiles: [],
    slashes: [],
    particles: [],
    spawnTimer: 0,
    input: { left: false, right: false },
    players: {
      aesSedai: { x: canvas.width * 0.4, y: canvas.height - 90, speed: 220, size: 44 },
      warder: { x: canvas.width * 0.6, y: canvas.height - 80, speed: 240, size: 48 }
    },
    soundOn: true
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function playTone(freq = 440, duration = 0.1) {
    if (!state.soundOn || typeof AudioContext === 'undefined') return;
    const ctxAudio = new AudioContext();
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.frequency.value = freq;
    osc.type = 'square';
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + duration);
    osc.stop(ctxAudio.currentTime + duration);
    setTimeout(() => ctxAudio.close(), 200);
  }

  function updateStats() {
    scoreEl.textContent = Math.round(state.score);
    livesEl.textContent = state.lives;
    waveEl.textContent = state.wave;
    channelEl.textContent = `${Math.round(state.channel)}%`;
  }

  function resetGame() {
    state.started = false;
    state.finished = false;
    state.score = 0;
    state.lives = 4;
    state.wave = 1;
    state.channel = 100;
    state.channelCooldown = 0;
    state.slashCooldown = 0;
    state.trollocs = [];
    state.projectiles = [];
    state.slashes = [];
    state.particles = [];
    state.spawnTimer = 0;
    state.spawnRemaining = 0;
    state.players.aesSedai.x = canvas.width * 0.4;
    state.players.aesSedai.y = canvas.height - 90;
    state.players.warder.x = canvas.width * 0.6;
    state.players.warder.y = canvas.height - 80;
    startMenuEl.style.display = 'flex';
    cutsceneEl.style.display = 'none';
    messageEl.textContent = 'Begin when ready.';
    overlayEl.style.pointerEvents = 'none';
    updateStats();
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

  function startGame() {
    if (state.finished) return;
    state.started = true;
    startMenuEl.style.display = 'none';
    cutsceneEl.style.display = 'none';
    state.trollocs = [];
    state.projectiles = [];
    state.slashes = [];
    state.particles = [];
    state.spawnTimer = 0;
    state.wave = 1;
    state.spawnRemaining = baseWaveCount(state.wave);
    state.lives = 4;
    state.score = 0;
    messageEl.textContent = 'Defend together. Channel (Space) and Slash (F).';
    updateStats();
  }

  function nextWave() {
    state.wave += 1;
    state.spawnTimer = 0;
    state.spawnRemaining = baseWaveCount(state.wave);
    state.trollocs = [];
    state.projectiles = [];
    state.slashes = [];
    if (state.wave > state.maxWaves) {
      triggerEnding();
    } else {
      messageEl.textContent = `Wave ${state.wave}! Trollocs gather—hold your ground.`;
      playTone(640, 0.18);
    }
    updateStats();
  }

  function triggerEnding() {
    state.finished = true;
    messageEl.textContent = 'The last Trolloc falls.';
    cutsceneEl.style.display = 'flex';
  }

  function baseWaveCount(wave) {
    return 6 + wave * 3;
  }

  function spawnTrolloc() {
    const size = rand(30, 44);
    state.trollocs.push({
      x: rand(40, canvas.width - 40),
      y: -size,
      size,
      speed: rand(60, 110) + state.wave * 6,
      hp: 2 + state.wave,
      swingTimer: rand(0.8, 1.6)
    });
  }

  function castChannel() {
    if (state.channel < 20 || state.channelCooldown > 0) return;
    state.channel -= 20;
    state.channelCooldown = 0.35;
    const { x, y } = state.players.aesSedai;
    state.projectiles.push({
      x,
      y: y - 20,
      vx: 0,
      vy: -360,
      size: 14,
      type: 'light'
    });
    playTone(760, 0.12);
  }

  function slash() {
    if (state.slashCooldown > 0) return;
    state.slashCooldown = 0.45;
    const { x, y } = state.players.warder;
    state.slashes.push({
      x,
      y,
      r: 50,
      life: 0.18
    });
    playTone(320, 0.08);
  }

  function update(dt) {
    if (!state.started || state.finished) return;

    // regen channel
    state.channel = clamp(state.channel + dt * 12, 0, 100);
    if (state.channelCooldown > 0) state.channelCooldown -= dt;
    if (state.slashCooldown > 0) state.slashCooldown -= dt;

    // movement
    const moveDir = (state.input.left ? -1 : 0) + (state.input.right ? 1 : 0);
    state.players.aesSedai.x = clamp(state.players.aesSedai.x + moveDir * state.players.aesSedai.speed * dt, 40, canvas.width - 40);
    state.players.warder.x = clamp(state.players.warder.x + moveDir * state.players.warder.speed * dt, 40, canvas.width - 40);

    // spawn trolls
    state.spawnTimer -= dt;
    const spawnInterval = Math.max(0.9 - state.wave * 0.1, 0.35);
    if (state.spawnTimer <= 0 && state.spawnRemaining > 0) {
      spawnTrolloc();
      state.spawnRemaining -= 1;
      state.spawnTimer = spawnInterval;
    }

    // update trollocs
    for (const t of state.trollocs) {
      t.y += t.speed * dt;
      t.swingTimer -= dt;
      if (t.swingTimer <= 0) {
        // small zig
        t.x += rand(-40, 40);
        t.swingTimer = rand(0.8, 1.6);
      }
    }

    // projectiles
    for (const p of state.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    state.projectiles = state.projectiles.filter((p) => p.y > -20 && p.y < canvas.height + 20);

    // slashes
    for (const s of state.slashes) {
      s.life -= dt;
    }
    state.slashes = state.slashes.filter((s) => s.life > 0);

    // collisions: projectiles vs trollocs
    for (let i = state.trollocs.length - 1; i >= 0; i--) {
      const t = state.trollocs[i];
      for (let j = state.projectiles.length - 1; j >= 0; j--) {
        const p = state.projectiles[j];
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        if (Math.hypot(dx, dy) < t.size * 0.6 + p.size) {
          t.hp -= 2;
          state.projectiles.splice(j, 1);
          spawnHit(t.x, t.y, '#f0c35b');
          if (t.hp <= 0) {
            state.score += 25;
            state.trollocs.splice(i, 1);
          }
          break;
        }
      }
    }

    // slashes vs trollocs
    for (let i = state.trollocs.length - 1; i >= 0; i--) {
      const t = state.trollocs[i];
      for (const s of state.slashes) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        if (Math.hypot(dx, dy) < s.r + t.size * 0.5) {
          t.hp -= 3;
          spawnHit(t.x, t.y, '#ff6b8f');
          if (t.hp <= 0) {
            state.score += 25;
            state.trollocs.splice(i, 1);
          }
          break;
        }
      }
    }

    // trollocs reach bottom or hit players
    for (let i = state.trollocs.length - 1; i >= 0; i--) {
      const t = state.trollocs[i];
      if (t.y > canvas.height - 60) {
        state.lives -= 1;
        spawnHit(t.x, t.y, '#b4002f');
        state.trollocs.splice(i, 1);
        messageEl.textContent = 'A Trolloc slipped through! Hold fast.';
        if (state.lives <= 0) {
          state.finished = true;
          cutsceneEl.style.display = 'flex';
          messageEl.textContent = 'They fall together—try again for their vow.';
        }
      }
    }

    // check wave completion
    if (state.spawnRemaining === 0 && state.trollocs.length === 0 && !state.finished) {
      nextWave();
    }

    updateStats();
  }

  function spawnHit(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = rand(40, 110);
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(0.4, 0.8),
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
      p.vy += 30 * dt;
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

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const spacing = 70;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += spacing) {
      ctx.moveTo(x, canvas.height);
      ctx.lineTo(x - 100, canvas.height - 220);
    }
    for (let y = canvas.height; y >= canvas.height - 220; y -= spacing) {
      ctx.moveTo(-50, y);
      ctx.lineTo(canvas.width, y - 110);
    }
    ctx.stroke();

    // snowfall
    for (let i = 0; i < 90; i++) {
      const x = (i * 71 + ts * 0.02) % canvas.width;
      const y = (i * 37 + ts * 0.04) % canvas.height;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawCelRect(x, y, w, h, fill, outline = '#000', radius = 8) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
    ctx.fill();
    ctx.stroke();
  }

  function drawAesSedai(p) {
    if (textures.aesSedai) {
      const img = textures.aesSedai;
      const scale = (p.size * 2.4) / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, p.x - w / 2, p.y - h, w, h);
      return;
    }
    // robe
    drawCelRect(p.x, p.y, p.size, p.size * 1.2, '#0e7c4b', '#0a0a0d', 12);
    // sash
    ctx.fillStyle = '#f0c35b';
    ctx.fillRect(p.x - p.size * 0.25, p.y - p.size * 0.2, p.size * 0.5, p.size * 0.2);
    // head
    const headY = p.y - p.size * 0.75;
    ctx.fillStyle = '#3d2b23'; // skin tone
    ctx.strokeStyle = '#0a0a0d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, headY, p.size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // hair
    ctx.fillStyle = '#1a1111';
    ctx.beginPath();
    ctx.arc(p.x, headY - p.size * 0.05, p.size * 0.37, Math.PI, Math.PI * 2);
    ctx.fill();
    // glasses
    ctx.strokeStyle = '#f8f8f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(p.x - p.size * 0.18, headY - p.size * 0.1, p.size * 0.16, p.size * 0.12);
    ctx.rect(p.x + p.size * 0.02, headY - p.size * 0.1, p.size * 0.16, p.size * 0.12);
    ctx.moveTo(p.x - p.size * 0.02, headY - p.size * 0.04);
    ctx.lineTo(p.x + p.size * 0.02, headY - p.size * 0.04);
    ctx.stroke();
    // channel focus
    ctx.strokeStyle = '#f0c35b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.size * 0.6);
    ctx.lineTo(p.x, p.y - p.size * 0.3);
    ctx.stroke();
  }

  function drawWarder(p) {
    if (textures.warder) {
      const img = textures.warder;
      const scale = (p.size * 2.2) / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, p.x - w / 2, p.y - h, w, h);
      return;
    }
    // armor/coat
    drawCelRect(p.x, p.y, p.size, p.size * 1.1, '#0e7c4b', '#0a0a0d', 12);
    // chest plate
    ctx.fillStyle = '#f0c35b';
    ctx.fillRect(p.x - p.size * 0.25, p.y - p.size * 0.35, p.size * 0.5, p.size * 0.3);
    // head
    const headY = p.y - p.size * 0.65;
    ctx.fillStyle = '#3d2b23';
    ctx.strokeStyle = '#0a0a0d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, headY, p.size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // hair cropped
    ctx.fillStyle = '#0f0a0a';
    ctx.beginPath();
    ctx.arc(p.x, headY - p.size * 0.05, p.size * 0.34, Math.PI, Math.PI * 2);
    ctx.fill();
    // glasses
    ctx.strokeStyle = '#f8f8f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(p.x - p.size * 0.16, headY - p.size * 0.1, p.size * 0.14, p.size * 0.1);
    ctx.rect(p.x + p.size * 0.02, headY - p.size * 0.1, p.size * 0.14, p.size * 0.1);
    ctx.moveTo(p.x - p.size * 0.02, headY - p.size * 0.05);
    ctx.lineTo(p.x + p.size * 0.02, headY - p.size * 0.05);
    ctx.stroke();
    // blade arc
    ctx.strokeStyle = '#f8f8f8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(p.x + p.size * 0.45, p.y - p.size * 0.15, p.size * 0.7, -0.4, 1.2);
    ctx.stroke();
  }

  function drawTrolloc(t) {
    if (textures.trolloc) {
      const img = textures.trolloc;
      const scale = (t.size * 2.2) / img.height;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, t.x - w / 2, t.y - h / 2, w, h);
      return;
    }
    ctx.fillStyle = '#1a1a21';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(t.x - t.size / 2, t.y - t.size / 2, t.size, t.size * 1.2, 8);
    ctx.fill();
    ctx.stroke();
    // horns
    ctx.strokeStyle = '#b4002f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(t.x - t.size * 0.25, t.y - t.size * 0.5);
    ctx.quadraticCurveTo(t.x - t.size * 0.4, t.y - t.size, t.x - t.size * 0.55, t.y - t.size * 0.7);
    ctx.moveTo(t.x + t.size * 0.25, t.y - t.size * 0.5);
    ctx.quadraticCurveTo(t.x + t.size * 0.4, t.y - t.size, t.x + t.size * 0.55, t.y - t.size * 0.7);
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#f0c35b';
    ctx.beginPath();
    ctx.arc(t.x - t.size * 0.15, t.y - t.size * 0.2, 4, 0, Math.PI * 2);
    ctx.arc(t.x + t.size * 0.15, t.y - t.size * 0.2, 4, 0, Math.PI * 2);
    ctx.fill();
    // snout highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(t.x - t.size * 0.15, t.y - t.size * 0.05, t.size * 0.3, t.size * 0.2);
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      ctx.fillStyle = '#f0c35b';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - p.size / 2, p.y - p.size, p.size, p.size * 1.6, 6);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawSlashes() {
    for (const s of state.slashes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, -0.8, 0.8);
      ctx.stroke();
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
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 16px Space Grotesk, sans-serif';
    ctx.fillText(`Score: ${Math.round(state.score)}`, 18, 26);
    ctx.fillText(`Hearts: ${state.lives}`, 18, 48);
    ctx.fillText(`Wave: ${state.wave}/${state.maxWaves}`, 18, 70);
    ctx.fillText(`Channel: ${Math.round(state.channel)}%`, 18, 92);
  }

  function gameLoop(ts) {
    const now = ts || performance.now();
    const dt = Math.min(0.05, (now - (gameLoop.last || now)) / 1000);
    gameLoop.last = now;
    update(dt);
    updateParticles(dt);
    drawBackground(now);
    drawParticles();
    drawProjectiles();
    drawSlashes();
    for (const t of state.trollocs) drawTrolloc(t);
    drawAesSedai(state.players.aesSedai);
    drawWarder(state.players.warder);
    drawUI();
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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.input.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.input.right = true;
      if (e.code === 'Space') castChannel();
      if (e.key === 'f' || e.key === 'F') slash();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.input.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.input.right = false;
    });
  }

  function init() {
    initEvents();
    loadAllTextures();
    messageEl.textContent = 'Begin when ready.';
    overlayEl.style.pointerEvents = 'none';
    cutsceneEl.style.display = 'none';
    updateStats();
    requestAnimationFrame(gameLoop);
  }

  init();
})();
