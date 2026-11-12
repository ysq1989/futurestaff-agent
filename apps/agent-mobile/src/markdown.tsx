import {Fragment, type ReactNode} from 'react'
import {safeLink, attachmentLink} from './api.js'

function inline(text: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|!?\[[^\]\n]*\]\([^\s)]+\))/g
  const result: ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0, token = match[0]
    result.push(text.slice(cursor, index))
    if (token.startsWith('`')) result.push(<code key={index}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('**')) result.push(<strong key={index}>{token.slice(2, -2)}</strong>)
    else {
      const link = /^(!?)\[([^\]]*)\]\(([^)]+)\)$/.exec(token)
      const href = link?.[3] ? safeLink(link[3]) : undefined
      const image = link?.[1] && link[3] ? attachmentLink(link[3]) : undefined
      result.push(image ? <a key={index} href={image} target="_blank" rel="noopener noreferrer"><img src={image} alt={link?.[2] || '会话图片'} loading="lazy"/></a> :
        href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{link?.[2] || '查看文件'}</a> : <Fragment key={index}>{link?.[2] || token}</Fragment>)
    }
    cursor = index + token.length
  }
  result.push(text.slice(cursor))
  return result
}

export function Markdown({text}: {text: string}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {index++; continue}
    if (/^\s*```/.test(line)) {
      const start = index++, code: string[] = []
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? '')) code.push(lines[index++] ?? '')
      if (index < lines.length) index++
      blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>)
      continue
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {blocks.push(<h3 key={index++}>{inline(heading[2] ?? '')}</h3>); continue}
    if (/^\s*[-*]\s+/.test(line)) {
      const start = index, items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) items.push((lines[index++] ?? '').replace(/^\s*[-*]\s+/, ''))
      blocks.push(<ul key={start}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>)
      continue
    }
    if (/^>\s?/.test(line)) {
      const start = index, quote: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) quote.push((lines[index++] ?? '').replace(/^>\s?/, ''))
      blocks.push(<blockquote key={start}>{quote.map((item, itemIndex) => <Fragment key={itemIndex}>{inline(item)}<br/></Fragment>)}</blockquote>)
      continue
    }
    const start = index, paragraph: string[] = [line]
    index++
    while (index < lines.length && (lines[index] ?? '').trim() && !/^\s*(?:```|#{1,4}\s|[-*]\s|>)/.test(lines[index] ?? '')) paragraph.push(lines[index++] ?? '')
    blocks.push(<p key={start}>{paragraph.map((part, partIndex) => <Fragment key={partIndex}>{partIndex > 0 && <br/>}{inline(part)}</Fragment>)}</p>)
  }
  return <div className="markdown">{blocks}</div>
}
