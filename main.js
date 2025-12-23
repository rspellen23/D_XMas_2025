(() => {
  const canvas = document.getElementById('playfield');
  const ctx = canvas.getContext('2d');
  const wheelCanvas = document.getElementById('wheelCanvas');
  const wctx = wheelCanvas.getContext('2d');
  const startBtn = document.getElementById('startRun');
  const spinBtn = document.getElementById('spinWheel');
  const quizBtn = document.getElementById('quizButton');
  const scoreEl = document.getElementById('scoreDisplay');
  const livesEl = document.getElementById('livesDisplay');
  const timeEl = document.getElementById('timeDisplay');
  const bonusEl = document.getElementById('bonusDisplay');
  const correctEl = document.getElementById('correctDisplay');
  const messageEl = document.getElementById('message');
  const overlayEl = document.getElementById('overlay');
  const wheelResultEl = document.getElementById('wheelResult');
  const quizZone = document.getElementById('quizZone');
  const quizOptions = document.getElementById('quizOptions');
  const toggleAudioBtn = document.getElementById('toggleAudio');
  const themeToggleBtn = document.getElementById('themeToggle');
  const cutsceneEl = document.getElementById('cutscene');
  const restartBtn = document.getElementById('restartButton');

  const state = {
    score: 0,
    lives: 3,
    timeLeft: 0,
    runActive: false,
    finished: false,
    runsCompleted: 0,
    correctAnswers: 0,
    goalAnswers: 5,
    bonus: null,
    bonusTime: 0,
    pendingTimeBoost: 0,
    gifts: [],
    hazards: [],
    particles: [],
    giftTimer: 0.5,
    hazardTimer: 1.2,
    input: { left: false, right: false },
    player: { x: canvas.width / 2, y: canvas.height - 60, w: 48, h: 28, speed: 320, shield: 0 },
    wheelAngle: 0,
    wheelSpin: { spinning: false, start: 0, duration: 1400, from: 0, to: 0 },
    soundOn: true,
    quizReady: false,
    activeQuestion: null
  };

  const wheelSegments = [
    { label: 'Double Points', effect: 'double', color: '#f6c667' },
    { label: 'Slow Shadows', effect: 'slow', color: '#1e715a' },
    { label: 'Shield Heart', effect: 'shield', color: '#b0213c' },
    { label: 'Extra Time', effect: 'time', color: '#5ac8fa' },
    { label: 'Romantic Fireworks', effect: 'fireworks', color: '#ff4f7d' },
    { label: 'Gift Cascade', effect: 'cascade', color: '#7c5bff' }
  ];

  const quizBank = [
    {
      q: 'Who guides the Two Rivers youths at the start of the story?',
      options: ['Moiraine Damodred', 'Egwene al\'Vere', 'Elaida'],
      answer: 'Moiraine Damodred',
      reward: { type: 'score', value: 40 }
    },
    {
      q: 'What title is given to Rand al’Thor?',
      options: ['The Wolf King', 'The Dragon Reborn', 'Prince of Ravens'],
      answer: 'The Dragon Reborn',
      reward: { type: 'life', value: 1 }
    },
    {
      q: 'Which Ajah is known for battle readiness?',
      options: ['Green Ajah', 'Brown Ajah', 'White Ajah'],
      answer: 'Green Ajah',
      reward: { type: 'score', value: 30 }
    },
    {
      q: 'The male half of the One Power is called?',
      options: ['saidar', 'saidar and saidin are the same', 'saidin'],
      answer: 'saidin',
      reward: { type: 'score', value: 25 }
    },
    {
      q: 'Who leads the Whitecloaks during early events?',
      options: ['Galad Damodred', 'Geofram Bornhald', 'Pedron Niall'],
      answer: 'Pedron Niall',
      reward: { type: 'life', value: 1 }
    }
  ];

  const ajahColors = ['#a32c3f', '#3c6cf4', '#1e715a', '#c79c1b', '#7c5bff', '#c43c8b', '#f6c667'];

  const fireworkPalette = ['#ff4f7d', '#f6c667', '#5ac8fa', '#7c5bff', '#1e715a'];

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
    osc.type = 'sine';
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
    timeEl.textContent = `${Math.max(0, Math.ceil(state.timeLeft))}s`;
    bonusEl.textContent = state.bonus ? state.bonus.label : 'None';
    correctEl.textContent = `${state.correctAnswers} / ${state.goalAnswers}`;
  }

  function startRun() {
    if (state.finished) return;
    cutsceneEl.style.display = 'none';
    state.runActive = true;
    state.timeLeft = 32 + state.pendingTimeBoost;
    state.pendingTimeBoost = 0;
    state.gifts = [];
    state.hazards = [];
    state.particles = [];
    state.giftTimer = 0.4;
    state.hazardTimer = 1.1;
    state.quizReady = false;
    overlayEl.style.pointerEvents = 'none';
    quizBtn.style.display = 'none';
    messageEl.textContent = 'Collect Ajah lights, dodge Trolloc snow. For Deedra!';
    updateStats();
  }

  function endRun(reason) {
    state.runActive = false;
    state.quizReady = true;
    state.runsCompleted += 1;
    overlayEl.style.pointerEvents = 'auto';
    quizBtn.style.display = 'inline-flex';
    messageEl.textContent = reason;
  }

  function applyBonus(segment) {
    state.bonus = { type: segment.effect, label: segment.label };
    wheelResultEl.textContent = `Gift received: ${segment.label}`;
    state.bonusTime = 22;

    switch (segment.effect) {
      case 'double':
        break;
      case 'slow':
        break;
      case 'shield':
        state.player.shield = Math.max(state.player.shield, 18);
        break;
      case 'time':
        if (state.runActive) {
          state.timeLeft += 6;
        } else {
          state.pendingTimeBoost += 6;
        }
        break;
      case 'fireworks':
        spawnFireworks(canvas.width / 2, canvas.height / 3);
        break;
      case 'cascade':
        break;
      default:
        break;
    }
    updateStats();
  }

  function spinWheel() {
    if (state.finished) return;
    if (state.wheelSpin.spinning) return;
    const idx = Math.floor(Math.random() * wheelSegments.length);
    const turns = 4 + Math.floor(Math.random() * 3);
    const segmentAngle = (Math.PI * 2) / wheelSegments.length;
    const targetAngle = (Math.PI / 2) - idx * segmentAngle; // pointer at top
    state.wheelSpin = {
      spinning: true,
      start: performance.now(),
      duration: 1800,
      from: state.wheelAngle,
      to: state.wheelAngle + turns * Math.PI * 2 + targetAngle
    };
    setTimeout(() => {
      applyBonus(wheelSegments[idx]);
      playTone(660, 0.25);
    }, 1800);
  }

  function drawWheel(ts) {
    const { width, height } = wheelCanvas;
    wctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 8;
    const segmentAngle = (Math.PI * 2) / wheelSegments.length;

    if (state.wheelSpin.spinning) {
      const elapsed = ts - state.wheelSpin.start;
      const t = clamp(elapsed / state.wheelSpin.duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      state.wheelAngle = state.wheelSpin.from + (state.wheelSpin.to - state.wheelSpin.from) * ease;
      if (t >= 1) {
        state.wheelSpin.spinning = false;
        state.wheelAngle = state.wheelSpin.to;
      }
    }

    for (let i = 0; i < wheelSegments.length; i++) {
      const start = i * segmentAngle + state.wheelAngle;
      const end = start + segmentAngle;
      wctx.beginPath();
      wctx.moveTo(cx, cy);
      wctx.arc(cx, cy, radius, start, end);
      wctx.closePath();
      wctx.fillStyle = wheelSegments[i].color;
      wctx.fill();
      wctx.strokeStyle = 'rgba(0,0,0,0.2)';
      wctx.stroke();

      // labels
      const mid = start + segmentAngle / 2;
      wctx.save();
      wctx.translate(cx + Math.cos(mid) * (radius * 0.65), cy + Math.sin(mid) * (radius * 0.65));
      wctx.rotate(mid + Math.PI / 2);
      wctx.fillStyle = '#0b0f1c';
      wctx.font = 'bold 12px Space Grotesk, sans-serif';
      wctx.textAlign = 'center';
      wctx.fillText(wheelSegments[i].label, 0, 4);
      wctx.restore();
    }

    // center
    wctx.beginPath();
    wctx.arc(cx, cy, 34, 0, Math.PI * 2);
    wctx.fillStyle = '#0b0f1c';
    wctx.fill();
    wctx.lineWidth = 3;
    wctx.strokeStyle = '#f6c667';
    wctx.stroke();
    wctx.fillStyle = '#f6c667';
    wctx.font = '700 13px Space Grotesk, sans-serif';
    wctx.textAlign = 'center';
    wctx.fillText('SPIN', cx, cy + 4);

    // pointer
    wctx.beginPath();
    wctx.moveTo(cx, cy - radius - 6);
    wctx.lineTo(cx - 10, cy - radius + 14);
    wctx.lineTo(cx + 10, cy - radius + 14);
    wctx.closePath();
    wctx.fillStyle = '#ff4f7d';
    wctx.fill();
    wctx.strokeStyle = '#ffe9ff';
    wctx.stroke();
  }

  function spawnGift() {
    const x = rand(30, canvas.width - 30);
    const r = rand(10, 16);
    const speed = rand(80, 140);
    const color = ajahColors[Math.floor(Math.random() * ajahColors.length)];
    state.gifts.push({ x, y: -20, r, speed, color, value: 10 });
  }

  function spawnHazard() {
    const x = rand(30, canvas.width - 30);
    const r = rand(14, 20);
    const speed = rand(110, 170);
    state.hazards.push({ x, y: -20, r, speed, wobble: rand(0.5, 1.2) });
  }

  function spawnFireworks(x, y) {
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(80, 200);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.8, 1.4),
        color: fireworkPalette[i % fireworkPalette.length]
      });
    }
  }

  function update(dt) {
    if (state.runActive) {
      state.timeLeft -= dt;
      if (state.bonusTime > 0) {
        state.bonusTime -= dt;
        if (state.bonusTime <= 0) {
          state.bonus = null;
        }
      }

      if (state.bonus?.type === 'cascade') {
        state.giftTimer -= dt * 1.5;
      } else {
        state.giftTimer -= dt;
      }
      state.hazardTimer -= dt;

      if (state.giftTimer <= 0) {
        spawnGift();
        state.giftTimer = rand(0.35, 0.7);
      }
      if (state.hazardTimer <= 0) {
        spawnHazard();
        state.hazardTimer = rand(0.8, 1.3);
      }

      const slowFactor = state.bonus?.type === 'slow' ? 0.65 : 1;
      const multiplier = state.bonus?.type === 'double' ? 2 : 1;

      const vel = (state.input.left ? -1 : 0) + (state.input.right ? 1 : 0);
      state.player.x = clamp(state.player.x + vel * state.player.speed * dt, 30, canvas.width - 30);
      if (state.player.shield > 0) {
        state.player.shield = Math.max(0, state.player.shield - dt);
      }

      for (const g of state.gifts) {
        g.y += g.speed * dt;
      }
      for (const h of state.hazards) {
        h.y += h.speed * slowFactor * dt;
        h.x += Math.sin(h.y * 0.02) * 20 * dt * h.wobble;
      }

      state.gifts = state.gifts.filter((g) => g.y < canvas.height + 40);
      state.hazards = state.hazards.filter((h) => h.y < canvas.height + 40);

      // collisions
      for (let i = state.gifts.length - 1; i >= 0; i--) {
        const g = state.gifts[i];
        const dx = Math.abs(g.x - state.player.x);
        const dy = Math.abs(g.y - state.player.y);
        if (dx < g.r + state.player.w && dy < g.r + state.player.h / 2) {
          state.score += g.value * multiplier;
          spawnFireworks(g.x, g.y);
          playTone(520, 0.1);
          state.gifts.splice(i, 1);
        }
      }

      for (let i = state.hazards.length - 1; i >= 0; i--) {
        const h = state.hazards[i];
        const dx = Math.abs(h.x - state.player.x);
        const dy = Math.abs(h.y - state.player.y);
        if (dx < h.r + state.player.w * 0.5 && dy < h.r + state.player.h / 2) {
          if (state.player.shield > 0) {
            state.player.shield = 0;
            spawnFireworks(h.x, h.y);
          } else {
            state.lives -= 1;
            playTone(220, 0.12);
          }
          state.hazards.splice(i, 1);
        }
      }

      if (state.timeLeft <= 0) {
        endRun('Run complete! Channel your answers in the quiz to keep the holiday spirit high.');
      } else if (state.lives <= 0) {
        endRun('Hearts are out! Answer a prophecy to rekindle the holiday glow.');
      }
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    updateStats();
  }

  function drawBackground() {
    ctx.fillStyle = '#050815';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // aurora gradient
    const aurora = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    aurora.addColorStop(0, 'rgba(90, 210, 250, 0.25)');
    aurora.addColorStop(0.45, 'rgba(30, 113, 90, 0.24)');
    aurora.addColorStop(1, 'rgba(255, 185, 88, 0.22)');
    ctx.fillStyle = aurora;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid lines for modern feel
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const spacing = 70;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += spacing) {
      ctx.moveTo(x, canvas.height);
      ctx.lineTo(x - 80, canvas.height - 180);
    }
    for (let y = canvas.height; y >= canvas.height - 180; y -= spacing) {
      ctx.moveTo(-40, y);
      ctx.lineTo(canvas.width, y - 80);
    }
    ctx.stroke();

    // snowfall dots
    for (let i = 0; i < 90; i++) {
      const x = (i * 73 + Date.now() * 0.02) % canvas.width;
      const y = (i * 41 + Date.now() * 0.04) % canvas.height;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(state.player.x, state.player.y);
    const grad = ctx.createLinearGradient(-state.player.w / 2, 0, state.player.w / 2, 0);
    grad.addColorStop(0, '#ffd970');
    grad.addColorStop(1, '#5ac8fa');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-state.player.w / 2, -state.player.h / 2, state.player.w, state.player.h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ff4f7d';
    ctx.beginPath();
    ctx.ellipse(0, -state.player.h / 2, 18, 10, 0, 0, Math.PI, true);
    ctx.fill();
    if (state.player.shield > 0) {
      ctx.strokeStyle = '#5ac8fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, state.player.w * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGifts() {
    for (const g of state.gifts) {
      const grad = ctx.createRadialGradient(g.x, g.y, g.r * 0.2, g.x, g.y, g.r);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, g.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHazards() {
    for (const h of state.hazards) {
      ctx.fillStyle = 'rgba(20, 26, 40, 0.8)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff4f7d';
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
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '700 16px Space Grotesk, sans-serif';
    ctx.fillText(`Deedra's Score: ${Math.round(state.score)}`, 20, 28);
    ctx.fillText(`Hearts: ${state.lives}`, 20, 52);
    ctx.fillText(`Time: ${Math.ceil(state.timeLeft)}s`, 20, 76);
    if (state.bonus) {
      ctx.fillText(`Bonus: ${state.bonus.label}`, 20, 100);
    }
  }

  function presentQuiz() {
    if (!state.quizReady) return;
    const question = quizBank[Math.floor(Math.random() * quizBank.length)];
    state.activeQuestion = question;
    quizOptions.innerHTML = '';
    quizZone.querySelector('.quiz-question').textContent = question.q;
    question.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.textContent = opt;
      btn.onclick = () => handleAnswer(opt);
      quizOptions.appendChild(btn);
    });
  }

  function handleAnswer(selected) {
    if (!state.activeQuestion) return;
    const correct = selected === state.activeQuestion.answer;
    if (correct) {
      if (state.activeQuestion.reward.type === 'score') {
        state.score += state.activeQuestion.reward.value;
      } else if (state.activeQuestion.reward.type === 'life') {
        state.lives += state.activeQuestion.reward.value;
      }
      state.correctAnswers += 1;
      messageEl.textContent = `Correct! ${state.activeQuestion.answer} — the Pattern glows warmer.`;
      spawnFireworks(canvas.width / 2, canvas.height / 4);
    } else {
      messageEl.textContent = 'Not quite. The Pattern weaves on—try another run!';
    }
    quizOptions.innerHTML = '';
    state.activeQuestion = null;
    state.quizReady = false;
    quizBtn.style.display = 'none';
    overlayEl.style.pointerEvents = 'none';
    checkEnding();
    updateStats();
  }

  function checkEnding() {
    const milestoneReached = state.correctAnswers >= state.goalAnswers;
    if (!milestoneReached || state.finished) return;
    state.finished = true;
    state.runActive = false;
    overlayEl.style.pointerEvents = 'auto';
    quizBtn.style.display = 'none';
    startBtn.disabled = true;
    spinBtn.disabled = true;
    cutsceneEl.style.display = 'flex';
    messageEl.textContent = 'The turning completes. Take in the moment.';
  }

  function resetGame() {
    state.score = 0;
    state.lives = 3;
    state.timeLeft = 0;
    state.runActive = false;
    state.finished = false;
    state.runsCompleted = 0;
    state.correctAnswers = 0;
    state.bonus = null;
    state.bonusTime = 0;
    state.pendingTimeBoost = 0;
    state.gifts = [];
    state.hazards = [];
    state.particles = [];
    state.player.shield = 0;
    startBtn.disabled = false;
    spinBtn.disabled = false;
    cutsceneEl.style.display = 'none';
    overlayEl.style.pointerEvents = 'none';
    quizBtn.style.display = 'none';
    wheelResultEl.textContent = 'Spin to receive a bonus gift.';
    messageEl.textContent = 'Spin, run, and quiz to earn gifts for Deedra. Tap Start Run to begin.';
    updateStats();
  }

  function gameLoop(ts) {
    const now = ts || performance.now();
    const dt = Math.min(0.05, (now - (gameLoop.last || now)) / 1000);
    gameLoop.last = now;
    update(dt);
    drawBackground();
    drawGifts();
    drawHazards();
    drawPlayer();
    drawParticles();
    drawUI();
    drawWheel(now);
    requestAnimationFrame(gameLoop);
  }

  function initEvents() {
    startBtn.addEventListener('click', startRun);
    spinBtn.addEventListener('click', spinWheel);
    quizBtn.addEventListener('click', () => {
      presentQuiz();
    });
    toggleAudioBtn.addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      toggleAudioBtn.textContent = `SFX: ${state.soundOn ? 'On' : 'Off'}`;
    });
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('theme-light');
      const lightOn = document.body.classList.contains('theme-light');
      themeToggleBtn.textContent = lightOn ? 'Switch to Dark' : 'Switch to Light';
    });
    restartBtn.addEventListener('click', resetGame);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.input.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.input.right = true;
      if (e.key === ' ' && !state.runActive) startRun();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.input.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.input.right = false;
    });
  }

  function init() {
    initEvents();
    messageEl.textContent = 'Spin, run, and quiz to earn gifts for Deedra. Tap Start Run to begin.';
    quizBtn.style.display = 'none';
    requestAnimationFrame(gameLoop);
  }

  init();
})();
