import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { PlatformDevAccessController, InMemoryTenantResources, decodePlatformDevAccessSnapshot,
  DesktopLoginWorkspace, PlatformSessionVault, workspaceIdentity, workspaceName, workspaceDirectory,
  workspaceStoragePatch, renderPlatformAccessView } from '../lib/index.js'

const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002'
const u = '20000000-0000-4000-8000-000000000001', v = '20000000-0000-4000-8000-000000000002'
const user = id => ({ userId: id, displayName: '离线测试用户', email: null })
const session = activeTenantId => ({ activeTenantId, audience: 'futurestaff-agent-pc-dev',
  accessToken: 'offline-access-with-enough-entropy', refreshToken: `offline-refresh-${activeTenantId}`, tokenType: 'Bearer', expiresIn: 900 })
const tenants = [a,b].map((tenantId,index) => ({ tenantId, displayName: `测试租户${index}`, slug: `fixture-${index}`, role: 'member', logoUrl: null }))
function fixture(enter = async () => true) {
  const calls = [], saves = []
  let activeTenantId = a
  const api = {
    loginWithPassword: async input => { calls.push(['login', input.tenantId]); activeTenantId=input.tenantId ?? a; return { session: session(activeTenantId), user: user(input.tenantId === b ? v : u) } },
    listTenants: async () => ({ activeTenantId, items: tenants }),
    listModels: async (_,activeTenantId) => { calls.push(['models',activeTenantId]); return { activeTenantId, activeModelId:null,items:[] } },
    listApplications: async (_,activeTenantId) => ({ activeTenantId,items:[] }),
    switchTenant: async () => { throw Error('must not switch during login') },
    refresh: async () => ({ session: session(a) }), logout: async () => {},
  }
  const vault = { load: async () => undefined, save: async value => { saves.push(value) }, clear: async () => {} }
  const controller = new PlatformDevAccessController(api,vault,new InMemoryTenantResources(),{ accepts:()=>true,enter })
  return { controller, calls, saves, api, vault }
}
test('account verification stays locked with no persisted credentials or model query until tenant confirmation', async () => {
  const f = fixture()
  const snapshot = await f.controller.login({ loginIdentifier:'fixture',password:'offline-password' })
  assert.doesNotMatch(JSON.stringify(snapshot), /offline-password/); assert.equal(snapshot.phase,'selecting_tenant'); assert.equal(snapshot.activeTenantId,undefined)
  assert.deepEqual(snapshot.models,[]); assert.equal(f.saves.length,0)
  assert.deepEqual(f.calls,[['login',undefined]])
  await assert.rejects(f.controller.authorizeChat()); await assert.rejects(f.controller.authorizeLocal())
  await assert.rejects(f.controller.switchTenant(b),/RELOGIN/)
  await assert.rejects(f.controller.selectLoginTenant('forged'))
  await f.controller.selectLoginTenant(b)
  assert.equal(f.controller.getSnapshot().phase,'no_apps')
  assert.deepEqual(f.calls,[['login',undefined],['login',b],['models',b]])
  assert.equal(f.saves[0].user.userId,v)
  assert.equal((await f.controller.authorizeLocal()).userId,v)
})
test('restart to a different workspace never unlocks this process or saves into the previous vault', async () => {
  const f=fixture(async()=>false)
  await f.controller.login({ loginIdentifier:'fixture',password:'offline-password' })
  await f.controller.selectLoginTenant(b)
  assert.equal(f.controller.getSnapshot().phase,'loading'); assert.equal(f.saves.length,0)
  assert.deepEqual(f.calls,[['login',undefined],['login',b]])
  await assert.rejects(f.controller.authorizeLocal())
})
test('restoration and refresh cannot cross a fixed workspace identity', async () => {
  const f=fixture()
  f.vault.load=async()=>({session:session(b),user:user(v)})
  const wrong=new PlatformDevAccessController(f.api,f.vault,new InMemoryTenantResources(),{accepts:()=>false,enter:async()=>true})
  assert.equal((await wrong.restore()).phase,'signed_out'); await assert.rejects(wrong.authorizeLocal())
})
test('restoration applies workspace upgrades before enabling the old Host generation', async () => {
  const f=fixture(async()=>false)
  f.vault.load=async()=>({session:session(a),user:user(u)})
  assert.equal((await f.controller.restore()).phase,'loading')
  assert.deepEqual(f.calls,[])
  await assert.rejects(f.controller.authorizeLocal())
})
test('pending credential is unavailable after expiry, return to login or Host disposal', async () => {
  for (const cancel of ['expiry','logout','dispose']) {
    const f=fixture()
    await f.controller.login({loginIdentifier:'fixture',password:'offline-password'})
    if(cancel==='logout') await f.controller.logout()
    if(cancel==='dispose') f.controller.dispose()
    if(cancel==='expiry') {
      const original=Date.now; Date.now=()=>original()+300001
      try { assert.equal((await f.controller.selectLoginTenant(b)).phase,'signed_out') }
      finally { Date.now=original }
    } else await assert.rejects(f.controller.selectLoginTenant(b))
    assert.deepEqual(f.calls,[['login',undefined]])
    assert.equal(f.saves.length,0)
  }
})
test('tenant selection snapshot rejects injected active context and UI offers login instead of runtime switching', () => {
  const selection={phase:'selecting_tenant',simulated:false,contractVersion:'0.1.1',user:user(u),tenants,models:[],applications:[]}
  assert.doesNotThrow(()=>decodePlatformDevAccessSnapshot(selection))
  assert.throws(()=>decodePlatformDevAccessSnapshot({...selection,activeTenantId:a}))
  assert.match(renderPlatformAccessView(selection),/选择登录主体/)
  assert.match(renderPlatformAccessView(selection),/请选择登录主体/)
  assert.doesNotMatch(renderPlatformAccessView(selection),/type="password"|确认密码/)
  assert.doesNotMatch(renderPlatformAccessView({...selection,phase:'no_apps',activeTenantId:a}),/data-action="switch-tenant"/)
})
test('environment, tenant and member have different folders and OS-protected vault keys', async () => {
  const root=path.join(os.tmpdir(),'fixture-workspaces'), values=new Map()
  const secrets={available:async()=>true,has:async key=>values.has(key),read:async key=>values.get(key),write:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)}
  const identities=[workspaceIdentity('production',a,u),workspaceIdentity('production',b,u),workspaceIdentity('production',a,v),workspaceIdentity('dev',a,u)]
  assert.equal(new Set(identities.map(id=>workspaceDirectory(id,root))).size,4)
  assert.equal(new Set(identities.map(workspaceName)).size,4)
  await new PlatformSessionVault(secrets,'production',workspaceName(identities[0])).save({session:session(a),user:user(u)})
  assert.equal(await new PlatformSessionVault(secrets,'production',workspaceName(identities[1])).load(),undefined)
  assert.throws(()=>workspaceIdentity('production','../escape',u))
  const patch=workspaceStoragePatch(workspaceDirectory(identities[0],root))
  for(const key of ['sessions','storages','attachment-local','settings','session-search.sqlite','douyin']) assert.ok(patch.includes(key))
})
test('desktop publication copies only code/config and preserves the original workspace data', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-tenant-profiles-')); t.after(()=>rm(root,{recursive:true,force:true}))
  const source=path.join(root,'futurestaff-alpha'); await mkdir(source)
  await writeFile(path.join(source,'package.json'),JSON.stringify({name:'fixture',dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}))
  await writeFile(path.join(source,'cordis.patch.yml'),'[]\n')
  await writeFile(path.join(source,'private-history.json'),'must stay in original')
  for(const module of ['fs-core','fs-platform-access','fs-product-hub-ui','fs-douyin-ui']) {
    const dir=path.join(source,'node_modules','@futurestaff',module); await mkdir(path.join(dir,'lib'),{recursive:true})
    await writeFile(path.join(dir,'package.json'),'{}'); await writeFile(path.join(dir,'lib','index.js'),'export {}')
  }
  await writeFile(path.join(source,'pnpm-workspace.yaml'),'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\nvirtualStoreDirMaxLength: 60\n')
  const ui = path.join(source, 'node_modules', '@futurestaff', 'fs-product-hub-ui', 'ui')
  await mkdir(ui)
  await writeFile(path.join(ui, 'index.html'), '<main>built code fixture</main>')
  await writeFile(path.join(source,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: false\n")
  await writeFile(path.join(source,'node_modules','.modules.yaml'),'nodeLinker: hoisted\npackageManager: pnpm@11.8.0\nvirtualStoreDirMaxLength: 60\n')
  const selected=[], identity=workspaceIdentity('production',b,v), name=workspaceName(identity)
  const values=new Map(), secrets={available:async()=>true,has:async key=>values.has(key),read:async key=>values.get(key),write:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)}
  const profiles={current:{name:'futurestaff-alpha',dir:source},list:()=>[{name,dir:path.join(root,name),webCapable:true}],select:async value=>selected.push(value)}
  const workspace=new DesktopLoginWorkspace(profiles,'production',secrets,undefined,path.join(root,'data'))
  assert.equal(await workspace.enter(session(b),user(v)),false); assert.deepEqual(selected,[name])
  const target=path.join(root,name)
  await assert.rejects(readFile(path.join(target,'private-history.json')))
  assert.equal(await readFile(path.join(source,'private-history.json'),'utf8'),'must stay in original')
  assert.equal(await readFile(path.join(target, 'node_modules', '@futurestaff', 'fs-product-hub-ui', 'ui', 'index.html'), 'utf8'), '<main>built code fixture</main>')
  assert.equal((await new PlatformSessionVault(secrets,'production',name).load()).user.userId,v)
  assert.ok((await readFile(path.join(target,'cordis.patch.yml'),'utf8')).includes('douyin'))
  const config=await readFile(path.join(target,'cordis.patch.yml'),'utf8')
  assert.match(config,/identityMode: single-subject/)
  assert.ok(config.includes(JSON.stringify(v))); assert.ok(config.includes(JSON.stringify(b)))
  assert.match(await readFile(path.join(target,'node_modules','.modules.yaml'),'utf8'),/nodeLinker: hoisted/)
  assert.equal(workspace.accepts(session(b),user(v)),false)
  profiles.current={name,dir:target}
  const bound=new DesktopLoginWorkspace(profiles,'production',secrets,identity,path.join(root,'data'))
  assert.equal(bound.accepts(session(b),user(v)),true); assert.equal(bound.accepts(session(a),user(v)),false)
  assert.equal(await bound.enter(session(b),user(v)),true)
  await writeFile(path.join(target,'cordis.patch.yml'),config.replace('# FutureStaff role market workspace v2','# FutureStaff role market workspace v1'))
  assert.equal(await bound.enter(session(b),user(v)),false)
  assert.equal(selected.at(-1),name)
  const upgraded=await readFile(path.join(target,'cordis.patch.yml'),'utf8')
  assert.ok(upgraded.includes('# FutureStaff role market workspace v2'))
  assert.equal(await bound.enter(session(b),user(v)),true)
})


