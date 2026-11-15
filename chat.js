/* Chat UI. Needs cloud.js (window.Cloud) and helpers from app.js (esc, draw, tab). */
let csGroup = null, csGroups = [], csUnsub = null, csWatch = null, csMsgs = [];
let csSignup = false, csNew = false, csErr = "", csSeen = {}, csUnread = {};

window.addEventListener("cloud-auth", () => {
  if (Cloud.user && !csWatch) csWatch = Cloud.watchGroups(csGroupsIn);
  if (!Cloud.user && csWatch) { csWatch(); csWatch = null; csGroups = []; csSeen = {}; csClose(true); }
  if (tab === "chat" && !csGroup) draw();
});

function csGroupsIn(gs) {
  const me = Cloud.user.uid;
  gs.forEach(g => {
    const at = g.lastMsg ? g.lastMsg.at : 0, prev = csSeen[g.id];
    if (prev !== undefined && at !== prev && g.lastMsg.uid !== me) {
      if (csGroup !== g.id) csUnread[g.id] = (csUnread[g.id] || 0) + 1;
      if (csGroup !== g.id || document.hidden) Cloud.notify(csName(g), g.lastMsg.name + ": " + g.lastMsg.text);
    }
    csSeen[g.id] = at;
  });
  csGroups = gs.sort((a, b) => (b.lastMsg ? b.lastMsg.at : 0) - (a.lastMsg ? a.lastMsg.at : 0));
  if (tab === "chat" && !csGroup && !csNew && Cloud.user) draw();
}

const csOtherId = g => (g.members || []).find(x => x !== Cloud.user.uid);
const csName = g => g.dm ? ((g.names || {})[csOtherId(g)] || "Chat") : g.name;
const csHue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const csAv = (n, big) => `<span class="wa-av${big ? " big" : ""}" style="background:hsl(${csHue(n)},45%,42%)">${esc(n.charAt(0).toUpperCase())}</span>`;
const csTime = t => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" }); };

function chatView() {
  if (!window.Cloud || !Cloud.ready) return `<div class="wa-wrap"><p class="note" style="padding:24px">${navigator.onLine ? "Loading…" : "You are offline. Connect to the internet to load chat."}</p></div>`;
  if (!Cloud.configured) return `<h1>Messages</h1><div class="panel"><strong>Cloud not configured</strong><p class="note">Add your Firebase settings to firebase-config.js to turn on accounts and group chat.</p></div>`;
  if (!Cloud.user) return csAuthView();
  if (csGroup) return csConvView();
  if (csNew) return csNewView();
  return csListView();
}

/* ---------- Sign in / create account ---------- */
function csAuthView() {
  return `<h1>${csSignup ? "Create account" : "Sign in"}</h1>
  <p class="lead">Your progress and messages are saved to your account.</p>
  <div class="panel">
    ${csSignup ? `<p><input type="text" id="cs-name" placeholder="Full name" autocomplete="name"></p>` : ""}
    <p><input type="text" id="cs-email" placeholder="Email" inputmode="email" autocomplete="email"></p>
    <p><input type="password" id="cs-pw" placeholder="Password (6+ characters)" autocomplete="${csSignup ? "new-password" : "current-password"}"></p>
    ${csErr ? `<p class="note" style="color:var(--bad)">${esc(csErr)}</p>` : ""}
    <div class="actions"><button onclick="csAuth()">${csSignup ? "Create account" : "Sign in"}</button>
    <button class="ghost" onclick="csSignup=!csSignup;csErr='';draw()">${csSignup ? "I have an account" : "Create an account"}</button></div>
  </div>`;
}
function csNeedNet() { if (navigator.onLine) return false; alert("You are offline. Connect to the internet to do this."); return true; }
async function csAuth() {
  if (csNeedNet()) return;
  const v = id => (document.getElementById(id) || {}).value || "";
  const email = v("cs-email").trim(), pw = v("cs-pw"), name = v("cs-name").trim();
  if (csSignup && !name) { csErr = "Please enter your name."; return draw(); }
  try { csErr = ""; csSignup ? await Cloud.signUp(name, email, pw) : await Cloud.signIn(email, pw); }
  catch (e) { csErr = (e.code || e.message || "Error").replace("auth/", "").replace(/-/g, " "); draw(); }
}

