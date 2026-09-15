/**
 * 年度星域航行控制器
 * 每一年是一片完整星空：包含多颗故事星和不可点击的环境星。
 * 滚轮、键盘或触摸手势只负责切换年份，点击故事星才读取具体回忆。
 */

class JourneyController {
  constructor({ years, layer, galaxy, memoryCard }) {
    this.years = years;
    this.layer = layer;
    this.galaxy = galaxy;
    this.memoryCard = memoryCard;
    this.activeYearIndex = 0;
    this.progress = 0;
    this.targetProgress = 0;
    this.mode = "journey";
    this.isActive = false;
    this.frameId = null;
    this.wheelAccumulator = 0;
    this.wheelResetTimer = null;
    this.navigationLockedUntil = 0;
    this.touchStartY = null;
    this.yearFields = [];
    this.birthSequenceId = 0;
    this.nearbyStoryNode = null;
    this.proximityFrameId = null;
    this.pendingPointer = null;
    this.proximityRadius = 118;

    this.hud = document.querySelector("#journey-hud");
    this.yearIndexLabel = document.querySelector("#chapter-index");
    this.yearName = document.querySelector("#chapter-name");
    this.currentYear = document.querySelector("#current-date");
    this.currentTitle = document.querySelector("#current-title");
    this.currentSummary = document.querySelector("#current-excerpt");
    this.memoryCount = document.querySelector("#year-memory-count");
    this.yearNavigation = document.querySelector("#year-navigation");
    this.preview = document.querySelector("#signal-preview");
    this.viewButtons = [...document.querySelectorAll("[data-view]")];

    this.render = this.render.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.clearNearbyStory = this.clearNearbyStory.bind(this);
  }

  /** 创建每一片年度星域、故事星与环境星。 */
  init() {
    this.yearFields = this.years.map((yearGroup, yearIndex) => {
      const field = document.createElement("section");
      field.className = `year-field year-field--${yearGroup.tone}`;
      field.dataset.year = yearGroup.year;
      field.setAttribute("aria-label", `${yearGroup.year} 年度星域`);

      const heading = document.createElement("h3");
      heading.className = "year-field__heading";
      heading.innerHTML = `<span>${yearGroup.year}</span><small>${yearGroup.name}</small>`;
      field.appendChild(heading);

      const ambientStars = this.createAmbientStars(yearGroup, yearIndex);
      const storyNodes = yearGroup.stories.map((story) => this.createStoryNode(story, yearIndex));
      [...ambientStars, ...storyNodes].forEach((node) => field.appendChild(node.element));
      this.layer.appendChild(field);

      return { element: field, heading, ambientStars, storyNodes };
    });

    this.createYearNavigation();
    this.bindEvents();
    this.updateYearContent(true);
    this.layoutFields();
  }

  /** 以确定性随机数生成环境星，使每次刷新仍保留相同星群构图。 */
  createAmbientStars(yearGroup, yearIndex) {
    const count = window.innerWidth < 700 ? 28 : 46;
    const random = this.seededRandom((yearIndex + 1) * 9187);

    return Array.from({ length: count }, (_, index) => {
      const element = document.createElement("span");
      element.className = "year-field__dust";
      element.setAttribute("aria-hidden", "true");

      // 高斯近似让星尘更容易在中心形成星群，同时保留少量外围散点。
      const x = this.clamp01((random() + random() + random()) / 3);
      const y = this.clamp01((random() + random() + random()) / 3);
      const size = 0.45 + random() * (index % 11 === 0 ? 2.1 : 1.05);
      const opacity = 0.16 + random() * 0.58;
      element.style.setProperty("--dust-size", `${size}px`);
      element.style.setProperty("--dust-opacity", opacity.toFixed(2));
      element.style.animationDelay = `${-random() * 7}s`;

      return { element, x, y, phase: random() * Math.PI * 2, depth: 0.5 + random() };
    });
  }

  /** 创建一颗真实可点击的故事星。 */
  createStoryNode(story, yearIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `story-star story-star--${story.color}`;
    if (story.x > 0.7) button.classList.add("story-star--label-left");
    button.dataset.storyId = story.id;
    const storedSize = Number(story.size);
    const fallbackSize = 0.72 + this.seedFromText(story.id) * 0.2;
    const visualSize = Math.max(0.68, Math.min(0.92, Number.isFinite(storedSize) ? storedSize : fallbackSize));
    button.style.setProperty("--story-visual-size", visualSize.toFixed(3));
    button.setAttribute("aria-label", `${story.date}，${story.title}`);
    button.innerHTML = `
      <span class="story-star__halo" aria-hidden="true"></span>
      <span class="story-star__core" aria-hidden="true"></span>
      <span class="story-star__label">
        <time datetime="${story.date}">${story.date.replaceAll("-", ".")}</time>
        <strong>${story.title}</strong>
      </span>
    `;
    button.addEventListener("click", () => this.openPreview(story, yearIndex));

    return {
      element: button,
      story,
      x: story.x,
      y: story.y,
      phase: story.x * 17 + story.y * 29,
      depth: 1 + story.importance * 0.5,
      visualSize,
    };
  }

