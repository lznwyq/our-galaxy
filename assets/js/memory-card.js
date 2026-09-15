/**
 * 完整回忆卡片控制器
 * 负责照片压缩、上传、画廊浏览、封面切换、删除和 IndexedDB 持久化。
 */

class MemoryCard {
  constructor({ dialog, store }) {
    this.dialog = dialog;
    this.store = store;
    this.story = null;
    this.year = null;
    this.photos = [];
    this.activePhotoIndex = 0;
    this.objectUrls = [];
    this.maxPhotos = 8;
    this.closeTimer = null;
    this.isClosing = false;

    this.image = document.querySelector("#gallery-image");
    this.empty = document.querySelector("#gallery-empty");
    this.counter = document.querySelector("#gallery-counter");
    this.thumbs = document.querySelector("#gallery-thumbs");
    this.photoInput = document.querySelector("#photo-input");
    this.photoStatus = document.querySelector("#photo-status");
    this.previousButton = document.querySelector("#gallery-prev");
    this.nextButton = document.querySelector("#gallery-next");
    this.coverButton = document.querySelector("#set-cover-photo");
    this.deleteButton = document.querySelector("#delete-photo");
    this.photoCount = document.querySelector("#memory-photo-count");
    this.closeButton = dialog.querySelector(".signal-preview__close");
  }

