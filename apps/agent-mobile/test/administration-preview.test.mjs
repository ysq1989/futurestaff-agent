import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'

// Exercise the shipped Markdown component; keep this local compile out of dist.
const compiled = await build({
  stdin: {
    contents: `import {createElement} from 'react';
      import {renderToStaticMarkup} from 'react-dom/server.browser';
      import {Markdown} from './src/markdown.tsx';
      export const render = text => renderToStaticMarkup(createElement(Markdown, {text}));`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
  define: {'process.env.NODE_ENV': '"production"'},
})
const {render} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const intent = '12345678-1234-4234-8234-123456789abc'
const url = `https://platform.fsstory.net/administration?intent=${intent}`
const preview = `预览已准备，请在Platform核对后本人确认。预览不表示已提交。\n\n[前往Platform核对并本人确认](${url})`

test('a server-rendered administration preview keeps its exact human link in the existing Markdown component', t => {
  const previous = globalThis.location
  globalThis.location = {origin: 'https://agent.fsstory.net'}
  t.after(() => {if (previous === undefined) delete globalThis.location; else globalThis.location = previous})
  const html = render(preview)
  assert.equal((html.match(/<a /g) ?? []).length, 1)
  assert.ok(html.includes(`href="${url}" target="_blank" rel="noopener noreferrer"`))
  assert.ok(html.includes('预览不表示已提交。'))
  assert.ok(html.includes('前往Platform核对并本人确认</a>'))
  assert.doesNotMatch(html, /<form|<iframe|<script|confirmation_hash|access_token|refresh_token/)
})

test('rendering a preview does not fetch, authorize or submit its human link', t => {
  const previousLocation = globalThis.location, previousFetch = globalThis.fetch
  globalThis.location = {origin: 'https://agent.fsstory.net'}
  let requests = 0
  globalThis.fetch = () => {requests++; throw Error('no request is permitted during rendering')}
  t.after(() => {globalThis.fetch = previousFetch; if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation})
  render(preview)
  assert.equal(requests, 0)
})

test('preview reuse does not widen the existing Markdown URL policy', t => {
  const previous = globalThis.location
  globalThis.location = {origin: 'https://agent.fsstory.net'}
  t.after(() => {if (previous === undefined) delete globalThis.location; else globalThis.location = previous})
  for (const target of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///private', 'https://user:secret@platform.fsstory.net/administration', '/administration?intent=' + intent]) {
    assert.doesNotMatch(render(`[本人确认](${target})`), /<a /, target)
  }
})
