import {spawnSync} from 'node:child_process'
import {existsSync,copyFileSync,cpSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const compiler=path.resolve(root,'../../node_modules/typescript/bin/tsc')
const result=spawnSync(process.execPath,[compiler,'-p',path.join(root,'tsconfig.json')],{stdio:'inherit'})
if(result.status!==0)process.exit(result.status??1)
cpSync(path.join(root,'assets'),path.join(root,'lib/assets'),{recursive:true})
for(const name of ['runtime-lock.json','runtime-files.json']){
  const lock=path.join(root,'src',name)
  if(!existsSync(lock))throw Error('Missing packaged video runtime lock: '+name)
  copyFileSync(lock,path.join(root,'lib',name))
}
