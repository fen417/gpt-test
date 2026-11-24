"""Build the Nahar station evidence props and export their game GLB."""
from pathlib import Path
import sys

import bpy


def material(name, hex_color, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    color = tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in srgb)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    mat.diffuse_color = shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


def root(name):
    group = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(group)
    return group


def finish(group, name, mat, bevel):
    obj = bpy.context.object
    obj.name = name
    obj.parent = group
    obj.data.materials.append(mat)
    edge = obj.modifiers.new('Rounded edges', 'BEVEL')
    edge.width, edge.segments = bevel, 2
    edge.harden_normals = True
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')


def box(group, name, xyz, size, mat, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    bpy.context.object.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(group, name, mat, bevel)


def dial(group, name, xyz, radius, depth, mat, vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz)
    finish(group, name, mat, .0007)


def lettering(group, text, xyz, size, ink):
    bpy.ops.object.text_add(location=xyz)
    obj = bpy.context.object
    obj.parent = group
    obj.data.body, obj.data.size = text, size
    obj.data.materials.append(ink)
    bpy.ops.object.convert(target='MESH')


def logbook():
    group = root('log')
    cloth = material('Oxide cloth', '784835', .92)
    faded = material('Worn spine', '986447', .94)
    paper = material('Aged page edges', 'baba96', .96)
    lines = material('Page seams', '9f9373', 1)
    tag = material('Station label', 'd1baa0', .85)
    ink = material('Stamped ink', '494d45', .94)
    box(group, 'Pages', (.002, 0, .024), (.229, .305, .037), paper, .004)
    for i in range(4):
        box(group, 'Page edge', (.117, 0, .012 + i * .008), (.002, .291, .0012), lines, .0003)
    for height in (.005, .046):
        box(group, 'Fabric cover', (0, 0, height), (.25, .322, .01), cloth, .004)
    box(group, 'Bound spine', (-.118, 0, .025), (.028, .319, .048), faded, .006)
    box(group, 'Glued label', (.025, .047, .052), (.15, .093, .0016), tag, .002)
    lettering(group, 'NAHAR', (-.037, .051, .053), .026, ink)
    lettering(group, 'RAIL LOG / 04', (-.037, .027, .053), .014, ink)
    box(group, 'Label rule', (.023, .018, .053), (.117, .0016, .0007), ink, .0002)


def recorder():
    group = root('recording')
    shell = material('Recorder casing', '343b3a', .6)
    panel = material('Brushed deck', '757e78', .36, .38)
    label = material('Archive tape label', 'b0a384', .81)
    ink = material('Recorder lettering', '313632', .91)
    cassette = material('Tape plastic', '433b30', .58)
    reel = material('Reel hub', 'cec9ab', .51)
    copper = material('Record light', 'af5e42', .38)
    box(group, 'Lower shell', (0, 0, .022), (.275, .192, .044), shell, .010)
    box(group, 'Top panel', (0, 0, .043), (.264, .18, .008), panel, .005)
    box(group, 'Cassette lid frame', (-.038, .01, .049), (.163, .129, .01), shell, .004)
    box(group, 'Cassette', (-.038, .011, .055), (.143, .104, .005), cassette, .003)
    box(group, 'Tape label', (-.038, .04, .058), (.127, .037, .002), label, .001)
    lettering(group, 'NAHAR / 04', (-.087, .034, .0592), .018, ink)
    for x in (-.079, .003):
        dial(group, 'Reel seat', (x, .002, .059), .017, .003, ink)
        dial(group, 'Tape reel', (x, .002, .0615), .012, .004, reel)
        dial(group, 'Reel spindle', (x, .002, .064), .005, .0012, cassette, 8)
    for i in range(5):
        box(group, 'Speaker grille', (.077, .045 - .012 * i, .048), (.068, .004, .002), shell, .001)
    for i in range(4):
        box(group, 'Transport key', (-.087 + i * .052, -.072, .052), (.04, .022, .009),
            shell if i < 3 else copper, .003)
    dial(group, 'Record indicator', (.108, -.045, .049), .006, .003, copper, 12)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    logbook()
    recorder()
    source = Path(__file__).resolve().parent
    assets = source.parents[1] / 'src' / 'assets' / 'nahar'
    bpy.ops.export_scene.gltf(filepath=str(assets / 'station-pickups.glb'), export_format='GLB', export_apply=True)
    bpy.data.objects['log'].location.x = -.21
    bpy.data.objects['recording'].location.x = .21
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source / 'station-pickups.blend'), compress=True)


if __name__ == '__main__':
    main()
