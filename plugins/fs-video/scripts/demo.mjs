import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {VideoEngine} from '../lib/engine.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const [caseDirectory,runtimeConfig,outputRoot]=process.argv.slice(2)
if(!caseDirectory||!runtimeConfig)throw Error('Usage: node scripts/demo.mjs CASE_DIRECTORY RUNTIME_CONFIG [OUTPUT_ROOT]')
const output=path.resolve(outputRoot??path.join(root,'.demo'))
await mkdir(output,{recursive:true})
const workspace=path.join(output,'environments','dev','tenants','11111111-1111-4111-8111-111111111111','users','22222222-2222-4222-8222-222222222222','agents','33333333-3333-4333-8333-333333333333','workspace')
const runtime=JSON.parse(await readFile(runtimeConfig,'utf8')),engine=new VideoEngine({workspaceRoot:workspace,ownerKey:'demo:coffee:member:agent',runtime})
const initial=JSON.parse(await readFile(path.join(caseDirectory,'initial.create.json'),'utf8')),revised=JSON.parse(await readFile(path.join(caseDirectory,'revised.create.json'),'utf8'))
const project=await engine.create(initial)
async function render(view,requestId){const job=await engine.render({requestId,projectId:view.projectId,revisionId:view.revisionId,profile:'final'});let last='';for(;;){const value=await engine.status({projectId:job.projectId,jobId:job.jobId});if(value.stage!==last){console.log(JSON.stringify({revisionId:job.revisionId,jobId:job.jobId,status:value.status,stage:value.stage,progress:value.progress}));last=value.stage}if(['succeeded','failed','cancelled'].includes(value.status)){if(value.status!=='succeeded')throw Error(JSON.stringify(value.error));return value}await new Promise(resolve=>setTimeout(resolve,1000))}}
const first=await render(project,'coffee-initial-render-v1')
const {requestId:_,...changes}=revised
const revision=await engine.revise({requestId:'coffee-revised-project-v1',projectId:project.projectId,baseRevisionId:project.revisionId,changes:{...changes,theme:'clean'}})
const second=await render(revision,'coffee-revised-render-v1')
const evidence={schemaVersion:1,case:'community-coffee-new-product',syntheticBusinessFacts:true,projectId:project.projectId,initial:{revisionId:project.revisionId,job:first},revised:{revisionId:revision.revisionId,parentRevisionId:project.revisionId,job:second},changes:['同一项目保留初版','改为舒缓原创配乐','强调示例柑橘风味与到店了解','改为清爽配色'],paidApiCalls:0,oldRevisionPreserved:(await engine.get({projectId:project.projectId,revisionId:project.revisionId})).revisionId===project.revisionId}
await writeFile(path.join(output,'coffee-case.json'),JSON.stringify(evidence,null,2))
try{await copyFile(path.join(caseDirectory,'model-evidence.json'),path.join(output,'model-evidence.json'))}catch{}
console.log(JSON.stringify({complete:true,evidence:path.join(output,'coffee-case.json'),first:first.result,second:second.result}))
