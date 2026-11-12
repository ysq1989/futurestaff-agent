import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createCloudServer} from './server.js'
const key=process.env.AGENT_ENCRYPTION_KEY
if(!key)throw Error('AGENT_ENCRYPTION_KEY is required')
const port=Number(process.env.PORT??3181)
const service=await createCloudServer({publicOrigin:process.env.AGENT_PUBLIC_ORIGIN??'https://agent.fsstory.net',platformOrigin:process.env.PLATFORM_ORIGIN??'https://platform.fsstory.net',dataDir:process.env.AGENT_DATA_DIR??'/data',encryptionKey:key,staticDir:process.env.AGENT_STATIC_DIR??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../agent-mobile/dist'),buildId:process.env.AGENT_BUILD_ID??'development',trustProxy:process.env.AGENT_TRUST_PROXY==='true',logger:record=>process.stdout.write(JSON.stringify({time:new Date().toISOString(),...record})+'\n')})
service.server.listen(port,process.env.HOST??'127.0.0.1',()=>process.stdout.write(JSON.stringify({event:'listening',port})+'\n'))
let closing=false
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{if(closing)return;closing=true;void service.close().then(()=>process.exit(0)).catch(()=>process.exit(1));setTimeout(()=>process.exit(1),25000).unref()})
