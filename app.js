/* ---------- Question data (JSON-shaped; move to questions.json if you prefer) ---------- */
const QUESTIONS = [
  {"id":1,"subject":"Mathematics","q":"What is 15% of 200?","options":["20","30","35","25"],"answer":1,"explain":"10% of 200 is 20 and 5% is 10, so 15% is 30."},
  {"id":2,"subject":"Mathematics","q":"Solve for x: 3x + 4 = 19","options":["x = 5","x = 6","x = 7","x = 4"],"answer":0,"explain":"Subtract 4 from both sides to get 3x = 15, then divide by 3."},
  {"id":3,"subject":"Mathematics","q":"What is the area of a triangle with base 10 and height 6?","options":["60","30","16","36"],"answer":1,"explain":"Area = ½ × base × height = 30."},
  {"id":4,"subject":"Science","q":"Which gas do plants absorb for photosynthesis?","options":["Oxygen","Nitrogen","Carbon dioxide","Hydrogen"],"answer":2,"explain":"Plants take in carbon dioxide and release oxygen."},
  {"id":5,"subject":"Science","q":"What is the SI unit of force?","options":["Joule","Newton","Watt","Pascal"],"answer":1,"explain":"Force is measured in newtons (N)."},
  {"id":6,"subject":"Science","q":"Which organ pumps blood around the body?","options":["Lungs","Liver","Kidney","Heart"],"answer":3,"explain":"The heart drives the circulatory system."},
  {"id":7,"subject":"English","q":"Which sentence is grammatically correct?","options":["She don’t like tea.","She doesn’t like tea.","She not like tea.","She doesn’t likes tea."],"answer":1,"explain":"With “she”, use “doesn’t” followed by the base verb."},
  {"id":8,"subject":"English","q":"A word with the opposite meaning is called a…","options":["Synonym","Homonym","Antonym","Acronym"],"answer":2,"explain":"Antonyms have opposite meanings."},
  {"id":9,"subject":"Computer","q":"What does CPU stand for?","options":["Central Processing Unit","Computer Personal Unit","Central Program Utility","Core Processing Update"],"answer":0,"explain":"The CPU executes instructions and is the main processor."},
  {"id":10,"subject":"Computer","q":"Which of these is an input device?","options":["Monitor","Printer","Keyboard","Speaker"],"answer":2,"explain":"A keyboard sends data into the computer."}
];
const ROOMS = ["Study Circle: Mathematics","Study Circle: Computer Studies","Study Partner"];

/* ---------- State ---------- */
const DAY = 864e5, INTERVALS = [1,3,7,14], KEY = "ssa_v1";
const fresh = () => ({streak:0,last:"",stats:{},review:{},chat:{},qa:[]});
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch(e) {}
S = S || fresh();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} window.Cloud && Cloud.saveProgress && Cloud.saveProgress(S); };

const SUBJECTS = [...new Set(QUESTIONS.map(q => q.subject))];
let tab = "home", run = null, room = null, stream = null;

/* ---------- Helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const dueList = () => QUESTIONS.filter(q => S.review[q.id] && S.review[q.id].due <= Date.now());
function mastery(){ let c=0,t=0; for(const k in S.stats){c+=S.stats[k].c;t+=S.stats[k].t} return t?Math.round(c/t*100):0; }
function touchStreak(){
  const t = new Date().toDateString(); if (S.last === t) return;
  const gap = S.last ? (new Date(t) - new Date(S.last)) / DAY : 99;
  S.streak = gap <= 1.5 ? S.streak + 1 : 1; S.last = t;
}

/* ---------- Navigation ---------- */
const TABS = [["home","Dashboard"],["study","Revision"],["chat","Messages"],["live","Classroom"]];
function go(t){ stopCam(); tab=t; run=null; room=null; draw(); window.scrollTo(0,0); }
function draw(){
  document.getElementById("nav").innerHTML = TABS.map(t =>
    `<button class="${t[0]===tab?"on":""}" onclick="go('${t[0]}')">${t[1]}</button>`).join("");
  document.getElementById("app").innerHTML = ({home,study,chat:chatView,live})[tab]();
  if (tab === "live") initBoard();
  setNet();
  const m = document.querySelector(".msgs"); if (m) m.scrollTop = m.scrollHeight;
}

