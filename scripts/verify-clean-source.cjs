#!/usr/bin/env node
// Conservative source-package safety gate. Intended for a FRESH repository.
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const bad=[];const mustNot=[
 'master_drive_database_snapshot.json',
 'public/master_drive_database_snapshot.json',
 '.sync_data/treasuries.json',
 '.firebaserc',
 '.env.production',
 '.env.local'
];
for (const x of mustNot) if (fs.existsSync(path.join(root,x)))bad.push('Sensitive/local legacy data found: '+x);
const c=path.join(root,'firebase-applet-config.json');
if(fs.existsSync(c)){
 const cfg=JSON.parse(fs.readFileSync(c,'utf8'));
 if(cfg.projectId && !String(cfg.projectId).startsWith('REPLACE_')) {
  console.log('NOTICE: Local Firebase config is set. Verify the target before any cloud deploy.');
 }
 if(cfg.firestoreDatabaseId!=='(default)')bad.push('Firestore database is not (default)');
}
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
if(!rules.includes('allow read, write: if false;'))bad.push('Rules do not match deny-all starter. Security review required.');
for(const x of ['.gitignore','package.json','src/sync-next/localDb.ts','src/sync-next/firestoreTransport.ts'])if(!fs.existsSync(path.join(root,x)))bad.push('Missing file '+x);
if(bad.length){ console.error(bad.join('\n'));process.exit(1) }
console.log('PASS clean source layout. This does NOT certify security, cloud integration or financial correctness.');
