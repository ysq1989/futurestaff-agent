import type {ToolSchema} from '@deepseek-ai/dsh-llm'
import {semanticAliases} from './semantic-contract.generated.js'
const reserved=(name:string)=>/^semantics[._]/i.test(name)
/** Per-request offered-tool-only mapping. History does not introduce new grants. */
export function semanticWire(tools:readonly ToolSchema[]){
 const forward=new Map<string,string>(),reverse=new Map<string,string>()
 for(const tool of tools){const pair=semanticAliases.find(x=>x.canonical===tool.name);if(pair){forward.set(pair.canonical,pair.wire);reverse.set(pair.wire,pair.canonical)}else if(reserved(tool.name))throw Error('SEMANTIC_WIRE_NOT_REGISTERED')}
 const outbound=(name:string)=>{const wire=forward.get(name);if(wire)return wire;if(reverse.has(name))return name;if(reserved(name))throw Error('SEMANTIC_WIRE_NOT_REGISTERED');return name}
 return{tools:tools.map(tool=>({...tool,name:outbound(tool.name)})),history:(messages:unknown[])=>messages.map(message=>{const v=message as {role?:string;toolCalls?:{name:string}[]};return v.role==='assistant'&&v.toolCalls?{...v,toolCalls:v.toolCalls.map(call=>({...call,name:outbound(call.name)}))}:message}),inbound:(name:string)=>{const canonical=reverse.get(name);if(canonical)return canonical;if(reserved(name))throw Error('SEMANTIC_WIRE_NOT_REGISTERED');return name}}
}
