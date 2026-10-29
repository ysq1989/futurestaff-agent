import {readFile,lstat,mkdir,writeFile,rename,rm} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {ensureTree,existingTree} from './agents.js'

export const commerceSkillNames=['commerce-library','commerce-product-images','commerce-detail-images','commerce-banner','commerce-video'] as const
const bundlePath=fileURLToPath(new URL('./resources/commerce-skills.json',import.meta.url))
export type CommerceSkillFile={path:string;content:string}

export async function readCommerceBundle(source=bundlePath):Promise<CommerceSkillFile[]>{
 const info=await lstat(source)
 if(!info.isFile()||info.isSymbolicLink()||info.size>128000)throw Error('COMMERCE_SKILL_BUNDLE_INVALID')
 const files=JSON.parse(await readFile(source,'utf8')) as CommerceSkillFile[]
 const seen=new Set<string>()
 if(!Array.isArray(files)||files.length>32)throw Error('COMMERCE_SKILL_BUNDLE_INVALID')
 for(const file of files){
  if(!file||Object.keys(file).sort().join()!=='content,path'||typeof file.path!=='string'||typeof file.content!=='string'
   ||!/^[a-z-]+\/(?:references\/)?[a-zA-Z0-9-]+\.md$/.test(file.path)||!commerceSkillNames.includes(file.path.split('/')[0] as typeof commerceSkillNames[number])
   ||Buffer.byteLength(file.content)>65536||seen.has(file.path))throw Error('COMMERCE_SKILL_BUNDLE_INVALID')
  seen.add(file.path)
 }
 for(const name of commerceSkillNames){const entry=files.find(file=>file.path===name+'/SKILL.md');if(!entry||!entry.content.includes('name: '+name+'\n'))throw Error('COMMERCE_SKILL_BUNDLE_INVALID')}
 return files
}

/** Text-only workflows add no model, business-system or knowledge-publication authority. */
export async function materializeCommerceSkills(workspace:string,source=bundlePath,signal?:AbortSignal){
 if(!path.isAbsolute(workspace))throw Error('COMMERCE_SKILL_WORKSPACE_INVALID')
 const files=await readCommerceBundle(source),parent=path.join(workspace,'.agents','skills')
 signal?.throwIfAborted();await ensureTree(parent)
 for(const name of commerceSkillNames){
  const target=path.join(parent,name)
  try{await existingTree(target);continue}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  const staging=path.join(parent,'.'+name+'-'+randomUUID());await mkdir(staging)
  try{
   for(const file of files.filter(file=>file.path.startsWith(name+'/'))){
    signal?.throwIfAborted();const destination=path.join(staging,...file.path.split('/').slice(1))
    await ensureTree(path.dirname(destination));await writeFile(destination,file.content,{flag:'wx',mode:0o600})
   }
   signal?.throwIfAborted()
   try{await rename(staging,target)}catch(error){await existingTree(target)}
  }finally{
   if(path.dirname(staging)!==parent||!path.basename(staging).startsWith('.commerce-'))throw Error('COMMERCE_SKILL_WORKSPACE_INVALID')
   await rm(staging,{recursive:true,force:true})
  }
 }
}
