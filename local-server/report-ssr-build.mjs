import {build} from 'esbuild';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const original=path.join(root,'src','context','AccountingContext.tsx').toLowerCase().replaceAll('\\','/');
await build({
 entryPoints:[path.join(root,'local-server','report-ssr-entry.tsx')],
 outfile:path.join(root,'local-server','report-ssr.compiled.mjs'),
 bundle:true,platform:'node',format:'esm',target:'node20',
 packages:'external',
 plugins:[{
  name:'replace-react-accounting-context',setup(build){
   build.onResolve({filter:/AccountingContext/},args=>{
    const target=path.resolve(args.resolveDir,args.path).replaceAll('\\','/').toLowerCase();
    if(target===original.slice(0,-4)||target===original)
      return {path:path.join(root,'local-server','report-snapshot-context.ts')};
    return null;
   });
  }
 }]
});
console.log('SSR_BUNDLE_READY');