  init() {
    this.closeButton.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) this.close();
    });
    this.photoInput.addEventListener("change", (event) => this.handleUpload(event));
    this.previousButton.addEventListener("click", () => this.selectPhoto(this.activePhotoIndex - 1));
    this.nextButton.addEventListener("click", () => this.selectPhoto(this.activePhotoIndex + 1));
    this.coverButton.addEventListener("click", () => this.setCurrentAsCover());
    this.deleteButton.addEventListener("click", () => this.deleteCurrentPhoto());
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    this.dialog.addEventListener("close", () => {
      this.dialog.classList.remove("is-visible", "is-closing");
      this.isClosing = false;
      this.releaseObjectUrls();
    });
  }

  /** 填充故事信息、读取该故事已保存照片，再打开模态卡片。 */
  async open(story, year) {
    this.story = story;
    this.year = year;
    this.activePhotoIndex = 0;
    this.setStatus("正在读取本地影像…");
    this.fillStoryContent();
    document.body.classList.add("memory-view-active");

    if (!this.dialog.open) {
      if (typeof this.dialog.showModal === "function") this.dialog.showModal();
      else this.dialog.setAttribute("open", "");
      this.dialog.classList.remove("is-closing");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => this.dialog.classList.add("is-visible"));
      });
    }

    try {
      this.photos = await this.store.getPhotos(story.id);
      const coverIndex = this.photos.findIndex((photo) => photo.isCover);
      this.activePhotoIndex = coverIndex >= 0 ? coverIndex : 0;
      this.renderGallery();
      this.setStatus(this.photos.length ? "影像已从本地档案读取。" : "");
    } catch (error) {
      this.photos = [];
      this.renderGallery();
      this.setStatus(error.message || "无法读取本地照片。", true);
    }
  }

  fillStoryContent() {
    document.querySelector("#preview-date").textContent =
      this.year === "未来" ? this.story.displayDate : `${this.year} · ${this.story.displayDate}`;
    document.querySelector("#preview-title").textContent = this.story.title;
    document.querySelector("#preview-text").textContent = this.story.excerpt;
    document.querySelector("#preview-location").textContent = `COORDINATE · ${this.story.location}`;
    document.querySelector("#preview-season").textContent = `SEASON · ${this.story.season}`;
  }

  /** 验证数量与格式，逐张压缩并写入 IndexedDB。 */
  async handleUpload(event) {
    const selectedFiles = [...event.target.files];
    event.target.value = "";
    if (!selectedFiles.length || !this.story) return;

    const slots = this.maxPhotos - this.photos.length;
    if (slots <= 0) {
      this.setStatus(`每段回忆最多保存 ${this.maxPhotos} 张照片。`, true);
      return;
    }

    const files = selectedFiles.slice(0, slots);
    if (selectedFiles.length > slots) {
      this.setStatus(`只添加前 ${slots} 张；每段回忆最多 ${this.maxPhotos} 张。`);
    } else {
      this.setStatus(`正在处理 ${files.length} 张照片…`);
    }

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file.type.startsWith("image/")) continue;
        this.setStatus(`正在处理第 ${index + 1} / ${files.length} 张…`);
        const blob = await this.compressImage(file);
        await this.store.savePhoto({
          id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          storyId: this.story.id,
          blob,
          fileName: file.name,
          createdAt: Date.now() + index,
          isCover: this.photos.length === 0 && index === 0,
        });
      }

      this.photos = await this.store.getPhotos(this.story.id);
      this.activePhotoIndex = Math.max(0, this.photos.length - files.length);
      this.renderGallery();
      this.setStatus(`已保存 ${files.length} 张照片，仅存储在当前浏览器。`);
    } catch (error) {
      this.setStatus(error.message || "照片保存失败。", true);
    }
  }

  /**
   * 将长边限制在 1800px，并输出质量 0.84 的 WebP；
   * 若浏览器无法生成 WebP，则回退到 JPEG。
   */
  async compressImage(file) {
    const bitmap = await this.loadImage(file);
    const maxDimension = 1800;
    const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === "function") bitmap.close();

    const webpBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (webpBlob) return webpBlob;
    const jpegBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!jpegBlob) throw new Error("浏览器无法处理这张图片。请尝试 JPG 或 PNG。");
    return jpegBlob;
  }

  async loadImage(file) {
    if ("createImageBitmap" in window) return window.createImageBitmap(file);

    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取这张图片。"));
      };
      image.src = url;
    });
  }

  /** 重建主图和缩略图，同时释放旧的 Blob URL。 */
  renderGallery() {
    this.releaseObjectUrls();
    const hasPhotos = this.photos.length > 0;
    this.empty.hidden = hasPhotos;
    this.image.hidden = !hasPhotos;
    this.counter.hidden = !hasPhotos;
    this.previousButton.hidden = this.photos.length < 2;
    this.nextButton.hidden = this.photos.length < 2;
    this.coverButton.hidden = !hasPhotos;
    this.deleteButton.hidden = !hasPhotos;
    this.photoCount.textContent = `${this.photos.length} ${this.photos.length === 1 ? "PHOTO" : "PHOTOS"}`;
    this.thumbs.innerHTML = "";

    if (!hasPhotos) {
      this.image.removeAttribute("src");
      return;
    }

    this.activePhotoIndex = Math.min(this.activePhotoIndex, this.photos.length - 1);
    this.objectUrls = this.photos.map((photo) => URL.createObjectURL(photo.blob));
    this.photos.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "memory-gallery__thumb";
      button.classList.toggle("is-active", index === this.activePhotoIndex);
      button.setAttribute("aria-label", `查看第 ${index + 1} 张照片${photo.isCover ? "，当前封面" : ""}`);
      button.innerHTML = `<img src="${this.objectUrls[index]}" alt="" />${photo.isCover ? '<span>封面</span>' : ""}`;
      button.addEventListener("click", () => this.selectPhoto(index));
      this.thumbs.appendChild(button);
    });
    this.updateActivePhoto();
  }

  selectPhoto(index) {
    if (!this.photos.length) return;
    this.activePhotoIndex = (index + this.photos.length) % this.photos.length;
    this.updateActivePhoto();
  }

  updateActivePhoto() {
    const photo = this.photos[this.activePhotoIndex];
    if (!photo) return;
    this.image.src = this.objectUrls[this.activePhotoIndex];
    this.image.alt = `${this.story.title}，第 ${this.activePhotoIndex + 1} 张照片`;
    this.counter.textContent = `${String(this.activePhotoIndex + 1).padStart(2, "0")} / ${String(this.photos.length).padStart(2, "0")}`;
    this.coverButton.disabled = Boolean(photo.isCover);
    this.coverButton.textContent = photo.isCover ? "当前封面" : "设为封面";
    [...this.thumbs.children].forEach((thumb, index) => {
      thumb.classList.toggle("is-active", index === this.activePhotoIndex);
    });
  }

  async setCurrentAsCover() {
    const photo = this.photos[this.activePhotoIndex];
    if (!photo || photo.isCover) return;
    try {
      await this.store.setCover(this.story.id, photo.id);
      this.photos = await this.store.getPhotos(this.story.id);
      this.renderGallery();
      this.setStatus("封面照片已更新。下一阶段会让它显示在故事星入口。 ");
    } catch (error) {
      this.setStatus(error.message || "设置封面失败。", true);
    }
  }

  async deleteCurrentPhoto() {
    const photo = this.photos[this.activePhotoIndex];
    if (!photo) return;
    const confirmed = window.confirm("确定删除当前照片吗？此操作无法撤销。");
    if (!confirmed) return;

    try {
      const removedCover = photo.isCover;
      await this.store.deletePhoto(photo.id);
      this.photos = await this.store.getPhotos(this.story.id);
      if (removedCover && this.photos.length) await this.store.setCover(this.story.id, this.photos[0].id);
      this.photos = await this.store.getPhotos(this.story.id);
      this.activePhotoIndex = Math.max(0, this.activePhotoIndex - 1);
      this.renderGallery();
      this.setStatus("照片已从本地档案删除。 ");
    } catch (error) {
      this.setStatus(error.message || "删除照片失败。", true);
    }
  }

  setStatus(message, isError = false) {
    this.photoStatus.textContent = message;
    this.photoStatus.classList.toggle("is-error", isError);
  }

  releaseObjectUrls() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];
  }

  close() {
    if (!this.dialog.open || this.isClosing) return;
    this.isClosing = true;
    this.dialog.classList.remove("is-visible");
    this.dialog.classList.add("is-closing");
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      document.body.classList.remove("memory-view-active");
      if (this.dialog.open && typeof this.dialog.close === "function") this.dialog.close();
      else {
        this.dialog.removeAttribute("open");
        this.dialog.dispatchEvent(new Event("close"));
      }
    }, 360);
  }
}

window.MemoryCard = MemoryCard;
