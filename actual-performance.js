(function (root) {
  "use strict";
  const P = root.TLPerformance;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = value => Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const present = record => record && P.actualAmount(record.total) !== null;
  const adCommission = ad => Number.isFinite(ad.commissionRate) ? ad.revenue * ad.commissionRate : 0;
  let state = { userId: null, epoch: -1, records: [], loaded: false, loading: false, error: "" };
  let context, panel, activeDialog;
  function reset() {
    root.TLPerformanceCharts?.destroy();
    activeDialog?.close();
    state = { userId: null, epoch: -1, records: [], loaded: false, loading: false, error: "" };
  }
  const current = ctx => ctx.isCurrent(ctx.userId, ctx.epoch);
  function normalize(record) { return { ...record, total: P.actualAmount(record.total), ads: Array.isArray(record.ads) ? record.ads : [] }; }
  async function load() {
    if (!context.userId || state.loading) return;
    const ctx = context;
    state.loading = true; state.error = ""; draw();
    try {
      const result = await ctx.client.from("timeline_actual_performance").select("month,total,ads,snapshot,version,updated_at").eq("user_id", ctx.userId).order("month").abortSignal(ctx.signal);
      if (result.error) throw result.error;
      if (!current(ctx)) return;
      state.records = (result.data || []).map(normalize); state.loaded = true;
    } catch (error) {
      if (!current(ctx)) return;
      state.error = "结算记录读取失败，请重试。";
    } finally { if (current(ctx)) { state.loading = false; draw(); } }
  }
  function makeSnapshot(ctx, kind) {
    const result = P.snapshot(ctx.projects, ctx.month, ctx.today, ctx.profiles);
    const model = P.calibration(state.records, ctx.month);
    return { ...result, kind, calibrated: model.ready ? result.formula * model.factor : null, calibrationMonths: model.n, factor: model.factor };
  }
  async function persist(ctx, record, expectedVersion) {
    if (!current(ctx)) throw new Error("登录状态已变化，请重新打开录入界面。");
    const result = await ctx.client.rpc("save_actual_performance", {
      p_month: record.month, p_total: record.total, p_ads: record.ads,
      p_snapshot: record.snapshot, p_expected_version: expectedVersion
    }).abortSignal(ctx.signal);
    if (result.error) {
      if (result.error.code === "40001") throw new Error("此月记录已被其他设备修改。请取消并刷新记录后重新录入。");
      throw new Error("保存失败，请检查网络后重试；录入内容仍保留。");
    }
    if (!current(ctx)) throw new Error("登录状态已变化。");
    const saved = normalize(Array.isArray(result.data) ? result.data[0] : result.data);
    state.records = state.records.filter(r => r.month !== saved.month).concat(saved);
    return saved;
  }
  async function captureForecast() {
    const ctx = context;
    if (!state.loaded || state.error || !ctx.ready || state.capturing || ctx.month !== ctx.today.slice(0, 7) || state.records.some(r => r.month === ctx.month)) return;
    const snapshot = makeSnapshot(ctx, "forecast");
    if (!snapshot.formula) return;
    state.capturing = true;
    try { await persist(ctx, { month: ctx.month, total: null, ads: [], snapshot }, 0); }
    catch { /* Actual entry remains available even when background forecast capture fails. */ }
    finally { if (current(ctx)) { state.capturing = false; draw(); } }
  }
  function draw() {
    if (!panel || !context || !current(context)) return;
    const record = state.records.find(r => r.month === context.month);
    const model = P.calibration(state.records, context.month);
    const snapshot = record?.snapshot || makeSnapshot(context, "historical");
    const formula = snapshot.formula;
    const calibrated = record ? snapshot.calibrated : model.ready ? formula * model.factor : null;
    const evaluation = P.evaluate(state.records);
    const difference=present(record)?record.total-formula:null;
    const differenceLabel=difference===null ? "尚未录入实际提成" : difference===0 ? "与公式估算一致" : `比预计${difference>0?"多":"少"} ¥${money(Math.abs(difference))}${formula>0 ? `（${money(Math.abs(difference)/formula*100)}%）` : " · 估算为零，不计算误差率"}`;
    panel.innerHTML = `<div class="actual-heading"><div><p class="eyebrow">TL / SETTLEMENT</p><h3>真实结算与预测</h3></div><div class="actual-actions"><button type="button" class="icon-button mini-button" data-refresh title="刷新结算记录" aria-label="刷新结算记录"><i data-lucide="refresh-cw"></i></button><button type="button" class="secondary-button actual-entry" data-entry ${state.loading || !state.loaded ? "disabled" : ""}><i data-lucide="plus"></i>录入实际</button></div></div>
      <div class="actual-comparison"><div><span>公式估算</span><strong>¥${money(formula)}</strong><small>${record ? snapshot.kind === "forecast" ? "已保存预测快照" : "历史回算" : "当前报价回算"}</small></div><div><span>历史校准估算</span><strong>${Number.isFinite(calibrated) ? `¥${money(calibrated)}` : "—"}</strong><small>${Number.isFinite(calibrated) ? `${snapshot.calibrationMonths ?? model.n} 个月样本 · 校准试算` : "满 3 个有效月份后试算"}</small></div><div><span>实际总提成</span><strong>${present(record) ? `¥${money(record.total)}` : "—"}</strong><small>${differenceLabel}</small></div></div>
      <p class="performance-range">${esc(context.month)} 结算 · 对应 ${esc(P.naturalMonth(context.month,-3).start.slice(0,7))} 自然月发布</p>
      <details class="forecast-breakdown"><summary>查看公式估算来源 · ${(snapshot.rows||[]).length} 条发布记录</summary>${(snapshot.rows||[]).map(row=>`<p><span>${esc(row.name)} · ${row.platform==="douyin"?"抖音":"小红书"}</span><strong>¥${money(row.estimated)}</strong></p>`).join("")||"此月暂无参与估算的发布记录"}</details>
      <details class="forecast-breakdown"><summary>当前校准样本 · ${model.n} 个月</summary><p>${model.months.map(esc).join("、") || "暂无有效历史结算"}</p><p>只采用当前结算月之前、已有实际总额且公式估算大于零的最近六个月；未录入和零估算月份不参与。</p><p>当前系数 ${model.factor.toFixed(3)}${record ? "；已保存估算仍沿用原快照，不随当前样本变化。" : ""}</p></details>
      ${model.n<3?`<div class="actual-sample-progress"><progress value="${model.n}" max="3" aria-label="校准样本积累"></progress><span>${model.n}/3 个有效结算月，继续积累后显示校准试算</span></div>`:""}
      <p class="actual-status" role="status">${state.loading ? "正在读取结算记录…" : esc(state.error)}</p>
      <div class="actual-analysis"><span>最近 ${model.n} 个有效月份</span>${model.mae === null ? "" : `<span>平均金额误差 ¥${money(model.mae)}</span><span>${model.bias > 0 ? "长期高估" : model.bias < 0 ? "长期低估" : "无整体偏差"} ${model.bias ? `¥${money(Math.abs(model.bias))}` : ""}</span>`}</div>
      <div class="performance-charts"></div>
      <p class="performance-footnote">${evaluation.n ? `${evaluation.n} 个后续结算检验：公式平均误差 ¥${money(evaluation.formulaMae)}，校准平均误差 ¥${money(evaluation.calibratedMae)}。` : "校准效果待后续真实结算检验，历史回算不作为预测成功样本。"}</p>
      ${present(record) ? `<details class="actual-details" open><summary>实际广告明细 · ${record.ads.length} 条</summary><div class="performance-table-wrap"><table class="performance-table"><thead><tr><th>广告 / 平台</th><th>实际收益</th><th>对应提成</th><th>较估算</th></tr></thead><tbody>${record.ads.map(ad => {
        const matched = (snapshot.rows || []).filter(r => r.projectId === ad.projectId);
        const estimate = matched.reduce((s,r) => s+r.estimated,0);
        return `<tr><td><strong>${esc(ad.name || matched[0]?.name || "未命名广告")}</strong><span>${matched.length ? [...new Set(matched.map(r => r.platform === "douyin" ? "抖音" : "小红书"))].join(" + ") : "未匹配估算"}</span></td><td>¥${money(ad.revenue)}</td><td>${Number.isFinite(ad.commissionRate) ? `¥${money(adCommission(ad))} · ${money(ad.commissionRate*100)}%` : "比例待匹配"}</td><td>${matched.length && Number.isFinite(ad.commissionRate) ? `¥${money(adCommission(ad)-estimate)}` : "—"}</td></tr>`;
      }).join("")}</tbody></table></div><p class="performance-footnote">已匹配比例的明细提成合计 ¥${money(record.ads.reduce((s,a)=>s+adCommission(a),0))} · 与确认总提成差额 ¥${money(record.total-record.ads.reduce((s,a)=>s+adCommission(a),0))}。实际总提成以确认值为准。</p></details>` : ""}`;
    root.TLPerformanceCharts.render(panel.querySelector('.performance-charts'),state.records,snapshot,month=>context.onChange(month),context.month);
    panel.querySelector("[data-refresh]").onclick = () => load();
    panel.querySelector("[data-entry]").onclick = () => open();
    const exportButton=document.createElement("button");
    exportButton.type="button";exportButton.className="icon-button mini-button";
    exportButton.title="导出全部结算记录";exportButton.setAttribute("aria-label",exportButton.title);
    exportButton.innerHTML='<i data-lucide="download"></i>';
    exportButton.disabled=!state.loaded || state.loading || !state.records.length;
    exportButton.onclick=()=>{
      if(!current(context) || !state.loaded)return;
      const url=URL.createObjectURL(new Blob([P.settlementCsv(state.records)],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");link.href=url;link.download=`TL-结算对账-${context.today}.csv`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    panel.querySelector(".actual-actions").prepend(exportButton);
    root.lucide?.createIcons();
  }
  function mount(element, ctx) {
    if (state.userId !== ctx.userId || state.epoch !== ctx.epoch) { reset(); state.userId = ctx.userId; state.epoch = ctx.epoch; }
    context = ctx; panel = element;
    if (!ctx.userId) { panel.replaceChildren(); return; }
    draw();
    if (!state.loaded && !state.loading && !state.error) load().then(captureForecast);
    else captureForecast();
  }
  function open() {
    if (!state.loaded || !current(context) || state.capturing) return;
    const ctx = { ...context }, controller = new AbortController();
    const dialog = document.createElement("dialog"); dialog.className = "project-dialog actual-dialog";
    const close = () => { controller.abort(); dialog.close(); dialog.remove(); if (activeDialog?.element === dialog) activeDialog = null; };
    activeDialog = { element: dialog, close };
    const onAccountAbort = () => close(); ctx.signal.addEventListener("abort", onAccountAbort, { once: true });
    dialog.addEventListener("close", () => { controller.abort(); ctx.signal.removeEventListener("abort", onAccountAbort); });
    dialog.innerHTML = `<form><header class="dialog-header"><div><p class="eyebrow">TL / SETTLEMENT</p><h2>录入实际</h2></div><button type="button" class="icon-button" data-close aria-label="关闭"><i data-lucide="x"></i></button></header><div class="project-form-body">
      <div class="actual-fields"><label>结算月份<input name="month" type="month" required value="${ctx.month}"></label><label>个人总提成<input name="total" type="number" min="0" max="1000000000" step="any" required inputmode="decimal"></label></div>
      <p data-notice role="status"></p><div class="actual-heading"><h3>广告明细</h3><button type="button" class="icon-button mini-button" data-add title="添加广告" aria-label="添加广告"><i data-lucide="plus"></i></button></div><div class="actual-ad-rows"></div><p data-balance class="performance-footnote"></p>
      <p data-error role="alert"></p></div><footer class="dialog-actions"><button type="button" class="secondary-button" data-close>取消</button><button type="submit" class="primary-button"><i data-lucide="check"></i>确认保存</button></footer></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form"), rows = dialog.querySelector(".actual-ad-rows"), notice = dialog.querySelector("[data-notice]"), error = dialog.querySelector("[data-error]");
    let targetRecord, dirty = false, editingMonth = ctx.month;
    const balance = () => {
      const total = Number(form.elements.total.value), sum = [...rows.children].reduce((s,r)=>s+Number(r.querySelector('[data-revenue]').value || 0)*Number(r.dataset.rate || 0),0);
      const unknown = [...rows.children].filter(r => r.dataset.rate === "").length;
      const delta = Math.round((total-sum)*100)/100;
      dialog.querySelector("[data-balance]").textContent = `已对应提成 ¥${money(sum)}${unknown ? ` · ${unknown} 条明细比例待匹配` : ""}${form.elements.total.value === "" ? "" : delta > 0 ? ` · 尚未对应 ¥${money(delta)}` : delta < 0 ? ` · 明细超出总额 ¥${money(-delta)}，请核对` : " · 总额已对齐"}。保存以个人总提成为准。`;
    };
    const add = (ad = {}) => {
      const row = document.createElement("div"); row.className = "actual-ad-row";
      const choices = new Map(ctx.projects.map(project=>[project.id,project.name]));
      for (const item of targetRecord?.snapshot?.rows || []) {
        if (item.projectId && !choices.has(item.projectId)) choices.set(item.projectId,`${item.name || "历史项目"} · 历史记录`);
      }
      if (ad.projectId && !choices.has(ad.projectId)) choices.set(ad.projectId,`${ad.name || "原关联项目"} · 历史记录`);
      row.innerHTML = `<label>广告名称<input data-name maxlength="200" placeholder="广告名称" value="${esc(ad.name)}"></label><label>对应项目<select data-project><option value="">未匹配 · 保留金额</option>${[...choices].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join("")}</select></label><label>实际收益<input data-revenue type="number" min="0" max="1000000000" step="any" inputmode="decimal" required value="${ad.revenue ?? ""}"></label><button type="button" class="icon-button mini-button" title="移除明细" aria-label="移除明细"><i data-lucide="trash-2"></i></button>`;
      row.querySelector("select").value = ad.projectId || "";
      const rateForProject = id => {
        const historical = (targetRecord?.snapshot?.rows || []).filter(item=>item.projectId===id);
        if (historical.length) {
          const rates = [...new Set(historical.map(item=>item.commissionRate))];
          return rates.length===1 && Number.isFinite(rates[0]) && rates[0]>=0 && rates[0]<=1 ? rates[0] : null;
        }
        const project=ctx.projects.find(p=>p.id===id);
        const profiles=targetRecord?.snapshot?.profiles || ctx.profiles;
        return project ? P.profiles(profiles).find(p=>p.id===P.account(project,profiles))?.commissionRate ?? null : null;
      };
      const initialRate = ad.commissionRate ?? rateForProject(ad.projectId);
      row.dataset.rate = initialRate ?? "";
      row.querySelector("select").onchange = e => { if (!row.querySelector("[data-name]").value) row.querySelector("[data-name]").value = choices.get(e.target.value) || ""; row.dataset.rate=rateForProject(e.target.value) ?? ""; dirty=true; balance(); };
      row.querySelector("button").onclick = () => { row.remove(); dirty = true; balance(); };
      rows.append(row); root.lucide?.createIcons(); balance();
    };
    const selectMonth = (initial = false) => {
      targetRecord = state.records.find(r=>r.month===form.elements.month.value);
      notice.textContent = present(targetRecord) ? "该月已有实际记录，确认后更新；估算快照保持不变。" : targetRecord ? "该月已有预测快照，结算后保留原预测用于对照。" : "该月没有预测快照，将标记为历史回算。";
      if (initial || !dirty) { rows.replaceChildren(); form.elements.total.value = present(targetRecord) ? targetRecord.total : ""; (targetRecord?.ads || []).forEach(add); }
      balance();
    };
    form.elements.month.onchange = () => {
      const nextMonth = form.elements.month.value;
      if (nextMonth === editingMonth) return;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) { form.elements.month.value=editingMonth; return; }
      const existing = state.records.find(record=>record.month===nextMonth);
      if (dirty && !root.confirm(`将当前未保存内容改记到 ${nextMonth}？${present(existing) ? "该月已有实际结算，确认保存后会更新该月记录。" : "当前输入会保留，只有确认保存后才写入。"}`)) {
        form.elements.month.value=editingMonth; return;
      }
      editingMonth=nextMonth;
      selectMonth();
    };
    form.addEventListener("input", event => { if (event.target !== form.elements.month) dirty = true; balance(); });
    const requestClose=()=>{
      if(!dirty){close();return;}
      let warning=dialog.querySelector('.editor-unsaved');
      if(!warning){warning=document.createElement('section');warning.className='editor-unsaved';warning.innerHTML='<p>实际结算尚未保存</p><div><button type="button" class="ghost-button" data-continue>继续编辑</button><button type="button" class="ghost-button" data-discard>放弃修改</button></div>';dialog.querySelector('form').append(warning);warning.querySelector('[data-continue]').onclick=()=>warning.remove();warning.querySelector('[data-discard]').onclick=close;}
      warning.querySelector('[data-continue]').focus();
    };
    dialog.querySelectorAll("[data-close]").forEach(b=>b.onclick=requestClose);
    dialog.addEventListener("cancel", e=>{e.preventDefault();requestClose();});
    dialog.querySelector("[data-add]").onclick=()=>{dirty=true;add();};
    let saving = false;
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving) return;
      const total=P.actualAmount(form.elements.total.value), month=form.elements.month.value;
      const ads=[...rows.children].map(row=>({name:row.querySelector('[data-name]').value.trim(),projectId:row.querySelector('[data-project]').value,revenue:P.actualAmount(row.querySelector('[data-revenue]').value),commissionRate:row.dataset.rate==="" ? null : Number(row.dataset.rate)}));
      if (total===null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || ads.length>500 || ads.some(a=>a.revenue===null)) { error.textContent="请检查结算月份、金额与广告明细；空白金额不等于零。"; return; }
      saving=true;
      const submit=form.querySelector('[type="submit"]'); submit.disabled=true; error.textContent="";
      try {
        const snapshot=targetRecord?.snapshot || makeSnapshot({...ctx,month},"historical");
        await persist(ctx,{month,total,ads,snapshot},targetRecord?.version || 0);
        close(); context.onChange(month);
      } catch(e) { if (dialog.isConnected) { error.textContent=e.message; submit.disabled=false; } }
      finally { saving=false; }
    };
    selectMonth(true); dialog.showModal(); root.lucide?.createIcons();
  }
  root.TLActualUI = { mount, reset };
})(globalThis);
