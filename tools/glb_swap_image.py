# glb_swap_image.py <in.glb> <out.glb> <image_index> <new_image_file> : replace one embedded image, repack BIN.
import json,struct,sys,io
from PIL import Image
src,dst,idx,newf=sys.argv[1],sys.argv[2],int(sys.argv[3]),sys.argv[4]
d=open(src,'rb').read()
jl=struct.unpack_from('<I',d,12)[0]; g=json.loads(d[20:20+jl]); bo=20+jl; bl=struct.unpack_from('<I',d,bo)[0]; B=d[bo+8:bo+8+bl]
im=g['images'][idx]; mime=im.get('mimeType','image/png')
I=Image.open(newf).convert('RGB'); buf=io.BytesIO()
if mime=='image/jpeg': I.save(buf,'JPEG',quality=92)
else: I.save(buf,'PNG',optimize=True)
new=buf.getvalue(); tgt=im['bufferView']
out=bytearray(); 
for i,bv in enumerate(g['bufferViews']):
    o=bv.get('byteOffset',0); data=new if i==tgt else B[o:o+bv['byteLength']]
    while len(out)%4: out+=b'\0'
    bv['byteOffset']=len(out); bv['byteLength']=len(data); out+=data
while len(out)%4: out+=b'\0'
g['buffers'][0]['byteLength']=len(out)
js=json.dumps(g,separators=(',',':')).encode()
while len(js)%4: js+=b' '
glb=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out)
open(dst,'wb').write(glb); print("wrote",dst,len(glb),"bytes; image",idx,mime,len(new),"bytes")
