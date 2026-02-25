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

  // HiDPI
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor((rect.width * 0.66) * dpr); // responsive ratio
    canvas.width = w;
    canvas.height = h;
  }
  window.addEventListener("resize", () => { fitCanvas(); });
  fitCanvas();

  // Storage
  const LS_BEST = "orbitSplit.best";
  let best = Number(localStorage.getItem(LS_BEST) || "0");
  ui.best.textContent = best;

  // Game state
  const state = {
    running: false,
    t: 0,
    dt: 0,
    last: performance.now(),
    score: 0,
    streak: 0,
    combo: 0,
    speed: 1.0,
    difficulty: 1.0,
    shake: 0,
    flash: 0,
  };

  // Orbit physics
  const player = {
    angle: 0,
    dir: 1,          // 1 or -1
    r: 140,
    targetR: 140,
    omega: 1.6,      // base angular speed
    size: 10,
    alive: true,
    invuln: 0,
  };

  // Obstacles (gates)
  // A gate is an arc ring with a missing opening you must pass through.
  const gates = [];
  function spawnGate() {
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.5, cy = H * 0.52;

    const baseR = player.r + 28;
    const g = {
      r: baseR,
      thickness: 18,
      ang: Math.random() * Math.PI * 2,
      open: Math.max(0.48, 0.78 - state.difficulty * 0.08), // opening arc width
      rot: (Math.random() < 0.5 ? -1 : 1) * (0.55 + state.difficulty * 0.12),
      passed: false,
      born: state.t,
      cx, cy
    };
    gates.push(g);
  }

  function reset() {
    state.t = 0;
    state.score = 0;
    state.streak = 0;
    state.combo = 0;
    state.speed = 1.0;
    state.difficulty = 1.0;
    state.shake = 0;
    state.flash = 0;

    player.angle = -Math.PI / 2;
    player.dir = 1;
    player.r = 140;
    player.targetR = 140;
    player.alive = true;
    player.invuln = 0;

    gates.length = 0;
    // Seed a few gates so you immediately have rhythm
    spawnGate();
    spawnGate();
    spawnGate();
    gates[1].r += 44;
    gates[2].r += 88;
  }

  function toast(msg) {
    ui.toast.hidden = false;
    ui.toast.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { ui.toast.hidden = true; }, 1200);
  }

  // Controls (one-button)
  function flip() {
    if (!state.running) return;
    if (!player.alive) return;
    player.dir *= -1;
    // tiny reward for rhythm flips
    state.score += 1;
    state.flash = Math.min(1, state.flash + 0.08);
  }

  function start() {
    reset();
    ui.overlay.style.display = "none";
    state.running = true;
    state.last = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state.running = false;
    ui.overlay.style.display = "grid";
    ui.overlay.querySelector("h1").textContent = "Game Over";
    ui.overlay.querySelector(".lead").textContent =
      `Score ${state.score} • Streak ${state.streak} • Try again?`;

    if (state.score > best) {
      best = state.score;
      localStorage.setItem(LS_BEST, String(best));
      ui.best.textContent = best;
      toast("New Best!");
    }
  }

  ui.playBtn.addEventListener("click", start);
  ui.howBtn.addEventListener("click", () => {
    toast("Flip direction to thread the opening. Speed ramps. Chase streaks!");
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!state.running) start();
      else flip();
    }
    if (e.code === "Enter" && !state.running) start();
  });

  canvas.addEventListener("pointerdown", () => {
    if (!state.running) start();
    else flip();
  }, { passive: true });

  // Helpers
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function wrapAngle(a){
    const two = Math.PI * 2;
    a = a % two;
    if (a < 0) a += two;
    return a;
  }

  // Drawing primitives
  function arcRing(cx, cy, r, thickness, a0, a1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1, false);
    ctx.stroke();
  }

  function drawBackground(cx, cy) {
    // subtle starfield
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 80; i++){
      const x = (Math.sin(i*91.7 + state.t*0.1) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i*77.3 + state.t*0.08) * 0.5 + 0.5) * canvas.height;
      const s = (i % 5 === 0) ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }
    ctx.restore();

    // core glow
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, 180);
    g.addColorStop(0, "rgba(120,180,255,0.45)");
    g.addColorStop(0.25, "rgba(120,180,255,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 180, 0, Math.PI*2);
    ctx.fill();
  }

  function drawGate(g) {
    // ring with an opening (missing arc)
    const openHalf = g.open * 0.5;
    const aMid = wrapAngle(g.ang);
    const a0 = wrapAngle(aMid + openHalf);
    const a1 = wrapAngle(aMid - openHalf);

    ctx.save();
    ctx.lineWidth = g.thickness;

    // ring stroke
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    // draw two arcs to leave a gap (opening)
    if (a0 < a1) {
      // opening crosses zero
      arcRing(g.cx, g.cy, g.r, g.thickness, a0, Math.PI*2);
      arcRing(g.cx, g.cy, g.r, g.thickness, 0, a1);
    } else {
      arcRing(g.cx, g.cy, g.r, g.thickness, a0, a1);
    }

    // highlight edge of opening
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    const edgeLen = 0.08 + state.difficulty * 0.01;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, aMid + openHalf, aMid + openHalf + edgeLen); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, aMid - openHalf - edgeLen, aMid - openHalf); ctx.stroke();

    ctx.restore();
  }

  function drawPlayer(cx, cy) {
    const a = player.angle;
    const x = cx + Math.cos(a) * player.r;
    const y = cy + Math.sin(a) * player.r;

    // trail
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(120,180,255,0.45)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, player.r, a - 0.45*player.dir, a, player.dir < 0);
    ctx.stroke();
    ctx.restore();

    // ship
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI/2);

    const inv = player.invuln > 0 ? 0.35 : 1.0;
    ctx.globalAlpha = inv;

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -player.size-2);
    ctx.lineTo(player.size*0.85, player.size+2);
    ctx.lineTo(0, player.size*0.55);
    ctx.lineTo(-player.size*0.85, player.size+2);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = inv * 0.6;
    ctx.fillStyle = "rgba(120,180,255,0.9)";
    ctx.beginPath();
    ctx.arc(0, 2, 3.2, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawUIRing(cx, cy) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, player.r, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  function gateCheck(g) {
    // Determine if the player crosses the ring at radius g.r while NOT being in the opening
    const radDiff = Math.abs(player.r - g.r);
    const withinRing = radDiff < (g.thickness * 0.55);

    if (!withinRing) return { hit: false, near: false, passed: false };

    const a = wrapAngle(player.angle);
    const openHalf = g.open * 0.5;
    const aMid = wrapAngle(g.ang);

    // angle distance on circle
    let d = Math.abs(a - aMid);
    d = Math.min(d, Math.PI*2 - d);

    const inOpening = d <= openHalf;

    // near miss when close to edge of opening but still safe
    const nearEdge = Math.abs(d - openHalf);

    if (inOpening) {
      // Passed safely if first time
      return { hit: false, near: nearEdge < 0.06, passed: true };
    } else {
      return { hit: true, near: false, passed: false };
    }
  }

  function step(dt) {
    state.t += dt;

    // ramp difficulty over time
    state.difficulty = 1 + state.t * 0.03;
    state.speed = 1 + state.t * 0.02;

    // player orbit speed increases a bit with difficulty
    const omega = player.omega * state.speed;
    player.angle = wrapAngle(player.angle + player.dir * omega * dt);

    // rotate gates + slowly push them outward to force new timing
    for (const g of gates) {
      g.ang = wrapAngle(g.ang + g.rot * dt * (0.8 + state.difficulty * 0.06));
      g.r += (10 + state.difficulty * 3) * dt; // outward drift
    }

    // spawn new gates periodically
    const desired = 3;
    if (gates.length < desired) spawnGate();
    // also spawn as time goes
    if (Math.floor(state.t * 1.4) > Math.floor((state.t - dt) * 1.4)) {
      spawnGate();
    }

    // remove gates that drift too far
    for (let i = gates.length - 1; i >= 0; i--) {
      if (gates[i].r > player.r + 280) gates.splice(i, 1);
    }

    // collision/passing logic: check nearest gate by radius
    let nearest = null;
    let nearestIdx = -1;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const d = Math.abs(g.r - player.r);
      if (!nearest || d < nearest.d) {
        nearest = { g, d };
        nearestIdx = i;
      }
    }

    if (nearest) {
      const g = nearest.g;
      if (!g.passed) {
        const res = gateCheck(g);

        if (res.passed) {
          g.passed = true;
          state.streak += 1;
          state.combo = Math.min(50, state.combo + 1);

          // scoring: base + streak bonus + near miss bonus
          const base = 25;
          const streakBonus = Math.floor(state.streak * 0.6);
          const nearBonus = res.near ? 18 : 0;
          const comboBonus = Math.floor(state.combo * 0.25);

          state.score += base + streakBonus + nearBonus + comboBonus;

          state.flash = Math.min(1, state.flash + (res.near ? 0.18 : 0.10));
          state.shake = Math.min(14, state.shake + (res.near ? 10 : 6));

          if (res.near) toast("Near miss!");
          if (state.streak > 0 && state.streak % 10 === 0) toast(`${state.streak} streak!`);

          ui.score.textContent = state.score;
          ui.streak.textContent = state.streak;
        }

        if (res.hit && player.invuln <= 0) {
          player.alive = false;
          gameOver();
        }
      }
    }

    // decay effects
    state.shake = Math.max(0, state.shake - 40 * dt);
    state.flash = Math.max(0, state.flash - 1.4 * dt);
    player.invuln = Math.max(0, player.invuln - dt);

    // UI sync
    ui.score.textContent = state.score;
    ui.streak.textContent = state.streak;
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.5, cy = H * 0.52;

    // camera shake
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;

    ctx.save();
    ctx.translate(sx, sy);

    // clear
    ctx.clearRect(-sx, -sy, W, H);

    // background
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    drawBackground(cx, cy);

    // gates
    for (const g of gates) drawGate(g);

    // orbit guide
    drawUIRing(cx, cy);

    // player
    drawPlayer(cx, cy);

    // center core
    ctx.save();
    const core = ctx.createRadialGradient(cx, cy, 3, cx, cy, 24);
    core.addColorStop(0, "rgba(255,255,255,0.9)");
    core.addColorStop(0.35, "rgba(120,180,255,0.55)");
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // flash overlay
    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 0.22;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // subtle vignette
    ctx.save();
    const v = ctx.createRadialGradient(cx, cy, 120, cx, cy, Math.max(W,H)*0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function loop(now) {
    if (!state.running) {
      draw(); // keep anim feel behind overlay
      return;
    }
    state.dt = Math.min(0.04, (now - state.last) / 1000);
    state.last = now;

    step(state.dt);
    draw();

    if (state.running) requestAnimationFrame(loop);
  }

  // Initial render + overlay
  reset();
  draw();

  // Ensure overlay title is correct on load
  ui.overlay.querySelector("h1").textContent = "Orbit Split";
})();
