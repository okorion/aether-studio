"""Reduce the CC BY 4.0 NIH 3DPX-000307 mesh for the Aether column.

Requires trimesh and fast-simplification. Source and attribution: src/assets/README.md.
Usage: python scripts/prepare-vertebra.py source.stl
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import trimesh

source = Path(sys.argv[1])
mesh = trimesh.load(source, process=True)
mesh = mesh.simplify_quadric_decimation(face_count=10000)
# Source X/Y/Z are left-right / anterior-posterior / superior-inferior.
# Put the body toward +Z and the neural arch behind it. Preserve anatomy;
# compress vertical scale slightly to fit the existing articulated joints.
p = mesh.vertices.copy()
positions = np.column_stack(((p[:, 0] - 374.57) * .030,
                             (p[:, 2] - 1610.0) * .019,
                             -(p[:, 1] - 124.0) * .026 + .22))
target = Path(__file__).resolve().parents[1] / 'src/assets/lumbar-vertebra.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes((json.dumps({
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'positions': np.round(positions, 4).flatten().tolist(),
    'indices': mesh.faces.flatten().tolist(),
}, separators=(',', ':')) + '\n').encode('utf-8'))
print(f'{target.name}: {len(mesh.vertices)} vertices / {len(mesh.faces)} triangles')
