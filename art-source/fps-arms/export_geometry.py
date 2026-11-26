"""Export the authored glove/sleeve geometry and joint landmarks for the FPS pose baker."""

import json
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector


def game_axes(vector, scale=1):
    return [round(value * scale, 7) for value in (vector.x, vector.z, -vector.y)]


def close_shoulder(obj, group, vertices, indices):
    # Weld a temporary copy to find the real opening across the artist's UV seams.
    mesh = bmesh.new()
    try:
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=.0001)
        edges = [edge for edge in mesh.edges if edge.is_boundary]
        if not edges:
            return
        rim = {vertex for edge in edges for vertex in edge.verts}
        if min(vertex.co.z for vertex in rim) < 10:
            raise ValueError(f'Unexpected opening on {obj.name}')
        cap = set(bmesh.ops.holes_fill(mesh, edges=edges, sides=0)['faces'])
        mesh.normal_update()
        center = sum((vertex.co for vertex in rim), Vector()) / len(rim)
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for triangle in mesh.calc_loop_triangles():
            if triangle[0].face not in cap:
                continue
            for loop in triangle:
                point = loop.vert.co
                uv = [.52 + (point.x - center.x) * .009, .73 + (point.y - center.y) * .009]
                normal = game_axes((normal_matrix @ loop.face.normal).normalized())
                indices.append(len(vertices))
                vertices.append([game_axes(obj.matrix_world @ point, .01), normal, uv, [[group, 1]]])
    finally:
        mesh.free()


def export_geometry(scene, output):
    rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
    joints = {
        bone.name: game_axes(rig.matrix_world @ bone.head_local, .01)
        for bone in rig.data.bones
    }
    data = {}
    for side, name in (('L', 'Object_8'), ('R', 'Object_10')):
        obj = scene.objects[name]
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv_layer = mesh.uv_layers.active.uv
        normals = obj.matrix_world.to_3x3().inverted().transposed()
        vertices, indices, corners = [], [], {}
        for triangle in mesh.loop_triangles:
            for loop in triangle.loops:
                vertex = mesh.vertices[mesh.loops[loop].vertex_index]
                normal = game_axes((normals @ mesh.corner_normals[loop].vector).normalized())
                uv = uv_layer[loop].vector
                uv = [round(uv.x, 7), round(1 - uv.y, 7)]
                key = (vertex.index, *normal, *uv)
                if key not in corners:
                    corners[key] = len(vertices)
                    weights = [[obj.vertex_groups[w.group].name, round(w.weight, 7)]
                               for w in vertex.groups if w.weight > 0]
                    vertices.append([game_axes(obj.matrix_world @ vertex.co, .01), normal, uv, weights])
                indices.append(corners[key])
        close_shoulder(obj, 'joint_00' if side == 'L' else 'joint24_023', vertices, indices)
        glove_indices, sleeve_indices = [], []
        for start in range(0, len(indices), 3):
            triangle = indices[start:start + 3]
            # The glove islands near the hand meet the camouflage cuff at a UV seam.
            # Use whole faces so the binding and the original edge loop stay intact.
            is_glove = all(vertices[i][0][1] < -.27 and vertices[i][2][1] < .55
                           for i in triangle)
            (glove_indices if is_glove else sleeve_indices).extend(triangle)
        data[side] = {'vertices': vertices, 'gloveIndices': glove_indices,
                      'sleeveIndices': sleeve_indices}
    Path(output).write_text(json.dumps({'joints': joints, 'hands': data}, separators=(',', ':')),
                            encoding='utf-8')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) == 3:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(Path(args[1]).resolve()))
        scene = bpy.context.scene
        scene.unit_settings.system = 'METRIC'
        scene.unit_settings.scale_length = .01
        scene['Source'] = 'Gloves for fps game by bobeer — CC BY 4.0'
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args[2]).resolve()), compress=True)
    export_geometry(bpy.context.scene, args[0])
