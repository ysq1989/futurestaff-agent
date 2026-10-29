import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {materializeCommerceSkills,commerceSkillNames} from '../lib/bundled-commerce-skills.js'
const desktopRequire=createRequire(new URL('../../../desktop-shell/dsh-plugin-desktop/package.json',import.meta.url))
const {FileSystemSkillProvider}=await import(pathToFileURL(desktopRequire.resolve('@deepseek-ai/dsh-skill-filesystem')).href)

test('real native provider discovers all four production skills plus shared library and preserves local changes',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'fs-commerce-skills-')),controller=new AbortController()
 const provider=new FileSystemSkillProvider({get:()=>undefined,logger:{warn(){}}},{invalidate(){},signal:controller.signal},{watch:false,dshHome:path.join(workspace,'no-global'),agentsHome:path.join(workspace,'no-agents')})
 try{
  await materializeCommerceSkills(workspace)
  const listed=await provider.list({cwd:workspace}),skills=Array.isArray(listed)?listed:listed.candidates
  for(const name of commerceSkillNames){const candidate=skills.find(skill=>skill.name===name);assert.ok(candidate,name);const content=await provider.get(candidate,{signal:controller.signal});assert.ok(content)}
  const filename=path.join(workspace,'.agents','skills','commerce-banner','SKILL.md')
  await writeFile(filename,'Member-owned version')
  await materializeCommerceSkills(workspace)
  assert.equal(await readFile(filename,'utf8'),'Member-owned version')
 }finally{controller.abort();await provider.dispose();await rm(workspace,{recursive:true,force:true})}
})