/* ---------- Dashboard ---------- */
function home(){
  const d = dueList().length;
  return `<h1>Dashboard</h1>
  <p class="lead">Your study progress at a glance.</p>
  <div class="stats">
    <div><b>${S.streak}</b><span>Day streak</span></div>
    <div><b>${mastery()}%</b><span>Overall mastery</span></div>
    <div><b>${d}</b><span>Due for review</span></div>
  </div>
  <div class="panel">
    <strong>Today</strong>
    <p class="note">${d ? `${d} previously missed question${d>1?"s are":" is"} ready for review.` : "No reviews due. Start a new quiz to keep your streak going."}</p>
    <div class="actions">
      <button onclick="startRun('${d?"review":"all"}')">${d?"Review now":"Start a quiz"}</button>
      <button class="ghost" onclick="go('live')">Open classroom</button>
    </div>
  </div>
  <h2>Subject progress</h2>
  <div class="list">${SUBJECTS.map(s => {
    const x = S.stats[s] || {c:0,t:0}, p = x.t ? Math.round(x.c/x.t*100) : 0;
    return `<div class="item"><div style="flex:1"><div style="display:flex;justify-content:space-between"><span>${s}</span><span class="note">${p}% &middot; ${x.t} answered</span></div><div class="meter"><i style="width:${p}%"></i></div></div></div>`;
  }).join("")}</div>
  <div class="actions"><button class="ghost small" onclick="resetAll()">Reset progress</button></div>`;
}

/* ---------- Revision hub ---------- */
function startRun(mode){
  let list = mode==="review" ? dueList() : QUESTIONS.filter(q => mode==="all" || q.subject===mode);
  if (!list.length) return;
  run = {list:[...list].sort(()=>Math.random()-.5), i:0, sel:null, score:0};
  tab = "study"; draw();
}
function study(){
  if (!run) {
    const d = dueList().length;
    return `<h1>Revision</h1><p class="lead">Choose a subject or review questions you missed.</p>
    ${d?`<div class="panel"><strong>${d} due for review</strong><div class="actions"><button onclick="startRun('review')">Review missed questions</button></div></div>`:""}
    <h2>Subjects</h2>
    <div class="list">${SUBJECTS.map(s => `<div class="item"><div>${s}<div class="note">${QUESTIONS.filter(q=>q.subject===s).length} questions</div></div><button class="small" onclick="startRun('${s}')">Begin</button></div>`).join("")}</div>
    <div class="actions"><button class="ghost" onclick="startRun('all')">Mixed quiz, all subjects</button></div>`;
  }
  if (run.i >= run.list.length)
    return `<h1>Session complete</h1><div class="panel"><div class="score">${run.score} / ${run.list.length}</div>
    <p class="note">Questions you missed have been scheduled for review.</p>
    <div class="actions"><button onclick="go('study')">Back to subjects</button><button class="ghost" onclick="go('home')">Dashboard</button></div></div>`;
  const q = run.list[run.i], L = "ABCD";
  return `<p class="note" style="margin-top:20px">${q.subject} &middot; Question ${run.i+1} of ${run.list.length}</p>
  <div class="progress"><i style="width:${run.i/run.list.length*100}%"></i></div>
  <div class="panel"><p class="q">${q.q}</p>
  ${q.options.map((o,j) => {
    let c = "opt"; if (run.sel!==null) { if (j===q.answer) c+=" ok"; else if (j===run.sel) c+=" bad"; }
    return `<button class="${c}" ${run.sel!==null?"disabled":""} onclick="pick(${j})"><span class="k">${L[j]}</span><span>${o}</span></button>`;
  }).join("")}
  ${run.sel!==null ? `<div class="feedback"><strong>${run.sel===q.answer?"Correct.":"Incorrect."}</strong> <span class="note">${q.explain}</span>
    <div class="actions"><button onclick="run.i++;run.sel=null;draw()">${run.i+1<run.list.length?"Next question":"Finish"}</button></div></div>` : ""}
  </div><button class="ghost small" onclick="go('study')">End session</button>`;
}
function pick(j){
  if (run.sel !== null) return;
  const q = run.list[run.i]; run.sel = j; touchStreak();
  const x = S.stats[q.subject] = S.stats[q.subject] || {c:0,t:0}; x.t++;
  if (j === q.answer) {
    x.c++; run.score++;
    const r = S.review[q.id];
    if (r) { r.box++; if (r.box >= INTERVALS.length) delete S.review[q.id]; else r.due = Date.now() + INTERVALS[r.box]*DAY; }
  } else S.review[q.id] = {box:0, due:Date.now()+DAY};
  save(); draw();
}

