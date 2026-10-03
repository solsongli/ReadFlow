import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
test('workbench native reader bundle has no dependency on the upstream reader package',async()=>{
 const result=await build({entryPoints:['src/app/workbench/entry.tsx'],bundle:true,write:false,metafile:true,outdir:'/tmp/readflow-r1/boundary',format:'esm',platform:'browser',jsx:'automatic',alias:{'@':resolve('src')},logLevel:'silent'});
 const inputs=Object.keys(result.metafile.inputs);
 assert.ok(inputs.some(file=>file.includes('features/paper-reader/')));
 assert.ok(inputs.some(file=>file.includes('pdfjs-dist/')));
 assert.deepEqual(inputs.filter(file=>file.includes('packages/reader/')||file.includes('@retainpdf/reader/')),[]);
});
