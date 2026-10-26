import test from 'node:test'
import assert from 'node:assert/strict'
import * as model from '../lib/client/talent-market-model.js'
import {decodeTalentCard} from '../lib/client/installed-talents.js'
const {filterTalentTemplates,talentTabs,talentTemplateDisplay}=model

const template=(name,category,compatible=true)=>({templateId:name,version:'a'.repeat(64),name,description:'Platform description',icon:'PM',category,capabilityBullets:['Platform capability'],compatible,unavailableReason:compatible?null:'Requires platform tools'})
const templates=[template('Project Manager','office'),template('ERP 库存助理','erp-system',false),template('Vietnam Visa Agent','vietnam-visa-system',false),template('私有专家','my-talent'),template('Other specialist','research'),template('Growth Hacker','marketing'),template('Frontend Developer','software-development'),template('Web Agent 网站设计师','software-development',false)]

test('assistant categories are independent of account applications and local installation status',()=>{
 const expected=[{id:'system',label:'系统助手'},{id:'general',label:'通用助手'}]
 assert.deepEqual(talentTabs(templates,['erp','vietnam_immigration']),expected)
 assert.deepEqual(talentTabs(templates,[]),expected)
 assert.deepEqual(talentTabs([],['agent','web','geo']),expected)
 assert.deepEqual(filterTalentTemplates(templates,'system','').map(item=>item.name),['ERP 库存助理','Vietnam Visa Agent','Web Agent 网站设计师'])
 assert.deepEqual(filterTalentTemplates(templates,'general','').map(item=>item.name),['Project Manager','私有专家','Other specialist','Growth Hacker','Frontend Developer'])
 const partition=['system','general'].flatMap(kind=>filterTalentTemplates(templates,kind,'').map(item=>item.templateId))
 assert.equal(new Set(partition).size,templates.length)
 assert.equal(partition.length,templates.length)
 assert.equal(talentTabs(templates,[]).some(tab=>tab.id==='my-talent'),false)
})

test('only explicit business associations or verified builtin metadata identify system assistants',()=>{
 assert.equal(typeof model.talentAssistantKind,'function')
 const kind=model.talentAssistantKind
 for(const category of ['office','marketing','software-development','my-talent','research','trading','future-system']){
  assert.equal(kind({...template('ERP Shop GEO administrator',category),description:'Uses every business system'}),'general',category)
 }
 assert.equal(kind(template('Renamed inventory role','erp-system')),'system')
 assert.equal(kind(template('Renamed visa role','vietnam-visa-system')),'system')
 assert.equal(kind(template('Web Agent 网站设计师','software-development')),'system')
 assert.equal(kind(template('Web Agent 网站设计师','marketing')),'general')
 assert.equal(kind(template('Other website designer','software-development')),'general')
 assert.equal(kind({...template('Published shop role','marketing'),businessSystems:['shop']}),'system')
 assert.equal(kind({...template('Published Web role','software-development'),businessSystems:['web']}),'system')
 assert.equal(kind({...template('Published Hub role','general'),businessSystems:['product-hub']}),'system')
 assert.equal(kind({...template('Published ERP role','general'),module:'erp'}),'system')
 assert.equal(kind({...template('Published visa role','general'),module:'vietnam_immigration'}),'system')
 assert.equal(kind({...template('Fashion Launch Assistant','marketing'),businessSystems:[]}),'general')
 assert.equal(kind({...template('Unknown module','general'),module:'not-a-business-system',businessSystems:['unknown']}),'general')
 assert.equal(kind({...template('General Agent','office'),module:'agent'}),'general')
 assert.equal(kind({...template('Local tools','office'),compatible:false,unavailableReason:'配套 Skills 或连接器尚未适配 DSH'}),'general')
 assert.equal(kind({businessSystems:['geo']}),'system')
 assert.equal(kind({}),'general')
})

