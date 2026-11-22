/* مخزني - الجزء 6 (UTF-8، جنب index.html): المصروفات + ربط العميل بالمورد (مقاصة) */
/* ---------- المصروفات (المالك بس) ---------- */
var EXP_CATS = ['رواتب','إيجار المكان','بنزين','كهرباء','مياه','إنترنت وتليفون','صيانة','أخرى'];
var exPer = 'month', exPend = null, exTimer = null, exOptsCache = '';
function p2(n){ return n<10 ? '0'+n : ''+n; }
function exDay(ts){ var d = new Date(ts); return p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear(); }
function exRange(per){
  var n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if(per==='today') return [new Date(y,m,n.getDate()).getTime(),Infinity];
  if(per==='month') return [new Date(y,m,1).getTime(),Infinity];
  if(per==='prev') return [new Date(y,m-1,1).getTime(),new Date(y,m,1).getTime()];
  return [0,Infinity];
}
function exIn(per){ var r = exRange(per), out = []; expenses.forEach(function(x){ if(x.ts>=r[0] && x.ts<r[1]) out.push(x); }); return out; }
function exSum(list){ var t = 0; list.forEach(function(x){ t += x.amount; }); return round(t); }
function renderExp(){
  var v = $('#v-exp'); if(!v || v.hidden || !isOwner()) return;
  var custom = [], seen = {};
  EXP_CATS.forEach(function(c){ seen[c] = 1; });
  expenses.forEach(function(x){ if(!seen[x.cat]){ seen[x.cat] = 1; custom.push(x.cat); } });
  custom.sort();
  var oh = EXP_CATS.concat(custom).map(function(c){ return '<option value="'+esc(c)+'">'+esc(c)+'</option>'; }).join('')+'<option value="__new">+ نوع جديد…</option>';
  if(oh!==exOptsCache){ var sel = $('#ex-cat'), cur = sel.value; sel.innerHTML = oh; if(cur) sel.value = cur; exOptsCache = oh; }
  $('#ex-new-wrap').hidden = ($('#ex-cat').value!=='__new');
  if(!$('#ex-date').value){ var n = new Date(); $('#ex-date').value = n.getFullYear()+'-'+p2(n.getMonth()+1)+'-'+p2(n.getDate()); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-exper]'),function(b){ b.setAttribute('aria-pressed',b.dataset.exper===exPer ? 'true' : 'false'); });
  var list = exIn(exPer).sort(function(a,b){ return b.ts-a.ts; }), tot = exSum(list), by = {};
  list.forEach(function(x){ by[x.cat] = (by[x.cat]||0)+x.amount; });
  var cats = Object.keys(by).sort(function(a,b){ return by[b]-by[a]; });
  var label = {today:'النهارده',month:'الشهر ده',prev:'الشهر اللي فات',all:'من الأول'}[exPer];
  var top = cats.length ? cats[0] : '';
  $('#ex-tiles').innerHTML = '<div class="tile"><span>إجمالي المصروفات ('+label+')</span><strong>'+money(tot)+'</strong><small>'+fmt(list.length)+' مصروف</small></div>'+
    (top ? '<div class="tile"><span>أكتر بند</span><strong>'+esc(top)+'</strong><small>'+money(round(by[top]))+'</small></div>' : '');
  $('#ex-bycat').innerHTML = cats.length ? cats.map(function(c){
    return '<tr><td>'+esc(c)+'</td><td class="n">'+money(round(by[c]))+'</td><td class="n">'+fmt(Math.round(by[c]/tot*100))+'%</td></tr>';
  }).join('') : '<tr><td colspan="3" class="note">مفيش مصروفات في الفترة دي.</td></tr>';
  var shown = list.slice(0,200);
  $('#ex-list').innerHTML = shown.length ? shown.map(function(x){
    return '<li class="ledger-row exp-row"><div class="lg-main"><strong>'+esc(x.cat)+' — <span class="ex-amt">'+money(x.amount)+'</span></strong>'+
      (x.note ? '<span class="pmeta">'+esc(x.note)+'</span>' : '')+'<span class="when">'+exDay(x.ts)+(x.by ? ' · '+esc(x.by) : '')+'</span></div>'+
      '<div class="lg-btns"><button type="button" class="btn sm" data-exa="edit" data-id="'+esc(x.id)+'">تعديل</button>'+
      '<button type="button" class="btn danger sm" data-exa="del" data-id="'+esc(x.id)+'">'+(exPend===x.id ? 'متأكد؟ اضغط تاني' : 'مسح')+'</button></div></li>';
  }).join('')+(list.length>200 ? '<li class="note">بيعرض آخر 200 مصروف. اختار فترة أصغر.</li>' : '') : '<li class="note">مفيش مصروفات في الفترة دي.</li>';
}
$('#ex-cat').addEventListener('change',function(){ $('#ex-new-wrap').hidden = ($('#ex-cat').value!=='__new'); if(!$('#ex-new-wrap').hidden) $('#ex-new').focus(); });
$('#exform').addEventListener('submit',function(e){
  e.preventDefault();
  if(!isOwner() || !ready()) return;
  var amt = parseFloat($('#ex-amt').value);
  if(!(amt>0)){ toast('اكتب المبلغ',true); $('#ex-amt').focus(); return; }
  var cat = $('#ex-cat').value;
  if(cat==='__new'){ cat = $('#ex-new').value.trim(); if(!cat){ toast('اكتب اسم النوع',true); $('#ex-new').focus(); return; } }
  var ds = $('#ex-date').value, ts = Date.now();
  if(ds){ var p = ds.split('-'), t = new Date(+p[0],+p[1]-1,+p[2],12).getTime(); if(isFinite(t)) ts = t; }
  var x = {id:uid(),ts:ts,cat:cat.slice(0,30),amount:round(amt),note:$('#ex-note').value.trim().slice(0,80),by:(sess ? sess.name : '')};
  logA('exp','مصروف '+x.cat+': '+money(x.amount)+(x.note ? ' — '+x.note : ''));
  putExpense(x);
  $('#ex-amt').value = ''; $('#ex-note').value = ''; $('#ex-new').value = ''; $('#ex-cat').value = x.cat; $('#ex-new-wrap').hidden = true;
  toast('اتسجل المصروف: '+money(x.amount)); render();
});
Array.prototype.forEach.call(document.querySelectorAll('[data-exper]'),function(b){ b.addEventListener('click',function(){ exPer = b.dataset.exper; renderExp(); }); });
document.addEventListener('click',function(e){
  var b = e.target.closest ? e.target.closest('[data-exa]') : null; if(!b) return;
  var x = expenses.get(b.dataset.id); if(!x || !isOwner()) return;
  if(b.dataset.exa==='del'){
    if(exPend!==x.id){ exPend = x.id; clearTimeout(exTimer); exTimer = setTimeout(function(){ exPend = null; renderExp(); },3000); renderExp(); return; }
    clearTimeout(exTimer); exPend = null;
    if(!ready()) return;
    logA('exp','مسح مصروف '+x.cat+': '+money(x.amount)+(x.note ? ' — '+x.note : ''));
    removeExpense(x.id); toast('اتمسح المصروف');
  } else if(b.dataset.exa==='edit'){
    if(!ready()) return;
    var a = window.prompt('المبلغ:',x.amount); if(a===null) return;
    var n = parseFloat(a); if(!(n>0)){ toast('المبلغ لازم يبقى أكبر من صفر',true); return; }
    var nt = window.prompt('الملاحظة:',x.note||''); if(nt===null) return;
    logA('exp','تعديل مصروف '+x.cat+': '+money(x.amount)+' ← '+money(round(n)));
    putExpense(Object.assign({},x,{amount:round(n),note:nt.trim().slice(0,80)})); toast('اتحفظ');
  }
});

