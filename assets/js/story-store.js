/**
 * 用户自建故事星存储
 * 文本内容体积很小，使用 localStorage 保存；照片仍由 IndexedDB 独立管理。
 */

class StoryStore {
  constructor() {
    this.storageKey = "our-galaxy-custom-stories-v1";
  }

  /** 将已保存的故事装载到十个年度星域。 */
  hydrateYears(years) {
    let records = [];
    try {
      records = JSON.parse(window.localStorage.getItem(this.storageKey) || "[]");
      if (!Array.isArray(records)) records = [];
    } catch {
      records = [];
    }

    const groupedRecords = new Map();
    records.forEach((record) => {
      if (!groupedRecords.has(record.yearIndex)) groupedRecords.set(record.yearIndex, []);
      groupedRecords.get(record.yearIndex).push(record);
    });

    let migrated = false;
    groupedRecords.forEach((yearRecords) => {
      yearRecords
        .sort((a, b) => (a.story?.createdAt || 0) - (b.story?.createdAt || 0))
        .forEach((record, index) => {
          if (!record.story || record.story.layoutVersion === 2) return;
          Object.assign(record.story, this.createBalancedLayout(record.story.id, index));
          migrated = true;
        });
    });

    records.forEach((record) => {
      const yearGroup = years[record.yearIndex];
      if (!yearGroup || !record.story?.id || !record.story?.title) return;
      yearGroup.stories.push(record.story);
    });
    if (migrated) window.localStorage.setItem(this.storageKey, JSON.stringify(records));
    this.refreshFlatList(years);
    return years;
  }

  /** 保存当前全部自建故事，确保关闭网页后仍然存在。 */
  saveYears(years) {
    const records = years.flatMap((yearGroup, yearIndex) =>
      yearGroup.stories.map((story) => ({ yearIndex, story })),
    );
    window.localStorage.setItem(this.storageKey, JSON.stringify(records));
    this.refreshFlatList(years);
  }

  refreshFlatList(years) {
    window.GALAXY_STORIES = years.flatMap((yearGroup, yearIndex) =>
      yearGroup.stories.map((story) => ({ ...story, year: yearGroup.year, yearIndex })),
    );
  }

  /** 将旧版集中在右侧的坐标一次性迁移为覆盖整片星域的均衡构图。 */
  createBalancedLayout(storyId, index) {
    const anchors = [
      [0.52, 0.46], [0.18, 0.7], [0.78, 0.24], [0.68, 0.76], [0.42, 0.18],
      [0.88, 0.52], [0.43, 0.82], [0.12, 0.5], [0.59, 0.16], [0.86, 0.82],
      [0.31, 0.57], [0.7, 0.43], [0.2, 0.84], [0.48, 0.65], [0.9, 0.34],
    ];
    const hash = this.hashText(storyId);
    const [anchorX, anchorY] = anchors[index % anchors.length];
    const ring = Math.floor(index / anchors.length);
    const jitterX = (((hash & 255) / 255) - 0.5) * 0.055;
    const jitterY = ((((hash >>> 8) & 255) / 255) - 0.5) * 0.055;
    return {
      x: Math.max(0.07, Math.min(0.93, anchorX + jitterX + Math.sin(ring * 1.7) * 0.025)),
      y: Math.max(0.11, Math.min(0.89, anchorY + jitterY + Math.cos(ring * 1.7) * 0.025)),
      size: Number((0.68 + ((hash >>> 16) & 255) / 255 * 0.24).toFixed(3)),
      layoutVersion: 2,
    };
  }

  hashText(text) {
    let hash = 2166136261;
    for (const character of String(text)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

window.StoryStore = StoryStore;
