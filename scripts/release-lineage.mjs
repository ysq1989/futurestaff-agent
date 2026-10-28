import {readFile} from 'node:fs/promises'
import path from 'node:path'

/** Preserve the exact shipped 3.3.3 tree as an authenticated upgrade baseline. */
export async function appendPublishedReleaseLineage(manifest, sourceRoot) {
  const previous=JSON.parse(await readFile(path.join(sourceRoot,'profile/workspace-upgrade-3.3.3.json'),'utf8'))
  manifest.supersedes=[...new Set([...manifest.supersedes,previous.manifestDigest])]
  manifest.workspacePreviousInventories=[...manifest.workspacePreviousInventories,previous.platformFiles]
  manifest.workspacePreviousPlatformPackageHashes=[...new Set([...manifest.workspacePreviousPlatformPackageHashes,previous.platformPackageSha256])]
}
