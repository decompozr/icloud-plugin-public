"""Canonical fingerprint of all native code/build inputs, excluding generated state."""
from pathlib import Path
import hashlib

def native_source_manifest():
    root=Path(__file__).resolve().parent/'native'
    paths=sorted([*root.glob('HomeKitHelper/*.swift'),*root.glob('HomeKitHelper/*.plist'),*root.glob('HomeKitHelper/*.entitlements'),root/'HomeKitHelper.xcodeproj/project.pbxproj'])
    digest=hashlib.sha256();files=[]
    for path in paths:
        data=path.read_bytes();relative=path.relative_to(root).as_posix()
        digest.update(relative.encode()+b'\0'+str(len(data)).encode()+b'\0'+data)
        files.append(dict(path=relative,size=len(data),sha256=hashlib.sha256(data).hexdigest()))
    return dict(sourceSHA256=digest.hexdigest(),files=files)
