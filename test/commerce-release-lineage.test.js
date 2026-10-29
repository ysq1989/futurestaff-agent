import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {stageReleaseProfile} from '../scripts/stage-release-profile.mjs'

test('commerce release upgrades the exact public 3.3.4 inventory and retains the previous baseline',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'fs-commerce-release-'))
 try{
  const baseline=JSON.parse(await readFile(new URL('../profile/workspace-upgrade-3.3.4.json',import.meta.url),'utf8'))
  assert.equal(baseline.installerSha256,'56928e43dc4d95bc33c89de207586541ba5c731e6c59aa724118e33e3e59ced7')
  const {releaseManifest}=await stageReleaseProfile({outputRoot:temporary})
  assert.ok(releaseManifest.supersedes.includes(baseline.manifestDigest))
  assert.ok(releaseManifest.workspacePreviousInventories.some(files=>JSON.stringify(files)===JSON.stringify(baseline.platformFiles)))
  assert.ok(releaseManifest.workspacePreviousPlatformPackageHashes.includes(baseline.platformPackageSha256))
  const current=JSON.parse(await readFile(new URL('../profile/workspace-upgrade-3.3.5.json',import.meta.url),'utf8'))
  assert.equal(current.installerSha256,'10ef7e9121934a525faaa2eda9abbadfe62a9221c6466e34e646111baaae4a44')
  assert.ok(releaseManifest.supersedes.includes(current.manifestDigest))
  assert.ok(releaseManifest.workspacePreviousInventories.some(files=>JSON.stringify(files)===JSON.stringify(current.platformFiles)))
  assert.ok(releaseManifest.workspacePreviousInventories.length<=32)
 }finally{await rm(temporary,{recursive:true,force:true})}
})