test('GEO upgrades preserve local data and keep the old Host locked until current-profile restart', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'fixture-geo-workspaces-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'futurestaff-alpha');await mkdir(source,{recursive:true});
  await writeFile(path.join(source,'package.json'),JSON.stringify({name:'fixture',dependencies:{}}));
  await writeFile(path.join(source,'cordis.patch.yml'),'[]\n');
  for(const file of ['pnpm-workspace.yaml','pnpm-lock.yaml'])await writeFile(path.join(source,file),'fixture');
  await mkdir(path.join(source,'node_modules'),{recursive:true});await writeFile(path.join(source,'node_modules','.modules.yaml'),'fixture');
  for(const module of ['fs-core','fs-platform-access','fs-product-hub-ui','fs-douyin-ui','fs-geo']){
    const dir=path.join(source,'node_modules','@futurestaff',module);await mkdir(path.join(dir,'lib','ui'),{recursive:true});
    await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'@futurestaff/'+module}));
    await writeFile(path.join(dir,'lib','index.js'),'export const fixture=true');
    await writeFile(path.join(dir,'lib','ui','index.html'),'<main>GEO code fixture</main>');
  }
  const identity=workspaceIdentity('production',b,v),name=workspaceName(identity),target=path.join(root,name);
  const values=new Map(),secrets={available:async()=>true,has:async k=>values.has(k),read:async k=>values.get(k),write:async(k,val)=>values.set(k,val),delete:async k=>values.delete(k)};
  let restarts=0;
  const profiles={current:{name:'futurestaff-alpha',dir:source},list:()=>[{name,dir:target,webCapable:true}],select:async()=>{},restartCurrent:async()=>{restarts++}};
  await new DesktopLoginWorkspace(profiles,'production',secrets).enter(session(b),user(v));
  profiles.current={name,dir:target};
  const data=path.join(root,'local-data');await mkdir(data);await writeFile(path.join(data,'geo-user-data'),'preserve');
  await writeFile(path.join(source,'package.json'),JSON.stringify({name:'fixture',dependencies:{'@futurestaff/fs-geo':'0.1.0'}}));
  const workspace=new DesktopLoginWorkspace(profiles,'production',secrets,identity);
  assert.equal(await workspace.enter(session(b),user(v)),false);assert.equal(restarts,1);
  assert.equal(await readFile(path.join(data,'geo-user-data'),'utf8'),'preserve');
  assert.ok(JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).dependencies['@futurestaff/fs-geo']);
  assert.equal(await readFile(path.join(target,'node_modules','@futurestaff','fs-geo','lib','ui','index.html'),'utf8'),'<main>GEO code fixture</main>');
  assert.equal(await workspace.enter(session(b),user(v)),false);
  assert.equal(await new DesktopLoginWorkspace(profiles,'production',secrets,identity).enter(session(b),user(v)),true);
});

