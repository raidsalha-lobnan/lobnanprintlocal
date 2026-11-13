/**
 * Generation fencing prevents an async camera.start()/getCameras() from
 * reopening a webcam after the modal has closed or the selected camera changed.
 */
export class BarcodeCameraSession {
  private generation = 0;

  begin():number {
    return ++this.generation;
  }

  invalidate():void {
    this.generation++;
  }

  isCurrent(generation:number):boolean {
    return generation===this.generation;
  }
}

/** Pause only halts decoding; browser MediaStream tracks must also be released. */
export function stopBarcodeVideoStream(stream:MediaStream|null|undefined):void {
  if(!stream)return;
  for(const track of stream.getTracks()) {
    try { track.stop(); } catch { /* best effort: continue other tracks */ }
  }
}
