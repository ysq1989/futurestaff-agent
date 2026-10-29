import sharp,{type OverlayOptions} from 'sharp'
import path from 'node:path'
import {open,readFile,lstat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {ensureTree,existingTree} from './agents.js'
import {garmentFile} from './fashion-files.js'

interface ImageLayer {type:'image';imagePath:string;left:number;top:number;width:number;height:number;fit?:'contain'|'cover'}
interface TextLayer {type:'text';lines:string[];left:number;top:number;width:number;height:number;fontSize:number;color:string;fontFamily?:string;align?:'left'|'center'|'right'}
export interface CommerceLayout {requestId:string;width:number;height:number;background:string;layers:(ImageLayer|TextLayer)[]}
const color=(value:string)=>/^#[a-f0-9]{6}$/i.test(value)
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!))

async function immutable(root:string,name:string,raw:Buffer){
 const file=path.join(root,name)
 try{const handle=await open(file,'wx',0o600);try{await handle.writeFile(raw)}finally{await handle.close()}}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if((await lstat(file)).isSymbolicLink()||!(await readFile(file)).equals(raw))throw Error('COMMERCE_LAYOUT_CONFLICT')}
 return file
}

/** Deterministic image/text composition keeps real product pixels and editable copy separate. */
export async function composeCommerce(root:string,input:CommerceLayout,signal?:AbortSignal){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.requestId)||!Number.isInteger(input.width)||!Number.isInteger(input.height)
  ||input.width<64||input.height<64||input.width>8192||input.height>8192||input.width*input.height>16000000||!color(input.background)
  ||!Array.isArray(input.layers)||input.layers.length>32)throw Error('COMMERCE_LAYOUT_INVALID')
 const composite:OverlayOptions[]=[]
 for(const layer of input.layers){
  signal?.throwIfAborted()
  if(![layer.left,layer.top,layer.width,layer.height].every(Number.isInteger)||layer.left<0||layer.top<0||layer.width<1||layer.height<1
   ||layer.left+layer.width>input.width||layer.top+layer.height>input.height)throw Error('COMMERCE_LAYOUT_BOUNDS')
  if(layer.type==='image'){
   if(layer.fit!==undefined&&!['contain','cover'].includes(layer.fit))throw Error('COMMERCE_LAYOUT_INVALID')
   const bytes=await garmentFile(root,layer.imagePath)
   composite.push({input:await sharp(bytes).rotate().resize(layer.width,layer.height,{fit:layer.fit??'contain',background:'#00000000'}).png().toBuffer(),left:layer.left,top:layer.top})
  }else if(layer.type==='text'){
   if(!Array.isArray(layer.lines)||layer.lines.length<1||layer.lines.length>12||layer.lines.some(line=>typeof line!=='string'||line.length>160)
    ||!Number.isInteger(layer.fontSize)||layer.fontSize<8||layer.fontSize>300||!color(layer.color)
    ||layer.fontFamily!==undefined&&!/^[A-Za-z0-9 \u4e00-\u9fff,-]{1,80}$/.test(layer.fontFamily)
    ||layer.align!==undefined&&!['left','center','right'].includes(layer.align))throw Error('COMMERCE_LAYOUT_INVALID')
   const lineHeight=Math.ceil(layer.fontSize*1.4)
   if(layer.lines.length*lineHeight>layer.height)throw Error('COMMERCE_TEXT_OVERFLOW')
   const align=layer.align??'left',x=align==='left'?0:align==='center'?layer.width/2:layer.width
   const text=layer.lines.map((line,index)=>`<text x="${x}" y="${layer.fontSize+index*lineHeight}" text-anchor="${align==='left'?'start':align==='center'?'middle':'end'}">${escape(line)}</text>`).join('')
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${layer.width}" height="${layer.height}"><g font-family="${escape(layer.fontFamily??'Microsoft YaHei,Arial')}" font-size="${layer.fontSize}" fill="${layer.color}">${text}</g></svg>`
   composite.push({input:Buffer.from(svg),left:layer.left,top:layer.top})
  }else throw Error('COMMERCE_LAYOUT_INVALID')
 }
 const bytes=await sharp({create:{width:input.width,height:input.height,channels:4,background:input.background}}).composite(composite).png().toBuffer()
 signal?.throwIfAborted()
 const directory=path.join(root,'commerce-output');await ensureTree(directory);await existingTree(directory)
 const layout=await immutable(directory,input.requestId+'.layout.json',Buffer.from(JSON.stringify(input,null,2)))
 const filename=await immutable(directory,input.requestId+'.png',bytes)
 return {status:'succeeded',path:filename,imagePath:'commerce-output/'+input.requestId+'.png',layoutPath:layout,layoutRelativePath:'commerce-output/'+input.requestId+'.layout.json',sha256:createHash('sha256').update(bytes).digest('hex'),width:input.width,height:input.height,reviewStatus:'needs-review',archiveStatus:'not-saved'}
}
