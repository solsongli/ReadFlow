import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranslationDiagnostics } from '../../src/features/paper-blocks/ui/TranslationDiagnostics.js';
import { translationDiagnostics } from '../../src/features/paper-blocks/domain/diagnostics.js';
test('safe diagnostic fields are visible, duplicate records collapse and extra data is ignored',()=>{
  const detail={stage:'terms',exception:'ConnectTimeout',http_status:503,provider_code:'server_error',
    prompt:'private document text',key:'fixture-secret-not-displayed'};
  const values=translationDiagnostics({job:{error:{details:detail},diagnostics:[detail]},result:{diagnostics:[detail]}});
  assert.equal(values.length,1);
  const html=renderToStaticMarkup(React.createElement(TranslationDiagnostics,{values}));
  assert.match(html,/术语预处理/);assert.match(html,/ConnectTimeout/);assert.match(html,/503/);
  assert.doesNotMatch(html,/private document text|fixture-secret-not-displayed/);
});
