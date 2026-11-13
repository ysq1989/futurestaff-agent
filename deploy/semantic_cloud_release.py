"""Frozen Cloud semantic release: B-compatible recovery retains all current data.

Derived from the reviewed administrative B switch, frozen here for this feature.
No historical publisher is loaded by this release. Never print private values.
"""
import fcntl
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import time
import urllib.request

ROOT = pathlib.Path('/opt/futurestaff-agent-cloud')
BUILD = '0.1.0-b04f9ed4dc7a'
BEFORE = '0.1.0-9d35a827f507'
OLD_IMAGE = 'sha256:f5a6a964e1accca08f859b3377761b39e8264cf0cf096d5b481efff240a5d872'
RELEASE = pathlib.Path(__file__).resolve().parent
assert RELEASE.parent == ROOT/'releases' and RELEASE.name == BUILD+'-r3'
NAME = 'futurestaff-agent-cloud-agent-1'
IMAGE = 'futurestaff/agent-cloud:'+BUILD
OPS = RELEASE/'operations'
SPEC = json.loads((RELEASE/'spec.json').read_text())
assert SPEC['buildId']==BUILD and SPEC['publisherSha256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()

def run(args, **kw):
    return subprocess.run(args, check=True, **kw)

def output(args):
    return subprocess.check_output(args, timeout=30).decode()

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def inspect():
    return json.loads(output(['docker','inspect',NAME]))[0]

def wait_health(build, image):
    for _ in range(40):
        try:
            doc=inspect()
            if doc['Image']==image and doc['State']['Status']=='running':
                with urllib.request.urlopen('http://127.0.0.1:3181/health',timeout=2) as response:
                    if response.status==200 and json.load(response).get('buildId')==build:return
        except (OSError, ValueError, KeyError, AssertionError, subprocess.CalledProcessError):
            pass
        time.sleep(0.5)
    raise RuntimeError('candidate health gate failed')

def compose(*args):
    env=dict(os.environ, AGENT_IMAGE_TAG=BUILD)
    run(['docker','compose','-p','futurestaff-agent-cloud','-f',str(RELEASE/'compose.yaml'),*args], env=env)

STAGE_SHA = SPEC['stagedFileHashesSha256']
NEW_IMAGE = json.loads((OPS/'built.json').read_text())['imageId'] if (OPS/'built.json').exists() else None
COMPATIBLE_IMAGES = [(IMAGE,NEW_IMAGE),('futurestaff/agent-cloud:'+BEFORE,OLD_IMAGE)]

def verify_stage():
    assert sha(RELEASE/'staged-file-hashes.json')==STAGE_SHA
    files=json.loads((RELEASE/'staged-file-hashes.json').read_text())
    for rel,digest in files.items():
        p=RELEASE/rel
        assert RELEASE in p.resolve().parents, 'Stage path escaped the release'
        assert p.is_file() and not p.is_symlink() and sha(p)==digest, rel
    meta=json.loads((RELEASE/'release.json').read_text())
    assert meta['buildId']==BUILD
    return files

def snapshot_files(root):
    found={}
    for p in sorted(root.rglob('*')):
        assert not p.is_symlink()
        if p.is_file(): found[str(p.relative_to(root))]=sha(p)
    return found

SMOKE=r'''
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
await import('@deepseek-ai/dsh-session-persistence-jsonl');
const image=await sharp({create:{width:2,height:2,channels:3,background:'#123456'}}).png().toBuffer();
if(image.length<20)throw Error('sharp');
process.env.AGENT_ENCRYPTION_KEY=randomBytes(32).toString('base64');
process.env.AGENT_PUBLIC_ORIGIN='https://fs-smoke.invalid';
// Use the allowlisted origin; --network none prevents all upstream access.
process.env.PLATFORM_ORIGIN='https://platform.fsstory.net';
process.env.AGENT_BUILD_ID='0.1.0-b04f9ed4dc7a';
await import('/app/server.mjs');
const base='http://127.0.0.1:3181';
let health;
for(let i=0;i<40;i++){try{health=await fetch(base+'/health');break}catch{await new Promise(r=>setTimeout(r,100))}}
if(!health?.ok||(await health.json()).buildId!==process.env.AGENT_BUILD_ID)throw Error('health');
const page=await fetch(base+'/');if(!page.ok||!(await page.text()).includes('68a15d2e3eb2'))throw Error('static');
const anon=await fetch(base+'/api/v1/systems');if(anon.status!==401)throw Error('anonymous');
const origin=await fetch(base+'/api/v1/login',{method:'POST',headers:{origin:'https://wrong.invalid','content-type':'application/json'},body:'{}'});if(origin.status!==403)throw Error('origin');
const manifest=JSON.parse(await readFile('/app/bundle-manifest.json','utf8'));if(manifest.buildId!==process.env.AGENT_BUILD_ID)throw Error('manifest');
console.log(JSON.stringify({event:'fs_release_smoke',health:200,static:200,anonymous:401,wrongOrigin:403,sharp:true,jsonl:true,network:'none'}));
process.kill(process.pid,'SIGTERM');
'''

RESTORE=r'''
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';import {createDecipheriv} from 'node:crypto';
const root='/restore/data',key=Buffer.from(process.env.AGENT_ENCRYPTION_KEY,'base64');if(key.length!==32)throw Error('key');
let files=0,encrypted=0;
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else if(entry.isFile()){files++;if(!p.endsWith('.json'))continue;const obj=JSON.parse(await readFile(p,'utf8'));if(obj.iv&&obj.tag&&obj.data){const aad=path.relative(root,p).slice(0,-5);const d=createDecipheriv('aes-256-gcm',key,Buffer.from(obj.iv,'base64'));d.setAAD(Buffer.from(aad));d.setAuthTag(Buffer.from(obj.tag,'base64'));JSON.parse(Buffer.concat([d.update(Buffer.from(obj.data,'base64')),d.final()]).toString('utf8'));encrypted++}}else throw Error('non-regular file')}}
try{await walk(root);console.log(JSON.stringify({event:'restore_verified',files,encrypted,decryption:true}))}
catch{console.error('restore_verification_failed');process.exit(1)}
'''


def compatible_recovery_safe(data):
    """B and this candidate preserve storage; keep V1.1 and semantic writes intact.

    New semantic entries may be unavailable in B, but remain on disk for rollforward.
    The isolated candidate->B->candidate proof is mandatory. Never restore an old archive.
    Unknown protocols, active tasks or malformed records hold the recovery.
    """
    try:
        for p in (data/'members').glob('*/sessions/*.json'):
            doc=json.loads(p.read_text())
            if doc.get('status') not in ('idle','interrupted','error','stopped'):return False
            binding=doc.get('administrationBinding')
            if binding and binding.get('contractVersion') not in ('1.0.0','1.1.0'):return False
        snapshot_files(data)  # Refuse symlinks, including outside session paths.
        return True
    except (OSError,ValueError,TypeError,KeyError):return False

def state_before():
    assert json.loads((OPS/'smoke-passed.json').read_text())['passed']
    doc=inspect();assert doc['Image']==OLD_IMAGE and doc['Id']==SPEC['baselineId'] and doc['State']['Status']=='running'
    assert doc['Config']['Image']=='futurestaff/agent-cloud:'+BEFORE
    statuses={}
    for p in (ROOT/'data/members').glob('*/sessions/*.json'):
        status=json.loads(p.read_text()).get('status','unknown');statuses[status]=statuses.get(status,0)+1
    assert all(s in ('idle','interrupted','error','stopped') for s in statuses), statuses
    env_file=ROOT/'service.env';raw=env_file.read_bytes();lines=raw.decode().splitlines()
    assert sha(env_file)==SPEC['baselineEnvSha256']
    assert [x for x in lines if x.startswith('AGENT_BUILD_ID=')]==['AGENT_BUILD_ID='+BEFORE]
    return doc,statuses,env_file,raw,lines

def switch():
    doc,statuses,env_file,raw,lines=state_before()
    # Inspect all files before stopping; no pre-B backup is restored on recovery.
    snapshot_files(ROOT/'data')
    backup=OPS/'backup';assert not backup.exists();backup.mkdir(mode=0o700)
    before={'imageId':doc['Image'],'image':doc['Config']['Image'],'envSha256':sha(env_file),'statuses':statuses}
    (OPS/'before.json').write_text(json.dumps(before))
    original=None
    try:
        # Include stop and its verification inside the recovery boundary.
        run(['docker','stop','--time','30',NAME])
        assert inspect()['State']['Status']=='exited'
        original=snapshot_files(ROOT/'data')
        (backup/'service.env').write_bytes(raw);os.chmod(backup/'service.env',0o600)
        archive=backup/'data.tar.gz'
        with tarfile.open(archive,'w:gz') as tf:tf.add(ROOT/'data',arcname='data',recursive=True)
        os.chmod(archive,0o600)
        for durable in [backup/'service.env',archive]:
            with durable.open('rb') as f:os.fsync(f.fileno())
        fd=os.open(backup,os.O_RDONLY);os.fsync(fd);os.close(fd)
        restore=backup/'restore';restore.mkdir(mode=0o700)
        with tarfile.open(archive) as tf:
            for item in tf.getmembers():
                dest=(restore/item.name).resolve();assert restore in dest.parents
                assert not item.issym() and not item.islnk() and (item.isfile() or item.isdir())
            tf.extractall(restore)
        assert snapshot_files(restore/'data')==original
        os.chown(restore,1000,1000)
        for restore_image,_digest in COMPATIBLE_IMAGES:
            run(['docker','run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--pids-limit','100','--env-file',str(backup/'service.env'),'--mount','type=bind,source='+str(restore)+',target=/restore,readonly',restore_image,'node','--input-type=module','-e',RESTORE])
        assert snapshot_files(ROOT/'data')==original and env_file.read_bytes()==raw
        receipt={'dataFiles':len(original),'archiveSha256':sha(archive),'envSha256':sha(backup/'service.env'),'hashesMatch':True,'encryptedRecordsVerified':True,'compatibleImages':[p[0] for p in COMPATIBLE_IMAGES]}
        (OPS/'restore-passed.json').write_text(json.dumps(receipt))
        next_env='\n'.join('AGENT_BUILD_ID='+BUILD if l.startswith('AGENT_BUILD_ID=') else l for l in lines)+'\n'
        tmp=ROOT/'service.env.semantic-20261113';assert not tmp.exists()
        env_fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(env_fd,'wb') as f:f.write(next_env.encode());f.flush();os.fsync(f.fileno())
        os.chmod(tmp,0o600);os.replace(tmp,env_file)
        fd=os.open(ROOT,os.O_RDONLY);os.fsync(fd);os.close(fd)
        compose('up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','agent')
        switched=inspect();assert switched['Image']==json.loads((OPS/'built.json').read_text())['imageId']
        wait_health(BUILD,switched['Image'])
        (OPS/'switched.json').write_text(json.dumps({'build':BUILD,'imageId':switched['Image'],'time':time.time(),'backup':str(backup)}))
        print(json.dumps({'switched':BUILD,'imageId':switched['Image'],'restore':receipt,'backup':str(backup)}))
    except Exception:
        # A shares B's durable protocol. Preserve new writes and require an
        # inactive, parseable state; never restart a52 or overwrite current data.
        try:
            current=inspect()
        except subprocess.CalledProcessError:
            # A successful daemon query distinguishes a missing container
            # from an unavailable Docker daemon during compose recreation.
            present=output(['docker','ps','-a','--filter','name=^/'+NAME+'$','--format','{{.ID}}']).strip()
            if present:raise
            current=None
        if current is not None and current['Image']==OLD_IMAGE and current['State']['Status']=='exited':
            if not compatible_recovery_safe(ROOT/'data'):
                print(json.dumps({'recoveryHeld':'compatible protocol or inactive state unconfirmed; A remains stopped','dataRestored':False}));raise
            env_file.write_bytes(raw);os.chmod(env_file,0o600);run(['docker','start',NAME])
            wait_health(BEFORE,OLD_IMAGE)
        elif current is None or current['Image']!=OLD_IMAGE:
            if current is not None:
                assert current['Image']==NEW_IMAGE, 'unexpected replacement image; hold recovery'
                run(['docker','stop','--time','30',NAME])
                assert inspect()['State']['Status']=='exited'
            if compatible_recovery_safe(ROOT/'data'):
                env_file.write_bytes(raw);os.chmod(env_file,0o600)
                env=dict(os.environ,AGENT_IMAGE_TAG=BEFORE)
                run(['docker','compose','-p','futurestaff-agent-cloud','-f',str(ROOT/'releases'/BEFORE/'compose.yaml'),'up','-d','--no-build'],env=env)
                wait_health(BEFORE,OLD_IMAGE)
                print(json.dumps({'recoveredPreviousService':BEFORE,'dataRestored':False}))
            else:
                print(json.dumps({'recoveryHeld':'previous-service recovery unsafe; current data preserved with candidate stopped','backup':str(backup)}))
        raise



def stage():
    global NEW_IMAGE, COMPATIBLE_IMAGES
    import shutil
    assert not (OPS/'built.json').exists(), 'Immutable candidate already staged'
    assert shutil.disk_usage(ROOT).free > 5*1024**3
    verify_stage()
    for name in ['runtime/package.json','runtime/package-lock.json','Dockerfile']:
        assert (RELEASE/'context'/name).read_bytes()==(ROOT/'releases'/BEFORE/'context'/name).read_bytes(), 'Runtime dependency inputs changed'
    tools=SPEC['tools']
    assert sha(pathlib.Path(tools['path'])/'manifest.json')==tools['sha256']
    sys.path.insert(0,tools['path']);sys.path.insert(0,str(RELEASE/'operator'))
    for name,digest in SPEC['operators'].items():assert sha(RELEASE/'operator'/name)==digest
    from image_metadata import (
        cleanup_build_records,
        image_ids,
        normalize_image,
        require_new_release_tag,
    )
    before=image_ids()
    # Reuse B's verified runtime/dependencies. An identical lock file does not
    # guarantee Docker retained the npm build cache, and staging stays offline.
    recipe=OPS/'Dockerfile.overlay'
    recipe.write_text('FROM '+OLD_IMAGE+'\nCOPY runtime/server.mjs runtime/bundle-manifest.json /app/\nCOPY public/ /app/public/\n')
    resume=SPEC.get('resumeRawImage')
    if resume:
        assert output(['docker','image','inspect','--format','{{.Id}}',IMAGE]).strip()==resume
        # An interrupted owned stage is resumed without rebuilding its tag.
        expected={str(p.relative_to(RELEASE/'context/runtime')):sha(p) for p in (RELEASE/'context/runtime').glob('*') if p.name in ('server.mjs','bundle-manifest.json')}
        expected.update({'public/'+str(p.relative_to(RELEASE/'context/public')):sha(p) for p in (RELEASE/'context/public').rglob('*') if p.is_file()})
        probe="import fs from 'node:fs';import crypto from 'node:crypto';const expected="+json.dumps(expected)+";for(const [name,hash] of Object.entries(expected)){if(crypto.createHash('sha256').update(fs.readFileSync('/app/'+name)).digest('hex')!==hash)throw Error('resumed source mismatch')}"
        run(['docker','run','--rm','--network','none','--read-only',resume,'node','--input-type=module','-e',probe],capture_output=True)
        build_output=b''
    else:
        require_new_release_tag(IMAGE)
        process=subprocess.run(['docker','build','--network','none','--force-rm','-f',str(recipe),'-t',IMAGE,str(RELEASE/'context')],capture_output=True,check=False,env=dict(os.environ,DOCKER_BUILDKIT='0'))
        (OPS/'build.private.log').write_bytes(process.stdout+process.stderr)
        assert process.returncode==0,'Offline dependency-cache build failed'
        build_output=process.stdout
    raw=json.loads(output(['docker','image','inspect',IMAGE]))[0]
    baseline=json.loads(output(['docker','image','inspect',OLD_IMAGE]))[0]
    assert raw['RootFS']['Layers'][:len(baseline['RootFS']['Layers'])]==baseline['RootFS']['Layers']
    assert {k:v for k,v in raw['Config'].items() if k!='Image'}=={k:v for k,v in baseline['Config'].items() if k!='Image'}
    record=normalize_image(raw['Id'],OLD_IMAGE,IMAGE)
    cleanup_build_records(build_output,before,record['image'])
    NEW_IMAGE=record['image'];COMPATIBLE_IMAGES=[(IMAGE,NEW_IMAGE),('futurestaff/agent-cloud:'+BEFORE,OLD_IMAGE)]
    assert record['layers']<=18
    (OPS/'built.json').write_text(json.dumps({'imageId':NEW_IMAGE,'record':record,'sourceCommit':SPEC['sourceCommit']}))
    command=['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','384m','--tmpfs','/tmp:rw,nosuid,noexec,size=67108864,uid=1000,gid=1000,mode=0700','-e','AGENT_DATA_DIR=/tmp/qa',NEW_IMAGE,'node','--input-type=module','-e',SMOKE]
    result=subprocess.run(command,capture_output=True,check=False)
    (OPS/'smoke.private.log').write_bytes(result.stdout+result.stderr)
    assert result.returncode==0 and b'fs_release_smoke' in result.stdout
    (OPS/'smoke-passed.json').write_text(json.dumps({'passed':True,'network':'none','modelCalls':0,'buildId':BUILD}))
    from release_resources import ResourceStore
    store=ResourceStore();store.check_candidates([NEW_IMAGE,OLD_IMAGE],max_layers=18)
    for iid in [NEW_IMAGE,OLD_IMAGE]:store.cache(iid)
    print(json.dumps({'staged':True,'image':NEW_IMAGE,'rollback':OLD_IMAGE,'layers':record['layers']}))


def main(action):
    assert action in ('stage','check','switch')
    assert ROOT.resolve()==ROOT
    OPS.mkdir(mode=0o700,exist_ok=True);os.chmod(OPS,0o700)
    with (ROOT/'semantic-release.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if action=='stage':return stage()
        verify_stage()
        assert json.loads((OPS/'semantic-recovery.json').read_text())['passed'], 'New semantic data compatibility proof required'
        for image,digest in COMPATIBLE_IMAGES:
            assert output(['docker','image','inspect','--format','{{.Id}}',image]).strip()==digest
        assert json.loads((OPS/'built.json').read_text())['imageId']==NEW_IMAGE
        if action=='check':
            doc,statuses,_env_file,_raw,_lines=state_before()
            print(json.dumps({'ready':BUILD,'imageId':NEW_IMAGE,'oldBuild':BEFORE,'oldImage':doc['Image'],'statuses':statuses,'runningServiceChanged':False}));return
        tools=SPEC['tools'];sys.path.insert(0,tools['path'])
        from release_resources import ResourceStore
        store=ResourceStore()
        current={'version':BUILD,'schema':'cloud-json-v1','images':[NEW_IMAGE],'compose':str(RELEASE/'compose.yaml'),'env':str(ROOT/'service.env')}
        rollback={'version':BEFORE,'schema':'cloud-json-v1','images':[OLD_IMAGE],'compose':str(ROOT/'releases'/BEFORE/'compose.yaml'),'env':str(ROOT/'service.env')}
        store.prepare('futurestaff-agent-cloud',current,rollback)
        switch()
        store.publish('futurestaff-agent-cloud',current,rollback,verified=True)
        (OPS/'retention.json').write_text(json.dumps({'passed':True,'currentPlusOne':True,'current':current,'rollback':rollback,'restoreOldData':False}))


if __name__=='__main__':
    assert len(sys.argv)==2
    main(sys.argv[1])
