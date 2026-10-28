import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {stageReleaseProfile} from '../scripts/stage-release-profile.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
test('3.3.4 release retains the full installer-extracted 3.3.3 upgrade baseline',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'fs-chat-lineage-'))
 try{
  const {releaseManifest,target}=await stageReleaseProfile({sourceRoot:root,outputRoot:temporary})
  const baseline=JSON.parse(await readFile(path.join(root,'profile/workspace-upgrade-3.3.3.json'),'utf8'))
  assert.equal(baseline.installerSha256,'6216177bacdcab75bb72bd4264becd536a42f0ebe273367d95ef6859d13b1e07')
  assert.equal(Object.keys(baseline.platformFiles).length,338)
  assert.ok(releaseManifest.supersedes.includes(baseline.manifestDigest))
  assert.ok(releaseManifest.workspacePreviousInventories.some(files=>JSON.stringify(files)===JSON.stringify(baseline.platformFiles)))
  assert.ok(releaseManifest.workspacePreviousPlatformPackageHashes.includes(baseline.platformPackageSha256))
  assert.ok((await readFile(path.join(target,'release-manifest.json'))).length<=2*1024*1024)
 }finally{await rm(temporary,{recursive:true,force:true})}
})
