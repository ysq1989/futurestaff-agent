import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

// Compile this surface in isolation so concurrent feature work never shares lib output.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/fashion-preview.tsx', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
})
const module = {exports: {}}
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)

function preview(receipt, options = {}) {
  const views = new Map()
  module.exports.mountFashionPreviews({
    slots: {inject: (_name, callback) => callback(), register: (settings, component) => {views.set(settings.key ?? settings.name, component); return () => {}}},
    inject: (_services, callback) => callback({effect: () => {}}),
  })
  const Card = views.get(options.toolName??'fashion_image_generate')
  const content = [{type: 'text', text: JSON.stringify(receipt)}]
  if (options.image) content.push({type: 'image', attachment: {attachmentId: 'sha256:' + 'a'.repeat(64), width: 800, height: 1200}})
  return renderToStaticMarkup(createElement(Card, {
    sessionId: 'session', openFile: () => {}, toolName:options.toolName??'fashion_image_generate',
    block: options.running ? {kind: 'tool-call'} : {kind: 'tool-result', content, isError: options.isError ?? false},
  }))
}

test('fashion failure is explicit and never presented as a reviewable successful material', () => {
  for (const options of [{}, {isError: true}]) {
    const html = preview({status: 'failed', message: '图片服务暂不可用'}, options)
    assert.match(html, /处理未完成|处理失败/)
    assert.doesNotMatch(html, /待审核/)
    assert.match(html, /图片服务暂不可用/)
  }
})

test('running fashion processing does not claim the material is waiting for review', () => {
  const html = preview({}, {running: true})
  assert.match(html, /正在处理素材/)
  assert.doesNotMatch(html, /待审核/)
})

test('unconfirmed request keeps its identity and recovery instruction without regeneration', () => {
  const html = preview({status: 'unknown', requestId: 'original-request'})
  assert.match(html, /未确认/)
  assert.match(html, /original-request/)
  assert.match(html, /查询原请求/)
  assert.match(html, /不会自动重新生成/)
  assert.doesNotMatch(html, /待审核|重新生成<\/button>/)
})

test('generated fashion material still needs human review and retains original-file actions', () => {
  const html = preview({status: 'succeeded', imagePath: 'fashion-output/dress.png', requestId: 'source-request', fidelityMode: 'reference-generation'}, {image: true})
  assert.match(html, /待审核/)
  assert.match(html, /800 × 1200/)
  assert.match(html, /下载原图/)
  assert.match(html, /打开文件/)
  assert.doesNotMatch(html, /审核通过|保真通过/)
})

test('commerce images use product wording and local file actions instead of the fashion generation export',()=>{
 const html=preview({status:'succeeded',imagePath:'commerce-output/example.png',requestId:'local-composition',previewKind:'commerce'},
  {image:true,toolName:'commerce_image_compose'})
 assert.match(html,/电商图片/);assert.match(html,/打开文件/);assert.match(html,/待审核/)
 assert.doesNotMatch(html,/服装素材|下载原图/)
})
