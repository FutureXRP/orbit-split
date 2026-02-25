(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const ui = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    streak: document.getElementById("streak"),
    overlay: document.getElementById("overlay"),
    playBtn: document.getElementById("playBtn"),
    howBtn: document.getElementById("howBtn"),
    toast: document.getElementById("toast"),
  };

  // ---------- HiDPI + responsive ----------
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(600, Math.floor(rect.width * dpr));
    const h = Math.floor(w * 0.66);
    canvas.width = w;
    canvas.height = h;
  }
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  // ---------- Storage ----------
  const LS_BEST = "orbitsplit.best.v2";
  let best = Number(localStorage.getItem(LS_BEST) || "0");
  ui.best.textContent = best;

  // ---------- Game constants ----------
  const TAU = Math.PI * 2;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function wrap(a) {
    a = a % TAU;
    if (a < 0) a += TAU;
    return a;
  }
  function angDist(a, b) {
    let d = Math.abs(wrap(a) - wrap(b));
    return Math.min(d, TAU - d);
  }

  // ---------- State ----------
  const state = {
    running: false,
    last: performance.now(),
    t: 0,
    score: 0,
    streak: 0,
    speed: 1.0,
    difficulty: 1.0,
    shake: 0,
    flash: 0,
    passed: 0,       // gates passed total
    spawnTimer: 0,
  };

  // Two-lane orbit
  const player = {
    angle: -Math.PI / 2,
    lane: 0,             // 0 = inner, 1 = outer
    lanePos: 0,          // smooth tween between lanes
    laneTarget: 0,
    omega: 2.2,          // angular speed base (rad/s)
    alive: true,
    size: 10,
    invuln: 0,
  };

  // Gates: block segments on a lane at a specific angle
  // You must NOT be on that lane when you cross that angle window.
  const gates = [];
  // Gate fields:
  // lane, angle, width, bornT, passed, id
  let gateId = 0;

  function center() {
    return { cx: canvas.width * 0.5, cy: canvas.height * 0.52 };
  }

  function laneRadius(lane) {
    const { cx, cy } = center();
    const base = Math.min(canvas.width, canvas.height) * 0.22;
    const gap = Math.min(canvas.width, canvas.height) * 0.075;
    return lane === 0 ? base : base + gap;
  }

  function toast(msg) {
    ui.toast.hidden = false;
    ui.toast.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (ui.toast.hidden = true), 1100);
  }

  // ---------- Spawning ----------
  function spawnGate() {
    const lane = Math.random() < 0.5 ? 0 : 1;

    // Spawn "ahead" of the player angle so it's reactable but tense.
    // As difficulty rises, we spawn closer and make segments wider.
    const ahead = clamp(1.9 - state.difficulty * 0.08, 0.95, 1.9); // radians ahead
    const jitter = (Math.random() - 0.5) * 0.55;
    const angle = wrap(player.angle + ahead + jitter);

    const width = clamp(0.42 + state.difficulty * 0.035, 0.42, 1.25); // radians (block segment size)
    gates.push({
      lane,
      angle,
      width,
      bornT: state.t,
      passed: false,
      id: gateId++,
    });
  }

  // ---------- Control ----------
  function toggleLane() {
    if (!state.running) return;
    if (!player.alive) return;

    player.laneTarget = player.laneTarget === 0 ? 1 : 0;

    // tiny "skill reward" for frequent correct toggles
    state.flash = Math.min(1, state.flash + 0.06);
  }

  function start() {
    reset();
    ui.overlay.style.display = "none";
    state.running = true;
    state.last = performance.now();
    requestAnimationFrame(loop);
  }

  function reset() {
    state.t = 0;
    state.score = 0;
    state.streak = 0;
    state.speed = 1.0;
    state.difficulty = 1.0;
    state.shake = 0;
    state.flash = 0;
    state.passed = 0;
    state.spawnTimer = 0;

    player.angle = -Math.PI / 2;
    player.lane = 0;
    player.lanePos = 0;
    player.laneTarget = 0;
    player.alive = true;
    player.invuln = 0;

    gates.length = 0;
    gateId = 0;

    // Seed initial gates (rhythm)
    spawnGate();
    spawnGate();
    spawnGate();

    ui.score.textContent = "0";
    ui.streak.textContent = "0";
  }

  function gameOver() {
    state.running = false;

    if (state.score > best) {
      best = state.score;
      localStorage.setItem(LS_BEST, String(best));
      ui.best.textContent = best;
      toast("New Best!");
    }

    ui.overlay.style.display = "grid";
    ui.overlay.querySelector("h1").textContent = "Game Over";
    ui.overlay.querySelector(".lead").textContent =
      `Score ${state.score} • Streak ${state.streak} • Passed ${state.passed}`;
  }

  ui.playBtn.addEventListener("click", start);
  ui.howBtn.addEventListener("click", () => {
    toast("Tap/Space toggles INNER/OUTER lane. Avoid blocks. Speed ramps fast.");
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!state.running) start();
      else toggleLane();
    }
    if (e.code === "Enter" && !state.running) start();
  });

  canvas.addEventListener("pointerdown", () => {
    if (!state.running) start();
    else toggleLane();
  }, { passive: true });

  // ---------- Logic ----------
  function step(dt) {
    state.t += dt;

    // ramp difficulty
    state.difficulty = 1 + state.t * 0.28; // fast ramp
    state.speed = 1 + state.t * 0.10;

    // player angular movement
    const omega = player.omega * (0.85 + 0.12 * Math.log(1 + state.speed));
    player.angle = wrap(player.angle + omega * dt);

    // smooth lane tween
    const laneLerp = 1 - Math.pow(0.001, dt); // snappy
    player.lanePos = player.lanePos + (player.laneTarget - player.lanePos) * laneLerp;
    player.lane = (player.lanePos < 0.5) ? 0 : 1;

    // spawn gates faster over time
    const spawnEvery = clamp(1.10 - state.difficulty * 0.03, 0.38, 1.10);
    state.spawnTimer += dt;
    while (state.spawnTimer >= spawnEvery) {
      state.spawnTimer -= spawnEvery;
      spawnGate();
    }

    // remove gates that are too far behind (passed long ago)
    for (let i = gates.length - 1; i >= 0; i--) {
      const g = gates[i];
      const behind = angDist(player.angle, g.angle) > 2.9 && (state.t - g.bornT) > 2.2;
      if (g.passed && behind) gates.splice(i, 1);
      // also drop ancient unpassed gates to prevent edge cases
      if (!g.passed && (state.t - g.bornT) > 10) gates.splice(i, 1);
    }

    // collision + pass detection
    // We treat a "crossing" when player's angle is within a thin window of gate angle.
    const crossWindow = clamp(0.075 - state.difficulty * 0.0012, 0.038, 0.075);

    for (const g of gates) {
      if (g.passed) continue;

      const d = angDist(player.angle, g.angle);

      // If we're close enough to "cross" the gate center
      if (d < crossWindow) {
        // gate blocks a segment of width g.width on its lane
        // if you're on that lane at crossing time -> collision
        if (player.lane === g.lane && player.invuln <= 0) {
          player.alive = false;
          gameOver();
          return;
        }

        // otherwise you successfully passed (and streak grows)
        g.passed = true;
        state.passed += 1;
        state.streak += 1;

        // scoring: base + streak scaling + difficulty scaling
        const base = 18;
        const streakBonus = Math.floor(state.streak * 1.2);
        const diffBonus = Math.floor(state.difficulty * 2.0);

        state.score += base + streakBonus + diffBonus;

        // effects
        state.flash = Math.min(1, state.flash + 0.12);
        state.shake = Math.min(16, state.shake + 8);

        if (state.streak % 10 === 0) toast(`${state.streak} streak!`);
      }
    }

    // “survival” drip points
    state.score += Math.floor(3 * dt * (1 + state.speed * 0.35));

    // decay
    state.shake = Math.max(0, state.shake - 40 * dt);
    state.flash = Math.max(0, state.flash - 1.4 * dt);
    player.invuln = Math.max(0, player.invuln - dt);

    ui.score.textContent = String(state.score);
    ui.streak.textContent = String(state.streak);
  }

  // ---------- Rendering ----------
  function drawBackground(cx, cy) {
    // starfield
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "white";
    const W = canvas.width, H = canvas.height;
    for (let i = 0; i < 90; i++) {
      const x = (Math.sin(i * 91.7 + state.t * 0.35) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 77.3 + state.t * 0.28) * 0.5 + 0.5) * H;
      const s = (i % 7 === 0) ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }
    ctx.restore();

    // core glow
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 220);
    g.addColorStop(0, "rgba(120,180,255,0.42)");
    g.addColorStop(0.35, "rgba(255,120,190,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 220, 0, TAU);
    ctx.fill();
  }

  function drawRings(cx, cy) {
    const r0 = laneRadius(0);
    const r1 = laneRadius(1);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, TAU); ctx.stroke();

    // lane “active” glow
    const activeR = r0 + (r1 - r0) * player.lanePos;
    ctx.strokeStyle = "rgba(120,180,255,0.22)";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, activeR, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawGate(g, cx, cy) {
    const r = laneRadius(g.lane);
    const half = g.width * 0.5;

    // Gate is a blocking segment centered on g.angle
    const a0 = wrap(g.angle - half);
    const a1 = wrap(g.angle + half);

    ctx.save();

    // block
    ctx.lineWidth = 16;
    ctx.strokeStyle = g.lane === 0
      ? "rgba(255,255,255,0.17)"
      : "rgba(255,255,255,0.14)";

    // draw arc segment (handle wrap)
    if (a0 < a1) {
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, a1); ctx.stroke();
    }

    // bright edge hint
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    const edgeLen = 0.06;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, wrap(a0 + edgeLen)); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, wrap(a1 - edgeLen), a1); ctx.stroke();

    ctx.restore();
  }

  function drawPlayer(cx, cy) {
    const r0 = laneRadius(0);
    const r1 = laneRadius(1);
    const r = r0 + (r1 - r0) * player.lanePos;

    const x = cx + Math.cos(player.angle) * r;
    const y = cy + Math.sin(player.angle) * r;

    // trail
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = "rgba(120,180,255,0.40)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, player.angle - 0.45, player.angle);
    ctx.stroke();
    ctx.restore();

    // ship
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.angle + Math.PI / 2);

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.beginPath();
    ctx.moveTo(0, -player.size - 3);
    ctx.lineTo(player.size * 0.9, player.size + 3);
    ctx.lineTo(0, player.size * 0.55);
    ctx.lineTo(-player.size * 0.9, player.size + 3);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(120,180,255,0.95)";
    ctx.beginPath();
    ctx.arc(0, 2, 3.2, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function drawCore(cx, cy) {
    ctx.save();
    const core = ctx.createRadialGradient(cx, cy, 3, cx, cy, 26);
    core.addColorStop(0, "rgba(255,255,255,0.9)");
    core.addColorStop(0.35, "rgba(120,180,255,0.55)");
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    const { cx, cy } = center();

    // camera shake
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;

    ctx.save();
    ctx.translate(sx, sy);

    ctx.clearRect(-sx, -sy, W, H);

    // background
    drawBackground(cx, cy);

    // rings
    drawRings(cx, cy);

    // gates
    for (const g of gates) drawGate(g, cx, cy);

    // player
    drawPlayer(cx, cy);

    // core
    drawCore(cx, cy);

    ctx.restore();

    // flash overlay
    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 0.20;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // vignette
    ctx.save();
    const v = ctx.createRadialGradient(cx, cy, 140, cx, cy, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.40)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function loop(now) {
    // keep a subtle animated background even when overlay shows
    const dt = Math.min(0.04, (now - state.last) / 1000);
    state.last = now;

    if (state.running) step(dt);
    else state.t += dt;

    draw();

    requestAnimationFrame(loop);
  }

  // kick loop
  reset();
  draw();
  requestAnimationFrame(loop);
})();
