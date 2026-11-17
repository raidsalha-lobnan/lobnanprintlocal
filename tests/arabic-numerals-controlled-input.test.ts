import test from 'node:test';
import assert from 'node:assert/strict';
import {enforceArabicNumeralsGlobally,normalizeArabicDigits} from '../src/utils/numberFormat';

/**
 * Simulates React's input value tracker. React owns an instance "value"
 * descriptor. A window capture listener that assigns target.value directly
 * updates that tracker before React's onChange: the note looks typed until
 * the next unrelated render, then disappears.
 */
class TrackedInput {
  tagName='INPUT';
  type='text';
  private actual='';
  reactTrackedValue='';
  reactState='';
  changeEvents=0;
  inputEvents=0;
  get value(){ return this.actual; }
  set value(next:string){ this.actual=next; }
  get selectionStart(){return this.actual.length;}
  get selectionEnd(){return this.actual.length;}
  setSelectionRange(_start:number,_end:number){}
  dispatchEvent(event:Event){
    this.inputEvents++;
    const capture = (globalThis as any).__capturedWindowInput;
    if(capture)capture({target:this,isComposing:false});
    // This is how React's delegated change plugin detects controlled inputs.
    if(this.actual!==this.reactTrackedValue){
      this.reactTrackedValue=this.actual;
      this.reactState=this.actual;
      this.changeEvents++;
    }
    return true;
  }
  reactMount(){
    Object.defineProperty(this,'value',{
      configurable:true,
      get:()=>this.actual,
      set:(v:string)=>{ this.actual=v; this.reactTrackedValue=v; }
    });
  }
  nativeType(value:string) {
    Object.getOwnPropertyDescriptor(TrackedInput.prototype,'value')!.set!
      .call(this,value);
  }
  reactRender(){
    this.value=this.reactState;
  }
}

test('global Arabic-digit normalization must notify React before a pasted POS note is rerendered',()=>{
 const prevWindow=(globalThis as any).window;
 const prevInput=(globalThis as any).HTMLInputElement;
 const prevTextarea=(globalThis as any).HTMLTextAreaElement;
 const originalLocale=Number.prototype.toLocaleString;
 const listeners:Record<string,Function>={};
 try{
   (globalThis as any).window={
     addEventListener:(name:string,fn:Function)=>{listeners[name]=fn;}
   };
   (globalThis as any).HTMLInputElement=TrackedInput;
   (globalThis as any).HTMLTextAreaElement=class TrackedTextArea {};
   enforceArabicNumeralsGlobally();
   (globalThis as any).__capturedWindowInput=listeners.input;

   const field=new TrackedInput();
   field.reactMount();
   // The user pasted a mixed Arabic/number note. Native typing changes the
   // DOM, not the React instance value tracker.
   field.nativeType('ورق ٩٠ × ١٣٠ رقم ١٥');
   listeners.input({target:field,isComposing:false});
   // Under the old target.value=normalized implementation, this stays empty.
   assert.equal(field.reactState,'ورق 90 × 130 رقم 15');
   assert.equal(field.reactTrackedValue,field.reactState);
   assert.ok(field.changeEvents>=1);

   // A later repository update forces an unrelated controlled rerender.
   field.reactRender();
   assert.equal(field.value,'ورق 90 × 130 رقم 15');
 }finally{
   Number.prototype.toLocaleString=originalLocale;
   if(prevWindow===undefined)delete (globalThis as any).window;
   else (globalThis as any).window=prevWindow;
   if(prevInput===undefined)delete (globalThis as any).HTMLInputElement;
   else (globalThis as any).HTMLInputElement=prevInput;
   if(prevTextarea===undefined)delete (globalThis as any).HTMLTextAreaElement;
   else (globalThis as any).HTMLTextAreaElement=prevTextarea;
   delete (globalThis as any).__capturedWindowInput;
 }
});

test('plain western-digit item notes remain untouched during normalization',()=>{
 assert.equal(normalizeArabicDigits('90*130 ورق رقم 15'),'90*130 ورق رقم 15');
 assert.equal(normalizeArabicDigits('٩٠*١٣٠ ورق رقم ١٥'),'90*130 ورق رقم 15');
});