/* ---------- ربط العميل بالمورد (نفس الشخص) + مقاصة الحسابات ---------- */
var lkCache = {c:'',s:''}, lkPend = null, lkTimer = null, lkQ = {cust:'',sup:''};
/* خيارات قايمة الربط مع بحث بالاسم أو التليفون أو العنوان. المربوط حاليا بيفضل ظاهر */
function lkOptions(side,selId){
  var other = side==='cust' ? suppliers : customers, q = (lkQ[side]||'').trim().toLowerCase();
  var all = Array.from(other.values()).sort(function(a,b){ return a.name.localeCompare(b.name,'ar'); });
  var m = q ? all.filter(function(x){ return x.name.toLowerCase().indexOf(q)>=0 || (x.phone||'').indexOf(q)>=0 || (x.addr||'').toLowerCase().indexOf(q)>=0; }) : all, more = 0;
  if(m.length>150){ more = m.length-150; m = m.slice(0,150); }
  if(selId && other.get(selId) && !m.some(function(x){ return x.id===selId; })) m.unshift(other.get(selId));
  return '<option value="">'+(q ? (m.length ? 'اختار من النتايج ('+fmt(m.length)+')…' : 'مفيش نتايج') : '— لأ، مش نفس الشخص —')+'</option>'+
    m.map(function(x){ return '<option value="'+esc(x.id)+'"'+(x.id===selId ? ' selected' : '')+'>'+esc(x.name)+(x.phone ? ' — '+esc(x.phone) : '')+'</option>'; }).join('')+
    (more ? '<option value="" disabled>… و'+fmt(more)+' كمان. اكتب أكتر في البحث</option>' : '');
}
function lkOne(side,me){
  var other = side==='cust' ? suppliers : customers, key = side==='cust' ? me.supId : me.custId, o = key ? other.get(key) : null;
  var opts = lkOptions(side,o ? o.id : '');
  var h = '<h2>'+(side==='cust' ? 'ده نفسه مورد؟' : 'ده نفسه عميل؟')+'</h2>'+
    '<p class="hint">لو الشخص ده بتبيعله وبتشتري منه، اربط الحسابين وتقدر تقفلهم على بعض. مثلا اشتريت منه بـ 20 وهو اشترى منك بـ 20 ومدفعش: الاتنين يبقوا خالصين.</p>'+
    '<div class="pform"><div class="wide"><label>'+(side==='cust' ? 'هو مين في الموردين؟' : 'هو مين في العملاء؟')+'</label>'+
    '<input type="search" class="lk-q" data-side="'+side+'" autocomplete="off" placeholder="ابحث بالاسم أو التليفون…" value="'+esc(lkQ[side]||'')+'">'+
    '<select class="lk-sel" data-side="'+side+'" data-id="'+esc(me.id)+'">'+opts+'</select></div></div>';
  if(o){
    var c = side==='cust' ? me : o, s = side==='cust' ? o : me, cb = custStats(c).bal, sb = supStats(s).bal, net = round(cb-sb), m = round(Math.min(Math.max(cb,0),Math.max(sb,0)));
    h += '<ul class="lk-info"><li>كعميل «'+esc(c.name)+'»: '+(cb>0 ? 'هيدفعلنا '+money(cb) : cb<0 ? 'إحنا هندفعله '+money(-cb) : 'حسابه صفر')+'</li>'+
      '<li>كمورد «'+esc(s.name)+'»: '+(sb>0 ? 'إحنا هندفعله '+money(sb) : sb<0 ? 'هيدفعلنا '+money(-sb)+' (دفعنا له زيادة)' : 'حسابه صفر')+'</li></ul>'+
      '<div class="lk-net">النتيجة بعد ما نخصم الاتنين من بعض: '+(net>0 ? 'هيدفعلنا '+money(net) : net<0 ? 'إحنا هندفعله '+money(-net) : 'محدش مديون لحد')+'</div>';
    if(m>0) h += '<button class="btn primary" type="button" data-lk="settle" data-cid="'+esc(c.id)+'" data-sid="'+esc(s.id)+'">'+(lkPend===c.id+'|'+s.id ? 'متأكد؟ اضغط تاني' : 'قفل الحسابات مع بعض (مقاصة '+money(m)+')')+'</button>'+
      '<p class="hint">هيتسجّل '+money(m)+' كدفعة في حساب العميل وكدفعة في حساب المورد، والصافي بس هو اللي يفضل.</p>';
  }
  return h;
}
function renderLinks(){
  if(!isOwner()) return;
  var ae = document.activeElement, keep = (ae && ae.classList && ae.classList.contains('lk-q')) ? {side:ae.dataset.side,pos:ae.selectionStart} : null;
  renderLinks2();
  if(keep){ var ni = document.querySelector('.lk-q[data-side="'+keep.side+'"]'); if(ni && ni!==ae){ ni.focus(); try{ ni.setSelectionRange(keep.pos,keep.pos); }catch(e){} } }
}
function renderLinks2(){
  var c = (typeof selCust!=='undefined' && selCust) ? customers.get(selCust) : null, cp = $('#cud-link');
  if(cp){ if(!c || $('#cust-detail').hidden){ cp.hidden = true; } else { var h1 = lkOne('cust',c); cp.hidden = false; if(h1!==lkCache.c){ cp.innerHTML = h1; lkCache.c = h1; } } }
  var s = (typeof selSup!=='undefined' && selSup) ? suppliers.get(selSup) : null, sp = $('#sd-link');
  if(sp){ if(!s || $('#sup-detail').hidden){ sp.hidden = true; } else { var h2 = lkOne('sup',s); sp.hidden = false; if(h2!==lkCache.s){ sp.innerHTML = h2; lkCache.s = h2; } } }
}
function setLink(cid,sid){
  var c = customers.get(cid); if(!c) return;
  var oldS = c.supId ? suppliers.get(c.supId) : null;
  if(oldS && oldS.id!==sid && oldS.custId===cid) putSupplier(Object.assign({},oldS,{custId:''}));
  if(sid){
    var s = suppliers.get(sid); if(!s) return;
    if(s.custId && s.custId!==cid){ var oc = customers.get(s.custId); if(oc && oc.supId===sid) putCustomer(Object.assign({},oc,{supId:''})); }
    putSupplier(Object.assign({},s,{custId:cid})); putCustomer(Object.assign({},c,{supId:sid}));
    logA('cust','ربط العميل «'+c.name+'» بالمورد «'+s.name+'»'); toast('اتربطوا: نفس الشخص');
  } else {
    putCustomer(Object.assign({},c,{supId:''}));
    logA('cust','فك ربط العميل «'+c.name+'» من المورد'); toast('اتفك الربط');
  }
  lkCache = {c:'',s:''}; render();
}
function doSettle(cid,sid){
  var c = customers.get(cid), s = suppliers.get(sid);
  if(!c || !s || !isOwner() || !ready()) return;
  var cb = custStats(c).bal, sb = supStats(s).bal, m = round(Math.min(Math.max(cb,0),Math.max(sb,0)));
  if(!(m>0)){ toast('مفيش حاجة تتقفل: الحسابين مش في اتجاهين',true); return; }
  var ts = Date.now(), by = sess ? sess.name : '';
  putCustomer(Object.assign({},c,{entries:(c.entries||[]).concat([{id:uid(),ts:ts,by:by,type:'payment',amount:m,note:'مقاصة مع حساب المورد «'+s.name+'»'}])}));
  putSupplier(Object.assign({},s,{entries:(s.entries||[]).concat([{id:uid(),ts:ts+1,type:'payment',amount:m,note:'مقاصة مع حساب العميل «'+c.name+'»'}])}));
  logA('settle','مقاصة '+money(m)+' بين العميل «'+c.name+'» والمورد «'+s.name+'»');
  lkCache = {c:'',s:''}; toast('اتقفلت الحسابات بالمقاصة: '+money(m)); render();
}
document.addEventListener('change',function(e){
  var sel = e.target.closest ? e.target.closest('.lk-sel') : null; if(!sel) return;
  if(!isOwner() || !ready()){ lkCache = {c:'',s:''}; renderLinks(); return; }
  var id = sel.dataset.id, v = sel.value;
  if(sel.dataset.side==='cust') setLink(id,v);
  else { var s = suppliers.get(id); if(!s) return; if(v) setLink(v,id); else if(s.custId) setLink(s.custId,''); }
});
document.addEventListener('click',function(e){
  var b = e.target.closest ? e.target.closest('[data-lk="settle"]') : null; if(!b) return;
  var key = b.dataset.cid+'|'+b.dataset.sid;
  if(lkPend!==key){
    lkPend = key; clearTimeout(lkTimer); lkTimer = setTimeout(function(){ lkPend = null; lkCache = {c:'',s:''}; renderLinks(); },3000);
    lkCache = {c:'',s:''}; renderLinks(); return;
  }
  clearTimeout(lkTimer); lkPend = null; doSettle(b.dataset.cid,b.dataset.sid);
});
/* فتح صفحة مورد/عميل بيستدعي renderSup/renderCust لوحدهم، فنربط لوحة الربط بيهم بعد ما كل الملفات تتحمّل (renderCust في app5) */
window.addEventListener('load',function(){
  var rs = renderSup, rc = renderCust;
  renderSup = function(){ rs.apply(this,arguments); try{ renderLinks(); }catch(e){} };
  renderCust = function(){ rc.apply(this,arguments); try{ renderLinks(); }catch(e){} };
});

