/* مولّد كيو ار كود صغير (بدون مكتبات). وضع البايت، تصحيح أخطاء M، من النسخة 1 لـ 10 (لحد 213 حرف).
   window.qrSvg(text) بيرجّع SVG جاهز للطباعة، أو '' لو النص طويل أوي. */
(function(){
  /* [بايتات تصحيح لكل بلوك, عدد بلوكات1, داتا بلوك1, عدد بلوكات2, داتا بلوك2] — مستوى M */
  var BL = [null,[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]];
  var AL = [null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  var EXP = [], LOG = [], i, x = 1;
  for(i=0;i<255;i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 256) x ^= 0x11d; }
  for(i=255;i<512;i++) EXP[i] = EXP[i-255];
  function mul(a,b){ return (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]]; }
  function gen(n){ var p = [1], k, j; for(k=0;k<n;k++){ var q = []; for(j=0;j<=p.length;j++) q[j] = 0; for(j=0;j<p.length;j++){ q[j] ^= p[j]; q[j+1] ^= mul(p[j],EXP[k]); } p = q; } return p; }
  function ecc(data,n){ var g = gen(n), r = [], j, k; for(k=0;k<n;k++) r[k] = 0; for(j=0;j<data.length;j++){ var f = data[j]^r[0]; r.shift(); r.push(0); if(f) for(k=0;k<n;k++) r[k] ^= mul(g[k+1],f); } return r; }
  function utf8(s){ var o = [], c, j; s = unescape(encodeURIComponent(s)); for(j=0;j<s.length;j++){ c = s.charCodeAt(j); o.push(c); } return o; }
  function bch(v,g,gl){ var t = v, gb = 0, k; for(k=g;k>0;k>>=1) gb++; t = v << (gb-1); while(true){ var tb = 0; for(k=t;k>0;k>>=1) tb++; if(tb<gb) break; t ^= g << (tb-gb); } return (v << (gb-1)) | t; }

  function build(text){
    var bytes = utf8(text), ver, cap;
    for(ver=1;ver<=10;ver++){ var b = BL[ver]; cap = b[1]*b[2]+b[3]*b[4]; if(bytes.length+2+(ver>9?1:0) <= cap) break; }
    if(ver>10) return null;
    var B = BL[ver], total = B[1]*B[2]+B[3]*B[4], bits = [];
    function put(v,n){ for(var k=n-1;k>=0;k--) bits.push((v>>k)&1); }
    put(4,4); put(bytes.length,ver>9?16:8); bytes.forEach(function(c){ put(c,8); });
    var maxb = total*8, t = Math.min(4,maxb-bits.length); put(0,t);
    while(bits.length%8) bits.push(0);
    var cw = [], k; for(k=0;k<bits.length;k+=8){ var v = 0, j; for(j=0;j<8;j++) v = (v<<1)|bits[k+j]; cw.push(v); }
    for(k=0;cw.length<total;k++) cw.push(k%2 ? 17 : 236);
    var blocks = [], pos = 0, nb = B[1]+B[3];
    for(k=0;k<nb;k++){ var len = k<B[1] ? B[2] : B[4]; blocks.push(cw.slice(pos,pos+len)); pos += len; }
    var eb = blocks.map(function(d){ return ecc(d,B[0]); }), out = [], maxd = Math.max(B[2],B[4]), j;
    for(j=0;j<maxd;j++) blocks.forEach(function(d){ if(j<d.length) out.push(d[j]); });
    for(j=0;j<B[0];j++) eb.forEach(function(e){ out.push(e[j]); });
    var dbits = []; out.forEach(function(c){ for(var q=7;q>=0;q--) dbits.push((c>>q)&1); });
    var size = 17+4*ver, best = null, bestP = 1e9, m;
    for(m=0;m<8;m++){ var g = place(ver,size,dbits,m), p = penalty(g,size); if(p<bestP){ bestP = p; best = g; } }
    return {size:size,g:best};
  }
  function place(ver,size,dbits,mask){
    var g = [], fn = [], r, c, k;
    for(r=0;r<size;r++){ g.push([]); fn.push([]); for(c=0;c<size;c++){ g[r].push(0); fn[r].push(false); } }
    function set(r,c,v){ if(r<0||c<0||r>=size||c>=size) return; g[r][c] = v?1:0; fn[r][c] = true; }
    function finder(r0,c0){ var dr, dc; for(dr=-1;dr<=7;dr++) for(dc=-1;dc<=7;dc++){ var in7 = dr>=0&&dr<=6&&dc>=0&&dc<=6, v = in7 && (dr===0||dr===6||dc===0||dc===6||(dr>=2&&dr<=4&&dc>=2&&dc<=4)); set(r0+dr,c0+dc,v); } }
    finder(0,0); finder(0,size-7); finder(size-7,0);
    for(k=8;k<size-8;k++){ set(6,k,k%2===0); set(k,6,k%2===0); }
    var al = AL[ver], a, b2;
    for(a=0;a<al.length;a++) for(b2=0;b2<al.length;b2++){
      if((a===0&&b2===0)||(a===0&&b2===al.length-1)||(a===al.length-1&&b2===0)) continue;
      var cr = al[a], cc = al[b2], dr2, dc2;
      for(dr2=-2;dr2<=2;dr2++) for(dc2=-2;dc2<=2;dc2++) set(cr+dr2,cc+dc2,Math.max(Math.abs(dr2),Math.abs(dc2))!==1);
    }
    set(size-8,8,1);
    /* خانات الفورمات: بنحجزها الأول وبنكتبها بعد اختيار القناع */
    for(k=0;k<9;k++){ if(!fn[8][k]) set(8,k,0); if(!fn[k][8]) set(k,8,0); }
    for(k=0;k<8;k++){ if(!fn[8][size-1-k]) set(8,size-1-k,0); if(!fn[size-1-k][8]) set(size-1-k,8,0); }
    if(ver>=7){ var vi = bch(ver,0x1f25), q; for(q=0;q<18;q++){ var vb = (vi>>q)&1, ra = Math.floor(q/3), ca = q%3+size-11; set(ra,ca,vb); set(ca,ra,vb); } }
    var idx = 0, up = true, col;
    for(col=size-1;col>0;col-=2){
      if(col===6) col--;
      for(var n=0;n<size;n++){
        var row = up ? size-1-n : n, cj;
        for(cj=0;cj<2;cj++){
          var cx = col-cj; if(fn[row][cx]) continue;
          var bit = idx<dbits.length ? dbits[idx] : 0; idx++;
          var mk; switch(mask){ case 0: mk=(row+cx)%2===0; break; case 1: mk=row%2===0; break; case 2: mk=cx%3===0; break; case 3: mk=(row+cx)%3===0; break; case 4: mk=(Math.floor(row/2)+Math.floor(cx/3))%2===0; break; case 5: mk=(row*cx)%2+(row*cx)%3===0; break; case 6: mk=((row*cx)%2+(row*cx)%3)%2===0; break; default: mk=((row+cx)%2+(row*cx)%3)%2===0; }
          g[row][cx] = bit ^ (mk?1:0);
        }
      }
      up = !up;
    }
    /* الفورمات: مستوى M = 00 */
    var fmt = bch((0<<3)|mask,0x537) ^ 0x5412, f;
    for(f=0;f<15;f++){
      var v = (fmt>>f)&1;
      if(f<6) g[f][8] = v; else if(f===6) g[7][8] = v; else if(f===7) g[8][8] = v; else if(f===8) g[8][7] = v; else g[8][14-f] = v;
      if(f<8) g[8][size-1-f] = v; else g[size-15+f][8] = v;
    }
    g[size-8][8] = 1;
    return g;
  }
  function penalty(g,size){
    var p = 0, r, c, k, dark = 0;
    for(r=0;r<size;r++) for(c=0;c<size;c++) dark += g[r][c];
    for(r=0;r<size;r++){ var run = 1; for(c=1;c<size;c++){ if(g[r][c]===g[r][c-1]) run++; else { if(run>=5) p += run-2; run = 1; } } if(run>=5) p += run-2; }
    for(c=0;c<size;c++){ var run2 = 1; for(r=1;r<size;r++){ if(g[r][c]===g[r-1][c]) run2++; else { if(run2>=5) p += run2-2; run2 = 1; } } if(run2>=5) p += run2-2; }
    for(r=0;r<size-1;r++) for(c=0;c<size-1;c++){ var v = g[r][c]; if(v===g[r][c+1]&&v===g[r+1][c]&&v===g[r+1][c+1]) p += 3; }
    var pa = [1,0,1,1,1,0,1,0,0,0,0], pb = [0,0,0,0,1,0,1,1,1,0,1];
    function match(arr,s){ for(var q=0;q<11;q++) if(arr[q]!==s[q]) return false; return true; }
    for(r=0;r<size;r++) for(c=0;c<=size-11;c++){ var row = g[r].slice(c,c+11); if(match(pa,row)||match(pb,row)) p += 40; }
    for(c=0;c<size;c++) for(r=0;r<=size-11;r++){ var colv = []; for(k=0;k<11;k++) colv.push(g[r+k][c]); if(match(pa,colv)||match(pb,colv)) p += 40; }
    p += Math.floor(Math.abs(dark*100/(size*size)-50)/5)*10;
    return p;
  }
  /* بيرجّع SVG أسود على أبيض. quiet = المساحة البيضا حوالين الكود (بالمربعات) */
  window.qrSvg = function(text,quiet){
    var q = build(String(text||'')); if(!q) return '';
    quiet = quiet==null ? 3 : quiet;
    var n = q.size+quiet*2, d = '', r, c;
    for(r=0;r<q.size;r++){ var c0 = -1; for(c=0;c<=q.size;c++){ var on = c<q.size && q.g[r][c]; if(on && c0<0) c0 = c; if(!on && c0>=0){ d += 'M'+(c0+quiet)+' '+(r+quiet)+'h'+(c-c0)+'v1h-'+(c-c0)+'z'; c0 = -1; } } }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+n+' '+n+'" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="'+n+'" height="'+n+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
  };
})();