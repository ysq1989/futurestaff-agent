import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import {WebsiteService, type WebsiteIdentity} from './website.js'

export function mountWebsite(ctx:Context,origin:string,authorize:(sessionId:string,tool:string)=>Promise<WebsiteIdentity>){
 const service=new WebsiteService(origin,authorize)
 ctx.inject(['tools'],toolCtx=>{
  for(const definition of [
   {name:'website_image_save',description:'把本智能体在当前员工会话下已完成的图片请求保存为 Website 私有设计候选。仅已开通且获权时可用，先查 website_tools 中 media 上传能力。Host直接传输真实字节，不复制图片base64或凭据，不发布正式站。失败重试沿用同 requestId；imageRequestId 来自实际生图结果。',parameters:{type:'object',properties:{requestId:{type:'string',format:'uuid'},imageRequestId:{type:'string',format:'uuid'},fileName:{type:'string',maxLength:100}},required:['requestId','imageRequestId'],additionalProperties:false},run:(id:string,input:unknown)=>service.saveImage(id,input as {requestId:string;imageRequestId:string;fileName?:string})},
   {name:'website_tools',description:'核实当前主体 Web 系统及员工权限，返回 standalone（未开通，继续独立设计）、connected 和实时工具参数，或 forbidden/unavailable。先调用本工具，不能把连接失败当未开通。',parameters:{type:'object',properties:{},additionalProperties:false},run:(id:string,_input:unknown)=>service.tools(id)},
   {name:'website_call',description:'调用 website_tools 实际返回的 Website 工具，保存需求/草稿并构建 Demo。name 与 arguments 必须符合实时参数。无正式发布或任意代码执行权限；发布在 Website 人工界面确认。写入超时保留原 requestId，不换 ID 重复提交。',parameters:{type:'object',properties:{name:{type:'string',pattern:'^website_[a-z_]+$'},arguments:{type:'object',additionalProperties:true}},required:['name','arguments'],additionalProperties:false},run:(id:string,input:unknown)=>service.call(id,input as {name:string;arguments:Record<string,unknown>})}
  ])toolCtx.effect(()=>toolCtx.tools.register({name:definition.name,description:definition.description,parameters:definition.parameters,output:{schema:{type:'object',additionalProperties:true},render:(_input,value)=>[{type:'text',text:JSON.stringify(value)}]},execute:async(input,exec)=>{if(!exec.agent)throw Error('AGENT_SESSION_REQUIRED');return definition.run(exec.agent.id,input)}}))
 })
}
