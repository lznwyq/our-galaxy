/**
 * 动态银河渲染模块
 * 使用 Canvas 2D 创建多层背景星、螺旋星尘和柔和星云。
 * 故事节点将在下一阶段作为独立图层加入，避免与装饰粒子耦合。
 */

const TAU = Math.PI * 2;

/** 在指定范围内生成随机数。 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/** 根据设备宽度返回粒子密度，控制移动端绘制成本。 */
function getParticleBudget(width) {
  if (width < 520) return { stars: 160, dust: 520 };
  if (width < 1024) return { stars: 240, dust: 800 };
  return { stars: 360, dust: 1250 };
}

class GalaxyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.frameId = null;
    this.startedAt = performance.now();
    this.lastFrameAt = 0;
    this.rotation = 0;
    this.targetParallax = { x: 0, y: 0 };
    this.parallax = { x: 0, y: 0 };
    this.intensity = 1;
    this.targetIntensity = 1;
    this.journeyProgress = 0;
    this.targetJourneyProgress = 0;
    this.backgroundStars = [];
    this.foregroundStars = [];
    this.galaxyDust = [];
    this.nebulaCanvas = document.createElement("canvas");
    this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.render = this.render.bind(this);
  }

  /** 初始化尺寸、粒子数据和浏览器事件。 */
  init() {
    if (!this.context) return;

    this.handleResize();
    window.addEventListener("resize", this.handleResize, { passive: true });
    window.addEventListener("pointermove", this.handlePointerMove, { passive: true });

    if (this.prefersReducedMotion) {
      this.draw(performance.now());
      return;
    }

    this.frameId = requestAnimationFrame(this.render);
  }

  /** 进入观测状态时轻微提高银河亮度。 */
  setObservationMode(enabled) {
    this.targetIntensity = enabled ? 1.22 : 1;
  }

  /** 接收时间航行进度，让背景与故事星产生统一但克制的空间位移。 */
  setJourneyProgress(progress) {
    this.targetJourneyProgress = Math.min(1, Math.max(0, progress));
  }

  /** 同步画布像素尺寸，并重新生成适应该屏幕的粒子。 */
  handleResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.createParticles();
    this.createNebulaTexture();

    if (this.prefersReducedMotion) this.draw(performance.now());
  }

  /** 鼠标只产生很轻的视差，避免破坏缓慢、克制的运动节奏。 */
  handlePointerMove(event) {
    this.targetParallax.x = (event.clientX / this.width - 0.5) * 68;
    this.targetParallax.y = (event.clientY / this.height - 0.5) * 46;
  }

  /** 生成背景星和带螺旋结构的银河星尘。 */
  createParticles() {
    const budget = getParticleBudget(this.width);

    this.backgroundStars = Array.from({ length: budget.stars }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: randomBetween(0.25, 1.15),
      alpha: randomBetween(0.18, 0.78),
      phase: randomBetween(0, TAU),
      speed: randomBetween(0.28, 0.62),
      depth: randomBetween(0.25, 1),
    }));

    // 少量近景星拥有独立光晕和更明显的呼吸，用于传达场景正在运行。
    this.foregroundStars = Array.from({ length: this.width < 520 ? 9 : 16 }, () => ({
      x: randomBetween(0.06, 0.94),
      y: randomBetween(0.08, 0.9),
      radius: randomBetween(1.1, 2.05),
      alpha: randomBetween(0.5, 0.9),
      phase: randomBetween(0, TAU),
      speed: randomBetween(0.46, 0.9),
      depth: randomBetween(1.1, 1.7),
    }));

    this.galaxyDust = Array.from({ length: budget.dust }, (_, index) => {
      const armCount = 4;
      const arm = index % armCount;
      const radius = Math.pow(Math.random(), 0.72);
      const armAngle = (arm / armCount) * TAU;
      const angle = armAngle + radius * 5.4 + randomBetween(-0.42, 0.42) * (0.3 + radius);

      return {
        angle,
        radius,
        spread: randomBetween(-1, 1) * (0.1 + radius * 0.33),
        size: randomBetween(0.3, radius < 0.2 ? 1.8 : 1.25),
        alpha: randomBetween(0.08, 0.5) * (1.08 - radius * 0.42),
        phase: randomBetween(0, TAU),
        hue: Math.random(),
      };
    });
  }

  /**
   * 将昂贵的径向渐变预绘制到离屏画布。
   * 动画帧中只需旋转并绘制一张纹理，减少实时计算。
   */
  createNebulaTexture() {
    const size = Math.min(Math.max(Math.max(this.width, this.height), 720), 1500);
    const canvas = this.nebulaCanvas;
    const context = canvas.getContext("2d");

    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);

    const center = size / 2;
    const core = context.createRadialGradient(center, center, 0, center, center, size * 0.46);
    core.addColorStop(0, "rgba(210, 193, 182, 0.16)");
    core.addColorStop(0.16, "rgba(118, 105, 157, 0.10)");
    core.addColorStop(0.52, "rgba(82, 71, 125, 0.045)");
    core.addColorStop(1, "rgba(5, 7, 17, 0)");

    context.fillStyle = core;
    context.fillRect(0, 0, size, size);

    context.save();
    context.translate(center, center);
    context.rotate(-0.45);
    context.scale(1, 0.27);
    const band = context.createRadialGradient(0, 0, 0, 0, 0, size * 0.46);
    band.addColorStop(0, "rgba(223, 205, 190, 0.09)");
    band.addColorStop(0.35, "rgba(137, 110, 158, 0.07)");
    band.addColorStop(1, "rgba(17, 18, 38, 0)");
    context.fillStyle = band;
    context.beginPath();
    context.arc(0, 0, size * 0.46, 0, TAU);
    context.fill();
    context.restore();
  }

  /** 动画循环：限制在约 45 FPS，节省移动设备电量。 */
  render(now) {
    if (now - this.lastFrameAt >= 1000 / 45) {
      const delta = Math.min(now - (this.lastFrameAt || now), 50);
      // 约 6 分钟旋转一周：保持舒缓，同时让旋臂位移清晰可感知。
      this.rotation += delta * 0.00001745;
      this.lastFrameAt = now;
      this.draw(now);
    }

    this.frameId = requestAnimationFrame(this.render);
  }

  /** 绘制一次完整画面。 */
  draw(now) {
    const context = this.context;
    const elapsedSeconds = (now - this.startedAt) / 1000;

    this.parallax.x += (this.targetParallax.x - this.parallax.x) * 0.045;
    this.parallax.y += (this.targetParallax.y - this.parallax.y) * 0.045;
    this.intensity += (this.targetIntensity - this.intensity) * 0.025;
    this.journeyProgress += (this.targetJourneyProgress - this.journeyProgress) * 0.025;

    context.fillStyle = "#050711";
    context.fillRect(0, 0, this.width, this.height);

    this.drawBackgroundStars(context, elapsedSeconds);
    this.drawNebula(context);
    this.drawGalaxyDust(context, elapsedSeconds);
    this.drawCoreGlow(context);
    this.drawForegroundStars(context, elapsedSeconds);
  }

  /** 绘制较远的背景星层。 */
  drawBackgroundStars(context, elapsedSeconds) {
    for (const star of this.backgroundStars) {
      const twinkle = 0.72 + Math.sin(elapsedSeconds * star.speed + star.phase) * 0.28;
      const x = star.x * this.width + this.parallax.x * star.depth;
      const y = star.y * this.height + this.parallax.y * star.depth;

      context.beginPath();
      context.fillStyle = `rgba(232, 229, 221, ${star.alpha * twinkle * this.intensity})`;
      context.arc(x, y, star.radius, 0, TAU);
      context.fill();
    }
  }

  /** 绘制会极慢旋转的星云底色。 */
  drawNebula(context) {
    const size = Math.max(this.width, this.height) * 1.28;

    context.save();
    context.globalAlpha = 0.78 * this.intensity;
    context.translate(
      this.width * 0.58 + this.parallax.x * 0.25 - this.journeyProgress * 26,
      this.height * 0.48 + this.parallax.y * 0.25 + Math.sin(this.journeyProgress * Math.PI) * 12,
    );
    context.rotate(this.rotation * 0.55 - 0.16);
    context.drawImage(this.nebulaCanvas, -size / 2, -size / 2, size, size);
    context.restore();
  }

  /** 绘制银河旋臂粒子；椭圆投影让银河具有空间倾角。 */
  drawGalaxyDust(context, elapsedSeconds) {
    const scale = Math.min(this.width, this.height) * (this.width < 600 ? 0.66 : 0.78);
    const driftX = Math.sin(elapsedSeconds * 0.075) * 7 - this.journeyProgress * 34;
    const driftY = Math.cos(elapsedSeconds * 0.058) * 4;
    const centerX =
      this.width * (this.width < 600 ? 0.64 : 0.67) + this.parallax.x * 0.9 + driftX;
    const centerY =
      this.height * (this.width < 600 ? 0.35 : 0.46) + this.parallax.y * 0.9 + driftY;

    context.save();
    context.globalCompositeOperation = "lighter";

    for (const particle of this.galaxyDust) {
      const angle = particle.angle + this.rotation * (1.15 - particle.radius * 0.35);
      const radialDistance = particle.radius * scale;
      const x = centerX + Math.cos(angle) * radialDistance;
      const y = centerY + Math.sin(angle) * radialDistance * 0.34 + particle.spread * scale * 0.19;
      const twinkle = 0.78 + Math.sin(elapsedSeconds * 0.32 + particle.phase) * 0.22;

      let color = "232, 229, 221";
      if (particle.hue < 0.2) color = "215, 185, 121";
      else if (particle.hue > 0.84) color = "183, 125, 145";

      context.beginPath();
      context.fillStyle = `rgba(${color}, ${particle.alpha * twinkle * this.intensity})`;
      context.arc(x, y, particle.size, 0, TAU);
      context.fill();
    }

    context.restore();
  }

  /**
   * 绘制少量近景恒星。
   * 光晕、核心和十字星芒分层绘制，使呼吸效果在数秒内清晰可见。
   */
  drawForegroundStars(context, elapsedSeconds) {
    context.save();
    context.globalCompositeOperation = "lighter";

    for (const star of this.foregroundStars) {
      const pulse = 0.62 + Math.sin(elapsedSeconds * star.speed + star.phase) * 0.38;
      const x =
        star.x * this.width +
        this.parallax.x * star.depth +
        Math.sin(elapsedSeconds * 0.11 + star.phase) * 1.8;
      const y =
        star.y * this.height +
        this.parallax.y * star.depth +
        Math.cos(elapsedSeconds * 0.09 + star.phase) * 1.4;
      const glowRadius = star.radius * (3.8 + pulse * 2.4);

      context.beginPath();
      context.fillStyle = `rgba(190, 181, 216, ${star.alpha * pulse * 0.12})`;
      context.arc(x, y, glowRadius, 0, TAU);
      context.fill();

      context.beginPath();
      context.fillStyle = `rgba(244, 239, 229, ${star.alpha * (0.62 + pulse * 0.38)})`;
      context.arc(x, y, star.radius * (0.82 + pulse * 0.22), 0, TAU);
      context.fill();

      if (pulse > 0.58) {
        const ray = star.radius * (2.2 + pulse * 2.8);
        context.beginPath();
        context.strokeStyle = `rgba(226, 216, 207, ${star.alpha * pulse * 0.2})`;
        context.lineWidth = 0.55;
        context.moveTo(x - ray, y);
        context.lineTo(x + ray, y);
        context.moveTo(x, y - ray);
        context.lineTo(x, y + ray);
        context.stroke();
      }
    }

    context.restore();
  }

  /** 用柔和渐变强化银河中心，不使用夸张炫光。 */
  drawCoreGlow(context) {
    const centerX = this.width * (this.width < 600 ? 0.64 : 0.67) + this.parallax.x * 0.45;
    const centerY = this.height * (this.width < 600 ? 0.35 : 0.46) + this.parallax.y * 0.45;
    const radius = Math.min(this.width, this.height) * 0.13;
    const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

    glow.addColorStop(0, `rgba(240, 225, 202, ${0.12 * this.intensity})`);
    glow.addColorStop(0.25, `rgba(171, 143, 159, ${0.07 * this.intensity})`);
    glow.addColorStop(1, "rgba(5, 7, 17, 0)");

    context.fillStyle = glow;
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  /** 清理动画和事件，便于未来页面切换时释放资源。 */
  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handlePointerMove);
  }
}

// 暴露给页面入口使用；避免 ES Module 在 file:// 协议下被浏览器拦截。
window.GalaxyRenderer = GalaxyRenderer;