  /** 制作模式确认后先把新星静默插入；抵达目标年份时才真正点亮。 */
  addStory(story, yearIndex) {
    const field = this.yearFields[yearIndex];
    if (!field) return;
    const node = this.createStoryNode(story, yearIndex);
    node.element.classList.add("is-awaiting-birth");
    field.storyNodes.push(node);
    field.element.appendChild(node.element);
    this.createYearNavigation();
    this.updateYearContent(true);
    this.layoutFields();
    return node;
  }

  /**
   * 关闭制作面板后自动进入星空、航行至指定年份，再播放完整的新星诞生动画。
   * 等待实际镜头进度而非固定延时，因此跨越一年或十年的体验都能保持一致。
   */
  async revealNewStory(story, yearIndex) {
    const field = this.yearFields[yearIndex];
    const node = field?.storyNodes.find((item) => item.story?.id === story.id);
    if (!field || !node) return;

    const sequenceId = ++this.birthSequenceId;
    document.querySelector(".app-shell")?.classList.add("is-observing");
    this.galaxy.setObservationMode(true);
    if (!this.isActive) this.start();
    if (this.mode === "map") this.setMode("journey");

    this.goToYear(yearIndex);
    this.navigationLockedUntil = performance.now() + 5200;
    await this.waitForYearArrival(yearIndex, sequenceId);
    if (sequenceId !== this.birthSequenceId) return;

    node.element.classList.remove("is-awaiting-birth");
    // 强制浏览器提交隐藏状态，确保下一帧从微光开始动画。
    void node.element.offsetWidth;
    node.element.classList.add("is-newborn");
    field.element.classList.add("is-receiving-star");
    this.hud.classList.add("is-witnessing-birth");

    window.setTimeout(() => {
      node.element.classList.remove("is-newborn");
      field.element.classList.remove("is-receiving-star");
      this.hud.classList.remove("is-witnessing-birth");
    }, 5200);
  }

