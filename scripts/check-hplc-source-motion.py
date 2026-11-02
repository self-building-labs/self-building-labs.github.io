"""Compare exported poses against both authoritative HPLC inputs (requires the CUDA/pxr environment)."""
import os,sys,json,struct
from pathlib import Path
import hashlib
import numpy as np
from scipy.spatial.transform import Rotation
from pxr import Usd,UsdGeom
repo=Path(__file__).resolve().parent.parent
r=Path(os.environ.get('HPLC_INPUT','/home/safety_agent/hplc-video-20261030-twin-v6-input'));os.environ['SDL_ROBOT_BIND']=str(r/'isaacsim/sdl2/model/robot_bind.json');sys.path[:0]=[str(r/'isaacsim/sdl2/source'),str(r)]
from workflow_kinematics import forward_tensor,FINGER_Z
from timeline import samples
w=json.loads((r/'workflow.json').read_text());rows=list(samples(w,fps=5,speed=1));links,_=forward_tensor(np.array([x['state']['q'] for x in rows]));links=links.cpu().numpy()
b=(repo/'source/assets/hplc-workflow.glb').read_bytes();l=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+l]);binary=b[28+l:]
def accessor(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(binary,dtype='<f4',count=a['count']*{'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
parents={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])}
tracks={}
for a in j['animations']:
 for c in a['channels']:
  s=a['samplers'][c['sampler']];tracks[(c['target']['node'],c['target']['path'])]=(accessor(s['input'])[:,0],accessor(s['output']))
C=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
indices={n.get('name'):i for i,n in enumerate(j['nodes'])}

# Compare every exported 5 Hz frame to FK from the authoritative saved states.
# This catches world/local hierarchy errors, not just a particular parent offset.
def matrices(i):
 n=j['nodes'][i];out=np.repeat(np.eye(4)[None],len(rows),axis=0)
 values={}
 for kind,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]:
  if (i,kind) in tracks:
   times,data=tracks[i,kind]
   assert np.max(np.abs(times-np.array([row['t'] for row in rows])))<.0001
   values[kind]=data
  else:values[kind]=np.tile(n.get(kind,default),(len(rows),1))
 out[:,:3,:3]=Rotation.from_quat(values['rotation']).as_matrix()*values['scale'][:,None,:]
 out[:,:3,3]=values['translation']
 if 'matrix' in n:out[:]=np.array(n['matrix']).reshape(4,4).T
 return matrices(parents[i])@out if i in parents else out
expected={'link'+str(i):links[:,i] for i in range(1,6)}
expected['ft_tool']=links[:,5]
from workflow_kinematics import BASE
carriage=np.repeat(np.eye(4)[None],len(rows),axis=0)
carriage[:,:3,3]=BASE[:3,3]+np.array([[row['state']['q'][0],0,0] for row in rows])
expected['carriage']=carriage
for side,sign in [('left',-1),('right',1)]:
 offset=np.repeat(np.eye(4)[None],len(rows),axis=0)
 offset[:,:3,3]=np.array([[.059,sign*row['state']['jaw_m'],FINGER_Z] for row in rows])
 expected[side+'_finger.001']=links[:,5]@offset
assert hashlib.sha256((r/'scene.usdc').read_bytes()).hexdigest()==w['scene_sha256']
stage=Usd.Stage.Open(str(r/'scene.usdc'));cache=UsdGeom.XformCache()
for obj in w['initial_state']['objects']:
 expected[obj.rsplit('/',1)[-1]]=np.array([row['state']['objects'][obj] for row in rows])
for env in w['initial_state']['environment']:
 initial=np.asarray(cache.GetLocalToWorldTransform(stage.GetPrimAtPath(env))).T
 expected[env.rsplit('/',1)[-1]+'.001']=np.array([row['state']['environment'][env] for row in rows])@initial
errors={}
for name,reference in expected.items():
 actual=matrices(indices[name]);reference=C@reference@np.linalg.inv(C)
 position=float(np.max(np.linalg.norm(actual[:,:3,3]-reference[:,:3,3],axis=1)))
 rotation=float(np.max(np.abs(actual[:,:3,:3]-reference[:,:3,:3])))
 assert position<1e-6,(name,position)
 assert rotation<1e-6,(name,rotation)
 errors[name]={'position_m':position,'rotation_matrix_error':rotation}
delivery=Path(os.environ.get('HPLC_DELIVERY','/home/safety_agent/hplc-controller-export-20261028/outputs/hplc-speedup-20261028/retime-v2-20261029/delivery'))
source_hash=hashlib.sha256((r/'workflow.json').read_bytes()).hexdigest()
assert source_hash==hashlib.sha256((delivery/'workflow.json').read_bytes()).hexdigest()
metadata=json.loads((repo/'source/assets/hplc-workflow.json').read_text())
assert source_hash==metadata['source_workflow_sha256']
assert hashlib.sha256(b).hexdigest()==metadata['model_sha256']
print(json.dumps({'passed':True,'frames':len(rows),'duration_s':rows[-1]['t'],'source_workflow_sha256':source_hash,'errors':errors},indent=2))
