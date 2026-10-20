import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyVideoLoader } from '../../../scripts/verify-video-loader.mjs'

test('real Loader keeps login active and mounts seven approved video tools only when the member service exists', async () => {
  const receipt = await verifyVideoLoader()
  assert.equal(receipt.passed, true)
  assert.equal(receipt.scenarios[0].videoTools, 0)
  assert.equal(receipt.scenarios[0].loaderActive, true)
  assert.equal(receipt.scenarios[1].metadataChecked, 7)
  assert.equal(receipt.scenarios[1].sdkTypecheckPassed, true)
  assert.equal(receipt.scenarios[1].unapprovedExecutionDenied, true)
})
