import {readFile} from 'node:fs/promises'
import path from 'node:path'

/** Preserve complete installer-derived inventories for released upgrade baselines. */
export async function appendPublishedReleaseLineage(manifest, sourceRoot) {
  for(const version of ['3.3.3','3.3.4','3.3.5','3.3.6']){
    const previous=JSON.parse(await readFile(path.join(sourceRoot,'profile/workspace-upgrade-'+version+'.json'),'utf8'))
    manifest.supersedes=[...new Set([...manifest.supersedes,previous.manifestDigest])]
    manifest.workspacePreviousInventories=[...manifest.workspacePreviousInventories,previous.platformFiles]
    manifest.workspacePreviousPlatformPackageHashes=[...new Set([...manifest.workspacePreviousPlatformPackageHashes,previous.platformPackageSha256])]
  }
}
