import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/client/index.js'

test('product settings retains Agent 市场 using the current shared agent center', () => {
  const registrations = []
  apply({ inject: (_services, callback) => callback({ effect: () => {} }), slots: {
    inject: (_name, register) => register(),
    subscribe: () => () => {},
    entries: () => [],
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  } })
  const market = registrations.find(row => row.options.id === 'futurestaff-agent-market')
  assert.ok(market, 'Agent 市场 must come from the product registration, not fixture-only section rows')
  assert.deepEqual(market.options, { name: 'settings.section', id: 'futurestaff-agent-market', order: -9, label: 'Agent 市场' })
  let closed = false
  const element = market.component({ close: () => { closed = true } })
  assert.equal(element.type.name, 'AgentCenter')
  assert.equal(element.props.embedded, true)
  element.props.beforeNewSession()
  assert.equal(closed, true, 'Entering a session must first return from settings')
})
