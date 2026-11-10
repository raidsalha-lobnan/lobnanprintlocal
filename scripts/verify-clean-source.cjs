#!/usr/bin/env node
// Guard against accidental publication of runtime data and secrets.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const blocked = [
  'master_drive_database_snapshot.json',
  'public/master_drive_database_snapshot.json',
  '.sync_data/treasuries.json',
  '.env',
  '.env.production',
  '.env.local',
  '.env.local-server',
  'private-backups'
];
const required = [
  '.gitignore',
  'package.json',
  'src/sync-next/localDb.ts',
  'src/sync-next/httpTransport.ts',
  'src/services/durableLegacyBridge.ts'
];
const violations = [];
for (const file of blocked) {
  if (fs.existsSync(path.join(root,file))) violations.push('Sensitive runtime file found: ' + file);
}
for (const file of required) {
  if (!fs.existsSync(path.join(root,file))) violations.push('Missing required source file: ' + file);
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('PASS source-package hygiene. Financial and security acceptance still require operational tests.');
