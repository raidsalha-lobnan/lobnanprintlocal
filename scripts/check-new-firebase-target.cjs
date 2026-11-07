const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const cfgPath = path.join(root, 'firebase-applet-config.json');
if (!fs.existsSync(cfgPath)) {
  console.error('Missing firebase-applet-config.json; copy firebase-applet-config.example.json and fill the new Web app config.');
  process.exit(1);
}
const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const required = ['projectId', 'appId', 'apiKey', 'authDomain', 'messagingSenderId'];
const missing = required.filter(k => !c[k] || String(c[k]).startsWith('REPLACE_'));
if (missing.length) {
  console.error('Firebase Web config is incomplete: ' + missing.join(', '));
  process.exit(1);
}
if (c.firestoreDatabaseId && c.firestoreDatabaseId !== '(default)') {
  console.error('Use the (default) Firestore database for this fresh Spark setup; found: ' + c.firestoreDatabaseId);
  process.exit(1);
}
const aliasesPath = path.join(root, '.firebaserc');
if (fs.existsSync(aliasesPath)) {
  const aliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  const target = aliases.projects && aliases.projects.default;
  if (target && target !== c.projectId) {
    console.error('Target mismatch: .firebaserc default = '+ target + ', web config projectId = '+c.projectId);
    process.exit(1);
  }
}
console.log('Firebase target configuration consistent: ' + c.projectId + ' / (default).');
console.log('This checks configuration only, NOT Firestore rules, authentication, or sync correctness.');
