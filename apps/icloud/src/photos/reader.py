"""Bounded, read-only osxphotos adapter. One JSON request per process; no shell.
No library writes. Snapshot is rebuilt per request to avoid stale mutation checks.
"""
import base64
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import unicodedata
from datetime import datetime, timezone
from importlib.metadata import version


def normalize(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def main(request):
    import osxphotos
    from osxphotos.utils import get_system_library_path
    if version('osxphotos') != '0.77.2':
        raise ValueError('dependency_version_mismatch')
    library = Path(request['library']).expanduser().resolve(strict=True)
    if not library.is_dir() or library.suffix != '.photoslibrary':
        raise ValueError('invalid_library')
    # Explicit read detects TCC denial before osxphotos wraps it as a copy error.
    with (library / 'database/Photos.sqlite').open('rb') as stream:
        stream.read(16)
    scope = hashlib.sha256(str(library).encode()).hexdigest()[:16]
    db = osxphotos.PhotosDB(dbfile=str(library))
    command = request['command']
    data = request.get('input', {})
    def aid(p): return f'asset:{scope}:{p.uuid}'
    def album(a, kind): return {'id': f'album:{scope}:{kind}:{a.uuid}', 'title': a.title or '', 'kind': kind, 'count': len(a.photos)}
    def summary(p):
        return {'id': aid(p), 'filename': p.original_filename or p.filename or '',
                'date': p.date.isoformat() if p.date else None, 'mediaType': 'video' if p.ismovie else 'photo', 'livePhoto': bool(getattr(p,'live_photo',False)),
                'title': p.title or '', 'description': p.description or '', 'keywords': list(p.keywords),
                'favorite': bool(p.favorite), 'persons': list(p.persons), 'width': p.width, 'height': p.height, 'shared': bool(p.shared)}
    ordinary = list(db.album_info)
    shared = list(db.album_info_shared)
    def selected_album(value):
        matches = [(a, k) for k, entries in [('ordinary', ordinary), ('shared', shared)] for a in entries if album(a, k)['id'] == value]
        if len(matches) != 1: raise ValueError('album_not_found_or_ambiguous')
        return matches[0]
    def selected_assets(values):
        # UUIDs are scoped to this selected library; include shared-only assets.
        all_photos = {aid(p): p for p in db.photos()}
        for a in shared:
            all_photos.update({aid(p): p for p in a.photos})
        if any(v not in all_photos for v in values): raise ValueError('asset_not_found')
        return [all_photos[v] for v in values]
    if command == 'health':
        system = get_system_library_path()
        return {'provider':'osxphotos', 'version': version('osxphotos'), 'libraryScope':scope,
                'systemLibrary': bool(system and Path(system).resolve() == library), 'source':'local_synced_snapshot',
                'serverSyncVerified':False}
    if command == 'persons':
        q=normalize(data.get('query',''))
        names=[{'name':n,'count':c} for n,c in db.persons_as_dict.items() if not q or q in normalize(n)]
        names.sort(key=lambda v:normalize(v['name']))
        return {'persons':names[:100],'total':len(names),'complete':len(names)<=100}
    if command == 'albums':
        entries=[album(a,k) for k,items in [('ordinary',ordinary),('shared',shared)] for a in items]
        offset=data.get('offset',0); limit=data.get('limit',50)
        return {'albums':entries[offset:offset+limit],'total':len(entries),'nextOffset':offset+limit if offset+limit<len(entries) else None}
    if command == 'query':
        resolved=None
        if data.get('person'):
            q=normalize(data['person']); names=list(db.persons)
            exact=[n for n in names if normalize(n)==q]
            found=exact or [n for n in names if q in normalize(n)]
            if len(found)!=1: return {'status':'person_selection_required','names':found[:100]}
            resolved=found[0]
        ps=list(selected_album(data['albumId'])[0].photos) if data.get('albumId') else db.photos()
        if resolved: ps=[p for p in ps if resolved in p.persons]
        for key in ('from','to'):
            if data.get(key):
                bound=datetime.fromisoformat(data[key].replace('Z','+00:00'))
                ps=[p for p in ps if p.date and (p.date>=bound if key=='from' else p.date<bound)]
        ps=sorted(ps,key=lambda p:(p.date.timestamp() if p.date else 0,p.uuid),reverse=True)
        offset=data.get('offset',0); limit=data.get('limit',50)
        return {'status':'ok','assets':[summary(p) for p in ps[offset:offset+limit]],'total':len(ps),'resolvedPerson':resolved,
                'nextOffset':offset+limit if offset+limit<len(ps) else None,'source':'local_synced_snapshot'}
    if command == 'detail': return summary(selected_assets([data['assetId']])[0])
    if command == 'preview':
        p=selected_assets([data['assetId']])[0]
        for candidate in reversed(p.path_derivatives):
            path=Path(candidate).resolve()
            if not path.is_relative_to(library): continue
            if not path.is_file() or path.stat().st_size>2*1024*1024: continue
            blob=path.read_bytes()
            mime='image/jpeg' if blob.startswith(b'\xff\xd8\xff') else 'image/png' if blob.startswith(b'\x89PNG\r\n\x1a\n') else None
            if mime: return {'mimeType':mime,'data':base64.b64encode(blob).decode(),'assetId':data['assetId']}
        raise ValueError('preview_unavailable')
    if command == 'compare':
        a,k=selected_album(data['albumId']); target=list(a.photos); rows=[]
        for p in selected_assets(data['assetIds']):
            candidates=[]
            for q in target:
                seconds=abs((p.date-q.date).total_seconds()) if p.date and q.date else None
                same_name=bool(p.original_filename and p.original_filename==q.original_filename)
                identity=p.uuid==q.uuid
                if identity or (same_name and seconds is not None and seconds<1 and p.ismovie==q.ismovie):
                    candidates.append({'assetId':aid(q),'sameFilename':same_name,'secondsApart':seconds,'sameMediaType':p.ismovie==q.ismovie,'sameDimensions':(p.width,p.height)==(q.width,q.height),'sameIdentity':identity})
            if len(candidates)>1000: raise ValueError('too_many_candidates')
            status='confirmed' if any(c['sameIdentity'] for c in candidates) else 'probable' if len(candidates)==1 else 'ambiguous' if candidates else 'not_found'
            rows.append({'assetId':aid(p),'status':status,'candidates':candidates})
        return {'source':'local_synced_snapshot','album':album(a,k),'results':rows}
    if command == 'cleanup':
        groups={}; candidates=[]
        for p in db.photos():
            if p.shared: continue
            fingerprint=p._info.get('masterFingerprint')
            if fingerprint:
                # Review only: Live Photo/video motion equivalence is not established.
                key=(fingerprint,p.ismovie,p.width,p.height)
                groups.setdefault(key,[]).append(aid(p))
            if p.screenshot: candidates.append({'reason':'screenshot','assetIds':[aid(p)]})
            name=p.original_filename or p.filename or ''
            if re.match(r'^(WhatsApp (Image|Video)|(?:IMG|VID)-\d{8}-WA\d{4})',name,re.IGNORECASE):
                candidates.append({'reason':'messaging_filename','assetIds':[aid(p)]})
        duplicate=[{'reason':'same_fingerprint','assetIds':v[:1000]} for v in groups.values() if len(v)>1]
        candidates=duplicate+candidates; limit=data.get('limit',50); offset=data.get('offset',0)
        return {'source':'local_synced_snapshot','reviewOnly':True,'total':len(candidates),'candidates':candidates[offset:offset+limit],
                'complete':offset+limit>=len(candidates),'nextOffset':offset+limit if offset+limit<len(candidates) else None}
    if command == 'inspect':
        system=get_system_library_path()
        if not system or Path(system).resolve()!=library: raise ValueError('writes_require_system_library')
        result={'libraryScope':scope,'mutation':data,'assets':[summary(p) for p in selected_assets(data.get('assetIds',[]))]}
        if any(p['shared'] for p in result['assets']): raise ValueError('shared_source_write_unsupported')
        if data.get('albumId'):
            a,k=selected_album(data['albumId']); result['album']=album(a,k)
            result['members']=sorted(aid(p) for p in a.photos)
            if data['action']=='delete_empty_album' and result['members']: raise ValueError('album_not_empty')
        return result
    raise ValueError('unsupported_command')

if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.read(65537)
        if len(raw)>65536: raise ValueError('request_too_large')
        result=main(json.loads(raw))
        print(json.dumps({'ok':True,'result':result},ensure_ascii=False,allow_nan=False))
    except PermissionError:
        print(json.dumps({'ok':False,'error':'photos_permission_required'}))
    except Exception as exc:
        allowed={'dependency_version_mismatch','invalid_library','asset_not_found','album_not_found_or_ambiguous','preview_unavailable','writes_require_system_library','shared_source_write_unsupported','album_not_empty','unsupported_command','request_too_large'}
        print(json.dumps({'ok':False,'error':str(exc) if isinstance(exc,ValueError) and str(exc) in allowed else 'photos_read_failed'}))
