// Firebase の初期化、オフライン保存の設定、ログイン／ログアウト。
import { firebaseConfig } from "../firebase-config.js";
import { ADMIN_UID } from "../app-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 電波が無いときの書き込みは端末に溜め、つながったら自動で送る。複数タブで開いても共有する。
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const provider = new GoogleAuthProvider();
getRedirectResult(auth).catch((e) => console.warn("リダイレクトでのログインに失敗しました", e));

export function isAdmin(user) {
  return !!user && user.uid === ADMIN_UID;
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    if (e.code === "auth/unauthorized-domain") {
      throw new Error(`このサイト（${location.hostname}）は Firebase でログインが許可されていません。`);
    }
    throw new Error(`ログインできませんでした（${e.code || e.message}）`);
  }
}

export function logout() {
  return signOut(auth);
}