/* كتابة في خانة البحث: بنحدّث القايمة بس (من غير ما نعيد رسم اللوحة عشان الكتابة متتقطعش) */
document.addEventListener('input',function(e){
  var q = e.target.closest ? e.target.closest('.lk-q') : null; if(!q) return;
  var side = q.dataset.side; lkQ[side] = q.value;
  var sel = q.parentNode.querySelector('.lk-sel'); if(!sel) return;
  var me = side==='cust' ? customers.get(sel.dataset.id) : suppliers.get(sel.dataset.id); if(!me) return;
  var key = side==='cust' ? me.supId : me.custId;
  sel.innerHTML = lkOptions(side,key); lkCache[side==='cust' ? 'c' : 's'] = '';
});
document.addEventListener('keydown',function(e){
  var q = e.target.closest ? e.target.closest('.lk-q') : null; if(!q || e.key!=='Enter') return;
  e.preventDefault();
  var side = q.dataset.side, sel = q.parentNode.querySelector('.lk-sel'); if(!sel) return;
  var first = Array.prototype.filter.call(sel.options,function(o){ return o.value && !o.disabled; })[0];
  if(!first || !isOwner() || !ready()) return;
  lkQ[side] = ''; sel.value = first.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
});

/* ---------- أكتر من فاتورة مفتوحة في نفس الوقت ----------
   كل فاتورة ليها سلتها وسعرها المعدّل والعميل والمدفوع والتوصيل. اللي معروضة هي اللي في cart/cartPrice، والباقي محفوظ هنا ومنفصل تماما.
   البيع بيتم للفاتورة اللي قدامك بس. والفواتير المفتوحة بتتحفظ على الجهاز عشان لو الصفحة اتقفلت أو اتحدثت متضيعش. */
