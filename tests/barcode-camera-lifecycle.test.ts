import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BarcodeCameraSession,stopBarcodeVideoStream} from '../src/utils/barcodeCameraLifecycle';

test('closing while getCameras or start is unresolved prevents a stale start from reopening',async()=>{
  const session=new BarcodeCameraSession();
  const first=session.begin();
  let unblock!:()=>void;
  const startPending=new Promise<void>(resolve=>{unblock=resolve;})
    .then(()=>session.isCurrent(first));
  session.invalidate();
  unblock();
  assert.equal(await startPending,false);
  const second=session.begin();
  assert.equal(session.isCurrent(first),false);
  assert.equal(session.isCurrent(second),true);
  const cameraChange=session.begin();
  assert.equal(session.isCurrent(second),false);
  assert.equal(session.isCurrent(cameraChange),true);
});

test('all physical media tracks stop, even if an earlier track throws',()=>{
  const stopped:string[]=[];
  const fake={
    getTracks:()=>[
      {stop(){stopped.push('video');throw Error('device removed')}},
      {stop(){stopped.push('audio')}}
    ]
  } as unknown as MediaStream;
  assert.doesNotThrow(()=>stopBarcodeVideoStream(fake));
  assert.deepEqual(stopped,['video','audio']);
  assert.doesNotThrow(()=>stopBarcodeVideoStream(null));
});

test('camera modal closes immediately on scan; stale callbacks cannot restart the webcam',()=>{
  const component=readFileSync(new URL('../src/components/BarcodeScannerModal.tsx',import.meta.url),'utf8');
  assert.match(component,/processBarcodeRef\.current = processBarcode/);
  assert.match(component,/const onDecoded = \(decodedText: string\) => \{\s*if \(isCurrent\(\)\) processBarcodeRef\.current/);
  assert.match(component,/const startScanner = useCallback\(async \(cameraId\?: string\)/);
  assert.match(component,/cameraStartPromiseRef\.current = startup/);
  assert.match(component,/cameraStopPromiseRef\.current = release/);
  assert.match(component,/\}, \[releaseCamera\]\);\s*\/\/ Resume Scanning/);
  assert.equal((component.match(/handleClose\(\); \/\/ Hide immediately/g)||[]).length,3);
  assert.equal((component.match(/onClick=\{handleClose\}/g)||[]).length,3);
  assert.match(component,/stopBarcodeVideoStream\(stream\)/);
  assert.match(component,/closingRef\.current = true;\s*void stopScanner\(\);\s*onClose\(\)/);
});
