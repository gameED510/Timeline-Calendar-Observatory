(function (root) {
  "use strict";
  const platforms = ["douyin", "xiaohongshu"];
  const rates = { douyin: 54000, xiaohongshu: 20000 };
  function account(project) {
    if (["wen", "other"].includes(project.publicationAccount)) return project.publicationAccount;
    return /^拜托了闻学长(?:\s|[&＆·:：]|$)/.test((project.name || "").trim()) ? "wen" : "other";
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function normalize(value) {
    return Object.fromEntries(platforms.map((platform) => {
      const item = value?.[platform];
      const count = Number(item?.count);
      return [platform, {
        count: Number.isSafeInteger(count) && count > 0 ? Math.min(count, 10000) : 0,
        date: validDate(item?.date) ? item.date : ""
      }];
    }));
  }
  function cycle(month, offset = 0) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid performance month");
    const [year, number] = month.split("-").map(Number);
    const iso = (delta, day) => new Date(Date.UTC(year, number - 1 + offset + delta, day)).toISOString().slice(0, 10);
    return { start: iso(-1, 16), end: iso(0, 16), last: iso(0, 15) };
  }
  function summarize(projects, period, today) {
    const rows = [];
    const missing = [];
    for (const project of projects) {
      if (!project.completedMilestones?.["发布"]) continue;
      const publication = normalize(project.publication);
      const scheduled = project.milestones?.["发布"];
      if (!platforms.some((platform) => publication[platform].count) && validDate(scheduled) && scheduled >= period.start && scheduled < period.end && scheduled <= today) missing.push(project);
      for (const platform of platforms) {
        const item = publication[platform];
        const date = scheduled;
        if (!item.count || !validDate(date) || date < period.start || date >= period.end || date > today) continue;
        const priced = account(project) === "wen";
        rows.push({ project, platform, count: item.count, date, priced, estimated: priced ? item.count * rates[platform] / 2 * 0.1 : 0 });
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.project.name.localeCompare(b.project.name));
    const counts = Object.fromEntries(platforms.map((platform) => [platform, rows.filter((row) => row.platform === platform).reduce((sum, row) => sum + row.count, 0)]));
    const commissionCounts = Object.fromEntries(platforms.map((platform) => [platform, rows.filter((row) => row.platform === platform && row.priced).reduce((sum, row) => sum + row.count, 0)]));
    return { rows, missing, counts, commissionCounts, total: counts.douyin + counts.xiaohongshu, projects: new Set(rows.map((row) => row.project.id)).size, commission: rows.reduce((sum, row) => sum + row.estimated, 0) };
  }
  root.TLPerformance = { platforms, rates, account, normalize, cycle, summarize };
})(globalThis);
