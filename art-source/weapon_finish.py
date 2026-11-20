"""Generate a small packed surface atlas for the rifle props."""
from array import array
import math
import random
from itertools import chain

import bpy


SIZE = 192
# Coated alloy, molded polymer, and exposed steel.
FINISHES = ((.49, .48, .105), (.78, .04, .22), (.38, .69, .10))


def finish_image(name, pixels):
    data = array('f', chain.from_iterable(pixels))
    image = bpy.data.images.new(name, width=SIZE, height=SIZE * len(FINISHES), alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(data)
    image.pack()
    return image


def shader_finish(material, shader):
    rng = random.Random(416)
    normal, orm = [], []
    for row, (roughness, metalness, strength) in enumerate(FINISHES):
        grain = [rng.uniform(-1, 1) for _ in range(SIZE * SIZE)]
        for y in range(SIZE):
            machining = .42 * math.sin(y * math.tau / 8)
            for x in range(SIZE):
                point = y * SIZE + x
                value = grain[point]
                dx = grain[y * SIZE + (x + 1) % SIZE] - value
                dy = grain[((y + 1) % SIZE) * SIZE + x] - value
                if row != 1:
                    dy += machining
                    dx *= .35
                depth = math.hypot(dx * strength, dy * strength, 1)
                normal.append((.5 + dx * strength / (2 * depth),
                               .5 + dy * strength / (2 * depth), .5 + .5 / depth, 1))
                mottling = math.sin(x * math.tau / 48) * math.sin(y * math.tau / 32)
                orm.append((1, roughness + .072 * value + .029 * mottling, metalness, 1))
    graph = material.node_tree
    normal_texture = graph.nodes.new('ShaderNodeTexImage')
    normal_texture.image = finish_image('Surface grain normal', normal)
    normals = graph.nodes.new('ShaderNodeNormalMap')
    normals.inputs['Strength'].default_value = .78
    graph.links.new(normal_texture.outputs['Color'], normals.inputs['Color'])
    graph.links.new(normals.outputs['Normal'], shader.inputs['Normal'])
    orm_texture = graph.nodes.new('ShaderNodeTexImage')
    orm_texture.image = finish_image('Metal and polymer roughness', orm)
    channels = graph.nodes.new('ShaderNodeSeparateColor')
    graph.links.new(orm_texture.outputs['Color'], channels.inputs['Color'])
    graph.links.new(channels.outputs['Green'], shader.inputs['Roughness'])
    graph.links.new(channels.outputs['Blue'], shader.inputs['Metallic'])


def finish_uv(mesh, face_colors, finish_rows):
    uv = mesh.uv_layers.active
    uv.name = 'Surface finish'
    for face, color in zip(mesh.polygons, face_colors):
        nx, nz, ny = face.normal
        row = finish_rows.get(color, 0)
        for index in face.loop_indices:
            x, z, y = mesh.vertices[mesh.loops[index].vertex_index].co
            z = -z
            u, v = (z,x) if abs(ny) > .65 else ((z,y) if abs(nx) > abs(nz) else (x,y))
            # Leave eight pixels at every row edge for filtering and mipmaps.
            uv.data[index].uv = ((u + .97) * .61, (row + .043 + (v + .41) * 1.24) / len(FINISHES))
