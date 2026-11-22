/* مخزني - الجزء 7 (UTF-8): مخازن متعددة (مخزن رئيسي + عربيات): تحويل بضاعة، تأكيد استلام، تقرير يومي لكل موقع */
var locTransfers = [], locDraft = [], locPend = false, locMsgT = null;
function locAll(){ return [{id:'main',name:'المخزن الرئيسي'}].concat((shopCfg && shopCfg.locs) || []); }
function locName(id){ if(!id || id==='main') return 'المخزن الرئيسي'; var l = locAll().filter(function(x){ return x.id===id; })[0]; return l ? l.name : id; }
/* كمية الصنف عند موقع (على جهاز المالك: qty = الرئيسي، و stk = العربيات) */
function locQty(p,id){ return id==='main' ? (+p.qty||0) : (+(p.stk && p.stk[id])||0); }
/* إجمالي الكمية في كل المواقع (للمالك بس. على جهاز العربية p.qty هو رصيدها هي) */
function totQty(p){
  var t = +p.qty||0;
  if(typeof LOC!=='undefined' && LOC==='main' && p.stk) Object.keys(p.stk).forEach(function(k){ t += (+p.stk[k]||0); });
  return round(t);
}
function locSave(){
  try{ localStorage.setItem('qatea-print',JSON.stringify(shopCfg)); }catch(e){}
  if(mode==='cloud' && db) db.doc('meta/print').set(shopCfg);
}
function locMsg(t,bad){ var m = $('#lc-msg'); if(!m) return; m.textContent = t||''; m.hidden = !t; m.style.color = bad ? 'var(--bad-ink)' : ''; clearTimeout(locMsgT); if(t) locMsgT = setTimeout(function(){ m.hidden = true; },6000); }

/* متابعة التحويلات: المالك يشوف الكل، وكاشير العربية يشوف اللي جاله بس */
function locStart(cashier){
  var ok = function(snap){
    locTransfers = snap.docs.map(function(d){ return Object.assign({},d.data(),{id:d.id}); }).sort(function(a,b){ return b.ts-a.ts; });
    renderLocs();
  };
  try{
    if(!cashier) db.collection('transfers').orderBy('ts','desc').limit(80).onSnapshot(ok,function(){});
    else if(LOC!=='main') db.collection('transfers').where('to','==',LOC).onSnapshot(ok,function(){});
  }catch(e){}
}

