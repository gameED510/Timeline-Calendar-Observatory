(function (root) {
  "use strict";
  const platforms = ["douyin", "xiaohongshu"];
  const rates = { douyin: 54000, xiaohongshu: 20000 };
  const ratio = (value, fallback) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : fallback;
  function actualAmount(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 && amount <= 1e9 ? amount : null;
  }
  function profiles(value) {
    if (!Array.isArray(value)) return [{ id: "wen", name: "拜托了闻学长", keywords: "拜托了闻学长", rates: { ...rates }, revenueShare: 0.5, commissionRate: 0.1 }];
    const seen = new Set();
    return value.slice(0, 50).filter((item) => item && typeof item.id === "string" && item.id !== "other" && !seen.has(item.id) && seen.add(item.id)).map((item) => ({
      id: item.id.slice(0, 80), name: String(item.name || "").slice(0, 100), keywords: String(item.keywords || "").slice(0, 500),
      revenueShare: ratio(item.revenueShare, 0.5), commissionRate: ratio(item.commissionRate, 0.1),
      rates: Object.fromEntries(platforms.map((key) => [key, item.rates?.[key] !== "" && item.rates?.[key] != null && Number.isFinite(Number(item.rates[key])) && Number(item.rates[key]) >= 0 ? Math.min(Number(item.rates[key]), 100000000) : null]))
    }));
  }
  function account(project, config) {
    if (project.publicationAccount) return project.publicationAccount;
    const name = (project.name || "").trim().toLowerCase();
    const matches = profiles(config).filter((item) => [item.name, ...item.keywords.split(/[,，\n]/)].some((word) => word.trim() && name.includes(word.trim().toLowerCase())));
    return matches.length === 1 ? matches[0].id : "other";
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
  function cycleMonth(date) {
    if (!validDate(date)) throw new Error("Invalid performance date");
    if (Number(date.slice(8, 10)) <= 15) return date.slice(0, 7);
    const [year, month] = date.slice(0, 7).split("-").map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  }
  function summarize(projects, period, today, config) {
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
        const gifted = project.publicationGift === true;
        const profile = profiles(config).find((entry) => entry.id === account(project, config));
        const rate = profile?.rates[platform];
        const priced = rate != null && !gifted;
        rows.push({ project, platform, count: item.count, date, priced, gifted, estimated: priced ? item.count * rate * profile.revenueShare * profile.commissionRate : 0 });
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.project.name.localeCompare(b.project.name));
    const counts = Object.fromEntries(platforms.map((platform) => [platform, rows.filter((row) => row.platform === platform).reduce((sum, row) => sum + row.count, 0)]));
    const commissionCounts = Object.fromEntries(platforms.map((platform) => [platform, rows.filter((row) => row.platform === platform && row.priced).reduce((sum, row) => sum + row.count, 0)]));
    return { rows, missing, counts, commissionCounts, total: counts.douyin + counts.xiaohongshu, projects: new Set(rows.map((row) => row.project.id)).size, commission: rows.reduce((sum, row) => sum + row.estimated, 0) };
  }
  function naturalMonth(month, offset = 0) {
    cycle(month);
    const [year, number] = month.split("-").map(Number);
    const iso = (delta, day) => new Date(Date.UTC(year, number - 1 + offset + delta, day)).toISOString().slice(0, 10);
    return { start: iso(0, 1), end: iso(1, 1), last: iso(1, 0) };
  }
  function calibration(records, month) {
    const valid = records.filter((r) => /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) && r.month < month && Number.isFinite(r.snapshot?.formula) && r.snapshot.formula > 0 && Number.isFinite(r.total) && r.total >= 0)
      .sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
    const n = valid.length;
    const formula = valid.reduce((s, r) => s + r.snapshot.formula, 0);
    const actual = valid.reduce((s, r) => s + r.total, 0);
    const bias = n ? valid.reduce((s, r) => s + r.snapshot.formula - r.total, 0) / n : null;
    return { n, months: valid.map(record => record.month), factor: n ? 1 + (actual / formula - 1) * n / (n + 3) : 1,
      ready: n >= 3, bias, mae: n ? valid.reduce((s, r) => s + Math.abs(r.snapshot.formula - r.total), 0) / n : null };
  }
  function snapshot(projects, month, today, config) {
    const result = summarize(projects, naturalMonth(month, -3), today, config);
    return { formula: result.commission, capturedAt: new Date().toISOString(), kind: "historical",
      profiles: profiles(config), rows: result.rows.map((r) => ({ projectId: r.project.id, name: r.project.name, platform: r.platform, count: r.count, estimated: r.estimated,
        commissionRate: profiles(config).find(p=>p.id===account(r.project,config))?.commissionRate ?? null })) };
  }
  function evaluate(records) {
    const valid = records.filter(r => Number.isFinite(r.total) && r.total >= 0 && r.snapshot?.kind === "forecast" && Number.isFinite(r.snapshot.formula) && r.snapshot.formula >= 0 && Number.isFinite(r.snapshot.calibrated) && r.snapshot.calibrated >= 0);
    return { n: valid.length,
      formulaMae: valid.length ? valid.reduce((s,r) => s + Math.abs(r.total - r.snapshot.formula), 0) / valid.length : null,
      calibratedMae: valid.length ? valid.reduce((s,r) => s + Math.abs(r.total - r.snapshot.calibrated), 0) / valid.length : null };
  }
  function chartPoints(records, month, count = 6) {
    const byMonth = new Map(records.filter(r => r.snapshot && Number.isFinite(r.total)).map(r => [r.month,r]));
    return Array.from({length:count},(_,index)=>{
      const key=naturalMonth(month,index-count+1).start.slice(0,7);
      return byMonth.get(key) || {month:key,total:null,snapshot:null};
    });
  }
  function settlementDifference(record) {
    const total = actualAmount(record?.total), snapshot = record?.snapshot;
    if (total === null || !Number.isFinite(snapshot?.formula)) return null;
    const groups = new Map();
    for (const row of snapshot.rows || []) {
      if (!row.projectId || !Number.isFinite(row.estimated)) continue;
      if (!groups.has(row.projectId)) groups.set(row.projectId, { estimate: 0, actual: 0, count: 0, incomplete: false });
      groups.get(row.projectId).estimate += row.estimated;
    }
    for (const ad of record.ads || []) {
      const group = groups.get(ad.projectId);
      if (!group) continue;
      const revenue = actualAmount(ad.revenue), rate = ad.commissionRate;
      if (revenue === null || !Number.isFinite(rate) || rate < 0 || rate > 1) { group.incomplete = true; continue; }
      group.actual += revenue * rate;
      group.count++;
    }
    let matchedActual = 0, matchedEstimate = 0, matchedProjects = 0;
    for (const group of groups.values()) {
      if (!group.count || group.incomplete) continue;
      matchedActual += group.actual; matchedEstimate += group.estimate; matchedProjects++;
    }
    return { matchedProjects, matchedDifference: matchedActual - matchedEstimate,
      unallocatedActual: total - matchedActual, unmatchedEstimate: snapshot.formula - matchedEstimate,
      difference: total - snapshot.formula };
  }
  function settlementCsv(records) {
    const amount = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : "";
    const rows = [["类型","结算月份","对应发布月","广告名称","平台","公式估算","校准估算","实际收益","个人提成","实际减估算","估算性质"]];
    for (const record of [...records].sort((a,b)=>a.month.localeCompare(b.month))) {
      const s=record.snapshot || {}, month=naturalMonth(record.month,-3).start.slice(0,7);
      const kind=s.kind === "forecast" ? "已保存预测" : "历史回算";
      rows.push(["月度合计",record.month,month,"","",amount(s.formula),amount(s.calibrated),"",amount(record.total),Number.isFinite(record.total)&&Number.isFinite(s.formula)?amount(record.total-s.formula):"",kind]);
      for(const ad of record.ads || []) {
        const matched=(s.rows || []).filter(row=>row.projectId===ad.projectId);
        const estimate=matched.reduce((sum,row)=>sum+row.estimated,0);
        const commission=Number.isFinite(ad.revenue)&&Number.isFinite(ad.commissionRate)?ad.revenue*ad.commissionRate:null;
        const related=(record.ads || []).filter(item=>item.projectId===ad.projectId);
        const first=related[0]===ad;
        const comparable=related.every(item=>actualAmount(item.revenue)!==null && Number.isFinite(item.commissionRate) && item.commissionRate>=0 && item.commissionRate<=1);
        const difference=related.reduce((sum,item)=>sum+item.revenue*item.commissionRate,0)-estimate;
        rows.push(["广告明细",record.month,month,ad.name || matched[0]?.name || "",[...new Set(matched.map(row=>row.platform==="douyin"?"抖音":"小红书"))].join(" + "),matched.length&&first?amount(estimate):"","",amount(ad.revenue),amount(commission),matched.length&&first&&comparable?amount(difference):"",kind]);
      }
    }
    const cell=value=>{
      let text=String(value ?? "");
      if(typeof value === "string" && /^[\s]*[=+@-]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    return "\uFEFF"+rows.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  root.TLPerformance = { platforms, rates, profiles, account, normalize, cycle, cycleMonth, summarize, naturalMonth, calibration, snapshot, evaluate, chartPoints, settlementCsv, actualAmount, settlementDifference };
})(globalThis);
