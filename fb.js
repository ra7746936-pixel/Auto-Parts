/* مخزني — الاتصال بـ Firebase.
   إعدادات الاتصال دي عامة (مش أسرار). الحماية الحقيقية في قواعد Firestore (ملف firestore.rules).
   الفتح من ملف على الجهاز (file://) أو بإضافة ?local للرابط = الوضع المحلي القديم من غير سحابة. */
(function(){
  var CFG = {
    apiKey: "AIzaSyAHwzKb29Tg9Ba2VrETUFrPuc5mVvdztDw",
    authDomain: "auto-parts-e19d1.firebaseapp.com",
    projectId: "auto-parts-e19d1",
    storageBucket: "auto-parts-e19d1.firebasestorage.app",
    messagingSenderId: "275962438391",
    appId: "1:275962438391:web:ee0976446573e83c93a9f2"
  };
  var SDK_VERSION = '13.2.0';
  window.FB_CONFIG = CFG;
  window.APP_VER = 'v3';
  window.FB_PEND = 0;
  window.FB_ADMIN_UID = 'WJHiOYM1OFfeUhqR9JvmMNW38SC2';

  function fire(n){ try{ window.dispatchEvent(new Event(n)); }catch(e){} }

  /* بديل للاختبار بس */
  if(window.FB_FAKE){
    window.FB = window.FB_FAKE; window.CLOUD_ON = true;
    setTimeout(function(){ fire('fb-ready'); },0);
    return;
  }
  /* ?local بيشتغل على جهازك إنت بس (localhost). على الرابط المنشور مبيفتحش الوضع المحلي. */
  var isDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if(location.protocol.indexOf('http')!==0 || (isDev && /[?&]local\b/.test(location.search))) return;

  window.CLOUD_ON = true;
  var base = 'https://www.gstatic.com/firebasejs/'+SDK_VERSION+'/';
  Promise.all([
    import(base+'firebase-app.js'),
    import(base+'firebase-auth.js'),
    import(base+'firebase-firestore.js')
  ]).then(function(m){
    var A = m[0], Au = m[1], F = m[2];
    /* جلسة دخول مستقلة لكل صفحة: الأدمن بيحط FB_APP_NAME عشان ميتشاركش الجلسة مع التطبيق */
    var app = window.FB_APP_NAME ? A.initializeApp(CFG,window.FB_APP_NAME) : A.initializeApp(CFG);
    var auth = Au.getAuth(app);
    var fs;
    try{
      /* كاش دائم على الجهاز: الكاشير يكمل أوفلاين والبيانات تتزامن لما النت يرجع */
      fs = F.initializeFirestore(app,{localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})});
    }catch(e){ fs = F.getFirestore(app); }
    /* Firestore بيرفض أي حقل قيمته undefined (وده كان بيوقف الحفظ كله). بنشيلها قبل الإرسال */
    function clean(d){ return JSON.parse(JSON.stringify(d)); }
    /* عدّاد الكتابات اللي لسه ما وصلتش للسيرفر (بيظهر في شريط الحالة) */
    function track(p,info){
      window.FB_PEND++; fire('fb-pend');
      p.then(function(){ window.FB_PEND--; fire('fb-pend'); },function(e){ window.FB_PEND--; fire('fb-pend'); onErr(e,info); });
    }
    function onErr(e,info){ try{ if(window.FB_ONERR) window.FB_ONERR(e,info); }catch(x){} }
    window.FB = {
      onUser: function(cb){ return Au.onAuthStateChanged(auth,cb); },
      user: function(){ return auth.currentUser; },
      signIn: function(email,pass){
        return Au.signInWithEmailAndPassword(auth,email,pass).then(function(c){ return c.user; });
      },
      reauth: function(pass){
        var u = auth.currentUser;
        if(!u || !u.email) return Promise.reject({code:'auth/no-user'});
        return Au.signInWithEmailAndPassword(auth,u.email,pass).then(function(){ return true; });
      },
      signOut: function(){ return Au.signOut(auth); },
      reset: function(email){ return Au.sendPasswordResetEmail(auth,email); },
      get: function(path){
        return F.getDoc(F.doc(fs,path)).then(function(s){ return s.exists() ? s.data() : null; });
      },
      set: function(path,data,merge){
        return merge ? F.setDoc(F.doc(fs,path),data,{merge:true}) : F.setDoc(F.doc(fs,path),data);
      },
      list: function(path){
        return F.getDocs(F.collection(fs,path)).then(function(q){
          return q.docs.map(function(d){ var v = d.data(); v.id = d.id; return v; });
        });
      },
      newId: function(path){ return F.doc(F.collection(fs,path)).id; },
      /* واجهة بيانات محل واحد: shops/{shopId}/... الكتابة بتتحط في طابور الجهاز وبتتبعت لما النت يكون موجود */
      shopDb: function(shopId){
        var root = 'shops/'+shopId+'/';
        return {
          collection: function(name){
            var q = F.collection(fs,root+name), api = {
              orderBy: function(f,d){ q = F.query(q,F.orderBy(f,d)); return api; },
              limit: function(n){ q = F.query(q,F.limit(n)); return api; },
              where: function(f,op,v){ q = F.query(q,F.where(f,op,v)); return api; },
              onSnapshot: function(ok,err){ return F.onSnapshot(q,ok,err); },
              /* قراءة مرة واحدة من السيرفر (للفواتير القديمة) */
              getOnce: function(){
                return F.getDocsFromServer(q).then(function(r){ return r.docs.map(function(d){ var v = d.data(); v.id = d.id; return v; }); });
              }
            };
            return api;
          },
          /* قراءة كل مستندات مجموعة من السيرفر نفسه (للنسخ الاحتياطي). بتفشل لو مفيش نت بدل ما ترجّع نسخة ناقصة */
          listAll: function(name){
            return F.getDocsFromServer(F.collection(fs,root+name)).then(function(q){
              return q.docs.map(function(d){ var v = d.data(); v.id = d.id; return v; });
            });
          },
          /* متابعة مستند واحد (الكاشير مش بيقرا المجموعة كلها) */
          watch: function(path,ok,err){ return F.onSnapshot(F.doc(fs,root+path),ok,err); },
          doc: function(path){
            var ref = F.doc(fs,root+path);
            return {
              set: function(d){
                try{ track(F.setDoc(ref,clean(d)),'set '+path); }catch(e){ onErr(e); }
                return Promise.resolve();
              },
              delete: function(){
                try{ track(F.deleteDoc(ref),'delete '+path); }catch(e){ onErr(e); }
                return Promise.resolve();
              }
            };
          },
          /* كتابة مستندات كتير دفعات (200 في الطلب الواحد): أسرع وبيستهلك نت أقل. لو دفعة اترفضت بنكتب مستنداتها واحد واحد */
          setMany: function(col,docs){
            for(var i = 0; i < docs.length; i += 200){
              (function(chunk){
                var n = chunk.length;
                try{
                  var b = F.writeBatch(fs);
                  chunk.forEach(function(d){ b.set(F.doc(fs,root+col+'/'+d.id),clean(d)); });
                  window.FB_PEND += n; fire('fb-pend');
                  b.commit().then(function(){ window.FB_PEND -= n; fire('fb-pend'); },function(e){
                    window.FB_PEND -= n; fire('fb-pend');
                    chunk.forEach(function(d){ try{ track(F.setDoc(F.doc(fs,root+col+'/'+d.id),clean(d)),'set '+col); }catch(x){ onErr(x); } });
                  });
                }catch(e){ onErr(e); }
              })(docs.slice(i,i+200));
            }
            return Promise.resolve();
          },
          /* مسح مستندات كتير مرة واحدة (دفعات 200) */
          delMany: function(col,ids){
            for(var i = 0; i < ids.length; i += 200){
              (function(chunk){
                var n = chunk.length;
                try{
                  var b = F.writeBatch(fs);
                  chunk.forEach(function(id){ b.delete(F.doc(fs,root+col+'/'+id)); });
                  window.FB_PEND += n; fire('fb-pend');
                  b.commit().then(function(){ window.FB_PEND -= n; fire('fb-pend'); },function(e){
                    window.FB_PEND -= n; fire('fb-pend');
                    chunk.forEach(function(id){ try{ track(F.deleteDoc(F.doc(fs,root+col+'/'+id)),'delete '+col); }catch(x){ onErr(x); } });
                  });
                }catch(e){ onErr(e); }
              })(ids.slice(i,i+200));
            }
            return Promise.resolve();
          },
          /* زيادة أو نقص رقم من غير ما نكتب فوق تعديل جهاز تاني */
          inc: function(path,deltas){
            var o = {};
            Object.keys(deltas).forEach(function(k){ o[k] = F.increment(deltas[k]); });
            try{ track(F.updateDoc(F.doc(fs,root+path),o),'inc '+path); }catch(e){ onErr(e); }
            return Promise.resolve();
          },
          /* تعديل حقول + زيادة/نقص أرقام + إضافة عناصر لمصفوفة، من غير ما نكتب فوق شغل جهاز تاني. بيفشل لو المستند اتمسح */
          upd: function(path,plain,deltas,unions){
            try{
              var o = clean(plain||{});
              Object.keys(deltas||{}).forEach(function(k){ o[k] = F.increment(deltas[k]); });
              Object.keys(unions||{}).forEach(function(k){ o[k] = F.arrayUnion.apply(null,clean(unions[k])); });
              track(F.updateDoc(F.doc(fs,root+path),o),'upd '+path);
            }catch(e){ onErr(e); }
            return Promise.resolve();
          },
          /* رقم فاتورة متسلسل للمحل كله (محتاج نت). floor = أكبر رقم الجهاز شايفه */
          nextNo: function(floor){
            var ref = F.doc(fs,root+'meta/counter');
            var tx = F.runTransaction(fs,function(t){
              return t.get(ref).then(function(s){
                var n = Math.max(s.exists() ? (+s.data().seq||0) : 0, +floor||0) + 1;
                t.set(ref,{seq:n});
                return n;
              });
            });
            return Promise.race([tx,new Promise(function(_,rej){ setTimeout(function(){ rej({code:'timeout'}); },12000); })]);
          }
        };
      },
      /* إنشاء حساب لعميل من غير ما يتسجّل خروج الأدمن (تطبيق تاني جوه نفس الصفحة) */
      createUser: function(email,pass){
        var sec;
        try{ sec = A.getApp('sec'); }catch(e){ sec = A.initializeApp(CFG,'sec'); }
        var sa = Au.getAuth(sec);
        return Au.createUserWithEmailAndPassword(sa,email,pass).then(function(c){
          var uid = c.user.uid;
          return Au.signOut(sa).then(function(){ return uid; });
        });
      }
    };
    fire('fb-ready');
  }).catch(function(e){
    window.FB_ERR = e;
    fire('fb-failed');
  });
})();