var CT_KEY = 'qatea-drafts', CT_MAX = 4, ctSlots = [{}], ctCur = 0, ctBooted = false;
function ctField(id){ var e = document.querySelector(id); return e ? e.value : ''; }
function ctSnap(){ return {cart:cart,price:cartPrice,cust:ctField('#cust'),paid:ctField('#paid'),fee:ctField('#fee')}; }
function ctItems(s){ return Object.keys(s.cart||{}).length; }
function ctLoad(s){
  cart = s.cart || {}; cartPrice = s.price || {}; cartSeq = {};
  var cu = s.cust && customers.get(s.cust) ? customers.get(s.cust) : null;
  $('#cust-q').value = cu ? cu.name : ''; renderCustSel(); $('#cust').value = cu ? cu.id : ''; renderCustSel();
  $('#paid').value = s.paid || ''; $('#fee').value = s.fee || '';
}
function ctSave(){
  if(!ctBooted) return;
  try{
    var all = ctSlots.slice(); all[ctCur] = ctSnap();
    if(all.every(function(s){ return !ctItems(s); })) localStorage.removeItem(CT_KEY);
    else localStorage.setItem(CT_KEY,JSON.stringify({ts:Date.now(),cur:ctCur,slots:all}));
  }catch(e){}
}
function cartsBusy(){ return ctSlots.some(function(s,i){ return ctItems(i===ctCur ? ctSnap() : s)>0; }); }
function cartsBoot(){
  if(ctBooted || mode==='pending' || !sess) return;
  ctBooted = true;
  if(ctItems({cart:cart})) return;
  try{
    var d = JSON.parse(localStorage.getItem(CT_KEY) || 'null');
    if(!d || !d.slots || Date.now()-d.ts > 12*3600000) return;
    ctSlots = d.slots.slice(0,CT_MAX); ctCur = Math.min(d.cur||0,ctSlots.length-1);
    ctLoad(ctSlots[ctCur]);
  }catch(e){}
}
function cartsReset(){ ctSlots = [{}]; ctCur = 0; try{ localStorage.removeItem(CT_KEY); }catch(e){} }
function cartsAfterSale(){
  if(ctSlots.length>1){ ctSlots.splice(ctCur,1); ctCur = Math.min(ctCur,ctSlots.length-1); ctLoad(ctSlots[ctCur]); }
  else ctSlots[0] = {};
}
function renderCartTabs(){
  var el = $('#ctabs'); if(!el) return;
  ctSave();
  if(ctSlots.length<2 && !ctItems({cart:cart})){ el.hidden = false; el.innerHTML = '<button type="button" class="ctab add" data-ct="new" title="افتح فاتورة تانية جنب دي">+ فاتورة تانية</button>'; return; }
  el.hidden = false;
  el.innerHTML = ctSlots.map(function(s,i){
    var live = i===ctCur ? ctSnap() : s, n = ctItems(live), tot = 0;
    Object.keys(live.cart||{}).forEach(function(id){ var p = products.get(id); if(p) tot += live.cart[id]*((live.price||{})[id]!=null ? live.price[id] : p.price); });
    return '<span class="ctab'+(i===ctCur?' on':'')+'" role="tab" aria-selected="'+(i===ctCur)+'"><button type="button" class="ct-b" data-ct="'+i+'">فاتورة '+(i+1)+'<small>'+(n ? fmt(n)+' صنف · '+money(round(tot)) : 'فاضية')+'</small></button>'+
      (ctSlots.length>1 ? '<button type="button" class="ct-x" data-ctx="'+i+'" aria-label="اقفل فاتورة '+(i+1)+'">×</button>' : '')+'</span>';
  }).join('')+(ctSlots.length<CT_MAX ? '<button type="button" class="ctab add" data-ct="new" aria-label="فاتورة جديدة">+</button>' : '');
}
function ctSwitch(i){
  if(i===ctCur || !ctSlots[i]) return;
  ctSlots[ctCur] = ctSnap(); ctCur = i; ctLoad(ctSlots[i]); renderAll(); focusQ();
}
document.addEventListener('click',function(e){
  var b = e.target.closest ? e.target.closest('#ctabs [data-ct],#ctabs [data-ctx]') : null; if(!b) return;
  if(b.dataset.ctx!=null){
    var x = +b.dataset.ctx, live = x===ctCur ? ctSnap() : ctSlots[x];
    if(ctItems(live) && !window.confirm('تقفل فاتورة '+(x+1)+' من غير بيع؟ الأصناف اللي فيها هتتمسح.')) return;
    ctSlots[ctCur] = ctSnap(); ctSlots.splice(x,1);
    if(!ctSlots.length) ctSlots = [{}];
    ctCur = x<ctCur ? ctCur-1 : Math.min(ctCur,ctSlots.length-1);
    if(x===ctCur || true) ctLoad(ctSlots[ctCur]);
    renderAll(); return;
  }
  if(b.dataset.ct==='new'){
    if(ctSlots.length>=CT_MAX){ toast('أقصى حاجة '+CT_MAX+' فواتير مفتوحة مع بعض',true); return; }
    ctSlots[ctCur] = ctSnap(); ctSlots.push({}); ctCur = ctSlots.length-1; ctLoad(ctSlots[ctCur]); renderAll(); focusQ(); return;
  }
  ctSwitch(+b.dataset.ct);
});
/* تغيير العميل أو المدفوع أو التوصيل بيتحفظ في المسودة علطول */
['#cust','#paid','#fee'].forEach(function(id){ var e = document.querySelector(id); if(e){ e.addEventListener('change',ctSave); e.addEventListener('input',ctSave); } });

