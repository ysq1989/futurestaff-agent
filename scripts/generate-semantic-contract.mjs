import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
const source=path.resolve(import.meta.dirname,'../../FutureStaff-platform/backend/app/contracts/semantic_tool_aliases.v1.json')
const value=JSON.parse(await readFile(source,'utf8'))
if(value.contract_version!=='1.0.0'||value.tools.length!==3||new Set(value.tools.map(t=>t.canonical)).size!==3||new Set(value.tools.map(t=>t.wire)).size!==3)throw Error('Invalid semantic alias contract')
const target=path.resolve(import.meta.dirname,'../plugins/fs-platform-access/src/semantic-contract.generated.ts')
await writeFile(target,'/** Generated from Platform semantic_tool_aliases.v1.json; run scripts/generate-semantic-contract.mjs. */\n'+[
 ['semanticAliases',value.tools],['semanticToolNames',value.tools.map(t=>t.canonical)],['semanticWireNames',value.tools.map(t=>t.wire)]
].map(([name,data])=>'export const '+name+'='+JSON.stringify(data)+' as const').join('\n')+'\n')
const fixtures=path.resolve(import.meta.dirname,'../plugins/fs-platform-access/test/fixtures/semantics')
await mkdir(fixtures,{recursive:true})
await writeFile(path.join(fixtures,'semantic_tool_aliases.v1.json'),JSON.stringify(value,null,2)+'\n')
