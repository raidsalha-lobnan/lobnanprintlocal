import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const unsub = onSnapshot(doc(db, 'userSessions', 'test@test.com'), (snap) => {
  console.log('Snapshot received:', snap.exists());
  unsub();
  process.exit(0);
}, (err) => {
  console.error('Error:', err);
  process.exit(1);
});
