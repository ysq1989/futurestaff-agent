import {createHash} from 'node:crypto'
import {readFile, readdir, mkdir, writeFile, cp} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {deflateSync} from 'node:zlib'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(path.join(process.cwd(), 'package.json'))
const {build} = require('esbuild')
const sourceNames = (await readdir(path.join(root, 'src'))).filter(name => /\.(tsx?|css)$/.test(name)).sort()
const publicNames = (await readdir(path.join(root, 'public'))).sort()
const sourceBytes = await Promise.all([...sourceNames.map(name => readFile(path.join(root, 'src', name))), ...publicNames.map(name => readFile(path.join(root, 'public', name)))])
const version = createHash('sha256').update(Buffer.concat(sourceBytes)).digest('hex').slice(0, 12)
const output = path.join(root, 'dist')
await mkdir(output, {recursive: true})
await build({
  absWorkingDir: root, entryPoints: ['src/main.tsx'], outfile: path.join(output, `app.${version}.js`),
  bundle: true, format: 'iife', platform: 'browser', target: ['es2022'], jsx: 'automatic', minify: true,
  define: {'process.env.NODE_ENV': '"production"'}, legalComments: 'eof',
  nodePaths: [path.dirname(path.dirname(require.resolve('react/package.json')))], logLevel: 'info',
})
for (const name of publicNames) {
  const file = path.join(root, 'public', name)
  if (name.endsWith('.html') || name.endsWith('.js')) await writeFile(path.join(output, name), (await readFile(file, 'utf8')).replaceAll('__BUILD__', version))
  else await cp(file, path.join(output, name))
}

function crc32(bytes) {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}
function chunk(type, data) {
  const kind = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([kind, data])))
  return Buffer.concat([length, kind, data, checksum])
}
function icon(size, maskable = false) {
  const pixels = Buffer.alloc((size * 4 + 1) * size)
  const x0 = .315, x1 = .72, y0 = .25, y1 = .755, stroke = .112
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    const inLetter = u >= x0 && u < x0 + stroke && v >= y0 && v < y1 ||
      u >= x0 && u < x1 && v >= y0 && v < y0 + stroke ||
      u >= x0 && u < x1 - .035 && v >= .475 && v < .475 + stroke
    const corner = !maskable && Math.hypot(Math.max(0, .18 - u, u - .82), Math.max(0, .18 - v, v - .82)) > .18
    const offset = y * (size * 4 + 1) + 1 + x * 4
    pixels[offset] = inLetter ? 255 : 37; pixels[offset + 1] = inLetter ? 255 : 99; pixels[offset + 2] = inLetter ? 255 : 235; pixels[offset + 3] = corner ? 0 : 255
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
await Promise.all([
  writeFile(path.join(output, 'icon-192.png'), icon(192)), writeFile(path.join(output, 'icon-512.png'), icon(512)),
  writeFile(path.join(output, 'icon-maskable.png'), icon(512, true)), writeFile(path.join(output, 'apple-touch-icon.png'), icon(180)),
])
console.log(`FutureStaff Agent mobile ${version} built at ${output}`)
