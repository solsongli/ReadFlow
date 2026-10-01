import test from 'node:test';
import assert from 'node:assert/strict';
const { createDocumentSubmitActions } = await import('../../src/features/library/domain/documents/submit-actions.ts');
const { assembleTranslatePayload, assembleOcrPayload } = await import('../../src/features/library/domain/documents/submit-payloads.ts');
const { friendlyTranslateError, friendlyOcrError } = await import('../../src/features/library/domain/documents/error-messages.ts');

test('original document translation submits local OCR despite archived provider/token overrides', async () => {
  let captured;
  const translation={base_url:'http://127.0.0.1:9/v1',model:'unit-test-model',api_key:'unit-test-only'};
  const actions=createDocumentSubmitActions({
    buildTranslateConfig:()=>({ocr:{provider:'mineru',mineru_token:'old-unit-test'},translation}),
    translateDocumentApi:async (_prefix,_id,payload)=>{captured=payload;return {job_id:'mock-submit'};},
    promoteDocumentToJob:()=>{},
  });
  await actions.translateDocument('synthetic-doc',{ocr:{provider:'paddle',paddle_token:'old-unit-test',credential_ref:'old-unit-ref',page_ranges:'2-4'}});
  assert.deepEqual(captured.ocr,{provider:'local',page_ranges:'2-4'});
  assert.deepEqual(captured.translation,translation,'the independent model configuration is not rewritten');
});

test('missing translation credentials stay blocked without telling the user to configure OCR', async () => {
  let promoted=false;
  const actions=createDocumentSubmitActions({
    buildTranslateConfig:()=>({ocr:{provider:'local'},translation:{model:'unit-test-model'}}),
    translateDocumentApi:async()=>{throw new Error('translation.api_key or translation.credential_ref is required');},
    promoteDocumentToJob:()=>{promoted=true;},
  });
  await assert.rejects(actions.translateDocument('synthetic-doc'),error=>
    error.message==='翻译需要先在「设置」里配置翻译 API 后再试。');
  assert.equal(promoted,false,'a validation failure must not appear as a submitted job');
});

test('reused OCR translation never reintroduces any OCR provider or credentials', () => {
  const result=assembleTranslatePayload({workflow:'translate',source:{artifact_job_id:'ready-ocr'},translation:{page_ranges:[2]}},
    ()=>({ocr:{provider:'paddle',paddle_token:'old-unit-test'},translation:{model:'unit-test-model'}}));
  assert.equal('ocr' in result,false);
  assert.equal(result.source.artifact_job_id,'ready-ocr');
  assert.deepEqual(result.translation.page_ranges,[2]);
});

test('document entry defaults are local even without an optional configuration builder', () => {
  assert.deepEqual(assembleTranslatePayload().ocr,{provider:'local',page_ranges:''});
  assert.deepEqual(assembleOcrPayload({ocr:{provider:'mineru',mineru_token:'old-unit-test',page_ranges:'1'}}).ocr,
    {provider:'local',page_ranges:'1'});
});

test('missing scan module errors containing Token remain accurate installation prompts', async () => {
  const message='扫描页需要本地 OCR 模块。请在设置 → OCR 中安装后重试；无需 Token，不会调用在线服务。';
  assert.equal(friendlyTranslateError(new Error(message)),message);
  assert.equal(friendlyOcrError(new Error(message)),message);
  assert.match(friendlyTranslateError({errorCode:'OCR_NOT_READY',message:'module missing'}),/本地 OCR 识别.*安装/);
  const actions=createDocumentSubmitActions({
    ocrDocumentApi:async()=>{throw new Error(message);},promoteDocumentToJob:()=>{},
  });
  await assert.rejects(actions.ocrDocument('synthetic-scan'),error=>error.message===message);
});
