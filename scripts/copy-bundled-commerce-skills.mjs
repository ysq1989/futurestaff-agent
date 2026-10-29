import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../skills/',import.meta.url))
const files=[]
async function visit(relative){
 const filename=path.join(root,...relative.split('/')),info=await lstat(filename)
 if(info.isSymbolicLink())throw Error('COMMERCE_SKILL_LINK')
 if(info.isDirectory()){for(const name of await readdir(filename))await visit(relative+'/'+name)}
 else if(info.isFile()&&relative.endsWith('.md'))files.push({path:relative,content:(await readFile(filename,'utf8')).replace(/\r\n/g,'\n')})
 else throw Error('COMMERCE_SKILL_FILE_INVALID')
}
for(const name of ['commerce-library','commerce-product-images','commerce-detail-images','commerce-banner','commerce-video'])await visit(name)
const target=fileURLToPath(new URL('../plugins/fs-platform-access/lib/resources/commerce-skills.json',import.meta.url))
await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(files))
const {readCommerceBundle}=await import('../plugins/fs-platform-access/lib/bundled-commerce-skills.js')
await readCommerceBundle(target)
