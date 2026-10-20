import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = path.resolve(root, process.env.DSH_HOME || '.dsh')
const source = path.join(root, 'profile', 'futurestaff-alpha')
const target = path.join(dshHome, 'profiles', 'futurestaff-alpha')
const geoPlugin = path.join(root, 'plugins', 'fs-geo').replaceAll('\\', '/')
const corePlugin = path.join(root, 'plugins', 'fs-core').replaceAll('\\', '/')
const platformAccessPlugin = path.join(root, 'plugins', 'fs-platform-access').replaceAll('\\', '/')
const productHubUiPlugin = path.join(root, 'plugins', 'fs-product-hub-ui').replaceAll('\\', '/')
const douyinUiPlugin = path.join(root, 'plugins', 'fs-douyin-ui').replaceAll('\\', '/')

await mkdir(path.dirname(target), { recursive: true })
await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })

const manifestPath = path.join(target, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.dependencies['@futurestaff/fs-geo'] = `file:${geoPlugin}`
manifest.dependencies['@futurestaff/fs-video'] = `file:${path.join(root, 'plugins', 'fs-video').replaceAll('\\', '/')}`
manifest.dependencies['@futurestaff/fs-core'] = `file:${corePlugin}`
manifest.dependencies['@futurestaff/fs-platform-access'] = `file:${platformAccessPlugin}`
manifest.dependencies['@futurestaff/fs-product-hub-ui'] = `file:${productHubUiPlugin}`
manifest.dependencies['@futurestaff/fs-douyin-ui'] = `file:${douyinUiPlugin}`
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

if (process.platform === 'win32') {
  execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm install --ignore-scripts'], { cwd: target, stdio: 'inherit' })
} else {
  execFileSync('npm', ['install', '--ignore-scripts'], { cwd: target, stdio: 'inherit' })
}
console.log(`Installed futurestaff-alpha at ${target}`)
