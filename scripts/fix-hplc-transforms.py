"""Restore USD resetXformStack semantics lost by the original Blender import.

The animated robot parts contain world-space poses. Their exported parent retains
an installation offset that belongs only to the static base. Reparent the world-
space parts to the glTF scene; do not change motion samples or mesh payloads.
"""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / 'source/assets/hplc-workflow.glb'
blob = path.read_bytes()
length, kind = struct.unpack_from('<II', blob, 12)
assert kind == 0x4e4f534a
model = json.loads(blob[20:20 + length])
nodes = model['nodes']
parent = next(i for i, n in enumerate(nodes) if n.get('name') == 'robot.001')
assert max(abs(a-b) for a,b in zip(nodes[parent]['translation'], [0, -.020000210031867027, 0])) < 1e-9
names = {'carriage', 'ft_tool', 'left_finger.001', 'right_finger.001'} | {f'link{i}' for i in range(1, 6)}
selected = {i for i, n in enumerate(nodes) if n.get('name') in names}
assert len(selected) == 9
scene = model['scenes'][model.get('scene', 0)]
for i in selected:
    if i in nodes[parent]['children']:
        nodes[parent]['children'].remove(i)
        scene['nodes'].append(i)
    else:
        assert i in scene['nodes'], 'Unexpected model hierarchy'
model.setdefault('extras', {})['hplc_world_space_robot_transforms'] = True
payload = json.dumps(model, separators=(',', ':')).encode()
payload += b' ' * (-len(payload) % 4)
# Copy binary chunk, including all geometry, textures and animation keys verbatim.
remainder = blob[20 + length:]
result = struct.pack('<III', 0x46546c67, 2, 20 + len(payload) + len(remainder))
result += struct.pack('<II', len(payload), 0x4e4f534a) + payload + remainder
path.write_bytes(result)
metadata_path = ROOT / 'source/assets/hplc-workflow.json'
metadata = json.loads(metadata_path.read_text())
metadata['model_sha256'] = hashlib.sha256(result).hexdigest()
metadata['source_controller_workflow'] = 'hplc-controller-export-20261028/outputs/hplc-speedup-20261028/retime-v2-20261029/delivery/workflow.json'
metadata['transform_correction'] = {
    'reason': 'USD world-space robot parts incorrectly inherited the parent -20 mm vertical installation offset during Blender import.',
    'method': 'Restore resetXformStack by making nine world-space robot nodes glTF scene roots; preserve static base hierarchy and all binary geometry/animation data.',
    'nodes': sorted(names),
}
metadata_path.write_text(json.dumps(metadata, indent=2) + '\n')
print('Restored world-space hierarchy for', len(selected), 'robot nodes; binary payload unchanged.')
