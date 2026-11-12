import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {RcloneDriveStorage} from '../rclone-drive-storage.mjs';

function createMockRclone() {
  const files = new Map();
  const spawnProcess = (_executable, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const chunks = [];
    child.stdin.on('data', chunk => chunks.push(chunk));
    child.stdin.on('end', () => {
      const [action, key] = args;
      queueMicrotask(() => {
        if (action === 'rcat') files.set(key, Buffer.concat(chunks));
        if (action === 'cat' && files.has(key)) child.stdout.write(files.get(key));
        child.stdout.end();
        child.stderr.end();
        child.emit('close', action === 'cat' && !files.has(key) ? 1 : 0);
      });
    });
    return child;
  };
  return {files, spawnProcess};
}

test('same encrypted cloud object is readable from independent device sessions', async () => {
  const backend = createMockRclone();
  const deviceA = new RcloneDriveStorage({spawnProcess: backend.spawnProcess});
  const deviceB = new RcloneDriveStorage({spawnProcess: backend.spawnProcess});
  const bytes = Buffer.from('a unique invoice attachment with original bytes', 'utf8');
  const uploaded = await deviceA.uploadBuffer(bytes, 'work-order.pdf', 'application/pdf');
  assert.match(uploaded.id, /^att_[0-9a-f-]{36}$/);
  assert.equal(uploaded.name, 'work-order.pdf');
  const onAnotherDevice = await deviceB.download(uploaded.id);
  assert.deepEqual(onAnotherDevice, bytes);
});

test('download rejects unrelated file IDs before reading storage', async () => {
  const backend = createMockRclone();
  const device = new RcloneDriveStorage({spawnProcess: backend.spawnProcess});
  await assert.rejects(device.download('../secret'), /INVALID_ATTACHMENT_ID/);
  await assert.rejects(device.uploadBuffer(Buffer.alloc(0), 'empty'), /ATTACHMENT_EMPTY/);
});