  waitForYearArrival(yearIndex, sequenceId) {
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const check = () => {
        const arrived = Math.abs(this.progress - yearIndex) < 0.045;
        const timedOut = performance.now() - startedAt > 2700;
        if (arrived || timedOut || sequenceId !== this.birthSequenceId) {
          window.setTimeout(resolve, arrived ? 260 : 80);
          return;
        }
        window.requestAnimationFrame(check);
      };
      window.requestAnimationFrame(check);
    });
  }

  /** 创建右侧年份目录，点击可直接抵达对应年度。 */
  createYearNavigation() {
    this.yearNavigation.innerHTML = "";
    this.years.forEach((yearGroup, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.yearIndex = String(index);
      button.innerHTML = `<span>${yearGroup.year}</span><small>${String(yearGroup.stories.length).padStart(2, "0")}</small>`;
      button.addEventListener("click", () => {
        if (this.mode === "map") this.setMode("journey");
        this.goToYear(index);
      });
      this.yearNavigation.appendChild(button);
    });
  }

  bindEvents() {
    window.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("touchstart", this.handleTouchStart, { passive: true });
    window.addEventListener("touchend", this.handleTouchEnd, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });
    window.addEventListener("pointermove", this.handlePointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", this.clearNearbyStory);
    window.addEventListener("blur", this.clearNearbyStory);

    this.viewButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === this.mode));
      button.addEventListener("click", () => this.setMode(button.dataset.view));
    });
  }

  /** 从序章进入第一片年度星域。 */
  start() {
    if (this.isActive) return;
    this.isActive = true;
    document.body.classList.add("journey-active");
    this.layer.classList.add("is-visible");
    this.hud.classList.add("is-visible");
    this.frameId = requestAnimationFrame(this.render);
  }

  /**
   * 累积滚轮输入，越过阈值才切换一次年份。
   * 850ms 锁定避免触控板惯性连续跳过多个年度星域。
   */
  handleWheel(event) {
    if (!this.isActive || this.mode !== "journey" || this.preview.open) return;
    event.preventDefault();
    if (performance.now() < this.navigationLockedUntil) return;

    this.wheelAccumulator += event.deltaY;
    window.clearTimeout(this.wheelResetTimer);
    this.wheelResetTimer = window.setTimeout(() => {
      this.wheelAccumulator = 0;
    }, 180);

    if (Math.abs(this.wheelAccumulator) >= 48) {
      this.stepYear(this.wheelAccumulator > 0 ? 1 : -1);
      this.wheelAccumulator = 0;
    }
  }

  /** 键盘同样按年度切换，而非逐故事切换。 */
  handleKeydown(event) {
    if (event.key === "Escape" && this.preview.open) {
      event.preventDefault();
      this.memoryCard.close();
      return;
    }
    if (!this.isActive || this.preview.open || this.mode !== "journey") return;

    if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      this.stepYear(1);
    } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      this.stepYear(-1);
    }
  }

  handleTouchStart(event) {
    if (!this.isActive || this.mode !== "journey" || this.preview.open) return;
    this.touchStartY = event.touches[0].clientY;
  }

  handleTouchEnd(event) {
    if (this.touchStartY === null || this.mode !== "journey" || this.preview.open) return;
    const distance = this.touchStartY - event.changedTouches[0].clientY;
    if (Math.abs(distance) > 44) this.stepYear(distance > 0 ? 1 : -1);
    this.touchStartY = null;
  }

  handleResize() {
    this.clearNearbyStory();
    this.layoutFields();
  }

  /**
   * 鼠标尚未悬停、只要进入星星周围的感应半径，就显示距离最近的一颗故事星信息。
   * 使用 requestAnimationFrame 合并高频指针事件，避免星空动画运行时重复计算布局。
   */
  handlePointerMove(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    this.pendingPointer = { x: event.clientX, y: event.clientY };
    if (this.proximityFrameId) return;
    this.proximityFrameId = window.requestAnimationFrame(() => {
      this.proximityFrameId = null;
      this.updateNearbyStory();
    });
  }

  updateNearbyStory() {
    if (!this.pendingPointer || !this.isActive || this.preview.open || document.querySelector("#maker-panel")?.open) {
      this.clearNearbyStory();
      return;
    }

    const { x, y } = this.pendingPointer;
    let nearestNode = null;
    let nearestDistance = Infinity;
    this.yearFields.forEach((field) => {
      field.storyNodes.forEach((node) => {
        const element = node.element;
        if (element.tabIndex < 0 || element.classList.contains("is-awaiting-birth")) return;
        const rect = element.getBoundingClientRect();
        const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestNode = node;
        }
      });
    });

    // 离开时稍微扩大阈值，减少鼠标在边缘移动造成的闪烁。
    const threshold = nearestNode === this.nearbyStoryNode ? this.proximityRadius + 22 : this.proximityRadius;
    this.setNearbyStory(nearestDistance <= threshold ? nearestNode : null);
  }

  setNearbyStory(node) {
    if (node === this.nearbyStoryNode) return;
    this.nearbyStoryNode?.element.classList.remove("is-nearby");
    this.nearbyStoryNode = node;
    this.nearbyStoryNode?.element.classList.add("is-nearby");
  }

  clearNearbyStory() {
    this.pendingPointer = null;
    this.setNearbyStory(null);
  }

  /** 平滑推动整片年度星空靠近或远离。 */
  render(now) {
    this.progress += (this.targetProgress - this.progress) * 0.055;
    if (Math.abs(this.targetProgress - this.progress) < 0.0005) this.progress = this.targetProgress;
    this.galaxy.setJourneyProgress(this.years.length > 1 ? this.progress / (this.years.length - 1) : 0);
    this.layoutFields(now / 1000);
    this.frameId = requestAnimationFrame(this.render);
  }

  /**
   * 航行模式：当前年份铺开成完整星空，相邻年份在远方收拢成星群。
   * 星图模式：所有年份缩成独立星云区域，同时组成完整银河全景。
   */
  layoutFields(elapsed = 0) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const compact = width < 700;

    this.yearFields.forEach((field, yearIndex) => {
      const yearGroup = this.years[yearIndex];
      const delta = yearIndex - this.progress;
      const proximity = Math.max(0, 1 - Math.abs(delta));
      const isCurrent = yearIndex === this.activeYearIndex;

      field.element.classList.toggle("is-current", isCurrent && this.mode === "journey");
      field.element.style.pointerEvents =
        this.isActive && (this.mode === "map" || proximity > 0.72) ? "auto" : "none";
      field.heading.style.setProperty("--year-heading-x", `${yearGroup.mapX * width}px`);
      field.heading.style.setProperty("--year-heading-y", `${yearGroup.mapY * height}px`);

      [...field.ambientStars, ...field.storyNodes].forEach((node, nodeIndex) => {
        let x;
        let y;
        let scale;
        let opacity;

        if (this.mode === "map") {
          const clusterWidth = compact ? width * 0.34 : width * 0.27;
          const clusterHeight = compact ? height * 0.25 : height * 0.3;
          const centerX = yearGroup.mapX * width;
          const centerY = yearGroup.mapY * height;
          x = centerX + (node.x - 0.58) * clusterWidth;
          y = centerY + (node.y - 0.5) * clusterHeight;
          scale = field.storyNodes.includes(node) ? 0.76 : 0.72;
          opacity = field.storyNodes.includes(node) ? 1 : 0.54;
        } else {
          const fieldLeft = compact ? width * 0.05 : width * 0.025;
          const fieldTop = compact ? height * 0.12 : height * 0.08;
          const fieldWidth = compact ? width * 0.9 : width * 0.95;
          const fieldHeight = compact ? height * 0.5 : height * 0.78;
          const depthShift = Math.max(-1.2, Math.min(1.2, delta));
          const collapse = 0.22 + proximity * 0.78;
          const centerX = compact ? width * 0.57 : width * 0.68;
          const centerY = compact ? height * 0.33 : height * 0.47;

          x = centerX + (fieldLeft + node.x * fieldWidth - centerX) * collapse;
          y = centerY + (fieldTop + node.y * fieldHeight - centerY) * collapse;
          x += depthShift * width * 0.44;
          y += Math.abs(depthShift) * height * 0.04;
          scale = 0.28 + proximity * 0.78;
          opacity = Math.max(0, 0.12 + proximity * 0.92 - Math.abs(delta) * 0.32);
        }

        const driftX = Math.sin(elapsed * 0.12 + node.phase + nodeIndex) * node.depth * 1.7;
        const driftY = Math.cos(elapsed * 0.1 + node.phase + nodeIndex) * node.depth * 1.2;
        const element = node.element;
        element.style.setProperty("--star-x", `${x + driftX}px`);
        element.style.setProperty("--star-y", `${y + driftY}px`);
        element.style.setProperty("--star-scale", scale.toFixed(3));
        element.style.setProperty("--star-opacity", opacity.toFixed(3));

        if (node.story) {
          const interactive =
            this.isActive && opacity > 0.35 && (this.mode === "map" || isCurrent);
          element.style.pointerEvents = interactive ? "auto" : "none";
          element.tabIndex = interactive ? 0 : -1;
        }
      });
    });
  }

  /** 前往指定年份并更新年度文案与导航高亮。 */
  goToYear(index) {
    this.clearNearbyStory();
    const nextIndex = Math.min(this.years.length - 1, Math.max(0, index));
    if (nextIndex === this.activeYearIndex && this.targetProgress === nextIndex) return;
    this.activeYearIndex = nextIndex;
    this.targetProgress = nextIndex;
    this.navigationLockedUntil = performance.now() + 850;
    this.updateYearContent();
  }

  stepYear(direction) {
    this.goToYear(this.activeYearIndex + direction);
  }

  updateYearContent(force = false) {
    const yearGroup = this.years[this.activeYearIndex];
    this.yearIndexLabel.textContent = `YEAR ${String(this.activeYearIndex + 1).padStart(2, "0")}`;
    this.yearName.textContent = yearGroup.name;
    this.currentYear.textContent = yearGroup.year;
    this.currentYear.dateTime = yearGroup.year === "未来" ? "" : yearGroup.year;
    this.currentTitle.textContent = yearGroup.title;
    this.currentSummary.textContent = yearGroup.summary;
    this.memoryCount.textContent = yearGroup.stories.length
      ? `${yearGroup.stories.length} MEMORIES · ${yearGroup.stories.length} 颗故事星`
      : "NO NAMED STARS · 尚未添加故事星";

    if (!force) {
      this.hud.classList.remove("is-changing");
      requestAnimationFrame(() => this.hud.classList.add("is-changing"));
    }

    [...this.yearNavigation.children].forEach((button, index) => {
      const active = index === this.activeYearIndex;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
    });
  }

  /** 航行 / 星图双模式共享同一批年度故事。 */
  setMode(mode) {
    if (!this.isActive || mode === this.mode) return;
    this.clearNearbyStory();
    this.mode = mode;
    document.body.classList.toggle("map-mode", mode === "map");
    this.viewButtons.forEach((button) => {
      const active = button.dataset.view === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    this.layoutFields();
  }

  /** 填充并打开故事信号预览。 */
  openPreview(story, yearIndex) {
    const year = this.years[yearIndex].year;
    this.memoryCard.open(story, year);
  }

  seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  seedFromText(text) {
    let seed = 2166136261;
    for (const character of String(text)) {
      seed ^= character.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    return (seed >>> 0) / 4294967296;
  }

  clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.wheelResetTimer);
    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("touchstart", this.handleTouchStart);
    window.removeEventListener("touchend", this.handleTouchEnd);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handlePointerMove);
    document.documentElement.removeEventListener("mouseleave", this.clearNearbyStory);
    window.removeEventListener("blur", this.clearNearbyStory);
    if (this.proximityFrameId) cancelAnimationFrame(this.proximityFrameId);
  }
}

window.JourneyController = JourneyController;
