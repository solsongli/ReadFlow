import test from "node:test";
import assert from "node:assert/strict";
import { createCredentialsStatePort } from "../../src/features/credentials/domain/state.js";
import { createCredentialVault } from "../../src/features/credentials/domain/credential-vault.js";
import { createWorkflowPayloadAssembly } from "../../src/features/ingest/domain/workflow/payload-assembly.js";

test("legacy MinerU/Paddle credentials stay archived without vault OCR restore or writes", async () => {
 const port=createCredentialsStatePort({initialState:{ocrProvider:"mineru",paddleToken:"p-old",mineruToken:"m-old",ocrCredentialRef:"old-ref"}});
 const vault=createCredentialVault({credentialsStatePort:port,runtimeEnv:{isDesktopMode:()=>false},readCurrentCredentials:port.getCredentials,currentOcrProvider:()=>port.getCredentials().ocrProvider,translationProvider:()=>"custom",listCredentials:async()=>({credentials:[{kind:"ocr_provider_token",provider:"mineru",credential_ref:"different-ref",configured:true,secret:"must-not-restore"}]}),createCredential:()=>assert.fail("must not create OCR credential"),updateCredential:()=>assert.fail("must not update OCR credential")});
 await vault.refreshCredentialReferences({persist:false});
 assert.equal(port.getCredentials().ocrProvider,"local");assert.equal(port.getCredentials().ocrCredentialRef,"old-ref");assert.equal(port.getCredentials().mineruToken,"m-old");assert.equal(port.getCredentials().paddleToken,"p-old");assert.equal(port.getOcrToken(),"");
 assert.equal(await vault.storeOcrCredential({provider:"mineru",secret:"draft"}),"");
});
test("upload and existing-document jobs cannot revive a legacy online OCR provider",()=>{
 for(const ocrOnly of [true,false]) {
 const assembly=createWorkflowPayloadAssembly({constants:{WORKFLOW_BOOK:"book",WORKFLOW_TRANSLATE:"translate"},developerConfigWithDefaults:()=>({workflow:"book"}),isOcrOnlyMode:()=>ocrOnly,currentPageRanges:()=>"2-4",getUploadState:()=>({uploadId:"upload"}),workflowNeedsUpload:()=>true,workflowUsesRenderStage:()=>false,defaultPaddleApiUrl:()=>assert.fail("must not read old endpoint"),defaultPaddleToken:()=>assert.fail("must not read old token"),defaultOcrProvider:()=>"mineru",defaultModelApiKey:()=>"",readSubmitValues:()=>({ocrProvider:"mineru",ocrCredentialRef:"old-ref",ocrToken:"old-token",translationCredentialRef:"translation"})});
 for(const payload of [assembly.collectRunPayload(),assembly.buildOcrJobConfig("2-4"),assembly.buildTranslateJobConfig("2-4")]) { assert.deepEqual(payload.ocr,{provider:"local",page_ranges:"2-4"});if(payload.translation)assert.equal(payload.translation.credential_ref,"translation"); }
 if(ocrOnly)assert.equal(assembly.collectRunPayload().translation,undefined);
 }
});
