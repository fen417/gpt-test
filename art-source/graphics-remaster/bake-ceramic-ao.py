"""Bake study geometry for the eight-by-eight ceramic tile material in Laguna."""
import sys
from pathlib import Path

import bpy

output = Path(sys.argv[sys.argv.index("--") + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)

# Model the tops, chamfered edges and grout as one continuous surface.
cuts = [(0.0, 0.0), (.018, 0.0), (.04, .016), (.96, .016), (.982, 0.0), (1.0, 0.0)]
axis = [(tile + fraction, elevation) for tile in range(8) for fraction, elevation in cuts[:-1]]
axis.append((8.0, 0.0))
vertices = [(x, y, min(zx, zy)) for y, zy in axis for x, zx in axis]
side = len(axis)
faces = [(i, i + 1, i + side + 1, i + side)
         for i in range(side * (side - 1)) if i % side < side - 1]
mesh = bpy.data.meshes.new("Tile tops and grout")
mesh.from_pydata(vertices, [], faces)
mesh.update()
tiles = bpy.data.objects.new("Laguna ceramic sample", mesh)
bpy.context.collection.objects.link(tiles)
uv = mesh.uv_layers.new()
for loop in mesh.loops:
    x, y, _ = vertices[loop.vertex_index]
    uv.uv[loop.index].vector = (x / 8, y / 8)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.world = bpy.data.worlds.new("AO environment")
scene.world.color = (.3, .3, .3)
scene.cycles.samples = 48
scene.render.bake.margin = 2

material = bpy.data.materials.new("Ceramic relief")
material.use_nodes = True
tiles.data.materials.append(material)
image = bpy.data.images.new("Grout AO", 1024, 1024, alpha=False)
image.colorspace_settings.name = "Non-Color"
target = material.node_tree.nodes.new("ShaderNodeTexImage")
target.image = image
material.node_tree.nodes.active = target
bpy.context.view_layer.objects.active = tiles
tiles.select_set(True)
bpy.ops.object.bake(type="AO")
image.filepath_raw = str(output.resolve())
image.file_format = "PNG"
image.save()
