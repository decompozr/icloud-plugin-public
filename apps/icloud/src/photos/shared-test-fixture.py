"""Generate only the explicitly requested synthetic sharing fixture, without Photos UI."""
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
from uuid import UUID
import zlib

# Small built-in bitmap alphabet keeps the fixture independent of system fonts.
FONT = {
 'A':['01110','10001','10001','11111','10001','10001','10001'],
 'B':['11110','10001','10001','11110','10001','10001','11110'],
 'C':['01111','10000','10000','10000','10000','10000','01111'],
 'E':['11111','10000','10000','11110','10000','10000','11111'],
 'H':['10001','10001','10001','11111','10001','10001','10001'],
 'I':['11111','00100','00100','00100','00100','00100','11111'],
 'L':['10000','10000','10000','10000','10000','10000','11111'],
 'O':['01110','10001','10001','10001','10001','10001','01110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
 'Y':['10001','10001','01010','00100','00100','00100','00100'],
 ' ':['00000']*7,
}


def png(operation_id):
    width,height,scale=640,200,6
    pixels=bytearray(b'\xff\xff\xff'*(width*height))
    for text,y in [('PHOTOS',35),('CAPABILITY TEST',115)]:
        x=(width-(len(text)*6-1)*scale)//2
        for char in text:
            for row,bits in enumerate(FONT[char]):
                for col,bit in enumerate(bits):
                    if bit=='1':
                        for dy in range(scale):
                            for dx in range(scale):
                                offset=((y+row*scale+dy)*width+x+col*scale+dx)*3
                                pixels[offset:offset+3]=b'\x10\x20\x50'
            x+=6*scale
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    rows=b''.join(b'\x00'+pixels[y*width*3:(y+1)*width*3] for y in range(height))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'tEXt',b'Description\x00Photos capability test; synthetic fixture; '+operation_id.encode())+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')


def run(request):
    operation_id=request['operationId']
    if not isinstance(operation_id,str) or str(UUID(operation_id))!=operation_id.lower():raise ValueError('identity')
    root=Path(request['directory'])
    if not root.is_absolute():raise ValueError('directory')
    root.mkdir(parents=True,exist_ok=True,mode=0o700);root=root.resolve()
    directory=Path(tempfile.mkdtemp(prefix='upload-',dir=root));directory.chmod(0o700)
    path=directory/'content';data=png(operation_id)
    try:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
        return {'assetId':'fixture:'+operation_id,'filename':'Photos capability test.png','representation':'original','livePhotoStillOnly':False,'mediaType':'photo','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'privatePath':str(path)}
    except Exception:
        path.unlink(missing_ok=True);directory.rmdir();raise


if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.read(8193)
        if len(raw)>8192:raise ValueError('input_limit')
        print(json.dumps({'ok':True,'result':run(json.loads(raw))}))
    except Exception:print(json.dumps({'ok':False,'error':'shared_fixture_generation_failed'}))
