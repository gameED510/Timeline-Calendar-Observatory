window.TLAdmin = (() => {
  let current = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = value => value ? new Date(value).toLocaleString('zh-CN', {hour12:false}) : '暂无';
  function close() { current?.close(); }
  function open({client, userId, isCurrent, icons}) {
    close();
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    current = dialog;
    dialog.className = 'admin-console';
    dialog.setAttribute('aria-labelledby','adminTitle');
    dialog.innerHTML = `<header class="dialog-header"><div><h2 id="adminTitle">管理控制台</h2><p class="admin-subtitle">用户与使用概况 <span>只读</span></p></div><button class="icon-button" data-close aria-label="关闭管理控制台"><i data-lucide="x"></i></button></header><div class="admin-content"><p class="admin-status" role="status">正在校验管理员权限…</p><section class="admin-authorized" hidden><div class="admin-metrics"></div><form class="admin-search"><label for="adminSearch">注册邮箱</label><input id="adminSearch" type="search" maxlength="200" placeholder="搜索邮箱" autocomplete="off"><button class="text-button" type="submit">搜索</button><button class="icon-button" type="button" data-refresh title="刷新数据" aria-label="刷新数据"><i data-lucide="rotate-ccw"></i></button></form><div class="admin-table-wrap"><table><thead><tr><th>用户</th><th>注册时间</th><th>最近登录</th><th>项目数</th><th>完成节点</th><th>最近云端保存</th></tr></thead><tbody></tbody></table></div><p class="admin-empty" hidden>没有匹配的用户</p><footer class="admin-pagination"><span data-count></span><div><button class="icon-button" data-prev aria-label="上一页"><i data-lucide="chevron-left"></i></button><span data-page></span><button class="icon-button" data-next aria-label="下一页"><i data-lucide="chevron-right"></i></button></div></footer></section></div>`;
    let page = 0, search = '', sequence = 0, closed = false;
    const valid = () => !closed && current === dialog && isCurrent(userId);
    const status = dialog.querySelector('.admin-status');
    const authorized = dialog.querySelector('.admin-authorized');
    const clearData = () => { authorized.hidden=true; dialog.querySelector('tbody').replaceChildren();dialog.querySelector('.admin-metrics').replaceChildren(); };
    async function load() {
      const request = ++sequence;
      if (!valid()) { dialog.close(); return; }
      clearData(); status.hidden=false;status.textContent='正在读取用户概况…';
      try {
        const {data,error} = await client.rpc('admin_user_overview',{p_search:search,p_page:page,p_page_size:25});
        if(!valid() || request!==sequence)return;
        if(error)throw error;
        if(!data || !['owner','reader'].includes(data.role) || !Array.isArray(data.users))throw new Error('Invalid response');
        status.hidden=true;authorized.hidden=false;
        dialog.querySelector('.admin-metrics').innerHTML=[['注册总人数',data.summary.registered],['近 7 天注册',data.summary.new_7d],['近 30 天登录',data.summary.signed_in_30d]].map(([label,n])=>`<div><span>${label}</span><strong>${Number(n)||0}</strong></div>`).join('');
        dialog.querySelector('tbody').innerHTML=data.users.map(u=>`<tr><td><strong>${escape(u.email || '无邮箱')}</strong><small>${escape(u.id)}</small><span class="admin-verification">${u.email_verified?'邮箱已验证':'邮箱未验证'}</span></td><td>${escape(time(u.registered_at))}</td><td>${escape(time(u.last_sign_in_at))}</td><td>${Number(u.project_count)||0}</td><td>${Number(u.completed_count)||0}</td><td>${escape(time(u.last_saved_at))}</td></tr>`).join('');
        dialog.querySelector('.admin-empty').hidden=data.users.length>0;
        dialog.querySelector('[data-count]').textContent=`${data.total} 位用户`;
        dialog.querySelector('[data-page]').textContent=`${page+1} / ${Math.max(1,Math.ceil(data.total/25))}`;
        dialog.querySelector('[data-prev]').disabled=page===0;
        dialog.querySelector('[data-next]').disabled=(page+1)*25>=data.total;
      } catch(error) {
        if(!valid() || request!==sequence)return;
        clearData();status.hidden=false;
        status.textContent=error.code==='42501'?'此账号不在管理员白名单中。':error.code==='PGRST202'?'管理员服务尚未配置，请稍后重试。':'无法读取用户概况，请重新打开控制台重试。';
      }
    }
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();search=dialog.querySelector('input').value.trim();page=0;load();};
    dialog.querySelector('[data-refresh]').onclick=load;
    dialog.querySelector('[data-prev]').onclick=()=>{if(page>0){page--;load();}};
    dialog.querySelector('[data-next]').onclick=()=>{page++;load();};
    dialog.addEventListener('close',()=>{closed=true;sequence++;clearData();dialog.remove();if(current===dialog)current=null;previous?.isConnected&&previous.focus({preventScroll:true});},{once:true});
    document.body.append(dialog);dialog.showModal();icons();load();
  }
  return {open,close};
})();
