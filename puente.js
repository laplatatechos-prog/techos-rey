// Puente de Techos Rey · Clientes: la app corre como página propia (sin Claude).
// Base = Supabase (tabla tr_docs), dictado = micrófono de Chrome, voz = la del celular, avisos = notificaciones push.
(function(){
var SB="https://dowtczgckcuvxwpgqcpq.supabase.co";
var KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvd3Rjemdja2N1dnh3cGdxY3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzM1MjIsImV4cCI6MjEwODg0OTUyMn0.zN23LvcbY2BlMxe-kqp0MV8nucmY2bKV1foeqd6Vx8E";
var FN=SB+"/functions/v1/tr-avisos";
function rest(p,op){op=op||{};op.headers=Object.assign({apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"},op.headers||{});
  return fetch(SB+"/rest/v1/"+p,op).then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t||r.status)});return r.status==204?null:r.text().then(function(t){return t?JSON.parse(t):null})})}

/* ---------- base de datos (imita la de Claude) ---------- */
var cache={},firmas={},subs=[];
function nuevoId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,9)}
function refrescar(cols){cols=cols||Object.keys(firmas);if(!cols.length)return Promise.resolve();
  return rest("tr_docs?select=col,id,data&col=in.("+cols.map(encodeURIComponent).join(",")+")").then(function(rows){
    var por={};cols.forEach(function(c){por[c]={}});rows.forEach(function(r){(por[r.col]=por[r.col]||{})[r.id]=r.data});
    cols.forEach(function(c){var f=JSON.stringify(por[c]);if(f===firmas[c])return;firmas[c]=f;cache[c]=por[c];
      var docs=Object.keys(por[c]).map(function(id){var d=por[c][id];return{id:id,data:function(){return JSON.parse(JSON.stringify(d))}}});
      subs.filter(function(s){return s.col==c}).forEach(function(s){try{s.cb({docs:docs})}catch(e){console.error(e)}})});
  }).catch(function(e){subs.forEach(function(s){if(s.err&&!s._avisado){s._avisado=1;s.err({code:"sin_conexion",message:String(e)})}})})}
setInterval(function(){if(document.visibilityState=="visible")refrescar()},8000);
document.addEventListener("visibilitychange",function(){if(document.visibilityState=="visible")refrescar()});
var db={
  collection:function(col){return{
    onSnapshot:function(cb,err){subs.push({col:col,cb:cb,err:err});if(!(col in firmas))firmas[col]=null;refrescar([col]);return function(){}},
    add:function(data){var id=nuevoId();return rest("tr_docs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({col:col,id:id,data:data})}).then(function(){(cache[col]=cache[col]||{})[id]=data;refrescar([col]);return{id:id}})}
  }},
  doc:function(path){var p=path.split("/"),col=p[0],id=p[1];return{
    update:function(d){return rest("tr_docs?select=data&col=eq."+encodeURIComponent(col)+"&id=eq."+encodeURIComponent(id)).then(function(r){
        var actual=(r&&r[0]&&r[0].data)||{},nuevo=Object.assign({},actual,d);
        return rest("tr_docs",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({col:col,id:id,data:nuevo,updated_at:new Date().toISOString()})})
      }).then(function(){refrescar([col])})},
    set:function(d){return rest("tr_docs",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({col:col,id:id,data:d,updated_at:new Date().toISOString()})}).then(function(){refrescar([col])})}
  }}
};

/* ---------- dictado con el micrófono de Chrome ---------- */
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,dictado=null;
if(SR){var L={p:[],f:[],s:[]},rec=null;function emit(k,v){L[k].slice().forEach(function(f){try{f(v)}catch(e){}})}
  function quitar(k,f){return function(){L[k]=L[k].filter(function(x){return x!==f})}}
  dictado={
    start:function(){return new Promise(function(res,rej){try{if(rec){try{rec.abort()}catch(e){}}
      rec=new SR();rec.lang="es-AR";rec.continuous=true;rec.interimResults=true;var parado=false;
      rec.onstart=function(){emit("s",{state:"listening"});res()};
      rec.onresult=function(e){var parcial="";for(var i=e.resultIndex;i<e.results.length;i++){var t=e.results[i][0].transcript;if(e.results[i].isFinal)emit("f",{text:t.trim()});else parcial+=t}emit("p",{text:parcial})};
      rec.onerror=function(e){var c=e.error=="not-allowed"||e.error=="service-not-allowed"?"not_granted":e.error=="no-speech"?"stopped":"upstream_error";if(c!="stopped")rej({code:c});parado=true;emit("s",{state:"idle",reason:c})};
      rec.onend=function(){rec=null;if(!parado)emit("s",{state:"idle",reason:"stopped"})};
      emit("s",{state:"starting"});rec.start()}catch(e){rej({code:"upstream_error"})}})},
    stop:function(){if(rec){try{rec.stop()}catch(e){}}return Promise.resolve()},
    active:function(){return!!rec},
    onPartial:function(f){L.p.push(f);return quitar("p",f)},
    onFinal:function(f){L.f.push(f);return quitar("f",f)},
    onState:function(f){L.s.push(f);return quitar("s",f)}
  }}

