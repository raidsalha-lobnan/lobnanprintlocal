import { $typst, initOptions, loadFonts } from '@myriaddreamin/typst.ts';
import compilerWasm from '../../node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url&inline';
import regular from '../../node_modules/@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf?url&inline';
import bold from '../../node_modules/@expo-google-fonts/noto-sans-arabic/700Bold/NotoSansArabic_700Bold.ttf?url&inline';
import latin from '../../node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url&inline';
import latinBold from '../../node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url&inline';
import type {PdfDocument} from './reportPdfEngine';

// Only shipped resources are loaded. No runtime CDN or remote font requests,
// so reports work offline in the packaged Windows application.
$typst.setCompilerInitOptions({
 getModule:()=>compilerWasm,
 beforeBuild:[initOptions.disableDefaultFontAssets(),loadFonts([regular,bold,latin,latinBold])]
});
export async function compileTypstPdf(doc:PdfDocument,signal?:AbortSignal):Promise<Blob>{
 const ensure=()=>{if(signal?.aborted)throw Error('PDF_EXPORT_CANCELLED');};
 ensure();
 try{
  await $typst.resetShadow();
  for(const file of doc.assets){ensure();await $typst.mapShadow(file.path,file.bytes);}
  // No user-supplied Typst source or imports: all strings are escaped by the
  // document serializer, and only these local in-memory images are mapped.
  const bytes=await $typst.pdf({mainContent:doc.source});
  ensure();
  if(!bytes||bytes.length<100||bytes.length>150_000_000||
   new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')
    throw Error('PDF_ENGINE_INVALID_OUTPUT');
  return new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
 }finally{await $typst.resetShadow().catch(()=>{});}
}
