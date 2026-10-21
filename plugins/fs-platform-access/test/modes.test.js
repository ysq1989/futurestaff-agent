import test from 'node:test'
import assert from 'node:assert/strict'
import { modePresentation, visibleModes } from '../lib/client/modes.js'
import { apply } from '../lib/client/index.js'

test('obsolete preset surfaces are hidden while original injection and registration are preserved', () => {
  const original = () => null, inject = () => ({ load: () => {} }), children = { composer: {} }
  const names = ['conversation.hero.agentPreset', 'conversation.session.header.actions', 'settings.section']
  const originals = names.map(name => ({ component: original, locale: 'settings.agentPreset', inject, children, options: {
    name,
    ...(name === 'settings.section' ? { id: 'agent-presets', order: 20 } : {}),
  } }))
  const registered = []
  apply({ inject:(_services,callback)=>callback({effect:()=>{}}),slots: {
    inject: (_name, register) => register(),
    subscribe: () => () => {},
    entries: name => originals.filter(entry => entry.options.name === name),
    register: (options, component) => { registered.push({ options, component }); return () => {} },
  } })
  const modes = originals
  assert.equal(modes.length, 3)
  for (const entry of modes) {
    assert.equal(entry.inject, inject)
    assert.equal(entry.children, children)
    assert.notEqual(entry.component, original)
    const element = entry.component({ t: key => key })
    assert.equal(element, null)
  }
  assert.equal(modes[2].options.id, 'agent-presets')
  assert.equal(modes[2].options.order, 20)
})

test('mode names and descriptions change while selection and unrelated translations stay intact', () => {
  const original = () => null, select = () => {}, load = () => {}
  const element = modePresentation(original)({ t: key => `original:${key}`, select, load })
  assert.equal(element.type, original)
  assert.equal(element.props.t('presetStandardName'), '普通模式')
  assert.equal(element.props.t('presetPtcName'), '任务模式')
  assert.match(element.props.t('presetStandardDescription'), /推荐/)
  assert.match(element.props.t('presetPtcDescription'), /多个步骤/)
  assert.equal(element.props.t('switchRefused'), 'original:switchRefused')
  assert.equal(element.props.select, select)
  assert.equal(element.props.load, load)
})

test('picker hides developer modes, preserves platform and custom roles, and keeps snapshot identity stable', () => {
  const snapshot = { current: 'standard', busy: false, options: [
    ...['standard', 'ptc', 'minimal', 'cordis', 'platform-role'].map(id => ({ id, trust: 'system' })),
    { id: 'minimal', trust: 'user' },
  ] }
  const visible = visibleModes(snapshot)
  assert.deepEqual(visible.options.map(option => [option.id, option.trust]), [
    ['standard', 'system'], ['ptc', 'system'], ['platform-role', 'system'], ['minimal', 'user'],
  ])
  assert.equal(visibleModes(snapshot), visible)
  assert.equal(visible.current, snapshot.current)
  assert.equal(snapshot.options.length, 6)
  const existingSelection = visibleModes({ ...snapshot, current: 'cordis' })
  assert.ok(existingSelection.options.some(option => option.id === 'cordis'))
})

test('picker wrapper filters the actual store selector without changing actions', () => {
  const snapshot = { current: 'ptc', options: ['standard', 'ptc', 'cordis'].map(id => ({ id, trust: 'system' })) }
  const element = modePresentation(() => null, true)({ t: key => key,
    useAgentPresetSeat: selector => selector(snapshot) })
  assert.deepEqual(element.props.useAgentPresetSeat(state => state.options.map(option => option.id)), ['standard', 'ptc'])
})
