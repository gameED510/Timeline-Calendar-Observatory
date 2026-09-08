/* A transient presentation layer; all mutations go through the app callbacks. */
window.CalendarMotion = (() => {
  let layer, origin, callbacks, entries = [], page = 0, focused = -1, drag = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = (node, frames, options = {}) => reduced() ? null : node.animate(frames, { duration: 520, easing: 'cubic-bezier(.2,.8,.25,1)', ...options });
  const icon = (name, label, action) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'motion-icon'; button.title = label;
    button.setAttribute('aria-label', label);
    const i = document.createElement('i'); i.dataset.lucide = name; button.append(i);
    button.addEventListener('click', action); return button;
  };
  function close(restoreFocus = true) {
    if (drag) { drag.ghost.remove(); drag = null; }
    document.querySelectorAll('.motion-near').forEach(node => node.classList.remove('motion-near'));
    if (layer) { layer.remove(); layer = null; }
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keyboard);
    if (restoreFocus && origin?.isConnected) origin.focus({preventScroll:true});
    entries = []; callbacks = null;
  }
  function outside(event) { if (layer && !layer.contains(event.target) && !origin?.contains(event.target) && !drag) close(false); }
  function keyboard(event) { if (event.key === 'Escape') { event.preventDefault(); close(); } }
  function open(items, anchor, handlers) {
    close(false); entries = items; origin = anchor; callbacks = handlers; page = 0; focused = -1;
    layer = document.createElement('section'); layer.className = 'motion-fan';
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-label', '当天项目');
    layer.setAttribute('popover', 'manual'); document.body.append(layer);
    if (layer.showPopover) layer.showPopover();
    const bounds = anchor.getBoundingClientRect();
    const width = Math.min(520, innerWidth - 20), height = Math.min(520, innerHeight - 100);
    layer.style.width = `${width}px`; layer.style.height = `${height}px`;
    layer.style.left = `${Math.max(10, Math.min(innerWidth - width - 10, bounds.left + bounds.width / 2 - width / 2))}px`;
    layer.style.top = `${Math.max(10, Math.min(innerHeight - height - 80, bounds.top - 90))}px`;
    render();
    layer.querySelector('.motion-icon')?.focus({preventScroll:true});
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keyboard);
  }
  function render() {
    layer.replaceChildren();
    const bar = document.createElement('div'); bar.className = 'motion-fan-bar';
    const title = document.createElement('strong'); title.textContent = `${entries[0]?.date?.slice(5).replace('-', '.')} · ${entries.length} 个节点`;
    bar.append(title, icon('x', '收起项目', () => close())); layer.append(bar);
    const deck = document.createElement('div'); deck.className = 'motion-deck'; layer.append(deck);
    const visible = entries.slice(page * 6, page * 6 + 6);
    visible.forEach((item, index) => {
      const card = document.createElement('article'); card.className = 'motion-card';
      card.style.setProperty('--project-color', item.project.color);
      const narrow = innerWidth < 550, spread = narrow ? 64 : 100;
      const row = Math.floor(index / 2), side = index % 2 ? 1 : -1;
      const x = visible.length === 1 ? 0 : side * spread;
      const y = row * 72 - (visible.length > 4 ? 50 : 15);
      const rotate = side * (index === 0 ? 18 : 8 - row * 2);
      card.style.setProperty('--x', `${x}px`); card.style.setProperty('--y', `${y}px`);
      card.style.setProperty('--angle', `${rotate}deg`); card.style.zIndex = String(index + 1);
      const main = document.createElement('button'); main.type = 'button'; main.className = 'motion-card-main';
      const stage = document.createElement('span'); stage.className = 'motion-card-stage'; stage.textContent = item.stage + (item.completed ? ' · 已完成' : '');
      const name = document.createElement('strong'); name.textContent = item.project.name;
      main.append(name, stage); main.setAttribute('aria-label', `${item.project.name} ${item.stage}，聚焦项目`);
      main.addEventListener('click', () => { if (main.dataset.dragged) { delete main.dataset.dragged; return; } focus(index); });
      main.addEventListener('focus', () => focus(index));
      main.addEventListener('pointerdown', event => startDrag(event, card, main, item));
      const actions = document.createElement('div'); actions.className = 'motion-card-actions';
      actions.append(icon('pencil', '编辑项目', () => { const fn = callbacks.edit; close(false); fn(item); }),
        icon(item.completed ? 'rotate-ccw' : 'check', item.completed ? '标记未完成' : '标记完成', () => { const fn = callbacks.toggle; close(false); fn(item); }));
      card.append(main, actions); deck.append(card);
      animate(card, [{transform:'translate(-50%, -50%) scale(.72) rotate(0)',opacity:0}, {transform:`translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotate}deg)`,opacity:1}], {delay:index * 28});
    });
    if (entries.length > 6) {
      const pager = document.createElement('div'); pager.className = 'motion-pager';
      const back = icon('chevron-left', '上一组', () => {page--;focused=-1;render();}); back.disabled = page === 0;
      const next = icon('chevron-right', '下一组', () => {page++;focused=-1;render();}); next.disabled = (page+1)*6 >= entries.length;
      const label = document.createElement('span'); label.textContent = `${page+1} / ${Math.ceil(entries.length/6)}`;
      pager.append(back,label,next); layer.append(pager);
    }
    callbacks.icons();
  }
  function focus(index) {
    if (!layer || focused === index || drag) return;
    focused = index;
    layer.querySelectorAll('.motion-card').forEach((card, i) => {
      card.getAnimations().forEach(a=>a.cancel());
      card.classList.toggle('focused', i === index); card.classList.toggle('receded', i !== index);
      card.style.zIndex = String(i === index ? 20 : i + 1);
    });
  }
  function startDrag(event, card, main, item) {
    if (event.button !== 0 || drag) return;
    const owner = layer;
    const startX = event.clientX, startY = event.clientY;
    let moving = false, ghost, target = null, lastTarget = null;
    main.setPointerCapture(event.pointerId);
    const move = e => {
      if(layer !== owner) return;
      const dx=e.clientX-startX, dy=e.clientY-startY;
      if (!moving && Math.hypot(dx,dy) < 8) return;
      if (!moving) {
        moving=true; main.dataset.dragged='true';
        ghost=card.cloneNode(true); ghost.className='motion-card motion-ghost';
        ghost.querySelector('.motion-card-actions')?.remove();
        const label=document.createElement('span');label.className='motion-drop-date';ghost.append(label);
        layer.append(ghost); card.classList.add('drag-origin'); drag={ghost};
        layer.querySelectorAll('.motion-card:not(.motion-ghost)').forEach((neighbor,i)=>{
          if(neighbor !== card) animate(neighbor,[{rotate:'0deg'},{rotate:'-2.5deg',offset:.25},{rotate:'2deg',offset:.55},{rotate:'-.7deg',offset:.8},{rotate:'0deg'}],{duration:650,delay:i*25});
        });
      }
      const box=layer.getBoundingClientRect();
      ghost.style.left=`${e.clientX-box.left}px`;ghost.style.top=`${e.clientY-box.top}px`;
      ghost.style.transform=`translate(-50%, -50%) rotate(${Math.max(-9,Math.min(9,dx/25))}deg)`;
      layer.style.pointerEvents='none';
      target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.day-cell[data-date], .agenda-day[data-date]') || null;
      layer.style.pointerEvents='';
      if (target !== lastTarget) {
        lastTarget?.classList.remove('motion-near'); target?.classList.add('motion-near');
        if(target) target.querySelectorAll('.pile-leaf,.milestone-chip').forEach((node,i)=>animate(node,[{translate:'0 0',rotate:'0deg'},{translate:'-3px -3px',rotate:'-3deg'},{translate:'3px 1px',rotate:'2deg'},{translate:'0 0',rotate:'0deg'}],{duration:420,delay:i*25}));
        lastTarget=target;
      }
      ghost.querySelector('.motion-drop-date').textContent = target?.dataset.date?.slice(5).replace('-','.') || '';
      ghost.classList.toggle('over-date', Boolean(target));
    };
    const finish = async e => {
      main.removeEventListener('pointermove',move);main.removeEventListener('pointerup',finish);main.removeEventListener('pointercancel',cancel);
      if(main.hasPointerCapture(event.pointerId))main.releasePointerCapture(event.pointerId);
      if(!moving)return;
      lastTarget?.classList.remove('motion-near');
      const destination=target?.dataset.date;
      if(destination && e.type !== 'pointercancel') {
        const b=target.getBoundingClientRect(), l=layer.getBoundingClientRect();
        const a=animate(ghost,[{left:ghost.style.left,top:ghost.style.top,transform:ghost.style.transform},{left:`${b.left+b.width/2-l.left}px`,top:`${b.top+75-l.top}px`,transform:'translate(-50%, -50%) scale(1.12,.7)',offset:.65},{left:`${b.left+b.width/2-l.left}px`,top:`${b.top+75-l.top}px`,transform:'translate(-50%, -50%) scale(.7,1.08)',offset:.82},{left:`${b.left+b.width/2-l.left}px`,top:`${b.top+75-l.top}px`,transform:'translate(-50%, -50%) scale(.75)'}],{duration:560});
        try{await a?.finished;}catch{}
        if(layer !== owner)return;
        const fn=callbacks.move;close(false);fn(item,destination);
        const cell=[...document.querySelectorAll('.day-cell')].find(n=>n.dataset.date===destination);
        if(cell)animate(cell.querySelector('.day-pile-cover,.chip-stack')||cell,[{scale:'1.08 .88'},{scale:'.96 1.06',offset:.55},{scale:'1'}],{duration:460});
      } else { ghost.remove(); card.classList.remove('drag-origin'); drag=null; }
    };
    const cancel=e=>finish(e);
    main.addEventListener('pointermove',move);main.addEventListener('pointerup',finish);main.addEventListener('pointercancel',cancel);
  }
  window.addEventListener('resize', () => close(false));
  return {open,close};
})();
