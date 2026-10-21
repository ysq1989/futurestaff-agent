import {test} from 'node:test';import assert from 'node:assert/strict';
import {mountGeoAssistant,geoToolSchemas,readAssistantResponse} from '../lib/index.js';
import {assertObjectJsonSchema} from '@deepseek-ai/dsh-tools';
test('GEO parameter schemas pass the actual Harness tool registry schema gate',()=>{
 for(const schema of Object.values(geoToolSchemas))assertObjectJsonSchema(schema);
});
test('native result transport accepts bounded full Chinese answers and cancels oversized streaming responses',async()=>{
 const answer='中文'.repeat(50000);assert.equal((await readAssistantResponse(Response.json({data:{answer}}))).data.answer,answer);
 let cancelled=false;const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(600000));},cancel(){cancelled=true;}});
 await assert.rejects(readAssistantResponse(new Response(body)),/GEO_RESPONSE_LIMIT/);assert.equal(cancelled,true);
});
test('native GEO tools register locally, enforce strict arguments and session scope before any browser or API action',async()=>{
 const definitions=new Map(),events=new Map();let authority=0;
 const host=mountGeoAssistant({effect:fn=>fn(),on:(name,fn)=>events.set(name,fn),tools:{register:def=>{definitions.set(def.name,def);return()=>{};}},
  futurestaffGeoAssistantSession:{authorize:async()=>{authority++;throw Error('GEO_AGENT_CAPABILITY_REQUIRED');}},platformDevLogin:{},
 });
 try{
  assert.deepEqual([...definitions.keys()].sort(),Object.keys(geoToolSchemas).sort());
  for(const tool of definitions.values()){assert.equal(tool.metadata.execution,'local');assert.equal(tool.metadata.tenantScoped,true);}
  const tool=definitions.get('geo_projects_list'),exec={agent:{id:'bound-session'},signal:new AbortController().signal};
  await assert.rejects(tool.execute({tenantId:'forged'},exec));assert.equal(authority,0);
  await assert.rejects(tool.execute({}, {...exec,agent:null}),/GEO_SESSION_REQUIRED/);
  await assert.rejects(tool.execute({},exec),/GEO_AGENT_CAPABILITY_REQUIRED/);assert.equal(authority,1);
  assert.equal((await events.get('tools/pre-execute')({name:'geo_collection_run'},()=>null)).kind,'ask');
  assert.equal(await events.get('tools/pre-execute')({name:'another_tool'},()=>null),null);
 }finally{await host.close();}
});
