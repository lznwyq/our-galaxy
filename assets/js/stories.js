/**
 * 十年年度星域
 * 星域名称用于建立整体时间深度；所有故事星初始为空，名称和内容只能由制作模式添加。
 */

const YEAR_BLUEPRINTS = [
  ["第 1 年", "初见星域", "故事开始拥有坐标", "最初的光很微弱，但它会成为整片银河的起点。", "gold", 0.18, 0.22],
  ["第 2 年", "靠近星域", "两颗星开始共享轨道", "时间继续向前，等待新的故事在这里亮起。", "rose", 0.5, 0.2],
  ["第 3 年", "日常星域", "平凡日子也会留下星光", "这一片空间留给尚未发生、也尚未命名的日常。", "silver", 0.82, 0.22],
  ["第 4 年", "漫游星域", "我们向更远的地方航行", "未来的坐标仍然空白，等待共同抵达。", "violet", 0.22, 0.5],
  ["第 5 年", "共栖星域", "生活逐渐拥有共同的轮廓", "还没有星星被命名，但银河已经为它们留出位置。", "gold", 0.5, 0.48],
  ["第 6 年", "守望星域", "漫长时间让陪伴成为引力", "这里收藏未来那些沉默却重要的陪伴。", "rose", 0.78, 0.5],
  ["第 7 年", "回声星域", "走过的路开始产生回声", "某一天回望时，新故事会在这一年被看见。", "silver", 0.2, 0.78],
  ["第 8 年", "深空星域", "我们仍在宇宙深处并肩", "时间尚未抵达，这片星空暂时保持安静。", "violet", 0.42, 0.78],
  ["第 9 年", "恒光星域", "一些光已经不会轻易熄灭", "等待你们亲手为这一年的星星命名。", "gold", 0.65, 0.78],
  ["第 10 年", "远航星域", "十年不是终点，只是更远的起点", "银河在这里继续向前，未来仍有无限深度。", "rose", 0.84, 0.78],
];

// 关系时间轴基准：确定关系当天及此前的故事统一收进第 1 年星域。
window.GALAXY_TIMELINE = {
  relationshipStart: "2025-11-29",
};

/**
 * 统一的星域日期计算器。
 * 2025-11-29 及此前属于第 1 星域；从次日起，每年 11 月 30 日进入下一星域。
 */
window.getGalaxyYearIndexForDate = function getGalaxyYearIndexForDate(date, maxYears = 10) {
  const [year, month, day] = String(date).split("-").map(Number);
  const [startYear, startMonth, startDay] = window.GALAXY_TIMELINE.relationshipStart
    .split("-")
    .map(Number);
  if (![year, month, day].every(Number.isFinite)) return 0;

  const selectedNumber = year * 10000 + month * 100 + day;
  const startNumber = startYear * 10000 + startMonth * 100 + startDay;
  if (selectedNumber <= startNumber) return 0;

  const beforeCutover = month < startMonth || (month === startMonth && day <= startDay);
  const yearIndex = year - startYear + (beforeCutover ? 0 : 1);
  return Math.max(1, Math.min(maxYears - 1, yearIndex));
};

window.GALAXY_YEARS = YEAR_BLUEPRINTS.map(
  ([year, name, title, summary, tone, mapX, mapY], index) => ({
    id: `relationship-year-${index + 1}`,
    year,
    name,
    title,
    summary,
    tone,
    mapX,
    mapY,
    stories: [],
  }),
);

window.GALAXY_STORIES = [];