test('video upgrades preserve local data and keep the old Host locked until current-profile restart', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'fixture-video-workspaces-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'futurestaff-alpha');await mkdir(source,{recursive:true});
  await writeFile(path.join(source,'package.json'),JSON.stringify({name:'fixture',dependencies:{}}));
  await writeFile(path.join(source,'cordis.patch.yml'),'[]\n');
  for(const file of ['pnpm-workspace.yaml','pnpm-lock.yaml'])await writeFile(path.join(source,file),'fixture');
  await mkdir(path.join(source,'node_modules'),{recursive:true});await writeFile(path.join(source,'node_modules','.modules.yaml'),'fixture');
  for(const module of ['fs-core','fs-platform-access','fs-product-hub-ui','fs-douyin-ui','fs-video']){
    const dir=path.join(source,'node_modules','@futurestaff',module);await mkdir(path.join(dir,'lib','ui'),{recursive:true});
    await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'@futurestaff/'+module}));
    await writeFile(path.join(dir,'lib','index.js'),'export const fixture=true');
    await writeFile(path.join(dir,'lib','ui','index.html'),'<main>Video code fixture</main>');
  }
  const identity=workspaceIdentity('production',b,v),name=workspaceName(identity),target=path.join(root,name);
  const values=new Map(),secrets={available:async()=>true,has:async k=>values.has(k),read:async k=>values.get(k),write:async(k,val)=>values.set(k,val),delete:async k=>values.delete(k)};
  let restarts=0;
  const profiles={current:{name:'futurestaff-alpha',dir:source},list:()=>[{name,dir:target,webCapable:true}],select:async()=>{},restartCurrent:async()=>{restarts++}};
  await new DesktopLoginWorkspace(profiles,'production',secrets).enter(session(b),user(v));
  profiles.current={name,dir:target};
  const data=path.join(root,'local-data');await mkdir(data);await writeFile(path.join(data,'video-user-data'),'preserve');
  await writeFile(path.join(source,'package.json'),JSON.stringify({name:'fixture',dependencies:{'@futurestaff/fs-video':'0.1.0'}}));
  const workspace=new DesktopLoginWorkspace(profiles,'production',secrets,identity);
  assert.equal(await workspace.enter(session(b),user(v)),false);assert.equal(restarts,1);
  assert.equal(await readFile(path.join(data,'video-user-data'),'utf8'),'preserve');
  assert.ok(JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).dependencies['@futurestaff/fs-video']);
  assert.equal(await readFile(path.join(target,'node_modules','@futurestaff','fs-video','lib','ui','index.html'),'utf8'),'<main>Video code fixture</main>');
  assert.equal(await workspace.enter(session(b),user(v)),false);
  assert.equal(await new DesktopLoginWorkspace(profiles,'production',secrets,identity).enter(session(b),user(v)),true);
});
