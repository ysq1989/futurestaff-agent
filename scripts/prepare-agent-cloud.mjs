import {builtinModules,createRequire} from 'node:module'
import {copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const source=fileURLToPath(new URL('../',import.meta.url)),templates=path.join(source,'docker/agent-cloud')
const output=path.resolve(process.argv[2]??path.join(source,'dist/agent-cloud'))
const context=path.join(output,'context'),runtime=path.join(context,'runtime')
const require=createRequire(path.join(source,'package.json')),{build}=require('esbuild')
await mkdir(runtime,{recursive:true})
const result=await build({entryPoints:[path.join(source,'apps/agent-cloud/src/cli.ts')],outfile:path.join(runtime,'server.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'@futurestaff/fs-platform-access/cloud':path.join(source,'plugins/fs-platform-access/src/cloud.ts')},metafile:true,legalComments:'eof'})
const builtins=new Set(builtinModules.map(n=>n.replace(/^node:/,''))),externals=new Set()
for(const file of Object.values(result.metafile.outputs))for(const imp of file.imports)if(imp.external&&!builtins.has(imp.path.replace(/^node:/,'')))externals.add(imp.path.startsWith('@')?imp.path.split('/').slice(0,2).join('/'):imp.path.split('/')[0])
const manifest=JSON.parse(await readFile(path.join(templates,'runtime/package.json'),'utf8'))
if([...externals].sort().join()!==Object.keys(manifest.dependencies).sort().join())throw Error('Runtime imports changed: update and review isolated runtime manifest/lock')
const cloudRequire=createRequire(path.join(source,'apps/agent-cloud/package.json'))
for(const [name,version] of Object.entries(manifest.dependencies)){
  let directory=path.dirname(cloudRequire.resolve(name)),found=false
  while(directory!==path.dirname(directory)){
    try{const p=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));if(p.name===name){if(p.version!==version)throw Error(`Runtime version mismatch: ${name}`);found=true;break}}catch(e){if(e.code!=='ENOENT')throw e}
    directory=path.dirname(directory)
  }
  if(!found)throw Error('Unresolved runtime package: '+name)
}
const frontend=path.join(source,'apps/agent-mobile/dist'),html=await readFile(path.join(frontend,'index.html'))
const sourceHash=createHash('sha256').update(await readFile(path.join(runtime,'server.mjs'))).update(html).digest('hex'),buildId='0.1.0-'+sourceHash.slice(0,12)
await writeFile(path.join(runtime,'bundle-manifest.json'),JSON.stringify({version:'0.1.0',buildId,sourceHash,bundledInputs:Object.keys(result.metafile.inputs).map(f=>path.relative(source,path.resolve(source,f)).replaceAll('\\','/')).sort(),externalDependencies:manifest.dependencies},null,2)+'\n')
for(const f of ['package.json','package-lock.json'])await copyFile(path.join(templates,'runtime',f),path.join(runtime,f))
for(const f of ['Dockerfile','.dockerignore'])await copyFile(path.join(templates,f),path.join(context,f))
for(const f of ['compose.yaml','nginx.agent.fsstory.net.conf'])await copyFile(path.join(templates,f),path.join(output,f))
await cp(frontend,path.join(context,'public'),{recursive:true})
await writeFile(path.join(output,'release.json'),JSON.stringify({buildId,sourceHash,domain:'agent.fsstory.net'},null,2)+'\n')
console.log(JSON.stringify({output,buildId,sourceHash}))
