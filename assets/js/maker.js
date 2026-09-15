/**
 * 制作模式
 * 提供滚轮日期选择、故事填写与创建前照片上传；确认后才生成一颗故事星。
 */

class MakerMode {
  constructor({ dialog, years, storyStore, journey, memoryStore, memoryCard }) {
    this.dialog = dialog;
    this.years = years;
    this.storyStore = storyStore;
    this.journey = journey;
    this.memoryStore = memoryStore;
    this.memoryCard = memoryCard;
    this.form = dialog.querySelector("form");
    this.timeline = window.GALAXY_TIMELINE;
    this.regionValue = document.querySelector("#maker-region-value");
    this.regionRule = document.querySelector("#maker-region-rule");
    this.status = document.querySelector("#maker-status");
    this.closeButton = dialog.querySelector(".maker-panel__close");
    this.openButton = document.querySelector("#maker-open");
    this.submitButton = this.form.querySelector('[type="submit"]');

    this.dateInput = document.querySelector("#maker-date-value");
    this.dateColumns = {
      year: document.querySelector("#maker-date-year"),
      month: document.querySelector("#maker-date-month"),
      day: document.querySelector("#maker-date-day"),
    };
    this.dateValues = { year: [], month: [], day: [] };
    this.selectedDate = { year: 0, month: 0, day: 0 };
    this.dateScrollTimers = new Map();
    this.itemHeight = 40;

    this.photoInput = document.querySelector("#maker-photo-input");
    this.photoPreview = document.querySelector("#maker-photo-preview");
    this.photoCount = document.querySelector("#maker-photo-count");
    this.selectedPhotos = [];
    this.photoObjectUrls = [];
    this.maxPhotos = 8;
  }

