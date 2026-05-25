(() => {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const timer = document.getElementById("timer");
  const restartBtn = document.getElementById("restart");

  const CONFIG = {
    duration: 30000,
    cycle: 3000,
    lanes: 10,
    cycleBursts: 10,
    loop: true,
    canvasPixels: 2560 * 1440,
    maxDpr: 1.35,
    maxParticles: 1500,
    maxHearts: 30,
    maxMeteors: 5,
    backgroundFade: 0.26
  };

  const FIREWORK_STYLES = [
    "点状星雨", "爱心绽放", "玫瑰花朵", "笑脸烟花", "双层光环",
    "垂柳金瀑", "棕榈光束", "螺旋星河", "五角星芒", "菊花盛放"
  ];

  const COLORS = [
    "#ff4fa3", "#ff8bc8", "#ffd3ea", "#ffd166", "#fff1a8",
    "#54e5ff", "#7aa7ff", "#a88cff", "#72ffba", "#ff7b72"
  ];

  const ROSE_COLORS = [
    { base: "#ff75b7", light: "#ffd3ea", dark: "#9d1a58" },
    { base: "#f2c985", light: "#fff0c6", dark: "#9d6a23" },
    { base: "#e3293f", light: "#ff8b99", dark: "#7c0817" },
    { base: "#9a62d8", light: "#e1c8ff", dark: "#4a1d76" },
    { base: "#ff9ccc", light: "#ffe2f0", dark: "#a71d61" }
  ];

  const rockets = [];
  const particles = [];
  const hearts = [];
  const stars = [];
  const meteors = [];
  const roses = [];
  const leaves = [];
  let schedule = [];
  let nextEvent = 0;
  let nextMeteorAt = 0;
  let currentLoop = -1;
  let width = 2560;
  let height = 1440;
  let dpr = 1;
  let startedAt = 0;
  let lastNow = 0;
  let animationId = 0;

  class Rocket {
    constructor(event) {
      const startX = event.targetX + random(-width * 0.018, width * 0.018);
      this.x = startX;
      this.y = height + 40 * dpr;
      this.startX = startX;
      this.startY = this.y;
      this.targetX = event.targetX;
      this.targetY = event.targetY;
      this.color = event.color;
      this.style = event.style;
      this.duration = event.flight;
      this.age = 0;
      this.size = 3.6 * dpr;
      this.sway = event.sway;
      this.trail = [];
    }

    update(dt) {
      this.age += dt;
      const p = clamp(this.age / this.duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const sway = Math.sin(p * Math.PI) * this.sway;
      this.x = lerp(this.startX, this.targetX, eased) + sway;
      this.y = lerp(this.startY, this.targetY, eased);
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 6) this.trail.shift();

      if (p >= 1) {
        explode(this.x, this.y, this.color, this.style);
        return false;
      }
      return true;
    }

    draw(ctx) {
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 1; i < this.trail.length; i += 1) {
        const a = i / this.trail.length;
        ctx.globalAlpha = a * 0.72;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * a;
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10 * dpr;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Particle {
    constructor(x, y, vx, vy, color, life, size, gravity, drag, shape = "dot", angle = 0) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color;
      this.life = life;
      this.maxLife = life;
      this.size = size;
      this.gravity = gravity;
      this.drag = drag;
      this.shape = shape;
      this.angle = angle;
      this.spin = random(-3, 3);
    }

    update(dt) {
      this.life -= dt;
      const drag = Math.pow(this.drag, dt * 60);
      this.vx *= drag;
      this.vy = this.vy * drag + this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle += this.spin * dt;
      return this.life > 0;
    }

    draw(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      const alpha = Math.max(0, Math.sin(t * Math.PI));
      const radius = this.size * (0.5 + t * 0.8);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;

      if (this.shape === "spark") {
        ctx.lineWidth = Math.max(1, radius * 0.38);
        ctx.beginPath();
        ctx.moveTo(-radius * 2.2, 0);
        ctx.lineTo(radius * 2.2, 0);
        ctx.moveTo(0, -radius * 2.2);
        ctx.lineTo(0, radius * 2.2);
        ctx.stroke();
      } else if (this.shape === "petal") {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.7, radius * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.shape === "streak") {
        ctx.lineWidth = Math.max(1, radius * 0.55);
        ctx.beginPath();
        ctx.moveTo(-radius * 3.2, 0);
        ctx.lineTo(radius * 0.8, 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class Heart {
    constructor(x, y, size) {
      this.x = x;
      this.y = y;
      this.vx = random(-16, 16) * dpr;
      this.vy = random(-34, -64) * dpr;
      this.size = size;
      this.life = random(3.6, 5.2);
      this.maxLife = this.life;
      this.color = Math.random() > 0.45 ? "#ff8cc9" : "#ffd4ea";
      this.phase = random(0, Math.PI * 2);
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt + Math.sin(this.phase + this.life * 2) * 8 * dpr * dt;
      this.y += this.vy * dt;
      return this.life > 0 && this.y > -70;
    }

    draw(ctx) {
      const t = this.life / this.maxLife;
      drawHeart(ctx, this.x, this.y, this.size * (0.75 + t * 0.22), this.color, Math.min(0.78, t));
    }
  }

  class Meteor {
    constructor(now) {
      this.x = random(width * 0.2, width * 1.05);
      this.y = random(height * 0.04, height * 0.34);
      this.vx = random(-520, -760) * dpr;
      this.vy = random(230, 360) * dpr;
      this.life = random(0.82, 1.22);
      this.maxLife = this.life;
      this.length = random(150, 260) * dpr;
      this.color = Math.random() > 0.5 ? "#ffffff" : "#ffd3ea";
      this.born = now;
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return this.life > 0 && this.x > -this.length && this.y < height * 0.85;
    }

    draw(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      const tailX = this.x - Math.sign(this.vx) * this.length;
      const tailY = this.y - Math.sign(this.vy) * this.length * 0.42;
      const grad = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255,255,255,${0.92 * t})`);
      grad.addColorStop(0.3, this.color);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalAlpha = Math.min(1, t + 0.2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3.8 * dpr;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.restore();
    }
  }
  function buildSchedule() {
    const events = [];
    const margin = width * 0.055;
    const usableWidth = width - margin * 2;
    for (let cycle = 0; cycle < CONFIG.cycleBursts; cycle += 1) {
      for (let lane = 0; lane < CONFIG.lanes; lane += 1) {
        const x = margin + usableWidth * (lane / (CONFIG.lanes - 1));
        const yBand = lane % 2 === 0 ? 0.29 : 0.36;
        const wave = Math.sin(cycle * 0.85 + lane * 0.72) * height * 0.035;
        events.push({
          time: cycle * CONFIG.cycle + lane * 34,
          targetX: x,
          targetY: clamp(height * yBand + wave, height * 0.21, height * 0.48),
          color: COLORS[(cycle + lane) % COLORS.length],
          style: lane,
          flight: 0.78 + (lane % 4) * 0.04,
          sway: Math.sin(lane + cycle) * width * 0.008
        });
      }
    }
    schedule = events;
    nextEvent = 0;
  }

  function resize() {
    const cssWidth = Math.max(1, window.innerWidth);
    const cssHeight = Math.max(1, window.innerHeight);
    const pixelCapDpr = Math.sqrt(CONFIG.canvasPixels / (cssWidth * cssHeight));
    dpr = clamp(Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr, pixelCapDpr), 0.78, CONFIG.maxDpr);
    width = Math.floor(cssWidth * dpr);
    height = Math.floor(cssHeight * dpr);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    seedStars();
    seedRoses();
    buildSchedule();
  }

  function seedStars() {
    stars.length = 0;
    const count = Math.floor(clamp(width * height / 26000, 95, 190));
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.76,
        size: random(1.7, 4.4) * dpr,
        alpha: random(0.16, 0.78),
        phase: random(0, Math.PI * 2),
        speed: random(0.55, 1.7),
        drift: random(-8, 8) * dpr
      });
    }
  }

  function seedRoses() {
    roses.length = 0;
    leaves.length = 0;
    const bedHeight = getRoseBedHeight();
    const roseCount = Math.floor(clamp(width / (48 * dpr), 30, 62));
    for (let i = 0; i < roseCount; i += 1) {
      const x = (i + random(-0.22, 0.22)) / Math.max(1, roseCount - 1) * width;
      const depth = Math.random();
      roses.push({
        x: clamp(x, 8 * dpr, width - 8 * dpr),
        y: height - random(bedHeight * 0.22, bedHeight * 0.72),
        size: random(11, 24) * dpr * (0.75 + depth * 0.5),
        stem: random(bedHeight * 0.25, bedHeight * 0.75),
        color: ROSE_COLORS[i % ROSE_COLORS.length],
        phase: random(0, Math.PI * 2),
        depth
      });
    }

    const leafCount = Math.floor(clamp(width / (12 * dpr), 90, 180));
    for (let i = 0; i < leafCount; i += 1) {
      leaves.push({
        x: Math.random() * width,
        y: height - random(4 * dpr, bedHeight * 0.9),
        size: random(8, 20) * dpr,
        angle: random(-1.1, 1.1),
        alpha: random(0.48, 0.9),
        shade: Math.random() > 0.5 ? "#1e7a43" : "#2b9b59"
      });
    }
  }

  function launch(event) {
    rockets.push(new Rocket(event));
    if (hearts.length < CONFIG.maxHearts && (event.style === 1 || event.style === 2 || event.style === 7)) {
      hearts.push(new Heart(event.targetX + random(-24, 24) * dpr, height + random(10, 80) * dpr, random(10, 20) * dpr));
    }
  }

  function explode(x, y, color, style) {
    switch (style) {
      case 0: dottedBurst(x, y, color); break;
      case 1: heartBurst(x, y, color); break;
      case 2: roseFlowerBurst(x, y, color); break;
      case 3: smileyBurst(x, y, color); break;
      case 4: doubleRingBurst(x, y, color); break;
      case 5: willowBurst(x, y, color); break;
      case 6: palmBurst(x, y, color); break;
      case 7: spiralBurst(x, y, color); break;
      case 8: starBurst(x, y, color); break;
      default: chrysanthemumBurst(x, y, color); break;
    }
    flashBurst(x, y, color);
    trimParticles();
  }

  function dottedBurst(x, y, color) {
    const count = 56;
    for (let i = 0; i < count; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(90, 350) * dpr;
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, i % 3 ? color : pick(COLORS), random(1.05, 1.55), random(1.2, 2.8) * dpr, 90 * dpr, 0.985);
    }
  }

  function heartBurst(x, y, color) {
    const count = 62;
    for (let i = 0; i < count; i += 1) {
      const t = (i / count) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const scale = random(12, 18) * dpr;
      addParticle(x, y, hx * scale, hy * scale, i % 2 ? "#ff78bd" : color, random(1.45, 2.0), random(1.7, 3.4) * dpr, 105 * dpr, 0.986, "dot");
    }
  }

  function roseFlowerBurst(x, y, color) {
    const count = 64;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const petal = 0.62 + 0.38 * Math.sin(angle * 5 + 0.6);
      const speed = random(165, 315) * petal * dpr;
      const c = i % 3 === 0 ? "#ffd3ea" : color;
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, c, random(1.35, 1.95), random(2.0, 4.2) * dpr, 110 * dpr, 0.985, "petal", angle);
    }
  }

  function smileyBurst(x, y, color) {
    const face = "#ffd94d";
    const eye = "#fff8c9";
    const count = 64;
    const radius = 250 * dpr;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const speed = radius * random(0.86, 1.04);
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, face, random(1.35, 1.95), random(1.8, 3.5) * dpr, 95 * dpr, 0.986, "dot");
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        const centerX = side * 72 * dpr;
        const centerY = -52 * dpr;
        const vx = centerX + Math.cos(angle) * 28 * dpr;
        const vy = centerY + Math.sin(angle) * 28 * dpr;
        addParticle(x, y, vx * 3.1, vy * 3.1, eye, random(1.2, 1.7), random(1.8, 3.2) * dpr, 70 * dpr, 0.987, "spark", angle);
      }
    }

    for (let i = 0; i < 34; i += 1) {
      const t = Math.PI * (0.16 + 0.68 * (i / 33));
      const px = Math.cos(t) * 112 * dpr;
      const py = Math.sin(t) * 86 * dpr + 20 * dpr;
      addParticle(x, y, px * 2.7, py * 2.7, color || "#ff8bc8", random(1.32, 1.92), random(1.8, 3.5) * dpr, 85 * dpr, 0.987, "spark", t);
    }
  }
  function ringBurst(x, y, color) {
    const count = 58;
    const speed = random(235, 315) * dpr;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, i % 4 ? color : pick(COLORS), random(1.2, 1.65), random(1.6, 3.1) * dpr, 115 * dpr, 0.987);
    }
  }

  function doubleRingBurst(x, y, color) {
    for (let ring = 0; ring < 2; ring += 1) {
      const count = ring ? 52 : 40;
      const speed = (ring ? 330 : 225) * dpr;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + ring * 0.08;
        addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, ring ? pick(COLORS) : color, random(1.15, 1.75), random(1.4, 3.0) * dpr, 120 * dpr, 0.986);
      }
    }
  }
  function willowBurst(x, y, color) {
    const count = 66;
    for (let i = 0; i < count; i += 1) {
      const angle = random(Math.PI * 0.08, Math.PI * 0.92);
      const speed = random(90, 260) * dpr;
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 105 * dpr, i % 2 ? "#ffd166" : color, random(1.8, 2.8), random(1.7, 3.3) * dpr, 190 * dpr, 0.992, "streak", angle);
    }
  }

  function palmBurst(x, y, color) {
    const rays = 9;
    for (let r = 0; r < rays; r += 1) {
      const angle = -Math.PI * 0.88 + (r / (rays - 1)) * Math.PI * 1.76;
      for (let j = 0; j < 7; j += 1) {
        const speed = (185 + j * 25) * dpr;
        addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, j % 2 ? color : "#fff1a8", random(1.1, 1.8), random(1.6, 3.0) * dpr, 140 * dpr, 0.984, "streak", angle);
      }
    }
  }

  function spiralBurst(x, y, color) {
    const count = 70;
    for (let i = 0; i < count; i += 1) {
      const angle = i * 0.55;
      const speed = (110 + i * 3.4) * dpr;
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, i % 2 ? color : pick(COLORS), random(1.25, 1.9), random(1.4, 3.0) * dpr, 115 * dpr, 0.985, i % 3 ? "dot" : "spark", angle);
    }
  }

  function starBurst(x, y, color) {
    const rays = 5;
    for (let r = 0; r < rays; r += 1) {
      const angle = -Math.PI / 2 + r * Math.PI * 2 / rays;
      for (let j = 0; j < 12; j += 1) {
        const speed = (80 + j * 27) * dpr;
        addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, j % 2 ? color : "#ffffff", random(1.0, 1.7), random(1.4, 2.8) * dpr, 100 * dpr, 0.985, "spark", angle);
      }
    }
  }

  function chrysanthemumBurst(x, y, color) {
    const count = 78;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + random(-0.035, 0.035);
      const speed = random(185, 405) * dpr;
      const c = i % 3 === 0 ? color : COLORS[(i * 3) % COLORS.length];
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, c, random(1.25, 1.95), random(1.6, 3.5) * dpr, 130 * dpr, 0.985);
    }
  }

  function flashBurst(x, y, color) {
    for (let i = 0; i < 10; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(42, 128) * dpr;
      addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, "#ffffff", random(0.28, 0.56), random(1, 2.1) * dpr, 45 * dpr, 0.96);
    }
    ctx.save();
    const radius = Math.max(width, height) * 0.045;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(0.24, "rgba(255,255,255,0.58)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function addParticle(x, y, vx, vy, color, life, size, gravity, drag, shape, angle) {
    particles.push(new Particle(x, y, vx, vy, color, life, size, gravity, drag, shape, angle));
  }

  function trimParticles() {
    if (particles.length <= CONFIG.maxParticles) return;
    particles.splice(0, particles.length - CONFIG.maxParticles);
  }

  function update(dt, now, elapsed) {
    while (nextEvent < schedule.length && elapsed >= schedule[nextEvent].time) {
      if (elapsed - schedule[nextEvent].time < 900) launch(schedule[nextEvent]);
      nextEvent += 1;
    }

    if (now >= nextMeteorAt && meteors.length < CONFIG.maxMeteors) {
      meteors.push(new Meteor(now));
      nextMeteorAt = now + random(1100, 2600);
    }

    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      if (!rockets[i].update(dt)) rockets.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (!particles[i].update(dt)) particles.splice(i, 1);
    }

    for (let i = hearts.length - 1; i >= 0; i -= 1) {
      if (!hearts[i].update(dt)) hearts.splice(i, 1);
    }

    for (let i = meteors.length - 1; i >= 0; i -= 1) {
      if (!meteors[i].update(dt)) meteors.splice(i, 1);
    }
  }

  function draw(now, elapsed) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0, 0, 0, ${CONFIG.backgroundFade})`;
    ctx.fillRect(0, 0, width, height);

    drawNightSky(now, elapsed);
    drawStars(now);
    for (const meteor of meteors) meteor.draw(ctx);

    ctx.globalCompositeOperation = "lighter";
    for (const heart of hearts) heart.draw(ctx);
    for (const rocket of rockets) rocket.draw(ctx);
    for (const particle of particles) particle.draw(ctx);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    drawFinalBlessing(elapsed / CONFIG.duration);
    drawRoseGarden(now);
  }

  function drawNightSky(now, elapsed) {
    const progress = elapsed / CONFIG.duration;
    const pulse = (Math.sin(now * 0.00055) + 1) / 2;
    const glow = ctx.createRadialGradient(width / 2, height * 0.64, 0, width / 2, height * 0.64, Math.max(width, height) * 0.7);
    glow.addColorStop(0, `rgba(255, 70, 165, ${0.045 + pulse * 0.025})`);
    glow.addColorStop(0.48, "rgba(38, 18, 70, 0.035)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.09 + Math.sin(progress * Math.PI) * 0.05;
    for (let i = 0; i < 7; i += 1) {
      const x = width * (i / 6);
      const sway = Math.sin(now * 0.00042 + i * 0.9) * width * 0.035;
      const beam = ctx.createLinearGradient(x + sway, 0, width / 2, height);
      beam.addColorStop(0, "rgba(255, 150, 218, 0.28)");
      beam.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - width * 0.024 + sway, 0);
      ctx.lineTo(x + width * 0.024 + sway, 0);
      ctx.lineTo(width / 2 + sway * 0.28, height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStars(now) {
    ctx.save();
    for (const star of stars) {
      const twinkle = (Math.sin(star.phase + now * 0.001 * star.speed) + 1) * 0.5;
      const x = (star.x + Math.sin(now * 0.00012 + star.phase) * star.drift + width) % width;
      ctx.globalAlpha = star.alpha * (0.28 + twinkle * 0.72);
      ctx.fillStyle = twinkle > 0.86 ? "#ffd3ea" : "#ffffff";
      ctx.beginPath();
      ctx.arc(x, star.y, star.size * (0.65 + twinkle * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawRoseGarden(now) {
    const bedHeight = getRoseBedHeight();
    const baseY = height - bedHeight;
    ctx.save();
    const ground = ctx.createLinearGradient(0, baseY, 0, height);
    ground.addColorStop(0, "rgba(0,0,0,0)");
    ground.addColorStop(0.34, "rgba(9,42,24,0.66)");
    ground.addColorStop(1, "rgba(2,17,9,0.96)");
    ctx.fillStyle = ground;
    ctx.fillRect(0, baseY - 20 * dpr, width, bedHeight + 24 * dpr);

    for (const leaf of leaves) {
      drawLeaf(ctx, leaf.x, leaf.y, leaf.size, leaf.angle + Math.sin(now * 0.001 + leaf.x) * 0.08, leaf.shade, leaf.alpha);
    }

    const sorted = roses.slice().sort((a, b) => a.depth - b.depth);
    for (const rose of sorted) {
      const sway = Math.sin(now * 0.0012 + rose.phase) * 4.2 * dpr * (0.5 + rose.depth);
      const x = rose.x + sway;
      const y = rose.y + Math.sin(now * 0.001 + rose.phase) * 1.6 * dpr;
      drawStem(ctx, x, y, rose.stem, rose.depth);
      drawLeaf(ctx, x - rose.size * 0.7, y + rose.stem * 0.36, rose.size * 0.72, -0.7, "#2da35d", 0.86);
      drawLeaf(ctx, x + rose.size * 0.64, y + rose.stem * 0.5, rose.size * 0.68, 0.66, "#237d49", 0.82);
      drawRoseBloom(ctx, x, y, rose.size, rose.color, rose.phase);
    }
    ctx.restore();
  }

  function drawStem(ctx, x, y, stemLength, depth) {
    ctx.save();
    ctx.strokeStyle = depth > 0.5 ? "#2b8e4d" : "#176635";
    ctx.lineWidth = Math.max(1.2 * dpr, 2.2 * dpr * (0.7 + depth * 0.6));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + 2 * dpr);
    ctx.quadraticCurveTo(x + 8 * dpr, y + stemLength * 0.46, x, y + stemLength);
    ctx.stroke();
    ctx.restore();
  }

  function drawLeaf(ctx, x, y, size, angle, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(-size, 0, size, 0);
    grad.addColorStop(0, "#0f4d2a");
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, "#79d38d");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.95, size * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.34;
    ctx.strokeStyle = "#d8ffe0";
    ctx.lineWidth = Math.max(0.6, size * 0.055);
    ctx.beginPath();
    ctx.moveTo(-size * 0.72, 0);
    ctx.lineTo(size * 0.72, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoseBloom(ctx, x, y, size, color, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(phase) * 0.12);
    ctx.shadowColor = color.base;
    ctx.shadowBlur = 5 * dpr;

    ctx.fillStyle = color.dark;
    ctx.globalAlpha = 0.44;
    ctx.beginPath();
    ctx.arc(0, size * 0.12, size * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      const px = Math.cos(angle) * size * 0.38;
      const py = Math.sin(angle) * size * 0.28;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = i % 2 ? color.base : color.light;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.58, size * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 + 0.28;
      ctx.save();
      ctx.translate(Math.cos(angle) * size * 0.18, Math.sin(angle) * size * 0.14);
      ctx.rotate(angle);
      ctx.fillStyle = i % 2 ? color.dark : color.base;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.36, size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const center = ctx.createRadialGradient(0, 0, size * 0.04, 0, 0, size * 0.36);
    center.addColorStop(0, color.light);
    center.addColorStop(0.52, color.base);
    center.addColorStop(1, color.dark);
    ctx.fillStyle = center;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHeart(ctx, x, y, size, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 32, size / 32);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= 42; i += 1) {
      const t = (i / 42) * Math.PI * 2;
      const px = 16 * Math.pow(Math.sin(t), 3);
      const py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFinalBlessing(progress) {
    if (progress < 0.76) return;
    const alpha = clamp((progress - 0.76) / 0.12, 0, 1);
    const y = height * 0.72;
    ctx.save();
    ctx.globalAlpha = alpha * 0.86;
    ctx.font = `900 ${Math.max(26 * dpr, width * 0.028)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = "愿你每天都被温柔和好运抱住";
    const grad = ctx.createLinearGradient(width * 0.25, y, width * 0.75, y);
    grad.addColorStop(0, "#fff6fb");
    grad.addColorStop(0.45, "#ff91cb");
    grad.addColorStop(1, "#ffe07a");
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(255, 106, 190, 0.78)";
    ctx.shadowBlur = 18 * dpr;
    ctx.fillText(text, width / 2, y);
    ctx.restore();
  }

  function frame(now) {
    const totalElapsed = Date.now() - startedAt;
    const loopIndex = Math.floor(totalElapsed / CONFIG.duration);
    const elapsed = totalElapsed % CONFIG.duration;
    const dt = Math.min((now - lastNow) / 1000, 1 / 30);
    lastNow = now;

    if (loopIndex !== currentLoop) {
      currentLoop = loopIndex;
      nextEvent = 0;
    }

    update(dt, now, elapsed);
    draw(now, elapsed);

    const roundCountdown = Math.max(1, Math.ceil((CONFIG.duration - elapsed) / 1000));
    const styleIndex = Math.min(CONFIG.lanes - 1, Math.floor((elapsed % CONFIG.cycle) / CONFIG.cycle * CONFIG.lanes));
    timer.textContent = `第${currentLoop + 1}轮 · ${roundCountdown}s · ${FIREWORK_STYLES[styleIndex]}`;

    animationId = requestAnimationFrame(frame);
  }

  function restart() {
    cancelAnimationFrame(animationId);
    rockets.length = 0;
    particles.length = 0;
    hearts.length = 0;
    meteors.length = 0;
    buildSchedule();
    currentLoop = -1;
    nextMeteorAt = performance.now() + 900;
    startedAt = Date.now();
    lastNow = performance.now();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    animationId = requestAnimationFrame(frame);
  }

  function getRoseBedHeight() {
    return clamp(height * 0.18, 120 * dpr, 250 * dpr);
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function lerp(a, b, p) {
    return a + (b - a) * p;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  window.addEventListener("resize", () => {
    resize();
    restart();
  }, { passive: true });

  restartBtn.addEventListener("click", restart);

  canvas.addEventListener("click", event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    roseFlowerBurst(x, y, "#ff8bc8");
    heartBurst(x, y, "#ffd3ea");
    trimParticles();
  });

  resize();
  restart();
})();