/* مخزني - الجزء 1 من 3 (UTF-8، جنب index.html) */
  document.documentElement.setAttribute('dir','rtl');
  var $ = function(s){ return document.querySelector(s); };
  var esc = function(s){ return String(s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var fmt = function(n){ return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2}); };
  var money = function(n){ return fmt(n)+' ج.م'; };
  var round = function(n){ return Math.round(n*1000)/1000; };
  var uid = function(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); };
  var byName = function(a,b){ return a.name.localeCompare(b.name,'ar'); };
  var LOW = 5;

  var products = new Map();
  var suppliers = new Map();
  var customers = new Map();
  var expenses = new Map();
  var selSup = null, stockLimit = 50, SVC_QTY = 1000000000;
  function leftTxt(p){ return p.svc ? 'خدمة' : 'فاضل '+fmt(p.qty)+(p.unit ? ' '+p.unit : ''); }
  var pendingEntry = null, entryTimer = null, pendingSup = null, supTimer = null;
  var lastOpts = '';
  var sales = [];
  var cart = {}, cartPrice = {}, cartSeq = {}, cartN = 0;
  /* تغيير سعر الصنف وقت البيع: المالك دايما، والكاشير لو المالك سمح */
  function canPrice(){ return (typeof isOwner==='function' && isOwner()) || shopCfg.cp===true; }
  /* عرض الكمية: كرتونة كاملة تتكتب "1 كرتونة" مش 20 كيس */
  function qtyText(q,pack,u){
    if(u) return fmt(q)+' '+u;
    if(!(pack>1) || q<pack) return fmt(q);
    var c = Math.floor(q/pack), r = round(q-c*pack);
    return fmt(c)+' كرتونة'+(r>0 ? ' و '+fmt(r)+' قطعة' : '');
  }
  function feeVal(){ var v = parseFloat($('#fee').value); return v>0 ? round(v) : 0; }
  var view = 'sell';
  var period = 'today';
  var editingId = null;
  var pendingDel = null, delTimer = null;
  var mode = 'pending';
  var db = null;
  var LICENSE_KEY_JWK = window.LICENSE_PUBLIC_KEY || '';
  var CONTACT = window.CONTACT_TEXT || '';
  var locked = !!LICENSE_KEY_JWK;
  var lic = null;
  var editSale = null, draft = [], pendingCancelInv = false, cancelInvTimer = null, lastIeOpts = '';
  var editEnt = null, lastRtOpts = '';
  var invSeq = 0;
  var lastSaleId = null, shopCfg = {name:'',foot:'',w:'80',qr:'',qrt:'',cp:false,locs:[]};

  /* ---------- حفظ ---------- */
  var LS_KEY = 'qatea-v1';
  function lsLoad(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        var d = JSON.parse(raw);
        (d.products||[]).forEach(function(p){ products.set(p.id,p); });
        sales = d.sales||[];
        (d.suppliers||[]).forEach(function(s){ suppliers.set(s.id,s); });
        (d.customers||[]).forEach(function(c){ customers.set(c.id,c); });
        (d.expenses||[]).forEach(function(x){ expenses.set(x.id,x); });
        invSeq = +d.seq||0;
      }
    }catch(e){}
    numberSales();
  }
  /* ترقيم الفواتير: 1,2,3… بالترتيب. الفواتير القديمة بتاخد رقم حسب وقتها، والعدّاد عمره ما بيرجع لورا */
  function numberSales(){
    var mx = invSeq;
    sales.forEach(function(s){ if(s.no>mx) mx = s.no; });
    sales.filter(function(s){ return !(s.no>0); }).sort(function(a,b){ return a.ts-b.ts; }).forEach(function(s){ s.no = ++mx; });
    invSeq = mx;
  }
  function lsSave(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({products:Array.from(products.values()),sales:sales,suppliers:Array.from(suppliers.values()),customers:Array.from(customers.values()),expenses:Array.from(expenses.values()),seq:invSeq})); }catch(e){}
  }
  var chain = Promise.resolve();
  function enqueue(fn){
    chain = chain.then(fn).catch(function(e){ toast('الحفظ ماتمش: '+((e&&e.message)||'جرب تاني'),true); });
    return chain;
  }
  function persist(dbFn){
    if(mode==='db' || mode==='cloud') enqueue(dbFn); else if(mode==='local'){ if(renderHold) lsDirty = true; else lsSave(); }
    render();
  }
  /* أثناء الاستيراد الكبير: نأجّل الرسم والحفظ المحلي لحد ما يخلص (بدل ما نعيدهم مع كل صنف) */
  var renderHold = false, renderLate = false, lsDirty = false;
  function holdRender(on){
    renderHold = !!on;
    if(!on){ if(lsDirty){ lsDirty = false; lsSave(); } if(renderLate){ renderLate = false; render(); } }
  }
  function ready(){
    if(locked){ toast('التطبيق مقفول. فعّله الأول.',true); return false; }
    if(!sess){ toast('سجّل الدخول الأول',true); return false; }
    if(mode==='pending'){ toast('استنى ثواني لحد ما البيانات تتحمّل',true); return false; }
    return true;
  }
  /* كتابة صنف: في السحابة بنبعت الفرق في الكمية مش الكمية نفسها، عشان بيع جهاز تاني في نفس اللحظة ما يتمسحش */
  function prodWrite(u,old){
    if(mode!=='cloud' || !old) return db.doc('products/'+u.id).set(u);
    var rest = Object.assign({},u); delete rest.qty; delete rest.sold; delete rest.revenue; delete rest.stk; delete rest.mq;
    var d = {}, f = {qty:1,sold:1,revenue:1};
    Object.keys(f).forEach(function(k){ var x = round((+u[k]||0)-(+old[k]||0)); if(x){ d[(k==='qty' && LOC!=='main') ? 'stk.'+LOC : k] = x; } });
    return db.upd('products/'+u.id,rest,d);
  }
  /* كتابة مورد: الحركات الجديدة بتتضاف لوحدها، وأي تعديل أو حذف بيكتب المورد كله */
  function supWrite(s,old){
    if(mode!=='cloud' || !old) return db.doc('suppliers/'+s.id).set(s);
    var oe = old.entries||[], ne = s.entries||[], oid = {}, nid = {};
    oe.forEach(function(e){ oid[e.id] = e; }); ne.forEach(function(e){ nid[e.id] = 1; });
    var removed = oe.some(function(e){ return !nid[e.id]; });
    var changed = ne.some(function(e){ return oid[e.id] && JSON.stringify(e)!==JSON.stringify(oid[e.id]); });
    if(removed || changed) return db.doc('suppliers/'+s.id).set(s);
    var added = ne.filter(function(e){ return !oid[e.id]; });
    var rest = Object.assign({},s); delete rest.entries;
    return db.upd('suppliers/'+s.id,rest,null,added.length ? {entries:added} : null);
  }
  /* إضافة أصناف كتير مرة واحدة (استيراد): في السحابة بتتبعت دفعات بدل صنف صنف، وده أسرع وبيستهلك نت أقل */
  function putProductsBulk(arr){
    if(mode==='cloud' && db.setMany){
      arr.forEach(function(p){ products.set(p.id,p); });
      enqueue(function(){ return db.setMany('products',arr); });
      render();
    } else arr.forEach(putProduct);
  }
  function putProduct(p){
    var old = products.get(p.id);
    products.set(p.id,p);
    persist(function(){ return prodWrite(p,old); });
  }
  function removeProduct(id){
    products.delete(id);
    persist(function(){ return db.doc('products/'+id).delete(); });
  }
  /* مسح كل الأصناف مرة واحدة (المالك بس). الفواتير والعملاء والموردين مش بيتأثروا */
  function removeAllProducts(){
    var ids = []; products.forEach(function(p,id){ ids.push(id); });
    products.clear();
    if(mode==='cloud' && db.delMany) enqueue(function(){ return db.delMany('products',ids); });
    else persist(function(){ var ch = Promise.resolve(); ids.forEach(function(id){ ch = ch.then(function(){ return db.doc('products/'+id).delete(); }); }); return ch; });
    render();
    return ids.length;
  }
  function recordSale(sale,updated){
    updated.forEach(function(p){ products.set(p.id,p); });
    sales.unshift(sale);
    var cloud = (mode==='cloud');
    persist(function(){
      if(cloud){
        /* في السحابة المخزون بيتعدّل بالنقص مش بقيمة جديدة، عشان جهازين يبيعوا مع بعض والكمية تطلع صح */
        sale.lines.forEach(function(l){ var dd = {sold:l.qty,revenue:round(l.qty*l.price)}; dd[LOC!=='main' ? 'stk.'+LOC : 'qty'] = -l.qty; db.inc('products/'+l.pid,dd); });
        return db.doc('sales/'+sale.id).set(sale);
      }
      var ch = Promise.resolve();
      updated.forEach(function(u){ ch = ch.then(function(){ return db.doc('products/'+u.id).set(u); }); });
      return ch.then(function(){ return db.doc('sales/'+sale.id).set(sale); });
    });
  }

  function putSupplier(s){
    var old = suppliers.get(s.id);
    suppliers.set(s.id,s);
    persist(function(){ return supWrite(s,old); });
  }
  /* كتابة عميل: نفس منطق المورد. الحركات الجديدة بتتضاف لوحدها (آمنة مع أكتر من جهاز)، وأي تعديل أو حذف بيكتب العميل كله */
  function custWrite(c,old){
    if(mode!=='cloud' || !old) return db.doc('customers/'+c.id).set(c);
    var oe = old.entries||[], ne = c.entries||[], oid = {}, nid = {};
    oe.forEach(function(e){ oid[e.id] = e; }); ne.forEach(function(e){ nid[e.id] = 1; });
    var removed = oe.some(function(e){ return !nid[e.id]; });
    var changed = ne.some(function(e){ return oid[e.id] && JSON.stringify(e)!==JSON.stringify(oid[e.id]); });
    if(removed || changed) return db.doc('customers/'+c.id).set(c);
    var added = ne.filter(function(e){ return !oid[e.id]; });
    var rest = Object.assign({},c); delete rest.entries;
    return db.upd('customers/'+c.id,rest,null,added.length ? {entries:added} : null);
  }
  function putCustomer(c){
    var old = customers.get(c.id);
    customers.set(c.id,c);
    persist(function(){ return custWrite(c,old); });
  }
  /* رصيد العميل: موجب = عليه (مدين للمحل)، سالب = له */
  function custStats(c){
    var owed = 0, paid = 0, bought = 0;
    (c.entries||[]).forEach(function(e){
      if(e.type==='sale'){ bought += e.total; owed += e.total-(e.paid||0); }
      else if(e.type==='debt') owed += e.amount;
      else if(e.type==='payment') paid += e.amount;
    });
    return {bought:round(bought),paid:round(paid),bal:round(owed-paid)};
  }
  function custBal(bal){
    if(bal>0) return ['هيدفعلنا '+money(bal),'warn'];
    if(bal<0) return ['إحنا هندفعله '+money(-bal),'ok'];
    return ['متسوّي','zero'];
  }
  function removeCustomer(id){
    customers.delete(id);
    persist(function(){ return db.doc('customers/'+id).delete(); });
  }
  /* المصروفات (المالك بس): رواتب، إيجار، بنزين… */
  function putExpense(x){ expenses.set(x.id,x); persist(function(){ return db.doc('expenses/'+x.id).set(x); }); }
  function removeExpense(id){ expenses.delete(id); persist(function(){ return db.doc('expenses/'+id).delete(); }); }
  function removeSupplier(id){
    suppliers.delete(id);
    persist(function(){ return db.doc('suppliers/'+id).delete(); });
  }
  function commit(prods,sup){
    var olds = prods.map(function(p){ return products.get(p.id); }), oldSup = suppliers.get(sup.id);
    prods.forEach(function(p){ products.set(p.id,p); });
    suppliers.set(sup.id,sup);
    persist(function(){
      var ch = Promise.resolve();
      prods.forEach(function(u,i){ ch = ch.then(function(){ return prodWrite(u,olds[i]); }); });
      return ch.then(function(){ return supWrite(sup,oldSup); });
    });
  }

  /* ---------- رسالة سريعة ---------- */
  var tt;
  function toast(msg,bad){
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show'+(bad?' bad':'');
    clearTimeout(tt);
    tt = setTimeout(function(){ el.className='toast'; },2600);
  }

  /* ---------- رسم ---------- */
  /* لو تحديث جه من جهاز تاني وانت بتكتب كمية توريد، نحافظ على اللي كتبته ومكان المؤشر */
  function keepInputs(fn){
    var saved = {}, act = document.activeElement, actKey = null, s0 = 0, s1 = 0;
    document.querySelectorAll('form.restock input').forEach(function(i){
      var k = i.form.dataset.id+'|'+i.name; if(i.value) saved[k] = i.value;
      if(i===act){ actKey = k; try{ s0 = i.selectionStart; s1 = i.selectionEnd; }catch(e){} }
    });
    fn();
    document.querySelectorAll('form.restock input').forEach(function(i){
      var k = i.form.dataset.id+'|'+i.name;
      if(saved[k]!=null && !i.value) i.value = saved[k];
      if(k===actKey){ i.focus(); try{ i.setSelectionRange(s0,s1); }catch(e){} }
    });
  }
  function render(){ if(renderHold){ renderLate = true; return; } keepInputs(renderAll); }
  function renderAll(){ renderStatus(); renderTabs(); if(typeof renderLocs==='function') renderLocs(); renderSell(); renderStock(); renderSup(); renderCust(); renderInv(); if(typeof renderExp==='function'){ renderExp(); renderLinks(); } renderReport(); renderInvEdit(); renderBackup(); renderMine(); renderSec(); renderRoleUI(); if(typeof renderCloudInfo==='function') renderCloudInfo(); }

  function renderStatus(){
    var el = $('#sync');
    if(mode==='db'){ el.textContent='محفوظ ومتزامن'; el.className='chip db'; }
    else if(mode==='cloud'){
      var on = (navigator.onLine!==false);
      var pn = window.FB_PEND||0, ver = ' · '+(window.APP_VER||'قديمة');
      el.textContent = !on ? 'أوفلاين: هيتزامن لما النت يرجع'+ver : pn>0 ? 'بيتبعت للسيرفر ('+pn+')…'+ver : 'متزامن مع السحابة'+ver;
      el.className = (on && !pn) ? 'chip db' : 'chip local';
    }
    else if(mode==='local'){ el.textContent='محفوظ على الجهاز ده بس'; el.className='chip local'; }
    else { el.textContent='بيحمّل…'; el.className='chip'; }
  }

  function renderTabs(){
    if(!tabAllowed(view)) view = 'sell';
    ['sell','stock','sup','cust','inv','exp','loc','report','sec'].forEach(function(v){
      $('#v-'+v).hidden = (v!==view);
      $('#t-'+v).setAttribute('aria-selected', v===view ? 'true':'false');
      $('#t-'+v).hidden = !tabAllowed(v);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-period]'),function(b){
      b.setAttribute('aria-pressed', b.dataset.period===period ? 'true':'false');
    });
  }

  function cleanCart(){
    Object.keys(cartPrice).forEach(function(id){ var pp = products.get(id); if(!cart[id] || !pp || !(cartPrice[id]>0) || cartPrice[id]===pp.price || !canPrice()) delete cartPrice[id]; });
    Object.keys(cart).forEach(function(id){
      var p = products.get(id);
      if(!p || p.qty<=0){ delete cart[id]; return; }
      if(cart[id]>p.qty) cart[id]=p.qty;
      if(!(cart[id]>0)) delete cart[id];
    });
  }

  function renderSell(){
    if(typeof cartsBoot==='function') cartsBoot();
    var q = ($('#q').value||'').trim().toLowerCase();
    var list = Array.from(products.values()).filter(function(p){ return !q || p.name.toLowerCase().indexOf(q)>=0 || (p.barcode && String(p.barcode).toLowerCase().indexOf(q)>=0); }).sort(byName);
    var sellTotal = list.length;
    if(list.length>60) list = list.slice(0,60);
    $('#plist').innerHTML = list.length ? list.map(function(p){
      return '<li><button type="button" class="prow" data-act="add" data-id="'+esc(p.id)+'"'+(p.qty<=0?' disabled':'')+'>'+
        '<span class="pname">'+esc(p.name)+'</span>'+
        '<span class="pmeta">'+money(p.price)+(p.unit?' / '+esc(p.unit):'')+' · '+(p.svc ? 'خدمة' : p.qty<=0?'خلص':'فاضل '+fmt(p.qty)+(p.unit?' '+esc(p.unit):''))+'</span>'+
        '<span class="padd" aria-hidden="true">+</span></button>'+(p.pack>1 && p.qty>0 ? '<button type="button" class="pcar" data-act="addc" data-id="'+esc(p.id)+'"'+(p.qty<p.pack?' disabled':'')+'>+ كرتونة ('+fmt(p.pack)+' قطعة) · '+money(round(p.pack*p.price))+'</button>' : '')+'</li>';
    }).join('')+(sellTotal>list.length ? '<li class="note">فيه '+fmt(sellTotal-list.length)+' صنف تاني. اكتب في البحث أو امسح الباركود عشان تلاقيه.</li>' : '') : '<li class="note">'+(products.size ? 'مفيش صنف بالاسم ده.' : 'لسه مفيش أصناف. افتح «المخزن» وضيف أول صنف.')+'</li>';

    cleanCart();
    /* آخر صنف اتضاف بيبقى أول واحد فوق (عشان البياع يعدّل سعره وكميته من غير ما ينزل)، والأقدم تحت */
    Object.keys(cartSeq).forEach(function(id){ if(!(id in cart)) delete cartSeq[id]; });
    Object.keys(cart).forEach(function(id){ if(!cartSeq[id]) cartSeq[id] = ++cartN; });
    var ids = Object.keys(cart).sort(function(a,b){ return cartSeq[b]-cartSeq[a]; }), total = 0;
    var af = document.activeElement, typing = !!(af && af.matches && af.matches('#cart [data-qty],#cart [data-price]'));
    /* لو البياع بيكتب كمية أو سعر، مبنعيدش رسم السلة (أي مزامنة بتيجي من جهاز تاني متقطعش كتابته) */
    var cartHtml = ids.length ? ids.map(function(id){
      var p = products.get(id), q2 = cart[id], pr = cartPrice[id]!=null ? cartPrice[id] : p.price, sub = round(q2*pr); total += sub;
      return '<li class="cline"><div class="cl-name">'+esc(p.name)+'<small>'+(p.pack>1 && q2>=p.pack ? '<b>'+esc(qtyText(q2,p.pack))+'</b> ('+fmt(q2)+' قطعة) · ' : '')+(canPrice() ? '<label class="cl-pr">السعر <input type="number" inputmode="decimal" min="0" step="any" value="'+pr+'" data-price="'+esc(id)+'" aria-label="سعر الوحدة"></label>' : fmt(pr))+' × '+fmt(q2)+(p.unit?' '+esc(p.unit):'')+' = '+money(sub)+(pr!==p.price ? ' <em class="cl-mod">سعر معدّل (الأصلي '+fmt(p.price)+')'+(isOwner() && p.cost!=null && pr<p.cost ? ' · أقل من الجملة!' : '')+'</em>' : '')+'</small></div>'+
        '<div class="step"><button type="button" data-act="dec" data-id="'+esc(id)+'" aria-label="نقّص">−</button>'+
        '<input type="number" inputmode="decimal" min="0" step="any" value="'+q2+'" data-qty="'+esc(id)+'" aria-label="الكمية">'+
        '<button type="button" data-act="inc" data-id="'+esc(id)+'" aria-label="زوّد">+</button></div>'+
        '<button type="button" class="rm" data-act="rm" data-id="'+esc(id)+'" aria-label="شيل من الفاتورة">×</button></li>';
    }).join('') : '<li class="note">اضغط على الأصناف اللي عايز تبيعها.</li>';
    if(!typing) $('#cart').innerHTML = cartHtml;
    $('#total').textContent = money(total + (ids.length ? feeVal() : 0));
    $('#checkout').disabled = !ids.length;
    var ls = lastSaleId ? findSale(lastSaleId) : null;
    if(typeof renderCartTabs==='function') renderCartTabs();
    $('#last-sale').hidden = !ls;
    if(ls){ $('#ls-txt').textContent = 'آخر فاتورة '+invCode(ls)+': '+money(ls.total); $('#last-sale button').setAttribute('data-sid',ls.id); }
  }

  function statusOf(p){
    if(p.svc) return '<span class="pill zero">خدمة</span>';
    if(p.qty<=0) return '<span class="pill bad">خلص</span>';
    if(p.qty<=LOW) return '<span class="pill warn">قرب يخلص</span>';
    return '<span class="pill ok">متوفر</span>';
  }

  function renderStock(){
    var all = Array.from(products.values()).sort(byName), sq = (($('#s-q')||{}).value||'').trim().toLowerCase();
    var list = sq ? all.filter(function(p){ return p.name.toLowerCase().indexOf(sq)>=0 || (p.barcode && String(p.barcode).toLowerCase().indexOf(sq)>=0); }) : all;
    var cnt = $('#s-count'), more = $('#s-more');
    if(cnt) cnt.textContent = all.length ? '(' + (sq ? fmt(list.length)+' من ' : '') + fmt(all.length) + ' صنف)' : '';
    var shownN = list.length;
    if(list.length>stockLimit) list = list.slice(0,stockLimit);
    if(more){ more.hidden = shownN<=list.length; more.textContent = 'اعرض أكتر ('+fmt(shownN-list.length)+' باقي)'; }
    var box = $('#slist');
    if(!all.length){
      box.innerHTML = '<li class="empty"><p>لسه مفيش أصناف في المخزن.</p><div class="row">'+
        '<button type="button" class="btn primary" data-act="focusform">ضيف أول صنف</button>'+
        '<button type="button" class="btn" data-act="seed">جرّب بأصناف تجريبية</button></div></li>';
      return;
    }
    box.innerHTML = list.map(function(p){
      var del = pendingDel===p.id;
      return '<li class="item"><div class="item-head"><strong>'+esc(p.name)+'</strong>'+statusOf(p)+'</div>'+(p.cost!=null && isOwner()?'<div class="pmeta">سعر الجملة: '+money(p.cost)+'</div>':'')+(p.barcode?'<div class="pmeta">باركود: '+esc(p.barcode)+'</div>':'')+(p.pack>1?'<div class="pmeta">الكرتونة: '+fmt(p.pack)+' قطعة'+(p.qty>=p.pack?' · فاضل ≈ '+fmt(Math.floor(p.qty/p.pack))+' كرتونة و '+fmt(round(p.qty%p.pack))+' قطعة':'')+'</div>':'')+
        '<dl class="stats"><div><dt>السعر'+(p.unit?' (لل'+esc(p.unit)+')':'')+'</dt><dd>'+money(p.price)+'</dd></div>'+
        '<div><dt>اتباع</dt><dd>'+fmt(p.sold)+'</dd></div>'+
        '<div><dt>فاضل</dt><dd>'+(p.svc ? '—' : fmt(p.qty)+(p.unit?' '+esc(p.unit):''))+'</dd></div></dl>'+
        '<div class="item-actions">'+
        '<form class="restock" data-id="'+esc(p.id)+'"><input name="n" type="number" inputmode="decimal" min="0" step="any" placeholder="'+(p.pack>1?'عدد':'كمية جديدة')+'" aria-label="كمية التوريد لـ '+esc(p.name)+'">'+(p.pack>1?'<select name="u" aria-label="الوحدة"><option value="c">كرتونة</option><option value="p">قطعة</option></select>':'')+'<button class="btn" type="submit">+ توريد</button></form>'+
        '<button type="button" class="btn" data-act="edit" data-id="'+esc(p.id)+'">تعديل</button>'+
        '<button type="button" class="btn danger" data-act="del" data-id="'+esc(p.id)+'">'+(del?'متأكد؟ اضغط تاني':'حذف')+'</button>'+
        '</div></li>';
    }).join('');
  }

  function periodRows(){
    var t0 = new Date(); t0.setHours(0,0,0,0); if(period==='month') t0.setDate(1); t0 = t0.getTime();
    var rows = new Map(), invoices = 0;
    if(period==='today' || period==='month'){
      sales.filter(function(s){ return s.ts>=t0; }).forEach(function(s){
        invoices++;
        s.lines.forEach(function(l){
          var r = rows.get(l.pid) || {name:l.name,sold:0,rev:0};
          r.sold += l.qty; r.rev += l.qty*l.price; rows.set(l.pid,r);
        });
      });
    } else {
      products.forEach(function(p){ rows.set(p.id,{name:p.name,sold:p.sold||0,rev:p.revenue||0}); });
    }
    products.forEach(function(p){ if(!rows.has(p.id)) rows.set(p.id,{name:p.name,sold:0,rev:0}); });
    var out = [];
    rows.forEach(function(r,pid){ var p = products.get(pid); out.push({name:r.name,sold:r.sold,rev:r.rev,left:(p && !p.svc)?p.qty:null}); });
    out.sort(function(a,b){ return (b.sold-a.sold) || a.name.localeCompare(b.name,'ar'); });
    return {rows:out,invoices:invoices,t0:t0};
  }

  function profitFor(list){
    var profit = 0, unknown = 0;
    list.forEach(function(s){
      s.lines.forEach(function(l){
        if(l.cost==null || !isFinite(+l.cost)) unknown++;
        else profit += (l.price-l.cost)*l.qty;
      });
    });
    return {profit:round(profit),unknown:unknown};
  }

  function renderReport(){
    var r = periodRows();
    var rev = 0, pcs = 0, stockVal = 0;
    r.rows.forEach(function(x){ rev += x.rev; pcs += x.sold; });
    products.forEach(function(p){ if(!p.svc) stockVal += (typeof totQty==='function' ? totQty(p) : p.qty)*p.price; });
    var pr = profitFor(sales.filter(function(s){ return period==='all' || s.ts>=r.t0; }));
    var owed = 0, custOwed = 0;
    suppliers.forEach(function(s){ var b = supStats(s).bal; if(b>0) owed += b; });
    customers.forEach(function(c){ var b = custStats(c).bal; if(b>0) custOwed += b; });
    var exT = (typeof exSum==='function' && isOwner()) ? exSum(exIn(period)) : 0;
    var PL = period==='today' ? 'النهارده' : period==='month' ? 'الشهر ده' : 'من الأول';
    var partial = (period==='all' && mode==='cloud');
    /* العميل اللي هو نفسه مورد: اللي بينهم بيتخصم من بعض في إجمالي الديون */
    var offs = 0;
    customers.forEach(function(c){ var s2 = c.supId ? suppliers.get(c.supId) : null; if(!s2) return; offs += Math.min(Math.max(custStats(c).bal,0),Math.max(supStats(s2).bal,0)); });
    offs = round(offs); owed = round(Math.max(owed-offs,0)); custOwed = round(Math.max(custOwed-offs,0));
    $('#tiles').innerHTML =
      '<div class="tile"><span>مبيعات '+PL+'</span><strong>'+money(rev)+'</strong>'+(period!=='all'?'<small>'+fmt(r.invoices)+' فاتورة</small>':'')+'</div>'+
      '<div class="tile"><span>ربح البضاعة '+PL+'</span><strong>'+money(pr.profit)+'</strong><small>'+(pr.unknown ? 'من غير '+fmt(pr.unknown)+' سطر مفيهوش سعر جملة' : 'سعر البيع − سعر الجملة (قبل المصروفات)')+(partial ? ' · محسوب من فواتير آخر '+CLOUD_DAYS+' يوم بس' : '')+'</small></div>'+
      (exT>0 ? '<div class="tile"><span>مصروفات '+PL+'</span><strong>'+money(exT)+'</strong><small>رواتب وإيجار وبنزين…</small></div><div class="tile"><span>الصافي بعد المصروفات</span><strong>'+money(round(pr.profit-exT))+'</strong><small>ربح البضاعة − المصروفات'+(period==='today' ? ' · الإيجار والمرتبات شهرية، شوف «الشهر ده»' : '')+'</small></div>' : '')+
      '<div class="tile"><span>قطع اتباعت</span><strong>'+fmt(pcs)+'</strong></div>'+
      '<div class="tile"><span>قيمة اللي فاضل في المخزن</span><strong>'+money(stockVal)+'</strong></div>'+
      '<div class="tile"><span>عدد الأصناف في المخزن</span><strong>'+fmt(products.size)+'</strong></div>'+
      '<div class="tile"><span>إحنا مديونين للموردين</span><strong>'+money(owed)+'</strong>'+(offs>0?'<small>بعد خصم '+money(offs)+' متبادل مع ناس عملاء ومورّدين</small>':'')+'</div>'+
      '<div class="tile"><span>العملاء مديونين لينا</span><strong>'+money(custOwed)+'</strong>'+(offs>0?'<small>بعد خصم '+money(offs)+' متبادل مع ناس عملاء ومورّدين</small>':'')+'</div>';
    var tv = []; products.forEach(function(p){ if(!p.svc) tv.push({p:p,v:p.qty*p.price}); });
    tv.sort(function(a,b){ return b.v-a.v; });
    $('#topval').innerHTML = tv.slice(0,10).map(function(x){
      return '<tr><td>'+esc(x.p.name)+'</td><td class="n">'+esc(qtyText(x.p.qty,x.p.pack,x.p.unit))+'</td><td class="n">'+money(x.p.price)+(x.p.unit ? ' / '+esc(x.p.unit) : '')+'</td><td class="n">'+money(round(x.v))+'</td></tr>';
    }).join('') || '<tr><td colspan="4" class="note">مفيش أصناف لسه.</td></tr>';
    $('#rtable').innerHTML = r.rows.length ? r.rows.map(function(x){
      return '<tr><td>'+esc(x.name)+'</td><td class="n">'+fmt(x.sold)+'</td><td class="n">'+(x.left===null?'—':fmt(x.left))+'</td><td class="n">'+money(x.rev)+'</td></tr>';
    }).join('') : '<tr><td colspan="4" class="note">مفيش أصناف لسه.</td></tr>';
    var recent = sales.filter(function(s){ return period==='all' || s.ts>=r.t0; }).slice(0,15);
    $('#recent').innerHTML = recent.length ? recent.map(function(s){
      var when = dt(s.ts);
      var tag = (s.edits && s.edits.length) ? '<span class="pill warn">اتعدّلت</span>' : '';
      return '<li><span class="when">'+esc(invCode(s))+' · '+when+'</span><span class="what">'+s.lines.map(function(l){ return esc(l.name)+' ×'+esc(qtyText(l.qty,l.pack,l.u)); }).join('، ')+'</span><span class="sum">'+money(s.total)+'</span>'+
        '<div class="inv-act"><button type="button" class="btn sm" data-act="editinv" data-sid="'+esc(s.id)+'">مرتجع / تعديل</button><button type="button" class="btn sm" data-act="print" data-sid="'+esc(s.id)+'">اطبع</button>'+tag+'</div></li>';
    }).join('') : '<li class="note">مفيش فواتير في الفترة دي.</li>';
  }