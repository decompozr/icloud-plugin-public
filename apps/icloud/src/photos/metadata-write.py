"""Photos scripting writes, never SQLite writes. Invoked only after a saved plan.
Revalidate the selected system library and exact pre-write values before changes.
"""
import json, sys
from pathlib import Path
from reader import main as read

def run(request):
    import photoscript
    from osxphotos.utils import get_last_library_path
    expected=request['expected']
    current=read({'library':request['library'],'command':'inspect','input':request['mutation']})
    if current!=expected: return {'status':'stale_plan'}
    # AppleScript targets the currently open library, which may differ from system.
    opened=get_last_library_path()
    if not opened or Path(opened).resolve()!=Path(request['library']).resolve():
        return {'status':'wrong_open_library'}
    changes=request['mutation']['values']; photos=[]
    for entry in expected['assets']:
        p=photoscript.Photo(entry['id'].split(':')[-1])
        before={'title':p.title,'description':p.description,'keywords':p.keywords,'favorite':p.favorite}
        if any(before[k]!=entry[k] for k in before): return {'status':'stale_plan'}
        photos.append(p)
    result=[]
    for p in photos:
        try:
            for key,value in changes.items(): setattr(p,key,value)
            verified=all(getattr(p,k)==v for k,v in changes.items())
            result.append({'uuid':p.uuid,'status':'applied' if verified else 'outcome_unknown'})
        except Exception:
            result.append({'uuid':p.uuid,'status':'outcome_unknown'})
            break
    return {'status':'applied' if len(result)==len(photos) and all(r['status']=='applied' for r in result) else 'outcome_unknown','items':result,'serverSyncVerified':False}

if __name__ == "__main__":
    try:
        raw=sys.stdin.buffer.read(65537)
        if len(raw)>65536: raise ValueError()
        print(json.dumps({'ok':True,'result':run(json.loads(raw))}))
    except Exception:
        print(json.dumps({'ok':False,'error':'metadata_operation_failed'}))
