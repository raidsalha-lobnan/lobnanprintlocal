import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.example.json';

// Silence non-fatal internal SDK connection warnings (e.g. 10s backend unreachable notice)
try {
  setLogLevel('error');
} catch {}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

console.log("Firebase initialized.");

export const auth = getAuth(app);

const dbId = (firebaseConfig as any).firestoreDatabaseId;

let firestoreInstance;
try {
  // Firestore persistence was previously only logged, not actually enabled.
  // Multi-tab persistent cache is independent of our durable business outbox.
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  }, dbId);
} catch (error) {
  console.warn('Persistent Firestore cache unavailable; business outbox remains separate', error);
  firestoreInstance = getFirestore(app, dbId);
}

export const db = firestoreInstance;

console.log("Firestore initialized with persistent local cache & database ID:", dbId || '(default)');

const LOCAL_PG_MODE = import.meta.env.VITE_SYNC_BACKEND === 'local-postgres';

// Installed only after a durable workspace repository is initialized.
// Returns true if the write has been persisted to the outbox; false to use the
// legacy Firebase call for unsupported special-purpose collections.
type DurableWriter = (
  operation: 'set' | 'delete', reference: any, payload?: any, options?: any
) => Promise<boolean>;
let durableWriter: DurableWriter | null = null;
export function registerDurableWriter(writer: DurableWriter): () => void {
  durableWriter = writer;
  return () => { if (durableWriter === writer) durableWriter = null; };
}


// Tracked wrappers for real-time accurate quota metering with preserved TypeScript overloaded signatures
const trackedGetDoc = (async (...args: any[]) => {
  if (LOCAL_PG_MODE) throw new Error('LEGACY_FIREBASE_READ_BLOCKED');
  const snapshot = await (getDoc as any)(...args);
  if (snapshot && snapshot.metadata?.fromCache !== true) {
  }
  return snapshot;
}) as typeof getDoc;

const trackedGetDocFromServer = ((...args: any[]) => {
  if (LOCAL_PG_MODE) return Promise.reject(new Error('LEGACY_FIREBASE_READ_BLOCKED')) as any;
  return (getDocFromServer as any)(...args);
}) as typeof getDocFromServer;

const trackedGetDocs = (async (...args: any[]) => {
  if (LOCAL_PG_MODE) throw new Error('LEGACY_FIREBASE_READ_BLOCKED');
  const snapshot = await (getDocs as any)(...args);
  if (snapshot) {
    const fromCache = snapshot.metadata?.fromCache === true;
    if (!fromCache) {
      if (snapshot.docs) {
      } else {
      }
    }
  }
  return snapshot;
}) as typeof getDocs;

const trackedSetDoc = ((...args: any[]) => {
  if (durableWriter) {
    return durableWriter('set', args[0], args[1], args[2]).then(handled => {
      if (handled) return;
      if (LOCAL_PG_MODE) throw new Error('LEGACY_FIREBASE_WRITE_BLOCKED');
      return (setDoc as any)(...args);
    });
  }
  if (LOCAL_PG_MODE) return Promise.reject(new Error('LEGACY_FIREBASE_WRITE_BLOCKED')) as any;
  return (setDoc as any)(...args);
}) as typeof setDoc;

const trackedDeleteDoc = ((...args: any[]) => {
  if (durableWriter) {
    return durableWriter('delete', args[0]).then(handled => {
      if (handled) return;
      if (LOCAL_PG_MODE) throw new Error('LEGACY_FIREBASE_DELETE_BLOCKED');
      return (deleteDoc as any)(...args);
    });
  }
  if (LOCAL_PG_MODE) return Promise.reject(new Error('LEGACY_FIREBASE_DELETE_BLOCKED')) as any;
  return (deleteDoc as any)(...args);
}) as typeof deleteDoc;

const trackedOnSnapshot = ((...args: any[]) => {
  if (LOCAL_PG_MODE) {
    // The canonical event feed is handled by LocalHttpSyncTransport.
    // Fail closed instead of connecting to any old Firestore namespace.
    const errorCallback = args.find((v:any,i:number)=>i>1 && typeof v==='function');
    if (errorCallback) queueMicrotask(()=>errorCallback(new Error('LEGACY_FIREBASE_LISTENER_BLOCKED')));
    return (()=>{}) as any;
  }
  // Find listener callback function in arguments
  let callbackIndex = -1;
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] === 'function') {
      callbackIndex = i;
      break;
    }
  }

  if (callbackIndex !== -1) {
    const originalCallback = args[callbackIndex];
    args[callbackIndex] = (snapshot: any) => {
      if (snapshot) {
        // If snapshot data is served from local IndexedDB cache, 0 cloud quota is consumed!
        const fromCache = snapshot.metadata?.fromCache === true;
        if (!fromCache) {
          try {
            if (typeof snapshot.docChanges === 'function') {
              const changes = snapshot.docChanges();
              if (changes && changes.length > 0) {
                const serverChanges = changes.filter((c: any) => !c.doc?.metadata?.hasPendingWrites);
                if (serverChanges.length > 0) {
                }
              }
            } else if (snapshot.docs) {
            }
          } catch {}
        }
      }
      return originalCallback(snapshot);
    };
  }

  return (onSnapshot as any)(...args);
}) as typeof onSnapshot;

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  doc,
  collection,
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
  trackedSetDoc as setDoc,
  trackedDeleteDoc as deleteDoc,
  writeBatch,
  trackedOnSnapshot as onSnapshot,
  query,
  where,
  orderBy,
  limit,
  trackedGetDocFromServer as getDocFromServer
};
