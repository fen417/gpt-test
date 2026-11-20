"""Mesh and export helpers for the game’s editable weapon props."""
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent / "tank"))
from build_rubezh import Assembly


def side_profile(mesh, points, width, color, x=0):
    center_z = sum(z for z, _ in points) / len(points)
    center_y = sum(y for _, y in points) / len(points)
    sections = [(-width / 2, .966), (-width * .38, 1), (width * .38, 1), (width / 2, .966)]
    mesh.rings([[(x + section, center_y + (y - center_y) * scale, center_z + (z - center_z) * scale)
                 for z, y in points] for section, scale in sections], color)


def sight_ring(mesh, y, z, inner, outer, depth, color):
    vertices = []
    sides = 20
    for plane, radius in ((-1, outer), (-1, inner), (1, inner), (1, outer)):
        for step in range(sides):
            angle = math.tau * step / sides
            vertices.append((radius * math.cos(angle), y + radius * math.sin(angle), z + plane * depth / 2))
    faces = []
    for row in range(4):
        current, following = row * sides, ((row + 1) % 4) * sides
        for step in range(sides):
            next_step = (step + 1) % sides
            faces.append((current + step, current + next_step, following + next_step, following + step))
    mesh.add(vertices, faces, color)


def export_weapon(parts, glb, blend, *, pivots=None, view_distance=2.1):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.context.scene.collection
    material = bpy.data.materials.new('Blued steel and molded polymer')
    material.use_nodes = True
    material.use_backface_culling = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = .25
    shader.inputs['Roughness'].default_value = .53
    paint = material.node_tree.nodes.new('ShaderNodeVertexColor')
    paint.layer_name = 'Paint'
    material.node_tree.links.new(paint.outputs['Color'], shader.inputs['Base Color'])
    for name, assembly in parts:
        obj = assembly.object(name, collection)
        if pivots and name in pivots:
            x, y, z = pivots[name]
            obj.location = (x, -z, y)
            for vertex in obj.data.vertices:
                vertex.co -= obj.location
        obj.data.materials.append(material)
        uv = obj.data.uv_layers.active
        obj.data.uv_layers.remove(uv)
    bpy.ops.export_scene.gltf(filepath=str(glb.resolve()), export_format='GLB', export_vertex_color='ACTIVE',
                              export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.color_type = 'VERTEX'
                area.spaces.active.region_3d.view_distance = view_distance
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()), compress=True)
