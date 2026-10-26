import {translateTemplate} from './template-translations.js'
import {businessSystems} from '../business-scope.js'
import {applicationsAllowed,type SystemApplicationId} from '../system-policy.js'

export type AssistantKind='system'|'general'
export interface TalentClassificationSource {
  name?:string;category?:string;module?:string|null;businessSystems?:readonly string[];requiredApplications?:readonly string[];classificationKnown?:boolean;
}

/** Public desktop projection of Platform AgentTemplate; executable recipe data stays in Host. */
export interface TalentTemplate extends TalentClassificationSource {
  templateId:string;version:string;name:string;description:string;icon:string;category:string;
  capabilityBullets:string[];compatible:boolean;unavailableReason:string|null;
  requiredApplications:string[];
  /** Negotiated local adapter metadata for display; authorization remains in Host. */
  tools?:readonly string[];
}
export type TalentTab=AssistantKind
export type TalentFilter='all'|AssistantKind

// Platform backend/app/api/agents.py explicitly associates these categories with modules.
const systemCategories=new Set(['erp-system','vietnam-visa-system'])
const systemScopes=new Set<string>(businessSystems)
const systemModules=new Set([...businessSystems,'product_hub','vietnam_immigration'])
// Desktop recipes omit system policies/tools. These exact builtin pairs are verified in
// FutureStaff-platform/backend/agent_templates; classification grants no corresponding tool access.
const builtinSystemAssociations=[
  // website-designer/meta.yaml: default_autonomy_policy.business_systems: ["web"].
  {name:'Web Agent 网站设计师',category:'software-development'},
  // product-selection-specialist/meta.yaml: default_autonomy_policy.call_product_hub_api: "L2".
  {name:'Product Selection Specialist',category:'marketing'},
  // agent-admin/meta.yaml + soul.md: the Agent management role explicitly uses call_agent_admin_api.
  {name:'Agent管理员',category:'my-talent'},
] as const

export const talentApplicationIds=['agent','erp','shop','product_hub','geo','vietnam_immigration','web'] as const
const systemApplication:Record<string,string>={erp:'erp',shop:'shop','product-hub':'product_hub',geo:'geo',visa:'vietnam_immigration',web:'web',product_hub:'product_hub',vietnam_immigration:'vietnam_immigration',agent:'agent'}
export interface TalentAccessSnapshot {activeTenantId?:string;applications?:readonly {appId:string;tenantId:string;capabilities:readonly string[]}[]}
export function talentRequiredApplications(source:TalentClassificationSource):string[]|null{
  if(source.classificationKnown===false)return null
  const required:string[]=[]
  if(source.requiredApplications!==undefined){
    if(!Array.isArray(source.requiredApplications)||new Set(source.requiredApplications).size!==source.requiredApplications.length
      ||source.requiredApplications.some(id=>!talentApplicationIds.includes(id as typeof talentApplicationIds[number])))return null
    required.push(...source.requiredApplications)
  }
  if(source.businessSystems!==undefined){
    if(!Array.isArray(source.businessSystems)||source.businessSystems.some(system=>!systemScopes.has(system)))return null
    required.push(...source.businessSystems.map(system=>systemApplication[system]!))
  }
  if(source.module){if(!systemApplication[source.module])return null;required.push(systemApplication[source.module]!)}
  if(source.category==='erp-system')required.push('erp')
  else if(source.category==='vietnam-visa-system')required.push('vietnam_immigration')
  else if(source.category?.endsWith('-system'))return null
  if(source.name==='Web Agent 网站设计师'&&source.category==='software-development')required.push('web')
  if(source.name==='Product Selection Specialist'&&source.category==='marketing')required.push('product_hub')
  if(source.name==='Agent管理员'&&source.category==='my-talent')required.push('agent')
  return [...new Set(required)]
}
export function talentApplicationAccess(source:TalentClassificationSource,identity:TalentAccessSnapshot):boolean{
  const required=talentRequiredApplications(source)
  return required!==null&&applicationsAllowed({tenantId:identity.activeTenantId??'',applications:identity.applications??[]},required as SystemApplicationId[])
}
/** Changes within the same member invalidate in-flight work just like an owner change. */
export function talentApplicationKey(identity:TalentAccessSnapshot):string{
  return JSON.stringify([identity.activeTenantId??'',(identity.applications??[]).map(app=>[app.appId,app.tenantId,
    Array.isArray(app.capabilities)?[...app.capabilities].sort():[]]).sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)))])
}

/** Display classification only; a business association never grants tool or system access. */
export function talentAssistantKind(template:TalentClassificationSource):AssistantKind{
  const scoped=Array.isArray(template.businessSystems)&&template.businessSystems.some(system=>systemScopes.has(system))
  return (Array.isArray(template.requiredApplications)&&template.requiredApplications.length>0)||scoped||systemModules.has(template.module??'')||systemCategories.has(template.category??'')
    ||builtinSystemAssociations.some(item=>item.name===template.name&&item.category===template.category)?'system':'general'
}
export function talentTabs(_templates:readonly TalentTemplate[]=[],_appIds:readonly string[]=[]):{id:TalentTab;label:string}[]{
  return [{id:'system',label:'系统助手'},{id:'general',label:'通用助手'}]
}
export function talentTemplateDisplay(template:TalentTemplate,isChinese=true):{name:string;description:string;bullets:string[]}{
  const translated=translateTemplate({...template,capability_bullets:template.capabilityBullets},isChinese)
  // Local system adapters have narrower capabilities than their cloud namesakes.
  return template.tools?.length&&talentAssistantKind(template)==='system'
    ?{name:translated.name,description:template.description,bullets:[...template.capabilityBullets]}
    :translated
}
export function filterTalentTemplates<T extends TalentTemplate>(templates:readonly T[],tab:TalentFilter,query:string,isChinese=true):T[]{
  const search=query.trim().toLocaleLowerCase()
  return templates.filter(template=>{
    if(tab!=='all'&&talentAssistantKind(template)!==tab)return false
    if(search){
      const display=talentTemplateDisplay(template,isChinese)
      return [template.name,template.description,...template.capabilityBullets,display.name,display.description,...display.bullets,template.category]
        .join(' ').toLocaleLowerCase().includes(search)
    }
    return true
  })
}
