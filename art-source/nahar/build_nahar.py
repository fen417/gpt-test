"""Build the batched game scene and editable city source from the shared map."""

import json
from collections import defaultdict
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def linear(component):
    value = component / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(value):
    return tuple(linear(int(value[i:i + 2], 16)) for i in (1, 3, 5))


class Batch:
    def __init__(self):
        self.points, self.faces, self.colors, self.uv = [], [], [], []

    def polygon(self, points, tone, axis):
        offset = len(self.points)
        self.points.extend((x, -z, y) for x, y, z in points)
        self.faces.append(tuple(range(offset, offset + len(points))))
        for i, p in enumerate(points):
            shade = 0.93 if axis != (0, 2) and i in (0, 1) else 1
            self.colors.extend((*[c * shade for c in tone], 1))
            self.uv.extend((p[axis[0]] / 4, p[axis[1]] / 4))

    def block(self, part, tint):
        x, z, y = (part[k] for k in ('x', 'z', 'baseY'))
        w, d, h = (part[k] for k in ('w', 'd', 'h'))
        if part.get('shape') == 'cylinder':
            radial = [(x + cos(i * pi / 8) * w / 2, z + sin(i * pi / 8) * d / 2) for i in range(16)]
            self.polygon([(px, y + h, pz) for px, pz in reversed(radial)], tint, (0, 2))
            self.polygon([(px, y, pz) for px, pz in radial], tint, (0, 2))
            for (ax, az), (bx, bz) in zip(radial, radial[1:] + radial[:1]):
                self.polygon([(bx, y, bz), (ax, y, az), (ax, y + h, az), (bx, y + h, bz)], tint, (0, 1))
            return
        a, b, c, d0 = x - w / 2, x + w / 2, z - d / 2, z + d / 2
        pts = [(a, y, c), (b, y, c), (b, y, d0), (a, y, d0),
               (a, y+h, c), (b, y+h, c), (b, y+h, d0), (a, y+h, d0)]
        for face, axis in [((0, 1, 2, 3), (0, 2)), ((7, 6, 5, 4), (0, 2)),
                           ((1, 0, 4, 5), (0, 1)), ((3, 2, 6, 7), (0, 1)),
                           ((0, 3, 7, 4), (2, 1)), ((2, 1, 5, 6), (2, 1))]:
            self.polygon([pts[i] for i in face], tint, axis)

    def make_mesh(self, name, surface, cast, collection, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        mesh.update()
        mesh.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='CORNER').data.foreach_set('color', self.colors)
        mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', self.uv)
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj['villageSurface'], obj['villageCaster'] = surface, cast
        return obj


def main():
    plan_path, asset_path, stage_path, *options = sys.argv[sys.argv.index('--') + 1:]
    plan = json.loads(Path(plan_path).read_text(encoding='utf-8'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    groups = {}
    for key in ('Base', 'Detail'):
        groups[key] = bpy.data.collections.new('Nahar ' + key)
        scene.collection.children.link(groups[key])

    preview_mat = bpy.data.materials.new('Tint')
    preview_mat.use_nodes = True
    nodes = preview_mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .89
    vertex = nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Tint'
    preview_mat.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Base Color'])

    batches = defaultdict(Batch)
    for part in plan['parts']:
        detail = part['detailLevel'] > 0
        category = 'Detail' if detail else 'Base'
        x, z = part['x'], part['z']
        zone = 92 if abs(x) < 440 and abs(z) < 285 else 245
        cast = (not detail and part['h'] > .18 and abs(x) < 438 and abs(z) < 280)
        batches[category, part['surface'], cast, int(x // zone), int(z // zone)].block(part, color(part['color']))

    heights, spacing, limit = (plan[k] for k in ('heights', 'spacing', 'limit'))
    for j in range(len(heights) - 1):
        for i in range(len(heights[j]) - 1):
            x, z = i * spacing - limit, j * spacing - limit
            tint = color('#cdb28e' if heights[j][i] > -1 else '#9b886d')
            tile = batches['Base', 'village-sand', False, i // 32 + 50, j // 32 + 50]
            a = (x, heights[j][i], z)
            b = (x + spacing, heights[j][i + 1], z)
            c = (x, heights[j + 1][i], z + spacing)
            d = (x + spacing, heights[j + 1][i + 1], z + spacing)
            tile.polygon([a, c, b], tint, (0, 2))
            tile.polygon([b, c, d], tint, (0, 2))

    water = plan['water']
    for i in range(12):
        x = water['x'] + (i - 5.5) * water['w'] / 12
        batches['Base', 'unlit', False, i, 40].block({**water, 'x':x, 'w':water['w']/12, 'h':.015,
                                                    'baseY':water['y']}, color('#4e655d'))
    for (category, surface, cast, x, z), batch in batches.items():
        batch.make_mesh(f'{category}-{surface}-{x}-{z}-{int(cast)}', surface, cast, groups[category], preview_mat)

    # GLB layers use the same voxel-free shapes as the map's collision plan.
    for category, collection in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in collection.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(Path(asset_path) / f'{category.lower()}.glb'), export_format='GLB',
                                  use_selection=True, export_extras=True, export_materials='NONE', export_vertex_color='ACTIVE')

    if '--preview' in options:
        preview_scene(scene, Path(stage_path))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).resolve().parent / 'nahar.blend'), compress=True)


def preview_scene(scene, stage):
    bpy.ops.object.camera_add(location=(-185, 200, 126))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((53, -40, 3)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens, camera.data.clip_end = 43, 3600
    scene.camera = camera
    for index, (x, z, y) in enumerate(((-103, -128, 79), (2, -76, 57))):
        asset = Path(__file__).resolve().parents[2] / 'src/assets/black-hawk/black-hawk.glb'
        existing = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(asset))
        imported = set(bpy.data.objects) - existing
        for obj in list(imported):
            node = obj
            while node is not None and not node.name.startswith(('LOD1', 'LOD2')):
                node = node.parent
            obj.hide_render = node is not None
        parents = [obj for obj in imported if obj.parent is None]
        bpy.ops.object.empty_add(location=(x,-z,y))
        anchor = bpy.context.object
        anchor.name = f'Preview Hawk {index + 1}'
        anchor.rotation_euler.z = -1.65
        for root in parents:
            root.parent = anchor

    scene.render.engine='BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light='STUDIO'
    shading.color_type='VERTEX'
    shading.show_shadows=True
    shading.show_cavity=True
    shading.cavity_type='BOTH'
    shading.curvature_ridge_factor=1.08
    shading.curvature_valley_factor=1.2
    shading.background_type='WORLD'
    if not scene.world:
        scene.world=bpy.data.worlds.new('Nahar Dawn')
    scene.world.color=(.41,.30,.22)
    scene.view_settings.exposure=.68
    scene.render.resolution_x, scene.render.resolution_y = 2560, 1440
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(stage / 'preview.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
