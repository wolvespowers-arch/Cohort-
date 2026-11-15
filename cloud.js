import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, limit, onSnapshot, updateDoc, arrayUnion, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const emit = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d }));
const Cloud = { configured: !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE"), user: null, ready: false };
window.Cloud = Cloud;

/* ---- Notifications (work without Firebase) ---- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
Cloud.askNotify = () => Notification.requestPermission().then(() => emit("cloud-auth"));
Cloud.notify = async (title, body) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { const r = await navigator.serviceWorker.getRegistration(); if (r) return r.showNotification(title, { body, tag: title }); } catch (e) {}
  try { new Notification(title, { body }); } catch (e) {}
};

if (!Cloud.configured) { Cloud.ready = true; emit("cloud-auth"); }
else {
  const app = initializeApp(firebaseConfig), auth = getAuth(app), db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const LIVE = "live-classroom";
  const uid = () => auth.currentUser.uid;
  Cloud.me = () => ({ uid: auth.currentUser.uid, name: auth.currentUser.displayName || "Student" });

  /* ---- Accounts ---- */
  Cloud.signUp = async (name, email, pw) => {
    const c = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(c.user, { displayName: name });
    await setDoc(doc(db, "users", c.user.uid), { name, email, created: serverTimestamp() });
    await setDoc(doc(db, "directory", email.trim().toLowerCase()), { uid: c.user.uid, name });
    emit("cloud-auth");
  };
  Cloud.signIn = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
  Cloud.signOut = () => signOut(auth);

  /* ---- Per-user study data ---- */
  let t;
  Cloud.saveProgress = p => {
    if (!auth.currentUser) return;
    clearTimeout(t);
    t = setTimeout(() => setDoc(doc(db, "users", uid(), "progress", "main"),
      { stats: p.stats, review: p.review, streak: p.streak, last: p.last, qa: p.qa, updated: Date.now() }).catch(() => {}), 1500);
  };

  /* ---- Groups and live messages ---- */
  async function joinLive(u) {
    const ref = doc(db, "groups", LIVE), s = await getDoc(ref);
    if (!s.exists()) await setDoc(ref, { name: "Live Classroom", dm: false, members: [u.uid], createdBy: u.uid, code: "LIVE", live: true, ts: serverTimestamp() });
    else if (!s.data().members.includes(u.uid)) await updateDoc(ref, { members: arrayUnion(u.uid) });
  }
  Cloud.watchGroups = cb => onSnapshot(query(collection(db, "groups"), where("members", "array-contains", uid())),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  Cloud.createGroup = async name => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    return (await addDoc(collection(db, "groups"), { name, dm: false, members: [uid()], createdBy: uid(), code, ts: serverTimestamp() })).id;
  };
  Cloud.joinGroup = async code => {
    const s = await getDocs(query(collection(db, "groups"), where("code", "==", code.trim().toUpperCase()), where("dm", "==", false)));
    if (s.empty) throw new Error("No group found with that code.");
    await updateDoc(s.docs[0].ref, { members: arrayUnion(uid()) });
    return s.docs[0].id;
  };
  Cloud.startDM = async email => {
    email = email.trim().toLowerCase();
    const me = Cloud.me(), mine = (auth.currentUser.email || "").toLowerCase();
    if (email === mine) throw new Error("That is your own email.");
    const f = await getDoc(doc(db, "directory", email));
    if (!f.exists()) throw new Error("No Cohort account uses that email yet. Ask them to sign up first.");
    const other = f.data(), id = "dm_" + [me.uid, other.uid].sort().join("_");
    await setDoc(doc(db, "groups", id), { dm: true, name: "", code: "", members: [me.uid, other.uid],
      names: { [me.uid]: me.name, [other.uid]: other.name }, emails: { [me.uid]: mine, [other.uid]: email } }, { merge: true });
    return id;
  };
  Cloud.watchMessages = (id, cb) => onSnapshot(query(collection(db, "groups", id, "messages"), orderBy("at"), limit(200)),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  Cloud.send = async (id, text) => {
    const m = Cloud.me(), at = Date.now();
    await addDoc(collection(db, "groups", id, "messages"), { text, uid: m.uid, name: m.name, at });
    await updateDoc(doc(db, "groups", id), { lastMsg: { text, name: m.name, uid: m.uid, at } });
  };

  onAuthStateChanged(auth, async u => {
    Cloud.user = u; Cloud.ready = true;
    if (u) {
      try { await joinLive(u); } catch (e) {}
      try { await setDoc(doc(db, "directory", (u.email || "").toLowerCase()), { uid: u.uid, name: u.displayName || "Student" }); } catch (e) {}
      try { const p = await getDoc(doc(db, "users", u.uid, "progress", "main")); if (p.exists()) emit("cloud-progress", p.data()); } catch (e) {}
    }
    emit("cloud-auth");
  });
}
