/**
 * 页面入口脚本
 * 连接动态银河、年度星域数据、航行控制器和全局界面状态。
 */

const canvas = document.querySelector("#galaxy-canvas");
const appShell = document.querySelector(".app-shell");
const enterButton = document.querySelector("#enter-galaxy");
const localTime = document.querySelector("#local-time");

const galaxy = new window.GalaxyRenderer(canvas);
galaxy.init();

const storyStore = new window.StoryStore();
storyStore.hydrateYears(window.GALAXY_YEARS);

const memoryStore = new window.MemoryStore();
const memoryCard = new window.MemoryCard({
  dialog: document.querySelector("#signal-preview"),
  store: memoryStore,
});
memoryCard.init();

const journey = new window.JourneyController({
  years: window.GALAXY_YEARS,
  layer: document.querySelector("#story-layer"),
  galaxy,
  memoryCard,
});
journey.init();
window.galaxyJourney = journey;

const makerMode = new window.MakerMode({
  dialog: document.querySelector("#maker-panel"),
  years: window.GALAXY_YEARS,
  storyStore,
  journey,
  memoryStore,
  memoryCard,
});
makerMode.init();

// 深链接用于本地检查，也允许未来直接分享指定年份。
const hashTarget = window.location.hash.replace("#", "");
const hashYearIndex = window.GALAXY_YEARS.findIndex((item) => item.year === hashTarget);
const hashStory = window.GALAXY_STORIES.find((item) => `memory-${item.id}` === hashTarget);

/** 更新页脚中的本地信号时间。 */
function updateLocalTime() {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  localTime.textContent = `LOCAL SIGNAL · ${time}`;
}

/** 从序章进入年度星域航行。 */
enterButton.addEventListener("click", () => {
  appShell.classList.add("is-observing");
  galaxy.setObservationMode(true);

  // 等序章基本淡出，再呈现年度星域，避免两组文字在转场中重叠。
  window.setTimeout(() => {
    journey.start();
    if (hashTarget === "map") journey.setMode("map");
    if (hashYearIndex >= 0) journey.goToYear(hashYearIndex);
    if (hashStory) {
      journey.goToYear(hashStory.yearIndex);
      window.setTimeout(() => memoryCard.open(hashStory, hashStory.year), 450);
    }
  }, 1150);
});

if (["observe", "map"].includes(hashTarget) || hashYearIndex >= 0 || hashStory) {
  window.setTimeout(() => enterButton.click(), 180);
}

if (hashTarget === "maker") {
  window.setTimeout(() => makerMode.open(), 180);
}

updateLocalTime();
window.setInterval(updateLocalTime, 1000);

/** 页面关闭时释放 Canvas 与航行控制器事件和动画循环。 */
window.addEventListener(
  "pagehide",
  () => {
    galaxy.destroy();
    journey.destroy();
  },
  { once: true },
);
