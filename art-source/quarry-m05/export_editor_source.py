
"""Export the existing editable Blender scene, without regenerating it."""
from pathlib import Path
import bpy
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'art-source/quarry-m05/dressing.blend'
dest = root / 'public/campaign/m05/dressing-source.glb'
dest.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
collection = bpy.data.collections.get('Editable quarry set dressing')
if collection is None:
    raise RuntimeError('Missing editable quarry collection')
bpy.ops.object.select_all(action='DESELECT')
objects = [o for o in collection.all_objects if o.type == 'MESH' and o.name.startswith('m05-dress-')]
if not objects:
    raise RuntimeError('No original dressing props')
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
                          export_yup=True, export_materials='EXPORT')
subprocess.run(['node', 'scripts/pack-map.mjs', str(dest.parent), str(dest.parent), dest.stem],
               cwd=root, check=True)
print(f'Exported {len(objects)} editable source props to {dest}')
