"""Bounded Edge TTS adapter. Input is validated by the Node contract, no shell/SSML."""
import asyncio, json, pathlib, sys
import edge_tts

async def main():
    source=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
    value=json.loads(source.read_text(encoding='utf8'))
    voice=value['voice']; boundaries=[]
    communicate=edge_tts.Communicate(value['text'],voice['name'],rate=voice['rate'],pitch=voice['pitch'],boundary='WordBoundary')
    with out.open('wb') as target:
        async for chunk in communicate.stream():
            if chunk['type']=='audio': target.write(chunk['data'])
            elif chunk['type']=='WordBoundary': boundaries.append({k:chunk[k] for k in ['offset','duration','text']})
    out.with_suffix('.words.json').write_text(json.dumps(boundaries,ensure_ascii=False),encoding='utf8')

asyncio.run(main())