function renderLocs(){
  var box = $('#rcv-box'), vl = $('#v-loc'); if(!vl) return;
  var cloud = (mode==='cloud'), owner = isOwner();
  /* كاشير عربية: تحويلات مستنية تأكيد + ملخص النهاردة */
  if(box){
    var van = cloud && !owner && LOC!=='main', h = '';
    if(van){
      locTransfers.filter(function(t){ return t.status==='pending' && t.to===LOC; }).forEach(function(t){
        h += '<div class="panel rcv"><strong>وصلك بضاعة من '+esc(locName(t.from))+'</strong><ul class="rcv-l">'+
          t.lines.map(function(l){ return '<li>'+esc(l.name)+' × '+fmt(l.qty)+'</li>'; }).join('')+'</ul>'+
          '<div class="hint">'+dt(t.ts)+' · الكمية دي اتضافت لرصيد العربية فعلا. اتأكد إنها وصلتك صح وبعدين أكّد.</div>'+
          '<button class="btn primary" type="button" data-rcv="'+esc(t.id)+'">أكدت الاستلام</button></div>';
      });
      var t0 = new Date(); t0.setHours(0,0,0,0); var n = 0, tot = 0;
      sales.forEach(function(s){ if(s.ts>=t0.getTime() && s.loc===LOC){ n++; tot += s.total; } });
      h += '<div class="hint">عربيتك: '+esc(locName(LOC))+' · مبيعات النهاردة: '+fmt(n)+' فاتورة بإجمالي '+money(round(tot))+'</div>';
    }
    box.innerHTML = h; box.hidden = !h;
  }
  var sn = $('#stk-note');
  if(sn){ var on = cloud && owner && (shopCfg.locs||[]).length>0; sn.hidden = !on; if(on) sn.textContent = 'الأرقام في تبويب المخزن دي هي المخزن الرئيسي بس. رصيد العربيات وتحويل البضاعة في تبويب «المواقع».'; }
  var sel = $('#cc-loc');
  if(sel){ var cur = sel.value; sel.innerHTML = locAll().map(function(l){ return '<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>'; }).join(''); if(cur) sel.value = cur; }
  if(!owner || !cloud || view!=='loc') return;
  var L = locAll();
  /* المواقع */
  $('#lc-list').innerHTML = (shopCfg.locs||[]).length ? shopCfg.locs.map(function(l){
    return '<li class="item"><div class="item-head"><strong>'+esc(l.name)+'</strong></div><div class="meta">كود: <b dir="ltr">'+esc(l.id)+'</b></div></li>';
  }).join('') : '<li class="empty"><p>لسه مفيش عربيات أو مخازن تانية. ضيف أول واحدة من تحت.</p></li>';
  /* التحويل */
  var opts = L.map(function(l){ return '<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>'; }).join('');
  var f = $('#lc-from'), tt = $('#lc-to'), fv = f.value || 'main', tv = tt.value;
  f.innerHTML = opts; tt.innerHTML = opts; f.value = fv;
  tt.value = (tv && tv!==fv) ? tv : (L.filter(function(l){ return l.id!==fv; })[0]||{id:fv}).id;
  var q = ($('#lc-q').value||'').trim().toLowerCase(), ps = [];
  products.forEach(function(p){ if(!p.svc && (!q || p.name.toLowerCase().indexOf(q)>=0 || (p.barcode && String(p.barcode).toLowerCase().indexOf(q)>=0))) ps.push(p); });
  ps.sort(byName); ps = ps.slice(0,40);
  var ps0 = $('#lc-p'), keep = ps0.value;
  ps0.innerHTML = ps.map(function(p){ return '<option value="'+esc(p.id)+'">'+esc(p.name)+' (متاح '+fmt(locQty(p,f.value))+')</option>'; }).join('');
  if(keep && ps.some(function(p){ return p.id===keep; })) ps0.value = keep;
  ps0.size = q ? Math.min(8,Math.max(2,ps.length)) : 1;
  $('#lc-draft').innerHTML = locDraft.length ? locDraft.map(function(d,i){
    return '<li class="item"><div class="item-head"><strong>'+esc(d.name)+'</strong><span>× '+fmt(d.qty)+'</span></div><div class="actions"><button class="btn" type="button" data-lcx="'+i+'">شيل</button></div></li>';
  }).join('') : '<li class="empty"><p>ضيف أصناف للتحويل.</p></li>';
  $('#lc-go').disabled = locPend || !locDraft.length;
  /* سجل التحويلات */
  $('#lc-log').innerHTML = locTransfers.length ? locTransfers.slice(0,25).map(function(t){
    return '<li class="item"><div class="item-head"><strong>'+esc(locName(t.from))+' ← '+esc(locName(t.to))+'</strong>'+
      (t.status==='pending' ? '<span class="chip local">مستني تأكيد الاستلام</span>' : '<span class="chip db">اتأكد'+(t.rcvBy ? ' ('+esc(t.rcvBy.name)+')' : '')+'</span>')+'</div>'+
      '<div class="meta">'+dt(t.ts)+' · '+t.lines.map(function(l){ return esc(l.name)+' × '+fmt(l.qty); }).join('، ')+'</div></li>';
  }).join('') : '<li class="empty"><p>مفيش تحويلات لسه.</p></li>';
  /* جدول الأرصدة */
  var sq = ($('#lc-sq').value||'').trim().toLowerCase(), rows = [];
  products.forEach(function(p){ if(!p.svc && (!sq || p.name.toLowerCase().indexOf(sq)>=0)) rows.push(p); });
  rows.sort(byName); var more = rows.length>80; rows = rows.slice(0,80);
  $('#lc-stock').innerHTML = '<thead><tr><th>الصنف</th>'+L.map(function(l){ return '<th class="n">'+esc(l.name)+'</th>'; }).join('')+'<th class="n">الإجمالي</th></tr></thead><tbody>'+
    rows.map(function(p){ return '<tr><td>'+esc(p.name)+'</td>'+L.map(function(l){ return '<td class="n">'+fmt(locQty(p,l.id))+'</td>'; }).join('')+'<td class="n">'+fmt(totQty(p))+'</td></tr>'; }).join('')+'</tbody>'+(more ? '' : '');
  $('#lc-more').hidden = !more;
  /* تقرير اليوم لكل موقع */
  var dv = $('#lc-day').value, d0 = dv ? new Date(dv+'T00:00:00') : new Date(); d0.setHours(0,0,0,0);
  var t0 = d0.getTime(), t1 = t0+86400000, out = '';
  var rep = L.map(function(l){
    var r = {l:l,n:0,tot:0,debt:0,items:{}};
    sales.forEach(function(s){
      if(s.ts<t0 || s.ts>=t1 || (s.loc||'main')!==l.id) return;
      r.n++; r.tot += s.total; if(s.paid!=null) r.debt += (s.total - s.paid);
      s.lines.forEach(function(x){ var o = r.items[x.name] || (r.items[x.name] = {q:0,v:0}); o.q += x.qty; o.v += x.qty*x.price; });
    });
    r.tot = round(r.tot); r.debt = round(r.debt); return r;
  });
  window.locRepText = 'تقرير '+(shopCfg.name||'المحل')+' ليوم '+(dv||new Date(t0).toISOString().slice(0,10))+'\n'+rep.map(function(r){
    return r.l.name+': '+r.n+' فاتورة، إجمالي '+money(r.tot)+' (مقبوض '+money(round(r.tot-r.debt))+' + آجل '+money(r.debt)+')';
  }).join('\n');
  $('#lc-rep').innerHTML = rep.map(function(r){
    var its = Object.keys(r.items).sort(function(a,b){ return r.items[b].v-r.items[a].v; });
    return '<li class="item"><div class="item-head"><strong>'+esc(r.l.name)+'</strong><span>'+fmt(r.n)+' فاتورة</span></div>'+
      '<dl class="kv"><div><dt>إجمالي المبيعات</dt><dd>'+money(r.tot)+'</dd></div><div><dt>مقبوض كاش</dt><dd>'+money(round(r.tot-r.debt))+'</dd></div><div><dt>آجل (على العملاء)</dt><dd>'+money(r.debt)+'</dd></div></dl>'+
      (its.length ? '<div class="meta">'+its.slice(0,12).map(function(k){ return esc(k)+' × '+fmt(round(r.items[k].q)); }).join('، ')+'</div>' : '')+'</li>';
  }).join('');
}