  init() {
    this.initDateWheels();
    this.openButton.addEventListener("click", () => this.open());
    this.closeButton.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) this.close();
    });
    // 防止制作面板中的滚动或滑动触发背后的年份航行。
    this.dialog.addEventListener("wheel", (event) => event.stopPropagation());
    this.dialog.addEventListener("touchstart", (event) => event.stopPropagation());
    this.dialog.addEventListener("touchend", (event) => event.stopPropagation());
    this.photoInput.addEventListener("change", (event) => this.addPhotos(event));
    this.form.addEventListener("submit", (event) => this.handleSubmit(event));
  }

  open() {
    this.setStatus("");
    if (typeof this.dialog.showModal === "function") this.dialog.showModal();
    else this.dialog.setAttribute("open", "");
    window.requestAnimationFrame(() => this.syncAllDateWheels(false));
  }

  close() {
    if (this.dialog.open && typeof this.dialog.close === "function") this.dialog.close();
    else this.dialog.removeAttribute("open");
  }

  /** 构造年、月、日三列滚轮，并默认停在今天。 */
  initDateWheels() {
    const today = new Date();
    const currentYear = today.getFullYear();
    this.dateValues.year = Array.from({ length: 31 }, (_, index) => currentYear - 20 + index);
    this.dateValues.month = Array.from({ length: 12 }, (_, index) => index + 1);
    this.selectedDate = {
      year: currentYear,
      month: today.getMonth() + 1,
      day: today.getDate(),
    };

    this.renderDateColumn("year");
    this.renderDateColumn("month");
    this.refreshDayColumn();

    Object.entries(this.dateColumns).forEach(([unit, column]) => {
      column.addEventListener("wheel", (event) => this.handleDateWheel(event, unit), { passive: false });
      column.addEventListener("scroll", () => this.handleDateScroll(unit), { passive: true });
      column.addEventListener("keydown", (event) => this.handleDateKeydown(event, unit));
      column.addEventListener("click", (event) => {
        const item = event.target.closest("[data-date-value]");
        if (!item) return;
        this.selectDateValue(unit, Number(item.dataset.dateValue));
      });
    });
    this.updateDateInput();
  }

  renderDateColumn(unit) {
    const suffix = { year: "年", month: "月", day: "日" }[unit];
    this.dateColumns[unit].innerHTML = this.dateValues[unit]
      .map((value) => `<button type="button" data-date-value="${value}" tabindex="-1">${value}${suffix}</button>`)
      .join("");
    this.updateDateSelection(unit);
  }

  refreshDayColumn() {
    const dayCount = new Date(this.selectedDate.year, this.selectedDate.month, 0).getDate();
    this.dateValues.day = Array.from({ length: dayCount }, (_, index) => index + 1);
    this.selectedDate.day = Math.min(this.selectedDate.day || 1, dayCount);
    this.renderDateColumn("day");
  }

  handleDateWheel(event, unit) {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY >= 0 ? 1 : -1;
    const values = this.dateValues[unit];
    const index = values.indexOf(this.selectedDate[unit]);
    const nextIndex = Math.max(0, Math.min(values.length - 1, index + direction));
    this.selectDateValue(unit, values[nextIndex]);
  }

  handleDateScroll(unit) {
    window.clearTimeout(this.dateScrollTimers.get(unit));
    const timer = window.setTimeout(() => {
      const values = this.dateValues[unit];
      const index = Math.max(0, Math.min(values.length - 1, Math.round(this.dateColumns[unit].scrollTop / this.itemHeight)));
      this.selectDateValue(unit, values[index], false);
    }, 90);
    this.dateScrollTimers.set(unit, timer);
  }

  handleDateKeydown(event, unit) {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const values = this.dateValues[unit];
    const index = values.indexOf(this.selectedDate[unit]);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(values.length - 1, index + direction));
    this.selectDateValue(unit, values[nextIndex]);
  }

  selectDateValue(unit, value, shouldScroll = true) {
    if (!this.dateValues[unit].includes(value)) return;
    this.selectedDate[unit] = value;
    if (unit === "year" || unit === "month") {
      this.refreshDayColumn();
      if (shouldScroll) this.syncDateWheel("day");
    }
    this.updateDateSelection(unit);
    this.updateDateInput();
    if (shouldScroll) this.syncDateWheel(unit);
  }

  updateDateSelection(unit) {
    this.dateColumns[unit].querySelectorAll("[data-date-value]").forEach((item) => {
      const selected = Number(item.dataset.dateValue) === this.selectedDate[unit];
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
  }

  syncDateWheel(unit, smooth = true) {
    const index = this.dateValues[unit].indexOf(this.selectedDate[unit]);
    if (index < 0) return;
    this.dateColumns[unit].scrollTo({
      top: index * this.itemHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  syncAllDateWheels(smooth = true) {
    Object.keys(this.dateColumns).forEach((unit) => this.syncDateWheel(unit, smooth));
  }

  updateDateInput() {
    const { year, month, day } = this.selectedDate;
    this.dateInput.value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    this.updateAutomaticRegion();
  }

  /**
   * 以 2025-11-29 为第 1 星域的最后一天划分星域。
   * 当天及所有更早日期归第 1 年；次日进入第 2 年，之后每年 11 月 30 日切换。
   */
  getYearIndexForDate(date) {
    return window.getGalaxyYearIndexForDate(date, this.years.length);
  }

  updateAutomaticRegion() {
    const yearIndex = this.getYearIndexForDate(this.dateInput.value);
    const yearGroup = this.years[yearIndex];
    this.regionValue.textContent = `${yearGroup.year} · ${yearGroup.name}`;
    this.regionRule.textContent = yearIndex === 0
      ? "2025.11.29 当天及此前日期，统一收藏在第一片星域"
      : "以 2025.11.29 为第一片星域的终点，已由日期自动匹配";
    this.regionValue.closest(".maker-auto-region").dataset.yearIndex = String(yearIndex);
  }

  /** 选择照片后先在制作面板预览，尚未写入档案。 */
  addPhotos(event) {
    const incoming = [...event.target.files].filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    const available = this.maxPhotos - this.selectedPhotos.length;
    if (available <= 0) {
      this.setStatus(`每颗星最多添加 ${this.maxPhotos} 张照片。`, true);
      return;
    }
    this.selectedPhotos.push(...incoming.slice(0, available));
    this.renderPhotoPreview();
    if (incoming.length > available) this.setStatus(`已保留前 ${available} 张照片。`);
    else this.setStatus("");
  }

  renderPhotoPreview() {
    this.releasePhotoPreviews();
    this.photoCount.textContent = `${this.selectedPhotos.length} / ${this.maxPhotos}`;
    this.photoPreview.innerHTML = "";
    this.photoObjectUrls = this.selectedPhotos.map((file) => URL.createObjectURL(file));
    this.selectedPhotos.forEach((file, index) => {
      const figure = document.createElement("figure");
      figure.className = "maker-photo-preview__item";
      figure.innerHTML = `
        <img src="${this.photoObjectUrls[index]}" alt="待添加照片 ${index + 1}" />
        ${index === 0 ? "<span>封面</span>" : ""}
        <button type="button" aria-label="移除第 ${index + 1} 张照片">×</button>
      `;
      figure.querySelector("button").addEventListener("click", () => {
        this.selectedPhotos.splice(index, 1);
        this.renderPhotoPreview();
      });
      this.photoPreview.appendChild(figure);
    });
  }

  releasePhotoPreviews() {
    this.photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.photoObjectUrls = [];
  }

  resetMakerForm(yearIndex) {
    this.form.reset();
    this.selectedPhotos = [];
    this.renderPhotoPreview();
    const today = new Date();
    this.selectedDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
    this.refreshDayColumn();
    this.updateDateSelection("year");
    this.updateDateSelection("month");
    this.updateDateInput();
    this.syncAllDateWheels(false);
  }

  /** 同时保存故事与照片；全部成功后才把新星插入当前银河。 */
  async handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(this.form);
    const title = String(formData.get("title") || "").trim();
    const date = this.dateInput.value;
    const yearIndex = this.getYearIndexForDate(date);
    const excerpt = String(formData.get("excerpt") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const color = String(formData.get("color") || "gold");

    if (!title || !date || !excerpt || !this.years[yearIndex]) {
      this.setStatus("请填写日期、星星名称和回忆内容。", true);
      return;
    }

    const position = this.findOpenPosition(yearIndex);
    const story = {
      id: window.crypto?.randomUUID?.() || `story-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date,
      displayDate: this.formatDate(date),
      title,
      excerpt,
      location: location || "未填写地点",
      season: "私人记录",
      x: position.x,
      y: position.y,
      importance: 0.82,
      // 可见光体比旧版更克制；点击热区仍保持原尺寸，避免小星难以操作。
      size: Number((0.68 + Math.random() * 0.24).toFixed(3)),
      layoutVersion: 2,
      color,
      createdAt: Date.now(),
    };
    const savedPhotoIds = [];
    this.submitButton.disabled = true;

    try {
      const preparedPhotos = [];
      for (let index = 0; index < this.selectedPhotos.length; index += 1) {
        this.setStatus(`正在处理照片 ${index + 1} / ${this.selectedPhotos.length}…`);
        const file = this.selectedPhotos[index];
        const blob = await this.memoryCard.compressImage(file);
        preparedPhotos.push({ file, blob });
      }

      this.years[yearIndex].stories.push(story);
      this.storyStore.saveYears(this.years);
      for (let index = 0; index < preparedPhotos.length; index += 1) {
        this.setStatus(`正在保存照片 ${index + 1} / ${preparedPhotos.length}…`);
        const photoId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        await this.memoryStore.savePhoto({
          id: photoId,
          storyId: story.id,
          blob: preparedPhotos[index].blob,
          fileName: preparedPhotos[index].file.name,
          createdAt: Date.now() + index,
          isCover: index === 0,
        });
        savedPhotoIds.push(photoId);
      }

      this.journey.addStory(story, yearIndex);
      const photoMessage = preparedPhotos.length ? `，${preparedPhotos.length} 张照片已同时保存` : "";
      this.resetMakerForm(yearIndex);
      this.setStatus(`星星已生成${photoMessage}。`);
      window.setTimeout(() => {
        this.close();
        window.setTimeout(() => this.journey.revealNewStory(story, yearIndex), 180);
      }, 560);
    } catch (error) {
      const storyIndex = this.years[yearIndex].stories.findIndex((item) => item.id === story.id);
      if (storyIndex >= 0) {
        this.years[yearIndex].stories.splice(storyIndex, 1);
        try { this.storyStore.saveYears(this.years); } catch { /* 保留原始错误 */ }
      }
      await Promise.allSettled(savedPhotoIds.map((photoId) => this.memoryStore.deletePhoto(photoId)));
      this.setStatus(error.message || "保存失败，请检查浏览器存储权限。", true);
    } finally {
      this.submitButton.disabled = false;
    }
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
  }

  /**
   * 在整片星域随机生成候选坐标，选择与已有星星距离最远的位置。
   * 左上标题区域施加惩罚但不把银河整体推到右侧。
   */
  findOpenPosition(yearIndex) {
    const existing = this.years[yearIndex].stories;
    const seedText = `${this.dateInput.value}-${existing.length}-${yearIndex}`;
    let seed = [...seedText].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const anchorPoints = [
      [0.16, 0.22], [0.42, 0.18], [0.68, 0.2], [0.88, 0.3],
      [0.36, 0.43], [0.61, 0.46], [0.82, 0.55],
      [0.14, 0.72], [0.38, 0.78], [0.63, 0.74], [0.86, 0.78],
    ];
    const candidates = [
      ...anchorPoints.map(([x, y]) => ({ x: x + (random() - 0.5) * 0.08, y: y + (random() - 0.5) * 0.08 })),
      ...Array.from({ length: 72 }, () => ({ x: 0.08 + random() * 0.84, y: 0.12 + random() * 0.76 })),
    ];

    const scored = candidates.map((candidate) => {
      const nearest = existing.length
        ? Math.min(...existing.map((story) => Math.hypot(story.x - candidate.x, story.y - candidate.y)))
        : 0.42;
      // 精简标题位于左上，只有该小块区域需要避让。
      const inTitleZone = candidate.x < 0.32 && candidate.y < 0.5;
      const edgePenalty = Math.min(candidate.x - 0.06, 0.94 - candidate.x, candidate.y - 0.09, 0.91 - candidate.y) * 0.22;
      return { ...candidate, score: nearest + edgePenalty - (inTitleZone ? 0.28 : 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    return { x: scored[0].x, y: scored[0].y };
  }

  formatDate(date) {
    const parts = date.split("-");
    return parts.length === 3 ? `${parts[1]} · ${parts[2]}` : date;
  }
}

window.MakerMode = MakerMode;
