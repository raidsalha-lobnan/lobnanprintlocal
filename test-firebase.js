import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function test() {
  try {
    console.log('Testing write...');
    await setDoc(doc(db, 'appState', 'accountingState'), { test: "data" });
    console.log('Write successful');
    process.exit(0);
  } catch(e) {
    console.error('Write failed:', e.message);
    process.exit(1);
  }
}
test();
