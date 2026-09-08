/* Calendar cards stay in their original day cell throughout expansion. */
window.CalendarMotion = (() => {
  let layer = null, callbacks = null, focused = -1, drag = null, leaveTimer;
  const groups = new WeakMap();
  const { gsap, Flip } = window.CalendarAnimator;
  function layout(group, change, complete = () => {}) {
    const cards = [...group.querySelectorAll('.motion-card:not(.motion-ghost)')];
    const state = Flip.getState(cards);
    change();
    if (!reduced()) Flip.from(state, { duration: .48, ease: 'power3.out', scale: true, nested: true, onComplete: complete });
    else complete();
  }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = (node, frames, options = {}) => reduced() ? null : node.animate(frames, { duration: 520, easing: 'cubic-bezier(.2,.8,.25,1)', ...options });
  function icon(name, label, action) {
    const button = document.createElement('button');
    button.type='button'; button.className='motion-icon'; button.title=label; button.setAttribute('aria-label',label);
    const i=document.createElement('i'); i.dataset.lucide=name; button.append(i);
    button.addEventListener('click',event=>{event.stopPropagation();action();}); return button;
  }
  function close(restoreFocus = true) {
    clearTimeout(leaveTimer);
    if (drag) { gsap.killTweensOf(drag.ghost); drag.ghost.remove(); drag=null; }
    document.querySelectorAll('.motion-near').forEach(node=>node.classList.remove('motion-near'));
    if(layer) {
      const old=layer;
      old.classList.add('closing');
      layout(old, () => {
      old.classList.remove('expanded','dragging');
      old.querySelectorAll('.motion-card').forEach((card,i)=>{
        card.querySelector('.motion-card-menu').hidden=true;
        card.querySelector('.motion-more').setAttribute('aria-expanded','false');
        card.classList.remove('focused','receded','drag-origin');card.style.zIndex=String(i+1);
        card.querySelector('.motion-card-main').setAttribute('aria-expanded','false');
        const data=groups.get(old);card.querySelector('strong').textContent=data.handlers.label(data.items[i]);
      });
      },()=>{old.classList.remove('closing');if(!old.classList.contains('expanded')&&!old.classList.contains('dragging'))old.closest('.day-cell')?.classList.remove('pile-active');});
      if(restoreFocus) old.querySelector('.motion-card-main')?.focus({preventScroll:true});
    }
    layer=null; callbacks=null; focused=-1;
  }
  function open(group) {
    clearTimeout(leaveTimer);
    if(layer===group)return;
    close(false);layer=group;callbacks=groups.get(group).handlers;focused=-1;
    const rect=group.getBoundingClientRect(), mobile=innerWidth<550;
    const width=mobile?168:208, spread=mobile?62:88;
    const center=Math.max(width/2+spread+24,Math.min(innerWidth-width/2-spread-24,rect.left+rect.width/2));
    const cards=[...group.querySelectorAll('.motion-card')];
    const step=Math.min(62,Math.max(8,(innerHeight-360)/Math.max(cards.length-1,1)));
    const top=Math.max(100,Math.min(innerHeight-190-step*(cards.length-1),rect.top-35));
    cards.forEach((card,i)=>{
      card.querySelector('strong').textContent=groups.get(group).items[i].project.name;
      const side=i%2 ? 1 : -1;
      card.style.setProperty('--x', `${center-rect.left-rect.width/2+side*spread}px`);
      card.style.setProperty('--y', `${top-rect.top+i*step}px`);
      card.style.setProperty('--angle', `${side*(i===0?18:8)}deg`);
      card.querySelector('.motion-card-main').setAttribute('aria-expanded','true');
    });
    layout(group, () => {
      group.classList.add('expanded');group.closest('.day-cell')?.classList.add('pile-active');
      if(cards.length===1){ cards[0].classList.add('focused');focused=0; }
    });
  }
  function focus(index) {
    if(!layer||drag||focused===index)return;
    focused=index;
    layout(layer, () => layer.querySelectorAll('.motion-card').forEach((card,i)=>{
      card.classList.toggle('focused',i===index);card.classList.toggle('receded',i!==index);
      if(i!==index){card.querySelector('.motion-card-menu').hidden=true;card.querySelector('.motion-more').setAttribute('aria-expanded','false');}
      card.style.zIndex=String(i===index?100:i+1);
    }));
  }
  function mount(items, group, handlers) {
    group.className='inline-pile';
    group.setAttribute('aria-label',`${items.length} 个节点`);
    groups.set(group,{handlers,items});
    items.forEach((item,index)=>{
      const card=document.createElement('article');card.className='motion-card';
      card.style.setProperty('--project-color',item.project.color);
      card.style.setProperty('--stack',String(Math.min(index,3)));
      card.style.zIndex=String(index+1);
      const main=document.createElement('button');main.type='button';main.className='motion-card-main';
      main.setAttribute('aria-expanded','false');main.setAttribute('aria-label',`${item.project.name} ${item.stage}，展开并聚焦`);
      const name=document.createElement('strong');name.textContent=handlers.label(item);
      const stage=document.createElement('span');stage.className='motion-card-stage';stage.textContent=item.stage+(item.completed?' · 已完成':'');
      main.append(name,stage);
      main.addEventListener('click',event=>{
        event.stopPropagation();
        if(main.dataset.dragged){delete main.dataset.dragged;return;}
        if(layer!==group)open(group);else focus(index);
      });
      main.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
      main.addEventListener('pointerdown',event=>startDrag(event,card,main,item,group));
      const actions=document.createElement('div');actions.className='motion-card-actions';
      actions.append(icon(item.completed?'rotate-ccw':'check',item.completed?'标记未完成':'标记完成',()=>{close(false);handlers.toggle(item);}));
      const menu=document.createElement('div');menu.className='motion-card-menu';menu.hidden=true;
      const edit=icon('pencil','编辑项目',()=>{close(false);handlers.edit(item);});
      edit.append(document.createTextNode('编辑项目'));menu.append(edit);
      const more=icon('ellipsis','更多操作',()=>{
        const next=menu.hidden;
        group.querySelectorAll('.motion-card-menu').forEach(node=>node.hidden=true);
        group.querySelectorAll('.motion-more').forEach(node=>node.setAttribute('aria-expanded','false'));
        menu.hidden=!next;more.setAttribute('aria-expanded',String(next));
      });
      more.classList.add('motion-more');more.setAttribute('aria-expanded','false');
      card.append(main,actions,more,menu);group.append(card);
    });
    group.addEventListener('pointerenter',event=>{
      if(event.pointerType==='mouse' && layer!==group && !drag) gsap.to(group,{y:reduced()?0:-4,duration:.2,overwrite:true});
    });
    group.addEventListener('pointerleave',()=>gsap.to(group,{y:0,duration:reduced()?0:.2,overwrite:true}));
    group.addEventListener('contextmenu',event=>event.preventDefault());
    group.addEventListener('click',event=>event.stopPropagation());
  }
  document.addEventListener('pointerdown',event=>{if(layer&&!layer.contains(event.target)&&!drag)close(false);},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  function startDrag(event, card, main, item, group) {
    if (event.button !== 0 || drag) return;
    const owner = group;
    const startX = event.clientX, startY = event.clientY;
    let moving = false, ghost, target = null, lastTarget = null;
    main.setPointerCapture(event.pointerId);
    const move = e => {
      if(moving && layer !== owner) return;
      const dx=e.clientX-startX, dy=e.clientY-startY;
      if (!moving && Math.hypot(dx,dy) < 8) return;
      if (!moving) {
        if(layer!==owner){close(false);layer=owner;callbacks=groups.get(owner).handlers;}
        owner.closest('.day-cell')?.classList.add('pile-active');
        moving=true; main.dataset.dragged='true';
        ghost=card.cloneNode(true); ghost.className='motion-card motion-ghost';
        ghost.querySelector('.motion-card-actions')?.remove();
        ghost.querySelector('.motion-more')?.remove();ghost.querySelector('.motion-card-menu')?.remove();
        ghost.querySelector('strong').textContent=item.project.name;
        const label=document.createElement('span');label.className='motion-drop-date';ghost.append(label);
        ghost.style.transform=''; ghost.style.width=''; ghost.style.height='';
        layer.append(ghost); drag={ghost};
        window.getSelection()?.removeAllRanges();
        layout(layer,()=>{
          layer.classList.remove('expanded');layer.classList.add('dragging');
          layer.querySelectorAll('.motion-card:not(.motion-ghost)').forEach(neighbor=>neighbor.classList.remove('focused','receded'));
          card.classList.add('drag-origin');
        });
      }
      const box=layer.getBoundingClientRect();
      ghost.style.left='0px';ghost.style.top='0px';
      gsap.set(ghost,{xPercent:0,yPercent:0,x:e.clientX-box.left-ghost.offsetWidth/2,y:e.clientY-box.top-ghost.offsetHeight/2,rotation:Math.max(-7,Math.min(7,dx/35))});
      layer.style.pointerEvents='none';
      target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.day-cell[data-date], .agenda-day[data-date]') || null;
      layer.style.pointerEvents='';
      if (target !== lastTarget) {
        lastTarget?.classList.remove('motion-near'); target?.classList.add('motion-near');
        if(target) target.querySelectorAll('.motion-card,.milestone-chip').forEach((node,i)=>animate(node,[{translate:'0 0',rotate:'0deg'},{translate:'-3px -3px',rotate:'-3deg'},{translate:'3px 1px',rotate:'2deg'},{translate:'0 0',rotate:'0deg'}],{duration:420,delay:i*25}));
        lastTarget=target;
      }
      ghost.querySelector('.motion-drop-date').textContent = target?.dataset.date?.slice(5).replace('-','.') || '';
      ghost.classList.toggle('over-date', Boolean(target));
    };
    const finish = async e => {
      main.removeEventListener('pointermove',move);main.removeEventListener('pointerup',finish);main.removeEventListener('pointercancel',cancel);
      if(main.hasPointerCapture(event.pointerId))main.releasePointerCapture(event.pointerId);
      if(!moving || layer !== owner)return;
      lastTarget?.classList.remove('motion-near');
      const destination=target?.dataset.date;
      if(destination && e.type !== 'pointercancel') {
        const b=target.getBoundingClientRect(), l=layer.getBoundingClientRect();
        const landing=target.querySelector('.inline-pile,.chip-stack');
        const destinationBox=landing?.getBoundingClientRect() || b;
        const x=destinationBox.left+destinationBox.width/2-l.left-ghost.offsetWidth/2;
        const y=destinationBox.top+Math.min(34,destinationBox.height/2)-l.top-ghost.offsetHeight/2;
        await new Promise(resolve=>{
          gsap.to(ghost,{x,y,rotation:0,scaleX:Math.min(1,destinationBox.width/ghost.offsetWidth),scaleY:.5,
            duration:reduced()?0:.34,ease:'power3.out',overwrite:true,onComplete:resolve,onInterrupt:resolve});
        });
        if(layer !== owner)return;
        const fn=callbacks.move;close(false);fn(item,destination);
        const cell=[...document.querySelectorAll('.day-cell')].find(n=>n.dataset.date===destination);
        if(cell&&!reduced())gsap.fromTo(cell.querySelector('.inline-pile,.chip-stack')||cell,
          {scaleX:1.035,scaleY:.94},{scaleX:1,scaleY:1,duration:.4,ease:'elastic.out(1,.65)',clearProps:'transform'});
      } else { close(false); }
    };
    const cancel=e=>finish(e);
    main.addEventListener('pointermove',move);main.addEventListener('pointerup',finish);main.addEventListener('pointercancel',cancel);
  }
  window.addEventListener('resize', () => close(false));
  return {mount,close};
})();
