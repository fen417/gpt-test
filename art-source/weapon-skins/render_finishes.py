"""Inspect the exported paint textures on the existing weapon geometry."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
WEAPONS = ROOT / "src" / "assets" / "infantry"
TEXTURES = ROOT / "src" / "assets" / "weapon-skins"
PANELS = {"Receiver", "Lower", "Upper", "Handguard", "ForeEnd", "Stock",
          "Frame", "Slide", "Shroud", "FeedCover"}
FINISHES = (
    ("common-1", "ar416", "AR-416  /  ASH"),
    ("common-2", "ak12m", "AK-12M  /  EMBANKMENT"),
    ("common-3", "p19", "P-19  /  MOSS"),
    ("uncommon-1", "mcx9", "MCX-9  /  QUARTZ"),
    ("uncommon-2", "pkp", "PKP  /  THALWEG"),
    ("uncommon-3", "mg36", "MG-36  /  RADIO BEACON"),
    ("rare-1", "vk45", "VK-45  /  RIPPLE"),
    ("rare-2", "dmr12", "DMR-12  /  DESERT WIND"),
    ("rare-3", "ar416", "AR-416  /  CONTOUR"),
    ("legendary-1", "ak12m", "AK-12M  /  COPPER HAWK"),
    ("legendary-2", "m50", "M-50  /  ECLIPSE"),
    ("ultra-1", "sv98", "SV-98M  /  LADY NAGANT"),
)
HEROES = {"legendary-1": "Receiver", "ultra-1": "Receiver"}
SURFACE = {
    "common": (.74, .05), "uncommon": (.64, .16), "rare": (.45, .24),
    "legendary": (.32, .42), "ultra": (.30, .22),
}

bpy.ops.wm.read_factory_settings(use_empty=True)


def paint_material(skin, companion):
    label = skin + (" / surrounding panels" if companion else "")
    material = bpy.data.materials.new(label)
    material.use_nodes = True
    graph = material.node_tree
    shader = graph.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value, shader.inputs["Metallic"].default_value = SURFACE[skin.split("-")[0]]
    tex = graph.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(TEXTURES / f"{skin}.webp"), check_existing=True)
    tex.extension = "EXTEND"
    uv = graph.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "Paint projection"
    graph.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    graph.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    return material


def paint_mesh(obj, finish, companion, shared_bounds):
    world = obj.matrix_world
    coords = [world @ vertex.co for vertex in obj.data.vertices]
    mins, maxs = shared_bounds or (
        [min(point[i] for point in coords) for i in range(3)],
        [max(point[i] for point in coords) for i in range(3)],
    )
    width, depth, height = [max(.001, hi - lo) for lo, hi in zip(mins, maxs)]
    uv = obj.data.uv_layers.new(name="Paint projection")
    normal_basis = world.to_3x3()
    for loop in obj.data.loops:
        n = (normal_basis @ obj.data.vertices[loop.vertex_index].normal).normalized()
        x,y,z = coords[loop.vertex_index]
        u = .025 + .95 * (maxs[1] - y) / depth
        v = .025 + .95 * (z - mins[2]) / height + .09 * x / width * abs(n.z)
        uv.uv[loop.index].vector = (.02 + .28 * u, .11 + .78 * v) if companion else (u, v)
    obj.data.materials.clear()
    obj.data.materials.append(finish)


def add_weapon(skin, weapon, position, length):
    prior = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(WEAPONS / f"{weapon}.glb"))
    imported = [obj for obj in bpy.context.scene.objects if obj not in prior]
    bpy.context.view_layer.update()
    meshes = [obj for obj in imported if obj.type == "MESH"]
    hero = HEROES.get(skin)
    base = paint_material(skin, False)
    accent = paint_material(skin, True) if hero else base
    panels = {mesh: mesh.name.split(".")[0] for mesh in meshes if mesh.name.split(".")[0] in PANELS}
    shared_bounds = None
    if weapon == "m50":
        points = [mesh.matrix_world @ Vector(point) for mesh in panels for point in mesh.bound_box]
        shared_bounds = ([min(point[i] for point in points) for i in range(3)],
                         [max(point[i] for point in points) for i in range(3)])
    for mesh, name in panels.items():
        companion = bool(hero and name != hero)
        paint_mesh(mesh, accent if companion else base, companion, shared_bounds)

    rotation = Matrix.Rotation(math.pi / 2, 4, "Z")
    points = [rotation @ obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    minimum = Vector([min(point[i] for point in points) for i in range(3)])
    maximum = Vector([max(point[i] for point in points) for i in range(3)])
    scale = length / (maximum.x - minimum.x)
    transform = Matrix.Translation(Vector(position) - (minimum + maximum) * (scale / 2))
    transform @= Matrix.Scale(scale, 4) @ rotation
    for obj in imported:
        if obj.parent not in imported:
            obj.matrix_world = transform @ obj.matrix_world


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, position, energy, size, color):
    bpy.ops.object.light_add(type="AREA", location=position)
    lamp = bpy.context.object
    lamp.name = name
    lamp.data.energy = energy
    lamp.data.size = size
    lamp.data.color = color
    aim(lamp, (0, 0, 0))


def title(label, x, z):
    bpy.ops.object.text_add(location=(x, -.16, z), rotation=(math.pi / 2, 0, 0))
    font = bpy.context.object
    font.data.body = label
    font.data.align_x = "CENTER"
    font.data.size = .087
    font.data.materials.append(lettering)


output = Path(sys.argv[sys.argv.index("--") + 1])
detail = "--detail" in sys.argv or "--eclipse" in sys.argv
lettering = bpy.data.materials.new("Neutral labels")
lettering.diffuse_color = (.52, .59, .56, 1)
if "--eclipse" in sys.argv:
    add_weapon(*FINISHES[-2][:2], (0, 0, 0), 2.35)
elif detail:
    add_weapon(*FINISHES[-1][:2], (0, 0, 0), 2.9)
else:
    for index, (skin, weapon, label) in enumerate(FINISHES):
        column, row = index % 3, index // 3
        x,z = (column - 1) * 2.53, (1.5 - row) * 1.04
        add_weapon(skin, weapon, (x, 0, z + .12), 2.20 if weapon not in ("m50", "p19") else 1.33)
        title(label, x, z - .365)

scene = bpy.context.scene
scene.world = bpy.data.worlds.new("Showroom")
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.15, .19, .21, 1)
scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .45
area("Softbox", (-2, -4.7, 4.5), 530, 6, (1, .93, .85))
area("Cool front fill", (2.5, -4.0, -2), 220, 5, (.83, .91, 1))
area("Edge light", (0, 2, 4.5), 700, 6, (.76, .85, 1))
bpy.ops.object.camera_add(location=(0, -12, .34))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.6 if "--eclipse" in sys.argv else 3.16 if detail else 7.62
aim(camera, (0, 0, 0))
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.resolution_x = 1536
scene.render.resolution_y = 1080 if "--eclipse" in sys.argv else 640 if detail else 960
scene.render.resolution_percentage = 100
scene.render.filepath = str(output)
bpy.ops.render.render(write_still=True)