test('verified Product Hub and Agent administration templates are system assistants',()=>{
 const kind=model.talentAssistantKind
 const productSelection=template('Product Selection Specialist','marketing',false)
 const agentAdmin=template('Agent管理员','my-talent',false)
 const fashion={...template('服装电商上新助手','marketing',false),businessSystems:[]}
 assert.equal(kind(productSelection),'system')
 assert.equal(kind(agentAdmin),'system')
 assert.equal(kind(fashion),'general')
 assert.equal(kind(template('Product Selection Specialist','office')),'general')
 assert.equal(kind(template('Agent管理员','office')),'general')
 assert.deepEqual(filterTalentTemplates([productSelection,agentAdmin,fashion],'system',''),[productSelection,agentAdmin])
 assert.deepEqual(filterTalentTemplates([productSelection,agentAdmin,fashion],'general',''),[fashion])
})

test('category search intersects the classification while all-assistant search matches localized content',()=>{
 assert.equal(talentTemplateDisplay(templates[0]).name,'项目经理')
 assert.deepEqual(filterTalentTemplates(templates,'general','库存'),[])
 assert.deepEqual(filterTalentTemplates(templates,'system','库存').map(item=>item.name),['ERP 库存助理'])
 assert.deepEqual(filterTalentTemplates(templates,'system','越南签证').map(item=>item.name),['Vietnam Visa Agent'])
 assert.deepEqual(filterTalentTemplates(templates,'system','项目经理'),[])
 assert.deepEqual(filterTalentTemplates(templates,'all','项目经理').map(item=>item.name),['Project Manager'])
 assert.deepEqual(filterTalentTemplates(templates,'all','库存').map(item=>item.name),['ERP 库存助理'])
 assert.deepEqual(filterTalentTemplates(templates,'all','Platform capability').length,templates.length)
 assert.equal(filterTalentTemplates(templates,'system','Platform capability').length,3)
 assert.equal(filterTalentTemplates(templates,'general','Platform capability').length,5)
 assert.deepEqual(filterTalentTemplates(templates,'all',''),templates)
 assert.deepEqual(filterTalentTemplates(templates,'general','not-a-template'),[])
 assert.equal(talentTemplateDisplay(templates[0],false).name,'Project Manager')
 assert.deepEqual(talentTemplateDisplay(templates[4]),{name:'Other specialist',description:'Platform description',bullets:['Platform capability']})
})

test('system visibility requires every current-tenant application and nonempty capabilities',()=>{
 assert.equal(typeof model.talentApplicationAccess,'function')
 const application=(appId,tenantId='tenant',capabilities=[appId==='web'?'web.manage':appId==='agent'?'agent.admin':appId==='vietnam_immigration'?'visa.read':appId+'.read'])=>({appId,tenantId,capabilities})
 const identity={activeTenantId:'tenant',applications:[application('erp'),application('web'),application('product_hub'),application('vietnam_immigration'),application('agent')]}
 const allow=model.talentApplicationAccess
 assert.equal(allow({requiredApplications:[]},{activeTenantId:'tenant',applications:[]}),true)
 assert.equal(allow({requiredApplications:['erp','web']},identity),true)
 assert.equal(allow({requiredApplications:['erp','shop']},identity),false)
 assert.equal(allow({requiredApplications:['unknown']},identity),false)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','other')]}),false)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','tenant',[])]}),false)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','tenant',[''])]}),false)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','tenant',['read',''])]}),false)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','tenant',[' '])]}),false)
 assert.equal(allow({requiredApplications:['web']},{...identity,applications:[application('web','tenant',['web.access'])]}),false)
 assert.equal(allow({requiredApplications:['agent']},{...identity,applications:[application('agent','tenant',['agent.read'])]}),false)
 assert.equal(allow({requiredApplications:['web']},{...identity,applications:[application('web','tenant',['web.manage'])]}),true)
 assert.equal(allow({requiredApplications:['agent']},{...identity,applications:[application('agent','tenant',['agent.admin'])]}),true)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','tenant',['visa.read'])]}),false)
 assert.equal(allow({requiredApplications:['erp']},{...identity,applications:[application('erp','tenant',['erp.unknown'])]}),false)
 assert.equal(allow({businessSystems:['erp','product-hub','visa']},identity),true)
 assert.equal(allow({businessSystems:['shop']},identity),false)
 assert.equal(allow({businessSystems:['unknown']},identity),false)
 assert.equal(allow({classificationKnown:false},identity),false)
 assert.equal(allow({name:'Agent管理员',category:'my-talent'},identity),true)
 assert.equal(allow({name:'Agent管理员',category:'my-talent'},{...identity,applications:[]}),false)
 assert.equal(allow({name:'Unclassified',category:'future-system'},identity),false)
 assert.notEqual(model.talentApplicationKey(identity),model.talentApplicationKey({...identity,applications:[]}))
 assert.notEqual(model.talentApplicationKey(identity),model.talentApplicationKey({...identity,applications:[application('erp','tenant',[])]}))
})

