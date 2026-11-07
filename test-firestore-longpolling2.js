import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, config.firestoreDatabaseId);

console.log("DB initialized with auto detect long polling");