/* ---------- Classroom ---------- */
function live(){
  return `<h1>Classroom</h1><p class="lead">Study room tools.</p>
  <div class="panel"><strong>Video</strong><video id="v" autoplay playsinline muted style="margin-top:10px"></video>
    <div class="actions" style="margin-top:0"><button onclick="startCam()">Start camera</button><button class="ghost" onclick="stopCam()">Stop</button></div>
    <p class="note" id="cm">Local preview only. Video between participants requires a server.</p></div>
  <div class="panel"><strong>Whiteboard</strong><div style="margin-top:10px"><canvas id="wb" width="600" height="360"></canvas></div>
    <div class="actions"><button class="ghost small" onclick="clearBoard()">Clear board</button></div></div>
  <div class="panel"><strong>Question queue</strong>
    <div class="row" style="margin:10px 0"><input type="text" id="qi" placeholder="Add a question"><button onclick="addQ()">Add</button></div>
    ${S.qa.map((q,i)=>`<div class="qa"><span>${esc(q)}</span><button class="ghost small" onclick="S.qa.splice(${i},1);save();draw()">Resolved</button></div>`).join("") || '<span class="note">The queue is empty.</span>'}</div>`;
}
function addQ(){ const v = document.getElementById("qi").value.trim(); if (v) { S.qa.push(v); save(); draw(); } }
async function startCam(){
  try { stream = await navigator.mediaDevices.getUserMedia({video:true}); document.getElementById("v").srcObject = stream; }
  catch(e) { document.getElementById("cm").textContent = "Camera is unavailable or permission was denied."; }
}
function stopCam(){ if (stream) { stream.getTracks().forEach(t=>t.stop()); stream = null; } const v = document.getElementById("v"); if (v) v.srcObject = null; }
let cv, cx, drawing = false;
function initBoard(){
  cv = document.getElementById("wb"); cx = cv.getContext("2d");
  cx.lineWidth = 3; cx.lineCap = "round"; cx.strokeStyle = "#1c1f23";
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX-r.left)*cv.width/r.width, (e.clientY-r.top)*cv.height/r.height]; };
  cv.onpointerdown = e => { drawing = true; const [x,y] = pt(e); cx.beginPath(); cx.moveTo(x,y); };
  cv.onpointermove = e => { if (!drawing) return; const [x,y] = pt(e); cx.lineTo(x,y); cx.stroke(); };
  cv.onpointerup = cv.onpointerleave = () => drawing = false;
}
function clearBoard(){ cx.clearRect(0,0,cv.width,cv.height); }

function resetAll(){ if (confirm("Reset all progress and messages?")) { S = fresh(); save(); draw(); } }
window.addEventListener("cloud-progress", e => {
  Object.assign(S, e.detail); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(x) {}
  const d = dueList().length;
  if (d) Cloud.notify("Revision due", d + " question" + (d > 1 ? "s are" : " is") + " ready to review.");
  draw();
});
function setNet(){
  const off = !navigator.onLine, b = document.getElementById("offline"); if (b) b.hidden = !off;
  const i = document.getElementById("cs-in"); if (i) { i.disabled = off; i.placeholder = off ? "Offline: messages can’t be sent" : "Message"; }
}
window.addEventListener("online", setNet); window.addEventListener("offline", setNet);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
draw();
