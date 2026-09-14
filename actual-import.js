(function (root) {
  "use strict";
  const clean = value => String(value || "").normalize("NFKC").replace(/\s+/g, "");
  const nameKey = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  function matchProject(name, projects) {
    const key = nameKey(name);
    if (!key) return null;
    const exact = projects.filter(p => nameKey(p.name) === key);
    if (exact.length === 1) return exact[0];
    const contained = projects.filter(p => key.length >= 3 && nameKey(p.name).includes(key));
    return contained.length === 1 ? contained[0] : null;
  }
  function monthCandidates(text) {
    const months = new Set();
    // A clipped day is intentional: month attribution does not depend on a full date.
    for (const m of clean(text).matchAll(/(?:20)?(\d{2})[-年/.](0?[1-9]|1[0-2])(?:[-月/.]|$)/g)) {
      months.add(`20${m[1]}-${m[2].padStart(2, "0")}`);
    }
    return [...months];
  }
  function parseImage(text) {
    const compact = clean(text);
    const explicit = [];
    for (const line of String(text).split(/\n/)) if (/结算|到账|提成月份/.test(clean(line))) explicit.push(...monthCandidates(line));
    const publication = monthCandidates(text);
    const lines = String(text).split(/\n/).map(l => l.trim()).filter(Boolean);
    const ads = [];
    for (const line of lines) {
      const date = line.match(/(?:20)?\d{2}\s*[-年/.]\s*(?:0?[1-9]|1[0-2])\s*[-月/.]\s*\d{0,2}/);
      if (!date) continue;
      const tail = line.slice(date.index + date[0].length).replace(/[,，]/g, "");
      const amount = tail.match(/(?:^|\s|[|丨])([0-9]{3,}(?:\.\d{1,4})?)(?=\s|$|[|丨])/);
      if (!amount) continue;
      let name = clean(line.slice(0, date.index)).replace(/标准[-—]?原创.*$/, "");
      name = name.replace(/^.*?(?:视频笔记|\d+[-—]\d+s)/, "").replace(/^[\d\s|丨“”"_]+|[|丨\s“”"_]+$/g, "");
      if (name) ads.push({ name, revenue: Number(amount[1]) });
    }
    const amounts = [...compact.replace(/[,，]/g, "").matchAll(/\d{3,}(?:\.\d{1,4})?/g)].map(m => Number(m[0])).filter(n => n <= 1e9);
    const standalone = lines.flatMap(l => {
      const m = l.replace(/[|丨,，_]/g, "").trim().match(/^(?:\d{1,2}\s+)?(\d{3,}(?:\.\d{1,4})?)$/);
      return m ? [Number(m[1])] : [];
    });
    const maximum = standalone.length ? Math.max(...standalone) : null;
    const isRevenue = /实际收益|收益合计/.test(compact) || publication.length > 0;
    return { explicit: [...new Set(explicit)], publication, ads,
      revenueTotal: isRevenue ? maximum : null,
      commissionTotal: !isRevenue && (/0[.,]1|提成|分成|李阳/.test(compact)) ? maximum : null,
      uncertain: !amounts.length };
  }
  function parseBatch(texts, projects = [], config) {
    const images = texts.map(parseImage);
    const explicit = [...new Set(images.flatMap(i => i.explicit))];
    const published = [...new Set(images.flatMap(i => i.publication))];
    const inferred = published.map(m => root.TLPerformance.naturalMonth(m, 3).start.slice(0, 7));
    const candidates = explicit.length ? explicit : [...new Set(inferred)];
    const commission = images.map(i => i.commissionTotal).filter(n => n !== null);
    const revenues = images.map(i => i.revenueTotal).filter(n => n !== null);
    const ambiguous = candidates.length !== 1 || commission.length > 1;
    const profiles = root.TLPerformance.profiles(config);
    const ads = images.flatMap(i => i.ads).map(ad => {
      const project = matchProject(ad.name, projects);
      const profile = project ? profiles.find(p=>p.id===root.TLPerformance.account(project, profiles)) : null;
      return { ...ad, projectId: project?.id || "", commissionRate: profile?.commissionRate ?? null };
    });
    const knownRates = [...new Set(ads.map(a=>a.commissionRate).filter(r=>r!==null))];
    const inferredRate = ads.length && ads.every(a=>a.commissionRate!==null) && knownRates.length===1 ? knownRates[0] : profiles.length===1 ? profiles[0].commissionRate : null;
    const total = commission.length === 1 ? commission[0] : revenues.length === 1 && inferredRate!==null ? revenues[0] * inferredRate : null;
    return { month: candidates.length === 1 ? candidates[0] : "", candidates, total: ambiguous ? null : total,
      totalSource: commission.length === 1 ? "personal" : "revenue", ads, ambiguous,
      notice: ambiguous ? "月份或合计不明确，请确认结算月份与个人总提成。" : commission.length === 1 ? "已读取个人提成合计，请核对后保存。" : inferredRate!==null ? `按收益合计的 ${inferredRate*100}% 试算，请确认个人总提成。` : "账号比例不明确，请填写个人总提成。" };
  }
  let scriptPromise;
  async function prepareImage(file) {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 24000000) { bitmap.close(); throw new Error("截图尺寸过大，请裁剪后重试"); }
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height), pixels = data.data;
    const dark = (x, y) => pixels[(y * canvas.width + x) * 4] < 140;
    const ys = [], xs = [];
    // Spreadsheet rules confuse OCR into treating digits as borders. Remove only long rules.
    for (let y = 0; y < canvas.height; y++) { let n = 0; for (let x = 0; x < canvas.width; x++) n += dark(x, y); if (n > canvas.width * 0.6) ys.push(y); }
    for (let x = 0; x < canvas.width; x++) { let n = 0; for (let y = 0; y < canvas.height; y++) n += dark(x, y); if (n > canvas.height * 0.6) xs.push(x); }
    ctx.fillStyle = "white";
    for (const y of ys) ctx.fillRect(0, y - 1, canvas.width, 3);
    for (const x of xs) ctx.fillRect(x - 1, 0, 3, canvas.height);
    const scaled = document.createElement("canvas"), scale = Math.min(3, 3600 / Math.max(canvas.width, canvas.height));
    scaled.width = Math.round(canvas.width * scale); scaled.height = Math.round(canvas.height * scale);
    scaled.getContext("2d").drawImage(canvas, 0, 0, scaled.width, scaled.height);
    return scaled;
  }
  function loadEngine() {
    if (root.Tesseract) return Promise.resolve();
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/ocr/tesseract.min.js";
      script.onload = resolve; script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error("识别资源加载失败")); };
      document.head.append(script);
    });
    return scriptPromise;
  }
  async function recognize(files, onProgress, signal) {
    if (!files.length || files.length > 12) throw new Error("每次请选择 1 至 12 张截图");
    if (files.some(f => !/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 15 * 1024 * 1024)) throw new Error("请选择小于 15MB 的 PNG、JPG 或 WebP 图片");
    await loadEngine();
    if (signal?.aborted) throw new Error("识别已取消");
    let index = 0;
    const worker = await root.Tesseract.createWorker("chi_sim+eng", 1, {
      workerPath: "/vendor/ocr/worker.min.js", corePath: "/vendor/ocr", langPath: "/vendor/ocr", workerBlobURL: false,
      logger: m => onProgress?.({ index, count: files.length, progress: m.progress || 0, status: m.status })
    });
    const abort = () => worker.terminate();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      const texts = [];
      for (const file of files) {
        if (signal?.aborted) throw new Error("识别已取消");
        const result = await worker.recognize(await prepareImage(file));
        texts.push(result.data.text); index += 1;
      }
      return texts;
    } finally { signal?.removeEventListener("abort", abort); await worker.terminate(); }
  }
  root.TLActualImport = { matchProject, monthCandidates, parseImage, parseBatch, recognize, prepareImage };
})(globalThis);
