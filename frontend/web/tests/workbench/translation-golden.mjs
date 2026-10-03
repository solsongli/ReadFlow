// Synthetic fixture only. Exercise the retained upload builders and actual submitJson transport.
import { buildSourcePayload, buildOcrPayload, buildTranslationPayload, buildRenderPayload } from '../../src/features/ingest/domain/workflow/payload.js';
import { createDeveloperConfigResolver, resolveWorkflowDefaults, normalizeWorkflow, normalizeMathMode, workflowConstants } from '../../src/features/ingest/domain.js';
import { submitJobRequest } from '../../../packages/api/src/jobs-submit.js';
const constants = workflowConstants();
const resolver = createDeveloperConfigResolver({ getDeveloperConfig: () => ({ model: 'fixture-model', baseUrl: 'http://127.0.0.1:9/v1', workers: 3, glossaryId: 'fixture-glossary' }), normalizeWorkflow, normalizeMathMode,
  defaults: resolveWorkflowDefaults(constants), defaultModelName: () => '', defaultModelBaseUrl: () => '' });
const developerConfig = resolver.developerConfigWithDefaults();
const payload = { workflow: 'book', source: buildSourcePayload({ workflow: 'book', developerConfig, uploadId: 'fixture-upload', workflowNeedsUpload: () => true }),
  ocr: buildOcrPayload({ pageRanges: '', constants, defaultPaddleApiUrl: () => '' }),
  translation: buildTranslationPayload({ developerConfig, constants, modelApiKey: '演示凭据', selectedGlossaryId: 'fixture-glossary' }),
  render: buildRenderPayload({ developerConfig, constants }), runtime: { timeout_seconds: developerConfig.timeoutSeconds } };
let captured;
globalThis.fetch = async (_url, init) => { captured = JSON.parse(init.body); return new Response(JSON.stringify({ code: 0, data: { job_id: 'fixture-job' } }), { status: 200 }); };
await submitJobRequest('http://127.0.0.1:9/api/v1', payload);
process.stdout.write(JSON.stringify(captured));
