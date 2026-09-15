/**
 * 回忆照片本地存储
 * 使用 IndexedDB 保存压缩后的图片 Blob。它比 localStorage 容量更大，
 * 也不会把二进制图片塞进页面代码。所有数据只保存在当前浏览器。
 */

class MemoryStore {
  constructor() {
    this.databaseName = "our-galaxy-memory-archive";
    this.storeName = "photos";
    this.databaseVersion = 1;
    this.databasePromise = null;
  }

  /** 打开数据库；首次使用时自动创建以照片 ID 为主键的对象仓库。 */
  openDatabase() {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("当前浏览器不支持本地照片存储。"));
        return;
      }

      const request = window.indexedDB.open(this.databaseName, this.databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          const store = database.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("storyId", "storyId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开照片档案。"));
    });

    return this.databasePromise;
  }

  /** 获取某颗故事星的全部照片，并按上传顺序排列。 */
  async getPhotos(storyId) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readonly");
      const index = transaction.objectStore(this.storeName).index("storyId");
      const request = index.getAll(storyId);
      request.onsuccess = () => {
        const photos = request.result.sort((a, b) => a.createdAt - b.createdAt);
        resolve(photos);
      };
      request.onerror = () => reject(request.error || new Error("读取照片失败。"));
    });
  }

  /** 保存一张已经压缩的照片。 */
  async savePhoto(photo) {
    const database = await this.openDatabase();
    return this.runWrite(database, (store) => store.put(photo));
  }

  /** 删除指定照片。 */
  async deletePhoto(photoId) {
    const database = await this.openDatabase();
    return this.runWrite(database, (store) => store.delete(photoId));
  }

  /** 将某张照片设置为封面，同一故事只保留一个封面标记。 */
  async setCover(storyId, photoId) {
    const photos = await this.getPhotos(storyId);
    const database = await this.openDatabase();
    const transaction = database.transaction(this.storeName, "readwrite");
    const store = transaction.objectStore(this.storeName);
    photos.forEach((photo) => store.put({ ...photo, isCover: photo.id === photoId }));

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("设置封面失败。"));
    });
  }

  runWrite(database, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readwrite");
      const request = operation(transaction.objectStore(this.storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("保存照片失败。"));
    });
  }
}

window.MemoryStore = MemoryStore;
