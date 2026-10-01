import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OCR_PROVIDER, normalizeOcrProvider } from '../../src/platform/config/providers.js';
import { normalizeBrowserStoredConfig } from '../../src/platform/config/storage.js';
import { ocrTokenFromCredentials, hasCompleteCredentials } from '../../src/features/credentials/domain/state-selectors.js';
import { hasDesktopCredentials } from '../../src/features/credentials/domain/desktop-readiness.js';
import { ensureOcrCredentialValidationReady } from '../../src/features/credentials/domain/ocr-readiness-flow.js';
import { buildOcrPayload } from '../../src/features/ingest/domain/workflow/payload.js';
import { createCredentialAccess } from '../../src/features/credentials/domain/credential-access.js';
import { createBrowserCredentialSaveFlow } from '../../src/features/credentials/domain/save-flow.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OcrPanels } from '../../src/features/credentials/ui/OcrPanels.js';

test('legacy online configuration is archived but cannot choose an online execution provider', () => {
  const value=normalizeBrowserStoredConfig({ocrProvider:'mineru',paddleToken:'archived-p',mineruToken:'archived-m',ocrCredentialRef:'archived-ref'});
  assert.equal(DEFAULT_OCR_PROVIDER,'local');assert.equal(normalizeOcrProvider('paddle'),'local');
  assert.equal(value.ocrProvider,'local');assert.equal(value.paddleToken,'archived-p');assert.equal(value.mineruToken,'archived-m');assert.equal(value.ocrCredentialRef,'archived-ref');
  assert.equal(ocrTokenFromCredentials(value,{defaultPaddleToken:()=>{throw Error('must not read old default');}}),'');
});
test('canonical local OCR payload omits all legacy secret, reference and URL fields',()=>{
  assert.deepEqual(buildOcrPayload({pageRanges:'1-3',ocrProvider:'mineru',ocrCredentialRef:'old-ref',ocrToken:'old-token',defaultPaddleApiUrl:()=>{throw Error('must not read URL');},constants:{}}),{provider:'local',page_ranges:'1-3'});
});
test('fresh local OCR readiness requires neither translation key nor module download',async()=>{
  assert.equal(hasDesktopCredentials({}),true);
  const access=createCredentialAccess({credentialsStatePort:{getCredentials:()=>({}),getOcrToken:()=>{throw Error('must not read');}}});
  assert.equal(access.hasOcrCredentials(),true);
  const ready=await ensureOcrCredentialValidationReady({providerId:'paddle',credentials:{},validateOcrToken:()=>{throw Error('must not call online validation');}});
  assert.equal(ready.ok,true);assert.equal(ready.status,'local');
  assert.equal(hasCompleteCredentials({}),false,'translation still needs its independent key');
  assert.equal(hasCompleteCredentials({modelApiKey:'translation-only'}),true);
});
test('actual settings OCR panel exposes shared local manager and no online credential input',()=>{
  const html=renderToStaticMarkup(createElement(OcrPanels));
  assert.match(html,/本地 OCR 模块管理/);assert.match(html,/RapidOCR/);assert.match(html,/文字 PDF 无需安装模块/);
  assert.doesNotMatch(html,/<input|<select|Paddle Access Token|MinerU API Token/);
});
test('settings save succeeds without cloud keys and preserves archived OCR credentials',async(t)=>{
  const previous=globalThis.window;const storage=new Map();globalThis.window={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},dispatchEvent:()=>{},location:{protocol:'http:'}};
  t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
  let saved;const statuses=[];
  const flow=createBrowserCredentialSaveFlow({viewPort:{setDialogStatus:(message,tone)=>statuses.push({message,tone}),setDeepSeekValidationMessage:()=>{}},credentialsStatePort:{setCredentials:v=>{saved=v;}},access:{currentOcrProvider:()=> 'local',readCurrentCredentials:()=>({paddleToken:'archived-p',mineruToken:'archived-m',ocrCredentialRef:'archived-ref'})},translation:{captureCurrent:()=>{},getCurrentProvider:()=> 'custom',defaultWorkers:()=>5,recordCurrentProfile:()=>{},persistable:()=>({})},getTaskOptions:()=>({}),saveTaskOptions:async()=>{},setupModePort:{currentSetupMode:()=>false},dialogElementsPort:{elements:()=>({})},syncBrowserDialogFromCredentialState:()=>{},runtimeEnv:{isDesktopMode:()=>false}});
  await flow.handleSave();assert.equal(statuses.at(-1).tone,'valid');assert.equal(saved.ocrProvider,'local');assert.equal(saved.paddleToken,'archived-p');assert.equal(saved.mineruToken,'archived-m');assert.equal(saved.ocrCredentialRef,'archived-ref');assert.equal(saved.modelApiKey,'');
});
