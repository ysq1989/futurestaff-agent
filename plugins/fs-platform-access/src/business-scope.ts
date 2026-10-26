/** Platform-owned Agent scope narrows existing human permissions; never grants them. */
export const businessSystems=['shop','erp','product-hub','geo','visa','web'] as const
export type BusinessSystem=typeof businessSystems[number]
export function decodeBusinessSystems(value:unknown):BusinessSystem[]{
 if(!Array.isArray(value)||value.length>businessSystems.length||new Set(value).size!==value.length||value.some(item=>!businessSystems.includes(item as BusinessSystem)))throw Error('AGENT_CONTRACT_INVALID')
 return value as BusinessSystem[]
}
export function toolBusiness(name:string):BusinessSystem|undefined{
 if(name.startsWith('website_'))return 'web'
 if(name==='call_erp_api'||name.startsWith('erp_'))return 'erp'
 if(name.startsWith('shop_'))return 'shop'
 if(/^(product_hub_|hub_|market_|call_product_hub_api)/.test(name))return 'product-hub'
 if(/^(geo_|call_geo_api)/.test(name))return 'geo'
 if(/^(visa_|immigration_|call_immigration_api)/.test(name))return 'visa'
 return undefined
}
export function businessToolAllowed(name:string,scope:readonly BusinessSystem[]|undefined):boolean{
 if(name==='agent_message_card')return true
 const system=toolBusiness(name)
 return scope===undefined||system===undefined||scope.includes(system)
}
/** Agent administration is a controlled application, separate from business scopes. */
export function toolSystem(name:string):BusinessSystem|'agent'|undefined{
 return name==='call_agent_admin_api'||name.startsWith('agent_admin_')?'agent':toolBusiness(name)
}
/** Recipe grants constrain system tools; native DSH tools retain composition-owned permissions. */
export function templateToolAllowed(name:string,tools:readonly string[]|undefined,scope:readonly BusinessSystem[]):boolean{
 // A fixed, data-only interface capability is available to every managed role.
 // This does not authorize business tools or broaden any module prefix.
 if(name==='agent_message_card')return true
 const system=toolSystem(name)
 if(system===undefined){
  // A new/unknown module cannot obtain native-tool treatment merely by missing a classifier.
  return !/^(?:call_[A-Za-z0-9_]+_api(?:$|_)|(?:mcp|module|futurestaff|fs)[_:])/.test(name)
 }
 if(!tools?.includes(name))return false
 // The Host resolves agent application/capability authorization before giving this exact grant.
 return system==='agent'||scope.includes(system)
}