/* ---------- Chat list ---------- */
function csListView() {
  const rows = csGroups.map(g => {
    const u = csUnread[g.id] || 0, l = g.lastMsg;
    return `<div class="wa-row" onclick="csOpen('${g.id}')">${csAv(csName(g), true)}
      <div class="wa-mid"><div class="wa-top"><b>${esc(csName(g))}</b><span class="${u ? "hot" : ""}">${l ? csTime(l.at) : ""}</span></div>
      <div class="wa-top"><span class="wa-prev">${l ? esc(l.name.split(" ")[0]) + ": " + esc(l.text) : "No messages yet"}</span>${u ? `<i class="wa-badge">${u}</i>` : ""}</div></div></div>`;
  }).join("");
  return `<div class="wa-wrap"><div class="wa-head"><span class="wa-title">Chats</span>
    <span><button class="wa-btn" onclick="csNew=true;csErr='';draw()">New chat</button><button class="wa-btn" onclick="Cloud.signOut()">Sign out</button></span></div>
    ${"Notification" in window && Notification.permission === "default" ? `<div class="wa-banner" onclick="Cloud.askNotify()">Turn on notifications for new messages</div>` : ""}
    ${rows || '<p class="note" style="padding:24px">No chats yet.</p>'}</div>`;
}

/* ---------- New group / join by code ---------- */
function csNewView() {
  return `<div class="wa-wrap"><div class="wa-head"><span class="wa-title">New chat</span><button class="wa-btn" onclick="csNew=false;draw()">Cancel</button></div>
  <div style="padding:16px"><div class="panel"><strong>Message someone by email</strong><p class="note">They need a Cohort account with that email.</p><p><input type="text" id="cs-ge" placeholder="friend@example.com" inputmode="email" autocapitalize="none"></p>
  <button onclick="csDM()">Start chat</button></div>
  <div class="panel"><strong>Create a group</strong><p><input type="text" id="cs-gn" placeholder="Group name"></p>
  <button onclick="csCreate()">Create group</button></div>
  <div class="panel"><strong>Join with a code</strong><p><input type="text" id="cs-gc" placeholder="Group code" autocapitalize="characters"></p>
  <button onclick="csJoin()">Join group</button></div>
  ${csErr ? `<p class="note" style="color:var(--bad)">${esc(csErr)}</p>` : ""}</div></div>`;
}
async function csDM() {
  if (csNeedNet()) return;
  const e = document.getElementById("cs-ge").value; if (!e.trim()) return;
  try { const id = await Cloud.startDM(e); csNew = false; csErr = ""; csOpen(id); } catch (x) { csErr = x.message; draw(); }
}
async function csCreate() {
  if (csNeedNet()) return;
  const n = document.getElementById("cs-gn").value.trim(); if (!n) return;
  try { const id = await Cloud.createGroup(n); csNew = false; csOpen(id); } catch (e) { csErr = e.message; draw(); }
}
async function csJoin() {
  if (csNeedNet()) return;
  const c = document.getElementById("cs-gc").value; if (!c.trim()) return;
  try { const id = await Cloud.joinGroup(c); csNew = false; csOpen(id); } catch (e) { csErr = e.message; draw(); }
}

/* ---------- Conversation ---------- */
function csOpen(id) {
  csGroup = id; csUnread[id] = 0; csMsgs = [];
  if (csUnsub) csUnsub();
  csUnsub = Cloud.watchMessages(id, m => { csMsgs = m; csPaint(); });
  document.body.classList.add("in-chat"); draw();
}
function csClose(silent) {
  if (csUnsub) csUnsub(); csUnsub = null; csGroup = null; csNew = false;
  document.body.classList.remove("in-chat"); if (!silent) draw();
}
function csConvView() {
  const g = csGroups.find(x => x.id === csGroup) || { name: "Chat", members: [] };
  return `<div class="wa-conv"><div class="wa-chead"><button class="wa-back" onclick="csClose()" aria-label="Back">&#8592;</button>${csAv(csName(g))}
    <div><b>${esc(csName(g))}</b><div class="wa-sub">${g.dm ? esc((g.emails || {})[csOtherId(g)] || "") : ""}${g.dm ? "" : g.live ? '<span class="wa-live"></span>Live chat &middot; ' : ""}${(g.members || []).length} members &middot; code ${esc(g.code || "")}</div></div></div>
    <div class="wa-msgs" id="cs-msgs"></div>
    <div class="wa-compose"><input type="text" id="cs-in" placeholder="Message" autocomplete="off" onkeydown="if(event.key==='Enter')csSend()"><button class="wa-send" onclick="csSend()" aria-label="Send">&#10148;</button></div></div>`;
}
function csPaint() {
  const el = document.getElementById("cs-msgs"); if (!el) return;
  const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120 || !el.children.length, me = Cloud.user.uid;
  el.innerHTML = csMsgs.map(m => {
    const mine = m.uid === me;
    return `<div class="wa-b ${mine ? "out" : "in"}">${mine ? "" : `<div class="wa-who" style="color:hsl(${csHue(m.name)},55%,45%)">${esc(m.name)}</div>`}${esc(m.text)}<span class="wa-t">${csTime(m.at)}</span></div>`;
  }).join("");
  if (near) el.scrollTop = el.scrollHeight;
}
function csSend() {
  if (csNeedNet()) return;
  const i = document.getElementById("cs-in"), t = i.value.trim(); if (!t) return;
  i.value = ""; Cloud.send(csGroup, t).catch(e => alert("Message not sent: " + e.message));
      }
