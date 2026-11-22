/* مخزني - الجزء 5 (UTF-8، جنب index.html): الاستيراد والفواتير والعملاء ثم بداية التشغيل */
/* ---------- استيراد أصناف من Excel / CSV (المالك بس) ---------- */
var impRows = null, impBusy = false;
function impMsg(t,bad){ var m = $('#imp-msg'); m.hidden = !t; m.textContent = t||''; m.style.color = bad ? 'var(--bad-ink)' : ''; }
function impNorm(x){
  return String(x==null ? '' : x).toLowerCase().replace(/[ً-ٟـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s_\-.:()\/]+/g,'');
}
function impNum(v){
  if(v==null) return NaN;
  var t = String(v).replace(/[٠-٩]/g,function(c){ return c.charCodeAt(0)-0x0660; }).replace(/[۰-۹]/g,function(c){ return c.charCodeAt(0)-0x06F0; })
    .replace(/٫/g,'.').replace(/٬/g,'').replace(/[^\d.,\-]/g,'');
  if(!t) return NaN;
  if(t.indexOf(',')>=0 && t.indexOf('.')<0 && /,\d{1,2}$/.test(t)) t = t.replace(',','.'); else t = t.replace(/,/g,'');
  return parseFloat(t);
}
function impCsv(text){
  if(text.charCodeAt(0)===0xFEFF) text = text.slice(1);
  var first = text.split(/\r?\n/)[0]||'', d = ',';
  if((first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length) d = ';';
  if((first.match(/\t/g)||[]).length > (first.match(new RegExp('['+d+']','g'))||[]).length) d = '\t';
  var rows = [], row = [], cur = '', q = false;
  for(var i = 0; i < text.length; i++){
    var c = text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if(c==='"') q = true;
    else if(c===d){ row.push(cur); cur = ''; }
    else if(c==='\n' || c==='\r'){ if(c==='\r' && text[i+1]==='\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function impInflate(u8){
  if(typeof DecompressionStream==='undefined') return Promise.reject(new Error('nodecomp'));
  var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(u8); w.close();
  return new Response(ds.readable).arrayBuffer().then(function(b){ return new Uint8Array(b); });
}
function impUnzip(buf){
  var u = new Uint8Array(buf), dv = new DataView(buf), e = -1, i;
  for(i = u.length-22; i >= Math.max(0,u.length-70000); i--){ if(dv.getUint32(i,true)===0x06054b50){ e = i; break; } }
  if(e<0) return Promise.reject(new Error('notzip'));
  var n = dv.getUint16(e+10,true), off = dv.getUint32(e+16,true), dec = new TextDecoder(), ent = {};
  for(i = 0; i < n; i++){
    if(dv.getUint32(off,true)!==0x02014b50) break;
    var meth = dv.getUint16(off+10,true), cs = dv.getUint32(off+20,true), nl = dv.getUint16(off+28,true), xl = dv.getUint16(off+30,true), cl = dv.getUint16(off+32,true), lo = dv.getUint32(off+42,true);
    ent[dec.decode(u.subarray(off+46,off+46+nl))] = {meth:meth,cs:cs,lo:lo};
    off += 46+nl+xl+cl;
  }
  function get(name){
    var f = ent[name]; if(!f) return Promise.resolve(null);
    var ds = f.lo+30+dv.getUint16(f.lo+26,true)+dv.getUint16(f.lo+28,true), raw = u.subarray(ds,ds+f.cs);
    if(f.meth===0) return Promise.resolve(raw);
    if(f.meth===8) return impInflate(raw);
    return Promise.reject(new Error('method'));
  }
  return {names:Object.keys(ent),get:get};
}
function impColIdx(ref){ var m = /^([A-Z]+)/.exec(ref||''), n = 0; if(!m) return 0; for(var i = 0; i < m[1].length; i++) n = n*26+(m[1].charCodeAt(i)-64); return n-1; }
function impXlsx(buf){
  var z; try{ z = impUnzip(buf); }catch(e){ return Promise.reject(e); }
  if(z.then) return z;
  var dec = new TextDecoder(), parse = function(u){ return new DOMParser().parseFromString(dec.decode(u),'application/xml'); };
  var sheets = z.names.filter(function(n){ return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(function(a,b){ return parseInt(a.replace(/\D/g,''),10)-parseInt(b.replace(/\D/g,''),10); });
  if(!sheets.length) return Promise.reject(new Error('nosheet'));
  return Promise.all([z.get('xl/sharedStrings.xml'),z.get(sheets[0])]).then(function(r){
    var ss = [];
    if(r[0]){
      var sd = parse(r[0]).getElementsByTagName('si');
      for(var i = 0; i < sd.length; i++){ var ts = sd[i].getElementsByTagName('t'), t = ''; for(var k = 0; k < ts.length; k++) t += ts[k].textContent; ss.push(t); }
    }
    var cells = parse(r[1]).getElementsByTagName('row'), rows = [];
    for(var ri = 0; ri < cells.length; ri++){
      var rn = parseInt(cells[ri].getAttribute('r'),10)-1, cs = cells[ri].getElementsByTagName('c'), row = [];
      for(var ci = 0; ci < cs.length; ci++){
        var c = cs[ci], t2 = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
        if(t2==='s') val = v ? (ss[parseInt(v.textContent,10)]||'') : '';
        else if(t2==='inlineStr'){ var it = c.getElementsByTagName('t'); for(var q = 0; q < it.length; q++) val += it[q].textContent; }
        else val = v ? v.textContent : '';
        row[impColIdx(c.getAttribute('r'))] = val;
      }
      rows[isNaN(rn) ? rows.length : rn] = row;
    }
    var out = []; for(var x = 0; x < rows.length; x++) out.push(rows[x]||[]);
    return out;
  });
}
/* ملف Word (.docx): بنقرا الجدول الأكبر في الملف، وأي جداول تانية ليها نفس صف العناوين (لو الجدول اتقسم) */
function impDocx(buf){
  var z; try{ z = impUnzip(buf); }catch(e){ return Promise.reject(e); }
  if(z.then) return z;
  return z.get('word/document.xml').then(function(u){
    if(!u) throw new Error('notable');
    var doc = new DOMParser().parseFromString(new TextDecoder().decode(u),'application/xml'), tbs = doc.getElementsByTagName('w:tbl'), all = [], i, j, k;
    var txt = function(tc){
      var ps = tc.getElementsByTagName('w:p'), out = [];
      for(var a = 0; a < ps.length; a++){ var ts = ps[a].getElementsByTagName('w:t'), t = ''; for(var b = 0; b < ts.length; b++) t += ts[b].textContent; if(t.trim()) out.push(t.trim()); }
      return out.join(' ');
    };
    for(i = 0; i < tbs.length; i++){
      var trs = tbs[i].getElementsByTagName('w:tr'), rows = [];
      for(j = 0; j < trs.length; j++){
        var row = [], kids = trs[j].childNodes;
        for(k = 0; k < kids.length; k++){ if(kids[k].nodeName==='w:tc') row.push(txt(kids[k])); }
        if(row.length) rows.push(row);
      }
      if(rows.length) all.push(rows);
    }
    if(!all.length) throw new Error('notable');
    var main = all[0]; all.forEach(function(t){ if(t.length>main.length) main = t; });
    var hs = JSON.stringify(main[0]), out = main.slice();
    all.forEach(function(t){ if(t!==main && JSON.stringify(t[0])===hs) out = out.concat(t); });
    /* صف العناوين لو اتكرر مع كل صفحة بنشيله */
    return out.filter(function(r,ix){ return ix===0 || JSON.stringify(r)!==hs; });
  });
}
var IMP_FIELDS = [
  {k:'unit',kw:['وحده','نوع','تصنيف','unit','kind']},
  {k:'pack',kw:['كرتون','علبه','عبوه','pack','carton','box']},
  {k:'cost',kw:['جمله','تكلف','شراء','cost','wholesale','purchase']},
  {k:'barcode',kw:['باركود','barcode','sku','كود']},
  {k:'qty',kw:['كميه','رصيد','مخزون','الفاضل','عدد','qty','quantity','stock','balance']},
  {k:'name',kw:['صنف','اسم','منتج','بيان','name','item','product','description']},
  {k:'price',kw:['سعربيع','سعرالبيع','بيع','سعر','price','sell','retail']}
];
function impGuess(head){
  var used = {}, g = {}, hn = head.map(impNorm), qi = -1, pi = -1, gi = -1, i0;
  for(i0 = 0; i0 < hn.length; i0++){
    if(qi<0 && (hn[i0].indexOf('قطاع')>=0 || hn[i0].indexOf('qata')>=0)) qi = i0;
    if(pi<0 && hn[i0].indexOf('pricesell')>=0) pi = i0;
    if(gi<0 && (hn[i0].indexOf('جمله')>=0 || hn[i0].indexOf('gomla')>=0)) gi = i0;
  }
  /* ملفات برامج الكاشير القديمة: سعر القطاعي = سعر البيع، و«سعر البيع» نفسه غالبا هو التكلفة (متوسط الشراء) */
  if(qi>=0 && pi>=0 && gi>=0){ g.price = qi; used[qi] = true; g.cost = pi; used[pi] = true; used[gi] = true; }
  IMP_FIELDS.forEach(function(f){
    if(g[f.k]!=null) return;
    for(var i = 0; i < head.length; i++){
      if(used[i]) continue; var h = impNorm(head[i]); if(!h) continue;
      if(f.kw.some(function(w){ return h.indexOf(w)>=0; })){ g[f.k] = i; used[i] = true; return; }
    }
  });
  return g;
}
function impFill(rows){
  var head = rows[0].map(function(h){ return String(h==null?'':h).trim(); }), g = impGuess(head), w = Math.max.apply(null,rows.slice(0,50).map(function(r){ return r.length; }).concat([head.length]));
  var opts = function(req){ var h = req ? '' : '<option value="-1">— مفيش —</option>'; for(var i = 0; i < w; i++) h += '<option value="'+i+'">'+esc(head[i] ? head[i] : 'عمود '+(i+1))+'</option>'; return h; };
  ['name','price'].forEach(function(k){ $('#imp-c-'+k).innerHTML = opts(true); $('#imp-c-'+k).value = g[k]!=null ? g[k] : (k==='name' ? 0 : Math.min(1,w-1)); });
  ['cost','qty','barcode','pack','unit'].forEach(function(k){ $('#imp-c-'+k).innerHTML = opts(false); $('#imp-c-'+k).value = g[k]!=null ? g[k] : -1; });
  $('#imp-info').textContent = 'لقيت '+fmt(rows.length-1)+' صف في الملف. راجع إن كل عمود مختار صح، وبعدين اضغط استورد.';
  impPreview();
}
function impParse(){
  var col = function(k){ return parseInt($('#imp-c-'+k).value,10); }, c = {name:col('name'),price:col('price'),cost:col('cost'),qty:col('qty'),barcode:col('barcode'),pack:col('pack'),unit:col('unit')};
  var items = [], bad = 0, seen = {};
  for(var i = 1; i < impRows.length; i++){
    var r = impRows[i], name = String(r[c.name]==null ? '' : r[c.name]).trim();
    if(!name && !r.some(function(x){ return String(x||'').trim(); })) continue;
    var price = impNum(r[c.price]);
    if(!name || !(price>=0)){ bad++; continue; }
    var qty = c.qty>=0 ? impNum(r[c.qty]) : 0, cost = c.cost>=0 ? impNum(r[c.cost]) : NaN, pk = c.pack>=0 ? Math.floor(impNum(r[c.pack])) : 0;
    var un = c.unit>=0 ? String(r[c.unit]==null ? '' : r[c.unit]).trim().slice(0,12) : '';
    if(/^(قطعه|قطعة|حبه|حبة|piece|pieces|pcs|pc|unit|units)$/i.test(un) || un==='-' || un==='0') un = '';
    if(un) pk = 0;
    /* الأصناف بالجرام بتتشرى بالكيلو: سعر الجملة بيتقسم على 1000 عشان يبقى لكل جرام (بدقة أعلى لأن الرقم صغير) */
    var gram = /^(جرام|جم|غرام|g|gr|gram|grams)$/i.test(un), kgDiv = gram ? (parseInt(($('#imp-kg')||{}).value,10)||1) : 1;
    if(kgDiv>1 && cost>=0) cost = Math.round(cost/kgDiv*100000)/100000;
    var bc = c.barcode>=0 ? String(r[c.barcode]==null ? '' : r[c.barcode]).trim() : '';
    var kb = bc ? 'b'+bc : '', kn = 'n'+name.toLowerCase();
    if((kb && seen[kb]) || seen[kn]){ bad++; continue; } if(kb) seen[kb] = 1; seen[kn] = 1;
    var svc = qty>=99999;   /* البرامج القديمة بتحط رقم كبير (99999 أو أكتر) للخدمات اللي ملهاش مخزون، زي الإيجار */
    items.push({svc:svc,name:name,price:round(price),qty:(svc ? SVC_QTY : qty>=0 ? round(qty) : 0),cost:(cost>=0 ? (kgDiv>1 ? cost : round(cost)) : null),pack:(pk>1 ? pk : 0),unit:un,hasUnit:(c.unit>=0),barcode:bc,hasQty:(c.qty>=0 && qty>=0),hasCost:(c.cost>=0 && cost>=0)});
  }
  return {items:items,bad:bad};
}
function impPreview(){
  if(!impRows) return;
  var r = impParse(), f = r.items.slice(0,3).map(function(x){ return x.name+' — بيع '+fmt(x.price)+(x.cost!=null ? ' / جملة '+fmt(x.cost) : '')+(x.svc ? ' — خدمة' : (x.qty ? ' — كمية '+fmt(x.qty)+(x.unit ? ' '+x.unit : '') : '')); }).join('  |  ');
  var svcN = r.items.filter(function(x){ return x.svc; }).length;
  $('#imp-prev').textContent = 'هيتستورد '+fmt(r.items.length)+' صنف'+(svcN ? ' (منهم '+fmt(svcN)+' خدمة: كميتهم 99999 أو أكتر فهتتحول لـ«صنف خدمة» من غير مخزون)' : '')+(r.bad ? ' (و'+fmt(r.bad)+' صف هيتخطى: اسم فاضي أو سعر غلط أو مكرر)' : '')+(f ? '. مثال: '+f : '.');
  $('#imp-go').disabled = !r.items.length;
}
function impHandleFile(file){
  impMsg('بقرا الملف…'); $('#imp-map').hidden = true; impRows = null;
  var isX = /\.xlsx$/i.test(file.name), isD = /\.docx$/i.test(file.name);
  if(/\.doc$/i.test(file.name)){ impMsg('ملفات .doc القديمة مش بتتقري. افتح الملف في Word واحفظه باسم جديد بصيغة .docx (أو Excel).',true); return; }
  var fr = new FileReader();
  fr.onerror = function(){ impMsg('معرفتش أقرا الملف.',true); };
  fr.onload = function(){
    var done = function(rows){
      rows = (rows||[]).filter(function(r){ return r && r.some(function(x){ return String(x==null?'':x).trim(); }); });
      if(rows.length<2){ impMsg('الملف فاضي أو فيه صف العناوين بس.',true); return; }
      if(rows.length>5001){ impMsg('الملف كبير (أكتر من 5000 صنف). قسّمه على ملفين.',true); return; }
      impRows = rows; impMsg(''); impFill(rows); $('#imp-map').hidden = false;
    };
    if(isD) impDocx(fr.result).then(done,function(e){ impMsg(e && e.message==='notable' ? 'ملف Word ده مفيهوش جدول. البيانات لازم تكون في جدول (صف عناوين وتحته الأصناف).' : (e && e.message==='nodecomp' ? 'المتصفح ده قديم. جرّب من Chrome حديث أو احفظ الملف Excel.' : 'معرفتش أقرا ملف Word. تأكد إنه .docx.'),true); });
    else if(isX) impXlsx(fr.result).then(done,function(e){ impMsg(e && e.message==='nodecomp' ? 'المتصفح ده قديم ومش بيقرا ملفات Excel. احفظ الملف CSV واختاره.' : 'معرفتش أقرا ملف Excel. تأكد إنه .xlsx، أو احفظه CSV.',true); });
    else done(impCsv(new TextDecoder('utf-8').decode(new Uint8Array(fr.result))));
  };
  fr.readAsArrayBuffer(file);
}
$('#imp-pick').addEventListener('click',function(){ $('#imp-file').click(); });
$('#imp-file').addEventListener('change',function(e){ var f = e.target.files[0]; e.target.value = ''; if(f) impHandleFile(f); });
$('#imp-cancel').addEventListener('click',function(){ impRows = null; $('#imp-map').hidden = true; impMsg(''); });
['name','price','cost','qty','barcode','pack','unit'].forEach(function(k){ $('#imp-c-'+k).addEventListener('change',impPreview); });
$('#imp-kg').addEventListener('change',impPreview);
/* مسح كل الأصناف: خطوتين (زرار ثم كتابة كلمة مسح) */
$('#wipe-open').addEventListener('click',function(){ $('#wipe-confirm').hidden = false; $('#wipe-txt').value = ''; $('#wipe-go').disabled = true; $('#wipe-txt').focus(); });
$('#wipe-cancel').addEventListener('click',function(){ $('#wipe-confirm').hidden = true; $('#wipe-txt').value = ''; });
$('#wipe-txt').addEventListener('input',function(){ $('#wipe-go').disabled = $('#wipe-txt').value.trim()!=='مسح'; });
$('#wipe-go').addEventListener('click',function(){
  if(!ready() || !isOwner()) return;
  if($('#wipe-txt').value.trim()!=='مسح') return;
  var n = products.size;
  if(!n){ toast('المخزن فاضي أصلا'); $('#wipe-confirm').hidden = true; return; }
  logA('delp','مسح كل الأصناف ('+fmt(n)+' صنف)',{all:n});
  if(typeof editingId!=='undefined' && editingId) resetForm();
  removeAllProducts();
  $('#wipe-confirm').hidden = true; $('#wipe-txt').value = '';
  toast('اتمسح '+fmt(n)+' صنف');
});
$('#imp-tpl').addEventListener('click',function(){
  var rows = [['اسم الصنف','سعر البيع','سعر الجملة','الكمية','الباركود','عدد القطع في الكرتونة','الوحدة'],['مياه 600 مل',5,3.5,48,'6221234567890',12,'قطعة'],['سلك كهربا 2.5',18,14,200,'',0,'متر']];
  var blob = xlsxFromSheets([['الأصناف',rows,[28,12,12,10,18,22,10]]]), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'qatea-items-template.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); },1000);
});
$('#imp-go').addEventListener('click',function(){
  if(impBusy || !impRows) return;
  if(!isOwner()){ toast('الاستيراد للمالك بس',true); return; }
  if(!ready()) return;
  var r = impParse(), mode2 = $('#imp-dup').value, byB = {}, byN = {}, added = 0, upd = 0, skipped = 0, i = 0, newBatch = [];
  products.forEach(function(p){ if(p.barcode) byB[p.barcode] = p; byN[p.name.toLowerCase()] = p; });
  impBusy = true; $('#imp-go').disabled = true; holdRender(true);
  (function step(){
    var end = Math.min(i+40,r.items.length);
    for(; i < end; i++){
      var x = r.items[i], old = (x.barcode && byB[x.barcode]) || byN[x.name.toLowerCase()];
      if(old){
        if(mode2==='skip'){ skipped++; continue; }
        putProduct(Object.assign({},old,{name:x.name,price:x.price,unit:x.hasUnit ? x.unit : (old.unit||''),pack:x.hasUnit&&x.unit ? 0 : (x.pack||old.pack||0),barcode:x.barcode||old.barcode||'',svc:x.hasQty ? x.svc : !!old.svc,qty:x.hasQty ? x.qty : old.qty,cost:x.hasCost ? x.cost : (old.cost==null ? null : old.cost)})); upd++;
      } else {
        var np = {id:uid(),name:x.name,price:x.price,qty:x.qty,cost:x.cost,barcode:x.barcode,pack:x.pack,unit:x.unit,svc:x.svc,sold:0,revenue:0,created:Date.now()+i};
        newBatch.push(np); products.set(np.id,np); added++; if(np.barcode) byB[np.barcode] = np; byN[np.name.toLowerCase()] = np;
      }
    }
    impMsg('بستورد… '+fmt(i)+' من '+fmt(r.items.length));
    if(i<r.items.length){ setTimeout(step,30); return; }
    newBatch.forEach(function(p){ products.delete(p.id); }); putProductsBulk(newBatch);
    logA('addp','استيراد أصناف من Excel: '+fmt(added)+' جديد، '+fmt(upd)+' اتحدّث، '+fmt(skipped)+' اتخطّى');
    impBusy = false; impRows = null; $('#imp-map').hidden = true; holdRender(false);
    impMsg('تمام: اتضاف '+fmt(added)+' صنف جديد'+(upd ? '، واتحدّث '+fmt(upd) : '')+(skipped ? '، واتخطّى '+fmt(skipped)+' موجودين قبل كده' : '')+'.');
    toast('اتستورد '+fmt(added+upd)+' صنف');
  })();
});

/* ---------- استيراد عملاء / موردين من Excel أو Word (المالك بس) ---------- */
/* كل صف = حركة في حساب الشخص. لو الاسم اتكرر في كذا صف (فاتورة لكل صف) الصفوف بتتجمّع على نفس الشخص. */
var PARTY = {
  cust:{plural:'العملاء',one:'عميل',map:function(){ return customers; },put:function(){ return putCustomer; },
    hint:'ارفع ملف فيه أسماء العملاء (وتليفوناتهم وأرصدتهم لو موجودة). كل صف فيه مبلغ بيتسجل على حساب العميل، ولو العميل اتكرر في كذا صف (فاتورة لكل صف) البرنامج يجمعهم على نفس العميل. بعد كده اضغط على العميل من القايمة تلاقي حسابه وفواتيره.',
    a:'هيدفعلنا (العميل مدين للمحل)',b:'إحنا هندفعله (المحل مدين للعميل)',noteA:'رصيد سابق (استيراد)',noteB:'رصيد له (استيراد)',log:'cust'},
  sup:{plural:'الموردين',one:'مورد',map:function(){ return suppliers; },put:function(){ return putSupplier; },
    hint:'ارفع ملف فيه أسماء الموردين (وتليفوناتهم وأرصدتهم لو موجودة). كل صف فيه مبلغ بيتسجل على حساب المورد، ولو المورد اتكرر في كذا صف البرنامج يجمعهم على نفس المورد.',
    a:'إحنا هندفعله (أنا مدين للمورد)',b:'هيدفعلنا (المورد مدين لي)',noteA:'رصيد سابق (استيراد)',noteB:'رصيد ليا (استيراد)',log:'sup'}
};
var PF = [
  {k:'phone',kw:['تليفون','موبايل','هاتف','محمول','جوال','phone','mobile','tel']},
  {k:'addr',kw:['عنوان','address','منطقه','العنوان']},
  {k:'date',kw:['تاريخ','date']},
  {k:'bal',kw:['رصيد','مديونيه','مدين','عليه','باقي','متبقي','balance','due','اجمالي','مبلغ','amount']},
  {k:'note',kw:['ملاحظ','فاتوره','رقم','note','invoice']},
  {k:'name',kw:['اسم','عميل','مورد','شركه','name','customer','client','supplier','بيان']}
];
var pRows = {cust:null,sup:null}, pBusy = false;
function pel(k,s){ return document.getElementById('pi-'+k+'-'+s); }
function pMsg(k,t,bad){ var m = pel(k,'msg'); m.hidden = !t; m.textContent = t||''; m.style.color = bad ? 'var(--bad-ink)' : ''; }
function pDate(v){
  if(v==null || v==='') return 0;
  var t = String(v).replace(/[٠-٩]/g,function(c){ return c.charCodeAt(0)-0x0660; }).trim(), n, p;
  if(/^\d{5}(\.\d+)?$/.test(t)){ n = (parseFloat(t)-25569)*86400000; return (n>631152000000 && n<4102444800000) ? Math.round(n) : 0; }
  p = t.split(/[\/\-.]/);
  if(p.length>=3){
    var a = parseInt(p[0],10), b = parseInt(p[1],10), c = parseInt(p[2],10);
    if(!(a>0 && b>0 && c>0)) return 0;
    var y, m, d;
    if(a>31){ y = a; m = b; d = c; } else { d = a; m = b; y = c; }
    if(y<100) y += 2000;
    if(m>12 || d>31 || y<1990 || y>2100) return 0;
    return new Date(y,m-1,d,12).getTime();
  }
  return 0;
}
function pGuess(head){
  var used = {}, g = {}, hn = head.map(impNorm);
  PF.forEach(function(f){
    for(var i = 0; i < hn.length; i++){
      if(used[i] || !hn[i]) continue;
      if(f.kw.some(function(w){ return hn[i].indexOf(w)>=0; })){ g[f.k] = i; used[i] = true; return; }
    }
  });
  return g;
}
function pFill(k,rows){
  var head = rows[0].map(function(h){ return String(h==null?'':h).trim(); }), g = pGuess(head);
  var w = Math.max.apply(null,rows.slice(0,50).map(function(r){ return r.length; }).concat([head.length]));
  var opts = function(req){ var h = req ? '' : '<option value="-1">— مفيش —</option>'; for(var i = 0; i < w; i++) h += '<option value="'+i+'">'+esc(head[i] ? head[i] : 'عمود '+(i+1))+'</option>'; return h; };
  pel(k,'c-name').innerHTML = opts(true); pel(k,'c-name').value = g.name!=null ? g.name : 0;
  ['phone','addr','bal','date','note'].forEach(function(f){ pel(k,'c-'+f).innerHTML = opts(false); pel(k,'c-'+f).value = g[f]!=null ? g[f] : -1; });
  pel(k,'info').textContent = 'لقيت '+fmt(rows.length-1)+' صف في الملف. راجع إن كل عمود مختار صح، وبعدين اضغط استورد.';
  pPreview(k);
}
function pParse(k){
  var col = function(f){ return parseInt(pel(k,'c-'+f).value,10); }, c = {name:col('name'),phone:col('phone'),addr:col('addr'),bal:col('bal'),date:col('date'),note:col('note')};
  var flip = pel(k,'sign').value==='b' ? -1 : 1, rows = pRows[k], by = {}, order = [], bad = 0, i, r;
  for(i = 1; i < rows.length; i++){
    r = rows[i];
    var name = String(r[c.name]==null ? '' : r[c.name]).trim().replace(/\s+/g,' ');
    if(!name){ if(r.some(function(x){ return String(x||'').trim(); })) bad++; continue; }
    var key = name.toLowerCase(), p = by[key];
    if(!p){ p = by[key] = {name:name.slice(0,80),phone:'',addr:'',ents:[]}; order.push(p); }
    var ph = c.phone>=0 ? String(r[c.phone]==null ? '' : r[c.phone]).replace(/[^\d+]/g,'') : '';
    if(ph && !p.phone) p.phone = ph.slice(0,20);
    var ad = c.addr>=0 ? String(r[c.addr]==null ? '' : r[c.addr]).trim().replace(/\s+/g,' ') : '';
    if(ad && !p.addr) p.addr = ad.slice(0,160);
    var amt = c.bal>=0 ? impNum(r[c.bal]) : NaN;
    if(amt>0 || amt<0){
      p.ents.push({amt:round(amt*flip),ts:(c.date>=0 ? pDate(r[c.date]) : 0),note:(c.note>=0 ? String(r[c.note]==null ? '' : r[c.note]).trim().slice(0,80) : '')});
    }
  }
  return {people:order,bad:bad};
}
function pPreview(k){
  if(!pRows[k]) return;
  var r = pParse(k), owed = 0, cred = 0, ne = 0, ex = 0, m = PARTY[k].map();
  r.people.forEach(function(p){
    var has = false; m.forEach(function(x){ if(x.name.toLowerCase()===p.name.toLowerCase()) has = true; });
    if(has) ex++;
    p.ents.forEach(function(e){ ne++; if(e.amt>0) owed += e.amt; else cred += -e.amt; });
  });
  var P = PARTY[k];
  pel(k,'prev').textContent = 'هيتستورد '+fmt(r.people.length)+' '+P.one+' ('+fmt(ne)+' حركة حساب): '+P.a+' '+money(round(owed))+(cred ? '، و'+P.b+' '+money(round(cred)) : '')+(ex ? '. منهم '+fmt(ex)+' موجودين قبل كده' : '')+(r.bad ? ' (و'+fmt(r.bad)+' صف من غير اسم هيتخطى)' : '')+'. مثال: '+r.people.slice(0,3).map(function(p){ return p.name; }).join('، ')+'.';
  pel(k,'go').disabled = !r.people.length;
}
function pHandleFile(k,file){
  pMsg(k,'بقرا الملف…'); pel(k,'map').hidden = true; pRows[k] = null;
  var isX = /\.xlsx$/i.test(file.name), isD = /\.docx$/i.test(file.name);
  if(/\.doc$/i.test(file.name)){ pMsg(k,'ملفات .doc القديمة مش بتتقري. افتح الملف في Word واحفظه بصيغة .docx (أو Excel).',true); return; }
  var fr = new FileReader();
  fr.onerror = function(){ pMsg(k,'معرفتش أقرا الملف.',true); };
  fr.onload = function(){
    var done = function(rows){
      rows = (rows||[]).filter(function(r){ return r && r.some(function(x){ return String(x==null?'':x).trim(); }); });
      if(rows.length<2){ pMsg(k,'الملف فاضي أو فيه صف العناوين بس.',true); return; }
      if(rows.length>5001){ pMsg(k,'الملف كبير (أكتر من 5000 صف). قسّمه على ملفين.',true); return; }
      pRows[k] = rows; pMsg(k,''); pFill(k,rows); pel(k,'map').hidden = false;
    };
    if(isD) impDocx(fr.result).then(done,function(e){ pMsg(k,e && e.message==='notable' ? 'ملف Word ده مفيهوش جدول. البيانات لازم تكون في جدول (صف عناوين وتحته الأسماء).' : 'معرفتش أقرا ملف Word. تأكد إنه .docx.',true); });
    else if(isX) impXlsx(fr.result).then(done,function(){ pMsg(k,'معرفتش أقرا ملف Excel. تأكد إنه .xlsx، أو احفظه CSV.',true); });
    else done(impCsv(new TextDecoder('utf-8').decode(new Uint8Array(fr.result))));
  };
  fr.readAsArrayBuffer(file);
}
function pGo(k){
  if(pBusy || !pRows[k]) return;
  if(!isOwner()){ toast('الاستيراد للمالك بس',true); return; }
  if(!ready()) return;
  var P = PARTY[k], m = P.map(), put = P.put(), r = pParse(k), dup = pel(k,'dup').value, byN = {}, i = 0, added = 0, upd = 0, skipped = 0, nEnt = 0, t0 = Date.now(), seq = 0;
  m.forEach(function(x){ byN[x.name.toLowerCase()] = x; });
  var mk = function(e){
    var ts = e.ts || (t0 + (seq++)), base = {id:uid(),ts:ts,by:(sess?sess.name:'')};
    if(k==='cust') return e.amt>0 ? Object.assign(base,{type:'debt',amount:e.amt,note:e.note||P.noteA}) : Object.assign(base,{type:'payment',amount:round(-e.amt),note:e.note||P.noteB});
    return e.amt>0 ? Object.assign(base,{type:'purchase',pid:'',name:e.note||P.noteA,qty:1,cost:e.amt,total:e.amt,paid:0}) : Object.assign(base,{type:'payment',amount:round(-e.amt),note:e.note||P.noteB});
  };
  pBusy = true; pel(k,'go').disabled = true; holdRender(true);
  (function step(){
    var end = Math.min(i+40,r.people.length);
    for(; i < end; i++){
      var p = r.people[i], old = byN[p.name.toLowerCase()], ents = p.ents.map(mk);
      ents.sort(function(a,b){ return a.ts-b.ts; });
      if(old){
        if(dup==='skip'){ skipped++; continue; }
        put(Object.assign({},old,{phone:old.phone||p.phone,addr:old.addr||p.addr,entries:(old.entries||[]).concat(ents)})); upd++; nEnt += ents.length;
      } else {
        var np = {id:uid(),name:p.name,phone:p.phone,addr:p.addr,entries:ents,created:Date.now()};
        put(np); byN[p.name.toLowerCase()] = np; added++; nEnt += ents.length;
      }
    }
    pMsg(k,'بستورد… '+fmt(i)+' من '+fmt(r.people.length));
    if(i<r.people.length){ setTimeout(step,30); return; }
    logA(P.log,'استيراد '+P.plural+' من ملف: '+fmt(added)+' جديد، '+fmt(upd)+' اتحدّث، '+fmt(skipped)+' اتخطّى ('+fmt(nEnt)+' حركة حساب)');
    pBusy = false; pRows[k] = null; pel(k,'map').hidden = true; holdRender(false);
    pMsg(k,'تمام: اتضاف '+fmt(added)+' '+P.one+' جديد'+(upd ? '، واتضافت حركات على '+fmt(upd)+' موجودين' : '')+(skipped ? '، واتخطّى '+fmt(skipped)+' موجودين قبل كده' : '')+'. ('+fmt(nEnt)+' حركة حساب)');
    toast('اتستورد '+fmt(added+upd)+' '+P.one);
  })();
}
function pInit(k){
  var P = PARTY[k], box = document.getElementById('pimp-'+k); if(!box) return;
  var sel = function(f,l,req){ return '<div><label for="pi-'+k+'-c-'+f+'">'+l+'</label><select id="pi-'+k+'-c-'+f+'"></select></div>'; };
  box.innerHTML = '<div class="panel"><h2>استيراد '+P.plural+' من Excel أو Word</h2><p class="hint">'+P.hint+'</p>'+
    '<div class="row-actions"><button class="btn primary" id="pi-'+k+'-pick" type="button">اختار ملف Excel أو Word أو CSV</button><button class="btn" id="pi-'+k+'-tpl" type="button">نزّل نموذج Excel</button><input id="pi-'+k+'-file" type="file" accept=".xlsx,.docx,.csv,.txt,text/csv" hidden></div>'+
    '<p class="hint" id="pi-'+k+'-msg" hidden></p>'+
    '<div id="pi-'+k+'-map" hidden><p class="hint" id="pi-'+k+'-info"></p><div class="pform">'+
      sel('name','عمود الاسم *')+sel('phone','عمود التليفون')+sel('addr','عمود العنوان')+sel('bal','عمود المبلغ / الرصيد')+sel('date','عمود التاريخ')+sel('note','عمود الملاحظة / رقم الفاتورة')+
      '<div class="wide"><label for="pi-'+k+'-sign">المبلغ الموجب في الملف معناه</label><select id="pi-'+k+'-sign"><option value="a">'+P.a+'</option><option value="b">'+P.b+'</option></select></div>'+
      '<div class="wide"><label for="pi-'+k+'-dup">لو الاسم موجود قبل كده</label><select id="pi-'+k+'-dup"><option value="skip">سيبه زي ما هو (ومتضيفش حاجة)</option><option value="add">ضيف المبالغ دي على حسابه</option></select></div>'+
    '</div><p class="hint" id="pi-'+k+'-prev"></p>'+
    '<div class="row-actions"><button class="btn primary" id="pi-'+k+'-go" type="button">استورد '+P.plural+'</button><button class="btn ghost" id="pi-'+k+'-cancel" type="button">إلغاء</button></div></div></div>';
  pel(k,'pick').addEventListener('click',function(){ pel(k,'file').click(); });
  pel(k,'file').addEventListener('change',function(e){ var f = e.target.files[0]; e.target.value = ''; if(f) pHandleFile(k,f); });
  pel(k,'cancel').addEventListener('click',function(){ pRows[k] = null; pel(k,'map').hidden = true; pMsg(k,''); });
  ['c-name','c-phone','c-addr','c-bal','c-date','c-note','sign'].forEach(function(f){ pel(k,f).addEventListener('change',function(){ pPreview(k); }); });
  pel(k,'go').addEventListener('click',function(){ pGo(k); });
  pel(k,'tpl').addEventListener('click',function(){
    var rows = [['الاسم','التليفون','العنوان','المبلغ','التاريخ','ملاحظة / رقم الفاتورة'],['أحمد محمود','01012345678','شارع التحرير، الدقي',1500,'15/10/2026','فاتورة 120'],['محمد علي','','',300,'','']];
    var blob = xlsxFromSheets([[P.plural,rows,[24,16,28,12,14,24]]]), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'qatea-'+k+'-template.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
  });
}
pInit('cust'); pInit('sup');

/* نسخة كاملة + ملف Excel مقروء (لرفعهم على Drive) */
window.mkBackupBundle = function(cb){ mkBackupData(function(data){ cb(data, buildExcelBlob(data.sales||[])); }); };

/* ---------- تبويب الفواتير (النهارده / 7 أيام / الشهر / من الأول) ---------- */
var invPer = 'today', invQ = '', invLimit = 50;
function invSince(per){
  var d = new Date(); d.setHours(0,0,0,0);
  if(per==='today') return d.getTime();
  if(per==='week') return d.getTime()-6*86400000;
  if(per==='month'){ d.setDate(1); return d.getTime(); }
  return 0;
}
function invRow(s,showCust,ro){
  var tag = (s.edits && s.edits.length) ? '<span class="pill warn">اتعدّلت</span>' : '';
  var ct = (showCust!==false && s.cust) ? '<span class="cust-tag">· '+esc(s.cust.name)+'</span>' : '';
  var fee = s.fee>0 ? '<span class="pmeta"> · توصيل '+money(s.fee)+'</span>' : '';
  return '<li><span class="when"><span class="inv-num">'+esc(invCode(s))+'</span> · '+dt(s.ts)+(s.by ? ' · '+esc(s.by.name) : '')+ct+'</span>'+
    '<span class="what">'+s.lines.map(function(l){ return esc(l.name)+' ×'+esc(qtyText(l.qty,l.pack,l.u)); }).join('، ')+fee+'</span><span class="sum">'+money(s.total)+'</span>'+
    '<div class="inv-act">'+(ro ? '<span class="pill zero">قديمة (للعرض فقط)</span>' : '<button type="button" class="btn sm" data-act="editinv" data-sid="'+esc(s.id)+'">مرتجع / تعديل</button>')+'<button type="button" class="btn sm" data-act="print" data-sid="'+esc(s.id)+'">اطبع</button>'+tag+'</div></li>';
}
function renderInv(){
  var box = $('#inv-list'); if(!box || $('#v-inv').hidden) return;
  Array.prototype.forEach.call(document.querySelectorAll('[data-iper]'),function(b){ b.setAttribute('aria-pressed', b.dataset.iper===invPer ? 'true' : 'false'); });
  var t0 = invSince(invPer), q = invQ.trim().toLowerCase().replace(/^#/,'');
  var list = sales.filter(function(s){ return s.ts>=t0; });
  var oldOn = invPer==='all' && mode==='cloud' && isOwner(), oldIds = {};
  if(oldOn) list = list.concat(oldSales.filter(function(s){ return !sales.some(function(x){ return x.id===s.id; }); }));
  oldSales.forEach(function(s){ oldIds[s.id] = 1; });
  if(q){
    list = list.filter(function(s){
      if(String(s.no||'')===q) return true;
      if(s.cust && s.cust.name.toLowerCase().indexOf(q)>=0) return true;
      return s.lines.some(function(l){ return l.name.toLowerCase().indexOf(q)>=0; });
    });
  }
  list.sort(function(a,b){ return b.ts-a.ts; });
  var tot = 0, fees = 0; list.forEach(function(s){ tot += s.total; fees += (s.fee||0); });
  $('#inv-tiles').innerHTML =
    '<div class="tile"><span>عدد الفواتير</span><strong>'+fmt(list.length)+'</strong></div>'+
    '<div class="tile"><span>إجمالي الفواتير</span><strong>'+money(round(tot))+'</strong>'+(fees>0 ? '<small>منها توصيل '+money(round(fees))+'</small>' : '')+'</div>';
  var shown = list.slice(0,invLimit);
  box.innerHTML = shown.length ? shown.map(function(s){ return invRow(s,true,!!oldIds[s.id] && !sales.some(function(x){ return x.id===s.id; })); }).join('') : '<li class="note">مفيش فواتير في الفترة دي'+(q ? ' بالبحث ده' : '')+'.</li>';
  $('#inv-more').hidden = list.length<=invLimit;
  $('#inv-note').textContent = (invPer==='all' && mode==='cloud') ? (isOwner() ? 'بيعرض فواتير آخر 45 يوم. الأقدم منها محفوظة في الكلاود، وبتتحمّل بالزرار اللي تحت (للعرض والطباعة بس).' : 'بيعرض فواتير آخر 45 يوم.') : '';
  var ob = $('#inv-old'); if(ob){
    ob.hidden = !oldOn || oldDone;
    ob.disabled = oldBusy; ob.textContent = oldBusy ? 'بيحمّل…' : (oldSales.length ? 'حمّل فواتير أقدم' : 'عرض الفواتير الأقدم من 45 يوم');
  }
}
var oldSales = [], oldBusy = false, oldDone = false;
window.oldSales = oldSales;
function loadOldInv(){
  if(oldBusy || mode!=='cloud' || !isOwner() || !db) return;
  var cutoff = Date.now()-CLOUD_DAYS*86400000;
  var last = oldSales.length ? oldSales[oldSales.length-1].ts : cutoff;
  oldBusy = true; renderInv();
  db.collection('sales').where('ts','<',Math.min(last,cutoff)).orderBy('ts','desc').limit(200).getOnce().then(function(rows){
    rows.forEach(function(s){ if(s && Array.isArray(s.lines) && !oldSales.some(function(x){ return x.id===s.id; })) oldSales.push(s); });
    oldSales.sort(function(a,b){ return b.ts-a.ts; });
    if(rows.length<200) oldDone = true;
    oldBusy = false; if(!rows.length) toast('مفيش فواتير أقدم'); renderInv();
  },function(){ oldBusy = false; toast('معرفتش أحمّل. اتأكد من النت وجرّب تاني.',true); renderInv(); });
}
document.addEventListener('click',function(e){
  var b = e.target.closest('[data-iper]');
  if(b){ invPer = b.dataset.iper; invLimit = 50; render(); return; }
  if(e.target.closest('#inv-old')){ loadOldInv(); return; }
  var m = e.target.closest('[data-act="invmore"]');
  if(m){ invLimit += 50; render(); }
});
$('#inv-q').addEventListener('input',function(e){ invQ = e.target.value; invLimit = 50; renderInv(); });

/* ---------- العملاء ---------- */
var selCust = null, custQ = '';
function custInvoices(id){ return sales.filter(function(s){ return s.cust && s.cust.id===id; }).sort(function(a,b){ return b.ts-a.ts; }); }
/* اختيار العميل في البيع: بحث بالاسم أو التليفون أو العنوان. العميل المختار بيفضل في القايمة حتى لو مش في نتايج البحث */
function custMatches(q){
  q = (q||'').trim().toLowerCase();
  var all = Array.from(customers.values()).sort(byName);
  return q ? all.filter(function(c){ return c.name.toLowerCase().indexOf(q)>=0 || (c.phone||'').indexOf(q)>=0 || (c.addr||'').toLowerCase().indexOf(q)>=0; }) : all;
}
function renderCustSel(){
  var el = $('#cust'); if(!el) return;
  var pr = $('#paid-row'); if(pr) pr.hidden = !el.value;
  var qq = ($('#cust-q')||{}).value || '', m = custMatches(qq), cur = el.value, more = 0;
  if(m.length>150){ more = m.length-150; m = m.slice(0,150); }
  if(cur && customers.get(cur) && !m.some(function(c){ return c.id===cur; })) m.unshift(customers.get(cur));
  var opts = '<option value="">'+(qq.trim() ? (m.length ? 'اختار من النتايج ('+fmt(m.length)+')…' : 'مفيش عميل بالاسم ده') : 'بدون عميل')+'</option>'+
    m.map(function(c){ return '<option value="'+esc(c.id)+'">'+esc(c.name)+(c.phone ? ' — '+esc(c.phone) : '')+'</option>'; }).join('')+
    (more ? '<option value="" disabled>… و'+fmt(more)+' كمان. اكتب أكتر في البحث</option>' : '');
  if(opts!==el.__o){ el.innerHTML = opts; el.__o = opts; if(cur && customers.get(cur)) el.value = cur; }
}
$('#cust-q').addEventListener('input',renderCustSel);
$('#cust-q').addEventListener('keydown',function(e){
  if(e.key!=='Enter') return;
  e.preventDefault();
  var m = custMatches(this.value);
  if(m.length>=1){ renderCustSel(); $('#cust').value = m[0].id; $('#cust').dispatchEvent(new Event('change')); this.value = ''; renderCustSel(); toast('العميل: '+m[0].name); }
});
function renderCust(){
  renderCustSel();
  if($('#v-cust').hidden) return;
  var c = selCust ? customers.get(selCust) : null;
  if(selCust && !c) selCust = null;
  $('#cust-list-view').hidden = !!c; $('#cust-detail').hidden = !c;
  var q = custQ.trim().toLowerCase();
  var list = Array.from(customers.values()).filter(function(x){ return !q || x.name.toLowerCase().indexOf(q)>=0 || (x.phone||'').indexOf(q)>=0 || (x.addr||'').toLowerCase().indexOf(q)>=0; }).sort(byName);
  $('#custlist').innerHTML = list.length ? list.map(function(x){
    var inv = custInvoices(x.id), tot = 0; inv.forEach(function(s){ tot += s.total; });
    var ln = linkedNet('cust',x), cb = custBal(ln===null ? custStats(x).bal : ln);
    if(ln!==null) cb = ['صافي: '+cb[0],cb[1]];
    return '<li class="item"><button type="button" class="sup-row" data-act="opencust" data-id="'+esc(x.id)+'"><span class="sup-main"><strong>'+esc(x.name)+'</strong>'+(x.phone ? '<span class="pmeta">'+esc(x.phone)+'</span>' : '')+(x.supId && suppliers.get(x.supId) ? '<span class="pmeta">نفسه مورد كمان</span>' : '')+'<span class="pmeta">'+fmt(inv.length)+' فاتورة · '+money(round(tot))+'</span></span><span class="pill '+cb[1]+'">'+cb[0]+'</span></button></li>';
  }).join('') : '<li class="note">'+(q ? 'مفيش عميل بالاسم ده.' : 'لسه ماسجلتش عملاء. ضيف أول عميل من فوق.')+'</li>';
  if(c){
    var inv2 = custInvoices(c.id), t2 = 0; inv2.forEach(function(s){ t2 += s.total; });
    $('#cud-name').textContent = c.name; $('#cud-phone').textContent = [c.phone ? 'التليفون: '+c.phone : 'من غير تليفون', c.addr ? 'العنوان: '+c.addr : ''].filter(Boolean).join(' · ');
    var cs = custStats(c), cb2 = custBal(cs.bal), lnC = linkedNet('cust',c), cb3 = lnC!==null ? custBal(lnC) : null;
    $('#cud-tiles').innerHTML = '<div class="tile"><span>عدد الفواتير</span><strong>'+fmt(inv2.length)+'</strong></div><div class="tile"><span>إجمالي مشترياته</span><strong>'+money(round(t2))+'</strong></div><div class="tile"><span>اللي دفعه بعدين</span><strong>'+money(cs.paid)+'</strong></div><div class="tile"><span>الرصيد'+(cb3?' (كعميل بس)':'')+'</span><strong>'+cb2[0]+'</strong></div>'+(cb3 ? '<div class="tile"><span>الصافي</span><strong>'+cb3[0]+'</strong><small>بعد خصم حسابه كمورد</small></div>' : '');
    $('#cud-owner').hidden = !isOwner();
    var en = (c.entries||[]).slice().sort(function(a,b){ return b.ts-a.ts; });
    $('#cud-ledger').innerHTML = en.length ? en.map(function(e){
      var btn = isOwner() ? '<div class="lg-btns"><button type="button" class="btn danger sm" data-act="delcent" data-eid="'+esc(e.id)+'">'+(pendingCEnt===e.id?'متأكد؟ اضغط تاني':'مسح')+'</button></div>' : '';
      var h;
      if(e.type==='sale') h = '<strong>فاتورة آجل '+(e.no?'#'+e.no:'')+' — '+money(e.total)+'</strong><span class="pmeta">دفع '+money(e.paid||0)+' · باقي عليه '+money(round(e.total-(e.paid||0)))+'</span>';
      else if(e.type==='debt') h = '<strong>دين قديم '+money(e.amount)+'</strong>'+(e.note?'<span class="pmeta">'+esc(e.note)+'</span>':'');
      else h = '<strong>دفعة '+money(e.amount)+'</strong>'+(e.note?'<span class="pmeta">'+esc(e.note)+'</span>':'');
      return '<li class="ledger-row"><div class="lg-main">'+h+'<span class="when">'+dt(e.ts)+'</span></div>'+btn+'</li>';
    }).join('') : '<li class="note">مفيش حركات حساب لسه.</li>';
    $('#cud-inv').innerHTML = inv2.length ? inv2.map(function(s){ return invRow(s,false); }).join('') : '<li class="note">مفيش فواتير لسه.</li>';
  }
}
var pendingCEnt = null;
function addCEntry(c,e){ putCustomer(Object.assign({},c,{entries:(c.entries||[]).concat([Object.assign({id:uid(),ts:Date.now(),by:(sess?sess.name:'')},e)])})); }
$('#cp-form').addEventListener('submit',function(e){
  e.preventDefault(); var c = selCust ? customers.get(selCust) : null; if(!c || !isOwner() || !ready()) return;
  var a = parseFloat($('#cp-amount').value); if(!(a>0)){ toast('اكتب مبلغ الدفعة',true); return; }
  addCEntry(c,{type:'payment',amount:round(a),note:$('#cp-note').value.trim()});
  logA('cust','دفعة من '+c.name+': '+money(a)); $('#cp-form').reset(); toast('اتسجلت الدفعة'); render();
});
$('#cdb-form').addEventListener('submit',function(e){
  e.preventDefault(); var c = selCust ? customers.get(selCust) : null; if(!c || !isOwner() || !ready()) return;
  var a = parseFloat($('#cd-amount').value); if(!(a>0)){ toast('اكتب مبلغ الدين',true); return; }
  addCEntry(c,{type:'debt',amount:round(a),note:$('#cd-note').value.trim()});
  logA('cust','دين قديم على '+c.name+': '+money(a)); $('#cdb-form').reset(); toast('اتسجل الدين'); render();
});
$('#cust').addEventListener('change',function(){ $('#paid-row').hidden = !$('#cust').value; if(!$('#cust').value) $('#paid').value = ''; if($('#cust').value && $('#cust-q').value){ $('#cust-q').value = ''; renderCustSel(); } });
function addCustomer(name,phone,addr){
  var c = {id:uid(),name:name,phone:phone||'',created:Date.now()};
  if(addr) c.addr = String(addr).slice(0,160);
  logA('cust','ضاف عميل: '+name);
  putCustomer(c);
  return c;
}
$('#cform').addEventListener('submit',function(e){
  e.preventDefault();
  if(!ready()) return;
  var name = $('#cu-name').value.trim();
  if(!name){ toast('اكتب اسم العميل',true); $('#cu-name').focus(); return; }
  var dup = Array.from(customers.values()).some(function(x){ return x.name===name && x.phone===$('#cu-phone').value.trim(); });
  if(dup){ toast('العميل ده متسجل قبل كده',true); return; }
  var c = addCustomer(name,$('#cu-phone').value.trim(),$('#cu-addr').value.trim());
  $('#cform').reset(); toast('اتضاف العميل: '+name); selCust = c.id; render();
});
$('#cu-q').addEventListener('input',function(e){ custQ = e.target.value; renderCust(); });
document.addEventListener('click',function(e){
  var b = e.target.closest('[data-act]'); if(!b) return;
  var act = b.dataset.act;
  if(act==='opencust'){ selCust = b.dataset.id; pendingCEnt = null; render(); }
  else if(act==='delcent'){
    var cx = selCust ? customers.get(selCust) : null; if(!cx || !isOwner()) return;
    if(pendingCEnt!==b.dataset.eid){ pendingCEnt = b.dataset.eid; render(); return; }
    pendingCEnt = null; logA('cust','مسح حركة حساب عميل: '+cx.name);
    putCustomer(Object.assign({},cx,{entries:(cx.entries||[]).filter(function(e2){ return e2.id!==b.dataset.eid; })})); toast('اتمسحت الحركة'); render();
  }
  else if(act==='custback'){ selCust = null; render(); }
  else if(act==='newcust-sale'){
    if(!ready()) return;
    var n = window.prompt('اسم العميل:'); n = n ? n.trim() : ''; if(!n) return;
    var ph = window.prompt('التليفون (اختياري):') || '';
    var ad = isOwner() ? (window.prompt('العنوان (اختياري):') || '') : '';
    var c = addCustomer(n,ph.trim(),ad.trim()); renderCustSel(); $('#cust').value = c.id; $('#paid-row').hidden = false; toast('اتضاف العميل: '+n);
  }
  else if(act==='editcust'){
    var cc = selCust ? customers.get(selCust) : null; if(!cc || !isOwner()) return;
    var nn = window.prompt('اسم العميل:',cc.name); if(nn===null) return; nn = nn.trim(); if(!nn){ toast('الاسم مينفعش يبقى فاضي',true); return; }
    var pp = window.prompt('التليفون:',cc.phone||''); if(pp===null) return;
    var aa = window.prompt('العنوان:',cc.addr||''); if(aa===null) return;
    logA('cust','تعديل عميل: '+cc.name+' ← '+nn);
    putCustomer(Object.assign({},cc,{name:nn,phone:pp.trim(),addr:aa.trim().slice(0,160)})); toast('اتحفظ'); render();
  }
  else if(act==='delcust'){
    var dc = selCust ? customers.get(selCust) : null; if(!dc || !isOwner()) return;
    if(!window.confirm('مسح العميل '+dc.name+'؟ فواتيره هتفضل زي ما هي.')) return;
    logA('cust','مسح عميل: '+dc.name); removeCustomer(dc.id); selCust = null; toast('اتمسح العميل'); render();
  }
});

/* اختيار وحدة الصنف: لو وحدة جاية من استيراد وغير موجودة في القايمة بتتضاف */
function setUnitSel(u){
  var s = $('#f-unit'); if(!s) return;
  if(u && !Array.prototype.some.call(s.options,function(o){ return o.value===u; })){ var o = document.createElement('option'); o.textContent = u; s.appendChild(o); }
  s.value = u||'';
}

  /* ---------- بداية ---------- */
  function startLocal(){
    /* على رابط منشور التطبيق دايما سحابي، حتى لو fb.js اتحجب أو اتشال */
    if(!window.CLOUD_ON && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.CLOUD_ON = true;
    /* السحابي: البيانات بتيجي من السيرفر بعد التحقق من الاشتراك. الوضع المحلي: من الجهاز */
    mode = window.CLOUD_ON ? 'pending' : 'local';
    if(!window.CLOUD_ON) lsLoad();
    secLoad(); if(window.CLOUD_ON){ aud = []; audBase = ''; audBaseN = 0; } else audLoad(); render();
    if(window.CLOUD_ON){ cloudStart(); } else { licenseStart(); gate(); }
  }
  function startDb(c){
    db = c; mode = 'db'; sess = {role:'owner',id:'owner',name:'المالك'}; hideLock();
    var fail = function(err){ toast('مشكلة في الاتصال بالبيانات: '+((err&&err.message)||''),true); };
    db.collection('products').onSnapshot(function(snap){
      var m = new Map();
      snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
      products = m; render();
    },fail);
    db.collection('sales').orderBy('ts','desc').limit(1000).onSnapshot(function(snap){
      sales = snap.docs.map(function(d){ return Object.assign({},d.data(),{id:d.id}); });
      render();
    },fail);
    db.collection('suppliers').onSnapshot(function(snap){
      var m = new Map();
      snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
      suppliers = m; render();
    },fail);
    db.collection('customers').onSnapshot(function(snap){
      var m = new Map();
      snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
      customers = m; render();
    },fail);
    db.collection('expenses').onSnapshot(function(snap){
      var m = new Map();
      snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
      expenses = m; render();
    },fail);
    render();
  }
  render();
  loadShopCfg();
  initIdle();
  setInterval(licenseCheck,60000);
  focusQ();
  var dbReq = null;
  try{ dbReq = window.claude ? window.claude.use('db') : null; }catch(e){ dbReq = null; }
  if(dbReq && dbReq.then){
    dbReq.then(function(c){ if(c) startDb(c); else startLocal(); }, function(){ startLocal(); });
  } else {
    startLocal();
  }

/* تلميح الكراتين: عدد الكراتين × القطع في الكرتونة */
(function(){
  function hint(){
    var pk = parseInt($('#f-pack').value,10), c = parseFloat($('#f-ctn').value), h = $('#f-ctn-hint');
    h.textContent = (pk>1 && c>0) ? ('= '+fmt(round(c*pk))+' قطعة هتتضاف') : '';
  }
  $('#f-pack').addEventListener('input',hint); $('#f-ctn').addEventListener('input',hint);
})();