(function (root) {
  "use strict";
  let loading, instance, generation = 0, mode = "amount", months = 6;
  const money = n => Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  function engine() {
    if (root.TLChart) return Promise.resolve(root.TLChart);
    if (!loading) loading = new Promise((resolve,reject) => {
      const script=document.createElement("script"); script.src="/vendor/charts.js?v=1";
      script.onload=()=>resolve(root.TLChart); script.onerror=()=>{loading=null;script.remove();reject(new Error("图表资源加载失败"));}; document.head.append(script);
    });
    return loading;
  }
  function destroy() { generation++; instance?.destroy(); instance=null; }
  async function render(host, records, snapshot, onMonth) {
    destroy(); const own=generation;
    const points=records.filter(r=>r.snapshot && r.total!==null).sort((a,b)=>a.month.localeCompare(b.month)).slice(-months);
    host.innerHTML='<div class="actual-chart-heading"><div class="segmented actual-chart-tabs"><button type="button" data-mode="amount">金额趋势</button><button type="button" data-mode="error">金额误差</button><button type="button" data-mode="percent">比例误差</button></div><select aria-label="图表时间范围"><option value="6">近 6 个月</option><option value="12">近 12 个月</option></select></div><div class="actual-chart-canvas"><canvas role="img" aria-label="绩效金额与估算误差趋势"></canvas></div><p class="chart-status" role="status"></p><div class="actual-chart-months"></div><details class="chart-data-table"><summary>查看图表数据</summary><div class="performance-table-wrap"><table class="performance-table"><thead><tr><th>月份</th><th>公式估算</th><th>实际提成</th><th>高估 / 低估</th></tr></thead><tbody></tbody></table></div></details><div class="actual-platform-mix"><h4>本月公式估算构成</h4></div>';
    host.querySelectorAll('[data-mode]').forEach(button=>{
      button.classList.toggle('active',button.dataset.mode===mode); button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
      button.onclick=()=>{mode=button.dataset.mode;render(host,records,snapshot,onMonth);};
    });
    const range=host.querySelector('select');range.value=String(months);range.onchange=()=>{months=Number(range.value);render(host,records,snapshot,onMonth);};
    const monthList=host.querySelector('.actual-chart-months');
    for (const point of points) {
      const row=document.createElement('tr');
      [point.month,`¥${money(point.snapshot.formula)}`,`¥${money(point.total)}`,`${point.snapshot.formula>=point.total?'高估':'低估'} ¥${money(Math.abs(point.snapshot.formula-point.total))}`].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});
      host.querySelector('.chart-data-table tbody').append(row);
      const button=document.createElement('button');button.type='button';button.textContent=point.month;
      button.title=`实际 ¥${money(point.total)}，公式 ¥${money(point.snapshot.formula)}`;
      button.onclick=()=>onMonth(point.month);monthList.append(button);
    }
    const mix=host.querySelector('.actual-platform-mix');
    const values=['douyin','xiaohongshu'].map(platform=>(snapshot.rows||[]).filter(r=>r.platform===platform).reduce((s,r)=>s+r.estimated,0));
    const total=values.reduce((s,n)=>s+n,0);
    values.forEach((value,index)=>{
      const row=document.createElement('div');row.className='platform-mix-row';
      const label=document.createElement('span');label.textContent=index===0?'抖音':'小红书';
      const track=document.createElement('div');track.className='platform-mix-track';
      const bar=document.createElement('span');bar.className=index===0?'mix-douyin':'mix-xiaohongshu';bar.style.width=`${total?value/total*100:0}%`;track.append(bar);
      const amount=document.createElement('strong');amount.textContent=`¥${money(value)}`;row.append(label,track,amount);mix.append(row);
    });
    const canvas=host.querySelector('canvas'), status=host.querySelector('.chart-status');
    if (!points.length) { status.textContent='录入实际结算后显示月度趋势';canvas.parentElement.hidden=true;return; }
    canvas.textContent=points.map(p=>`${p.month}：公式 ${money(p.snapshot.formula)}，实际 ${money(p.total)}`).join('；');
    try {
      const Chart=await engine();if(own!==generation||!host.isConnected)return;
      const css=getComputedStyle(host), ink=css.getPropertyValue('--muted').trim()||'#777', line=css.getPropertyValue('--line').trim()||'#ddd';
      const series=mode==='amount' ? [
        {label:'公式估算',data:points.map(p=>p.snapshot.formula),borderColor:'#3785c5',backgroundColor:'#3785c5'},
        {label:'历史校准',data:points.map(p=>p.snapshot.calibrated ?? null),borderColor:'#b58b24',backgroundColor:'#b58b24',borderDash:[5,4]},
        {label:'实际提成',data:points.map(p=>p.total),borderColor:'#299481',backgroundColor:'#299481'}
      ] : [{label:mode==='percent'?'误差 / 公式估算':'公式估算 - 实际',data:points.map(p=>mode==='percent'?(p.snapshot.formula>0?(p.snapshot.formula-p.total)/p.snapshot.formula*100:null):p.snapshot.formula-p.total),backgroundColor:points.map(p=>p.snapshot.formula>=p.total?'#d77567':'#299481'),borderRadius:4,maxBarThickness:36}];
      instance=new Chart(canvas,{type:mode==='amount'?'line':'bar',data:{labels:points.map(p=>p.month.slice(2)),datasets:series},options:{responsive:true,maintainAspectRatio:false,animation:matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:350},interaction:{intersect:false,mode:'index'},
        elements:{line:{borderWidth:2,tension:.25,cubicInterpolationMode:'monotone'},point:{radius:3,hoverRadius:5}},
        plugins:{legend:{position:'bottom',labels:{color:ink,usePointStyle:true,boxWidth:8,padding:14,font:{size:11}}},tooltip:{callbacks:{label:item=>`${item.dataset.label}：${mode==='percent'?money(item.parsed.y)+'%':'¥'+money(item.parsed.y)}`}}},
        scales:{x:{grid:{display:false},ticks:{color:ink,font:{size:11}}},y:{beginAtZero:true,grid:{color:line},ticks:{color:ink,maxTicksLimit:5,callback:v=>mode==='percent'?money(v)+'%':Math.abs(v)>=10000?`${Math.round(v/1000)/10}万`:money(v)}}},
        onClick:(_event,elements)=>{if(elements.length)onMonth(points[elements[0].index].month);}
      }});
      status.textContent=mode==='amount'?'':`正值为高估，负值为低估${mode==='percent'?'；公式估算为零的月份不计算比例':''}`;
    } catch(e) { if(own===generation)status.textContent=e.message+'，可通过下方月份查看记录。'; }
  }
  root.TLPerformanceCharts={render,destroy};
})(globalThis);