/* بحث قايمة الموردين */
(function(){ var e = document.querySelector('#su-q'); if(e) e.addEventListener('input',function(){ renderSup(); }); })();

/* بحث اختيار الصنف في «بضاعة جديدة من المورد» و«مرتجع للمورد».
   الكتابة بتفلتر القايمة، Enter بيختار أول نتيجة، واختيار الصنف بيمسح البحث وينقلك للكمية، وزرار × بيمسح الكتابة. */
(function(){
  [['pu','#pu-qty'],['rt','#rt-qty']].forEach(function(cfg){
    var q = document.querySelector('#'+cfg[0]+'-q'), sel = document.querySelector('#'+cfg[0]+'-prod'), x = document.querySelector('[data-qx="'+cfg[0]+'-q"]');
    if(!q || !sel || !x) return;
    function sync(){ x.hidden = !q.value; }
    q.addEventListener('input',function(){ sync(); renderSup(); });
    x.addEventListener('click',function(){ q.value = ''; sync(); renderSup(); q.focus(); });
    sel.addEventListener('change',function(){
      if(!q.value) return;
      q.value = ''; sync(); renderSup();
      if(sel.value && sel.value!=='__new') setTimeout(function(){ var n = document.querySelector(cfg[1]); if(n) n.focus(); },0);
    });
    q.addEventListener('keydown',function(e){
      if(e.key!=='Enter') return;
      e.preventDefault();
      var qq = q.value.trim().toLowerCase();
      var first = Array.prototype.filter.call(sel.options,function(o){
        var pp = o.value && o.value!=='__new' ? products.get(o.value) : null;
        return pp && (pp.name.toLowerCase().indexOf(qq)>=0 || (pp.barcode && String(pp.barcode).toLowerCase().indexOf(qq)>=0));
      })[0];
      if(!first){ toast('مفيش صنف بالاسم ده',true); return; }
      sel.value = first.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
    });
    var f = q.form; if(f) f.addEventListener('reset',function(){ setTimeout(function(){ sync(); renderSup(); },0); });
  });
})();