/* ---- أحداث ---- */
$('#lc-add').addEventListener('submit',function(e){
  e.preventDefault();
  if(!isOwner() || mode!=='cloud') return;
  var n = $('#lc-name').value.trim();
  if(!n){ locMsg('اكتب اسم العربية أو المخزن',true); return; }
  if(locAll().some(function(l){ return l.name===n; })){ locMsg('الاسم ده موجود',true); return; }
  var id = 'v'+uid().replace(/[^a-z0-9]/gi,'').slice(0,8).toLowerCase();
  shopCfg.locs = (shopCfg.locs||[]).concat([{id:id,name:n}]);
  locSave(); logA('cfg','إضافة موقع مخزون: '+n); $('#lc-name').value = ''; locMsg('اتضافت: '+n); render();
});
$('#lc-from').addEventListener('change',function(){ locDraft = []; renderLocs(); });
$('#lc-to').addEventListener('change',renderLocs);
$('#lc-q').addEventListener('input',renderLocs);
$('#lc-sq').addEventListener('input',renderLocs);
$('#lc-day').addEventListener('change',renderLocs);
$('#lc-addl').addEventListener('click',function(){
  var f = $('#lc-from').value, p = products.get($('#lc-p').value), n = parseFloat($('#lc-n').value);
  if(!p){ locMsg('اختار صنف',true); return; }
  if(!(n>0)){ locMsg('اكتب الكمية',true); return; }
  var had = 0; locDraft.forEach(function(d){ if(d.pid===p.id) had += d.qty; });
  if(round(had+n) > locQty(p,f)){ locMsg('المتاح من '+p.name+' في '+locName(f)+': '+fmt(locQty(p,f)),true); return; }
  var ex = locDraft.filter(function(d){ return d.pid===p.id; })[0];
  if(ex) ex.qty = round(ex.qty+n); else locDraft.push({pid:p.id,name:p.name,qty:round(n)});
  $('#lc-n').value = ''; $('#lc-q').value = ''; renderLocs();
});
$('#lc-draft').addEventListener('click',function(e){ var b = e.target.closest('[data-lcx]'); if(!b) return; locDraft.splice(+b.dataset.lcx,1); renderLocs(); });
$('#lc-go').addEventListener('click',function(){
  if(!isOwner() || mode!=='cloud' || locPend || !locDraft.length) return;
  var f = $('#lc-from').value, t = $('#lc-to').value;
  if(f===t){ locMsg('اختار موقعين مختلفين',true); return; }
  for(var i=0;i<locDraft.length;i++){
    var p = products.get(locDraft[i].pid);
    if(!p || locDraft[i].qty > locQty(p,f)){ locMsg('الكمية مش كفاية من '+locDraft[i].name+' في '+locName(f),true); return; }
  }
  if(!window.confirm('تحويل '+locDraft.length+' صنف من '+locName(f)+' إلى '+locName(t)+'؟ الرصيد هيتغيّر فورا.')) return;
  locPend = true;
  var tr = {id:uid(),ts:Date.now(),from:f,to:t,status:(t==='main' ? 'received' : 'pending'),lines:locDraft.map(function(d){ return {pid:d.pid,name:d.name,qty:d.qty}; }),by:{id:sess.id,name:sess.name}};
  var lines = tr.lines;
  persist(function(){
    lines.forEach(function(l){
      var d = {}; d[f==='main' ? 'qty' : 'stk.'+f] = -l.qty; d[t==='main' ? 'qty' : 'stk.'+t] = l.qty;
      db.upd('products/'+l.pid,{},d);
    });
    return db.doc('transfers/'+tr.id).set(tr);
  });
  logA('cfg','تحويل مخزون من '+locName(f)+' إلى '+locName(t)+': '+lines.map(function(l){ return l.name+' × '+fmt(l.qty); }).join('، '));
  locTransfers.unshift(tr); locDraft = []; locPend = false; locMsg('اتحوّلت البضاعة. السواق هيأكد الاستلام.'); renderLocs();
});
$('#lc-copy').addEventListener('click',function(){
  try{ navigator.clipboard.writeText(window.locRepText||'').then(function(){ locMsg('اتنسخ التقرير'); },function(){ locMsg('معرفتش أنسخ',true); }); }catch(e){ locMsg('معرفتش أنسخ',true); }
});
$('#rcv-box').addEventListener('click',function(e){
  var b = e.target.closest('[data-rcv]'); if(!b || mode!=='cloud' || LOC==='main') return;
  var id = b.dataset.rcv, t = locTransfers.filter(function(x){ return x.id===id; })[0]; if(!t || t.status!=='pending') return;
  t.status = 'received'; renderLocs();
  persist(function(){ return db.upd('transfers/'+id,{status:'received',rcvAt:Date.now(),rcvBy:{id:sess.id,name:sess.name}}); });
  logA('cfg','تأكيد استلام بضاعة في '+locName(LOC));
  toast('اتأكد الاستلام');
});