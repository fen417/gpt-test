"""Generate packed surface atlases for the game props."""
from array import array
import math
import random
from itertools import chain

import bpy


SIZE = 192
# Coated alloy, molded polymer, and exposed steel.
FINISHES = ((.49, .48, .105), (.78, .04, .22), (.38, .69, .10))
FABRIC = (.90, .0, .19)


def finish_image(name, pixels, size=SIZE):
    data = array('f', chain.from_iterable(pixels))
    image = bpy.data.images.new(name, width=size, height=len(pixels)//size, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(data)
    image.pack()
    return image


def shader_finish(material, shader, row_count, finishes=(*FINISHES,FABRIC), *,
                  fabric_rows=(3,), stipple_rows=(), size=SIZE, roughness_variation=1):
    rng = random.Random(416)
    normal, orm = [], []
    for row, (roughness, metalness, strength) in enumerate(finishes[:row_count]):
        grain = [rng.uniform(-1, 1) for _ in range(size * size)]
        if row in stipple_rows:
            grain = stipple_height(size, rng)
        for y in range(size):
            machining = .42 * math.sin(y * math.tau / 8)
            for x in range(size):
                point = y * size + x
                value = grain[point]
                dx = grain[y * size + (x + 1) % size] - value
                dy = grain[((y + 1) % size) * size + x] - value
                if row in fabric_rows:
                    # Crossed threads catch light along both axes of the weave.
                    dx = .38*dx + .8*math.sin(x*math.tau/4)*math.cos(y*math.tau/8)
                    dy = .38*dy + .8*math.sin(y*math.tau/4)*math.cos(x*math.tau/8)
                elif row != 1 and row not in stipple_rows:
                    dy += machining
                    dx *= .35
                depth = math.hypot(dx * strength, dy * strength, 1)
                normal.append((.5 + dx * strength / (2 * depth),
                               .5 + dy * strength / (2 * depth), .5 + .5 / depth, 1))
                mottling = math.sin(x * math.tau / 48) * math.sin(y * math.tau / 32)
                orm.append((1, roughness + roughness_variation * (.072*value + .029*mottling), metalness, 1))
    graph = material.node_tree
    normal_texture = graph.nodes.new('ShaderNodeTexImage')
    normal_texture.image = finish_image('Surface grain normal', normal, size)
    normals = graph.nodes.new('ShaderNodeNormalMap')
    normals.inputs['Strength'].default_value = .78
    graph.links.new(normal_texture.outputs['Color'], normals.inputs['Color'])
    graph.links.new(normals.outputs['Normal'], shader.inputs['Normal'])
    orm_texture = graph.nodes.new('ShaderNodeTexImage')
    orm_texture.image = finish_image('Metal and polymer roughness', orm, size)
    channels = graph.nodes.new('ShaderNodeSeparateColor')
    graph.links.new(orm_texture.outputs['Color'], channels.inputs['Color'])
    graph.links.new(channels.outputs['Green'], shader.inputs['Roughness'])
    graph.links.new(channels.outputs['Blue'], shader.inputs['Metallic'])


def stipple_height(size,rng):
    """Small irregular molded peaks, with rounded bases and no repeating ridges."""
    step = max(5,size//59)
    count = (size+step-1)//step + 2
    centers = [[(x*step+rng.uniform(-.26,.26)*step,
                 y*step+rng.uniform(-.26,.26)*step,
                 rng.uniform(.38,.56)*step,rng.uniform(.68,1.0))
                for x in range(-1,count)] for y in range(-1,count)]
    height = []
    for y in range(size):
        for x in range(size):
            value = 0
            for row in range(y//step,y//step+3):
                for column in range(x//step,x//step+3):
                    cx,cy,radius,depth = centers[row][column]
                    distance = ((x-cx)**2+(y-cy)**2)/radius**2
                    if distance < 1:
                        value = max(value,depth*(1-distance)**2)
            height.append(value + rng.uniform(-.035,.035))
    return height


def finish_uv(mesh, face_colors, finish_rows, row_count):
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
            uv.data[index].uv = ((u + .97) * .61, (row + .043 + (v + .41) * 1.24) / row_count)


def grip_finish_uv(mesh, face_colors, finish_rows, row_count, color, *, depth, height):
    """Use a full finish tile for the grip sides instead of the world projection."""
    finish_uv(mesh,face_colors,finish_rows,row_count)
    uv = mesh.uv_layers.active.uv
    row = finish_rows[color]
    for face, finish in zip(mesh.polygons,face_colors):
        if finish != color:
            continue
        for index in face.loop_indices:
            _, z, y = mesh.vertices[mesh.loops[index].vertex_index].co
            u = (-z-depth[0])/(depth[1]-depth[0])
            v = (y-height[0])/(height[1]-height[0])
            uv[index].vector = (.06+.88*u,(row+.07+.86*v)/row_count)
