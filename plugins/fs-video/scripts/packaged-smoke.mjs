import {cp,mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'.runtime','packaged-smoke')
await mkdir(output,{recursive:true});await cp(path.join(root,'lib'),path.join(output,'lib'),{recursive:true});await writeFile(path.join(output,'package.json'),JSON.stringify({name:'video-packaged-smoke',type:'module',private:true}))
const{VideoEngine}=await import(pathToFileURL(path.join(output,'lib/engine.js')).href)
const runtime=JSON.parse(await readFile(process.argv[2],'utf8')),engine=new VideoEngine({workspaceRoot:path.join(output,'member-workspace'),ownerKey:'packaged-smoke-member',runtime})
const p=await engine.create({requestId:'packaged-smoke-'+Date.now(),title:'咖啡店包装副本验收',brief:'虚构案例，仅验证复制lib后的真实配音和浏览器渲染，不使用源码assets。',aspectRatio:'16:9',scenes:[{id:'welcome',visual:'hero',title:'午后新品，到店了解',narration:'咖啡新品，到店了解。',lines:['示例风味','活动以门店公布为准'],durationSeconds:3}],voice:{provider:'edge'},music:'gentle'})
const job=await engine.render({requestId:'packaged-render-'+Date.now(),projectId:p.projectId,revisionId:p.revisionId,profile:'preview'})
for(;;){const state=await engine.status({projectId:p.projectId,jobId:job.jobId});if(['failed','cancelled'].includes(state.status))throw Error(JSON.stringify(state.error));if(state.status==='succeeded'){await writeFile(path.join(output,'packaged-smoke.json'),JSON.stringify({onlyLibCopied:true,sourceAssetsRequired:false,projectId:p.projectId,result:state.result},null,2));console.log(JSON.stringify({complete:true,result:state.result}));break}await new Promise(r=>setTimeout(r,500))}