test('renderer template DTO requires explicit bounded application metadata',()=>{
 const source={...template('Project Manager','office'),templateId:'10000000-0000-4000-8000-000000000001'}
 assert.throws(()=>decodeTalentCard(source),/目录格式不兼容/)
 assert.throws(()=>decodeTalentCard({...source,requiredApplications:['unknown']}),/目录格式不兼容/)
 assert.throws(()=>decodeTalentCard({...source,requiredApplications:['erp','erp']}),/目录格式不兼容/)
 assert.deepEqual(decodeTalentCard({...source,requiredApplications:[]}).requiredApplications,[])
 assert.deepEqual(decodeTalentCard({...source,requiredApplications:['erp','web']}).requiredApplications,['erp','web'])
})

test('0.3 system cards keep server local capabilities through DTO decoding while retaining translated names',()=>{
 const rows=[
  {name:'Product Selection Specialist',category:'marketing',application:'product_hub',tools:['call_product_hub_api'],translatedName:'选品顾问',capabilityBullets:['查询获授权商品与私有货池','建立和查看私有选品草稿','最终审核在权威工作台人工完成']},
  {name:'Vietnam Visa Agent',category:'vietnam-visa-system',application:'vietnam_immigration',tools:['visa_query'],translatedName:'越南签证 Agent',capabilityBullets:['查询当前岗位允许的案件与进度','核对材料配置与业务事件','提交和支付在签证工作台人工完成']},
 ]
 for(const [index,row]of rows.entries()){
  const source={...template(row.name,row.category),templateId:`10000000-0000-4000-8000-00000000000${index+1}`,requiredApplications:[row.application],tools:row.tools,description:'服务器声明的本地受限业务能力',capabilityBullets:row.capabilityBullets}
  assert.deepEqual(talentTemplateDisplay(source).bullets,row.capabilityBullets,'the static cloud translation must not replace local capability boundaries')
  const card=decodeTalentCard(source),display=talentTemplateDisplay(card)
  assert.deepEqual(card.tools,row.tools,'the public decoder must retain the negotiated display metadata')
  assert.equal(display.name,row.translatedName)
  assert.equal(display.description,source.description)
  assert.deepEqual(display.bullets,row.capabilityBullets)
  assert.doesNotMatch(display.bullets.join(' '),/发布 H5|货池维护|网签与支付|支付链接/)
  assert.deepEqual(talentTemplateDisplay(card,false),{name:row.name,description:source.description,bullets:row.capabilityBullets})
 }
 const generic=decodeTalentCard({...template('Project Manager','office'),templateId:'10000000-0000-4000-8000-000000000003',requiredApplications:[],tools:[]})
 assert.equal(talentTemplateDisplay(generic).name,'项目经理')
 assert.equal(talentTemplateDisplay(generic).description,'管理项目时间线、任务派发、跨团队协调和进度汇报。')
 assert.deepEqual(talentTemplateDisplay(generic).bullets,['项目规划与里程碑','状态报告与仪表盘','跨团队协调'])
})

test('negotiated system display tool metadata is optional for legacy rows and strict when supplied',()=>{
 const source={...template('Project Manager','office'),templateId:'10000000-0000-4000-8000-000000000004',requiredApplications:[]}
 assert.equal(decodeTalentCard(source).tools,undefined)
 for(const tools of ['visa_query',['visa_query','visa_query'],['bad name'],Array.from({length:65},(_,n)=>'tool_'+n)])assert.throws(()=>decodeTalentCard({...source,tools}),/目录格式不兼容/)
})