/* ---------- quién entra ---------- */
function quien(){try{return localStorage.getItem("tr_quien")||""}catch(e){return""}}
var listoQuien=new Promise(function(res){
  if(quien())return res();
  function pedir(){var d=document.createElement("div");d.id="quienEntra";
    d.innerHTML='<div class="qe-caja"><svg width="46" height="38" viewBox="0 0 26 22" aria-hidden="true"><path d="M3 9 L7 3 L13 7 L19 3 L23 9 Z" fill="#c4951a"/><path d="M2 21 L13 11 L24 21 Z" fill="none" stroke="#16264a" stroke-width="2.2" stroke-linejoin="round"/></svg><h2>¿Quién entra?</h2><button data-q="Rafael">Rafael</button><button data-q="Laura">Laura</button></div>';
    document.body.appendChild(d);d.querySelectorAll("[data-q]").forEach(function(b){b.onclick=function(){try{localStorage.setItem("tr_quien",b.dataset.q)}catch(e){}d.remove();res()}})}
  if(document.body)pedir();else document.addEventListener("DOMContentLoaded",pedir)});
var user={me:function(){return listoQuien.then(function(){return{name:quien()}})}};

/* ---------- avisos al celular ---------- */
window.TR={
  quien:quien,
  cambiarQuien:function(){try{localStorage.removeItem("tr_quien")}catch(e){}location.reload()},
  avisosEstado:function(){if(!("serviceWorker" in navigator)||!("PushManager" in window))return Promise.resolve("no");
    if(Notification.permission=="denied")return Promise.resolve("bloqueado");
    return navigator.serviceWorker.getRegistration().then(function(r){return r?r.pushManager.getSubscription():null}).then(function(s){return s?"activo":"apagado"})},
  activarAvisos:function(){
    return Notification.requestPermission().then(function(p){if(p!="granted")throw new Error("permiso");return navigator.serviceWorker.register("sw.js")})
    .then(function(){return navigator.serviceWorker.ready}).then(function(reg){return fetch(FN).then(function(r){return r.json()}).then(function(j){
      var k=j.pub.replace(/-/g,"+").replace(/_/g,"/");k+="===".slice((k.length+3)%4);var raw=atob(k),arr=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
      return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr})})})
    .then(function(sub){return fetch(FN,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({suscribir:{persona:quien(),sub:sub.toJSON()}})})})
    .then(function(){return fetch(FN,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({probar:true})})})},
  gcalLink:function(a,c){var f=a.fecha.replace(/-/g,""),url="https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(a.que+" – "+(c.nombre||""))+"&location="+encodeURIComponent([c.direccion,c.zona].filter(Boolean).join(", "))+"&details="+encodeURIComponent("Techos Rey · Clientes"+(c.telefono?"\nTel "+c.telefono:""));
    if(a.hora){var h=a.hora.replace(":",""),fin=new Date(a.fecha+"T"+a.hora+":00");fin.setHours(fin.getHours()+1);url+="&dates="+f+"T"+h+"00/"+fin.getFullYear()+("0"+(fin.getMonth()+1)).slice(-2)+("0"+fin.getDate()).slice(-2)+"T"+("0"+fin.getHours()).slice(-2)+("0"+fin.getMinutes()).slice(-2)+"00&ctz=America/Argentina/Buenos_Aires"}
    else{var d=new Date(a.fecha+"T12:00:00");d.setDate(d.getDate()+1);url+="&dates="+f+"/"+d.getFullYear()+("0"+(d.getMonth()+1)).slice(-2)+("0"+d.getDate()).slice(-2)}
    return url}
};
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(function(){});

window.claude={use:function(n){return Promise.resolve(n=="db"?db:n=="dictation"?dictado:n=="user"?user:null)}};
})();
