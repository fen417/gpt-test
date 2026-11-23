"""Build the editable Field Reserve case, menu GLB, and optional patch render."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source" / "cases"
EXPORT = ROOT / "src" / "assets" / "cases"

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgb, metallic=0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    surface = mat.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = roughness
    return mat


shell = material("Molded olive composite", (0.155, 0.205, 0.10), 0.08)
edge = material("Raised shell rails", (0.095, 0.125, 0.065), 0.13)
rubber = material("Graphite impact guards", (0.027, 0.032, 0.03), 0.05, 0.63)
steel = material("Dark hardware", (0.105, 0.12, 0.12), 0.73, 0.38)
amber = material("Amber latch releases", (0.73, 0.33, 0.062), 0.34, 0.38)
ink = material("Stencil", (0.73, 0.78, 0.59), 0.04)
plate = material("Identification panel", (0.051, 0.077, 0.04), 0.19)


def part(name, mat, bevel, segments=2):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Rounded molded edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.harden_normals = True
        normals = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
    return obj


def block(name, xyz, size, mat, bevel=0.012, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    bpy.context.object.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return part(name, mat, bevel, segments)


def pin(name, xyz, radius, length, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=radius, depth=length, location=xyz, rotation=rotation,
    )
    return part(name, mat, min(0.0025, radius * 0.25), 1)


def stencil(name, inscription, xyz, size, mat):
    bpy.ops.object.text_add(location=xyz)
    obj = bpy.context.object
    obj.data.body = inscription
    obj.data.size = size
    obj.data.space_character = 1.12
    obj.data.resolution_u = 3
    bpy.ops.object.convert(target="MESH")
    return part(name, mat, 0)


block("Lower tub", (0, 0, 0.119), (0.90, 0.54, 0.204), shell, 0.043, 4)
block("Compression seal", (0, 0, 0.224), (0.904, 0.545, 0.025), rubber, 0.012, 3)
block("Lid", (0, 0, 0.269), (0.915, 0.555, 0.079), shell, 0.031, 4)
block("Reinforced upper frame", (0, 0, 0.299), (0.862, 0.497, 0.035), edge, 0.019, 3)
block("Recessed lid face", (0, 0, 0.313), (0.754, 0.391, 0.017), shell, 0.014, 3)
block("Back identification panel", (0.05, -0.010, 0.325), (0.457, 0.191, 0.014), plate, 0.014, 3)
stencil("Unit marking", "SECTOR 09", (-0.145, 0.014, 0.3324), 0.065, ink)
stencil("Case marking", "FIELD RESERVE", (-0.145, -0.039, 0.3324), 0.035, ink)
stencil("Asset number", "S09 - 034", (-0.145, -0.073, 0.3324), 0.019, amber)

for i, y in enumerate((-0.154, 0.151)):
    block(f"Lid stiffener {i + 1}", (0.0, y, 0.327), (0.68, 0.026, 0.024), edge, 0.009)
for side in (-1, 1):
    for end in (-1, 1):
        x, y = side * 0.404, end * 0.231
        block("Corner bumper", (x, y, 0.090), (0.122, 0.108, 0.151), rubber, 0.023, 3)
        block("Lid corner cap", (x, y, 0.271), (0.116, 0.102, 0.073), rubber, 0.019, 3)
        block("Stacking foot", (x, end * 0.20, 0.023), (0.105, 0.096, 0.047), rubber, 0.011)
        pin("Corner fastener", (x, y, 0.307), 0.009, 0.008, steel)
    block("Latch mount", (side * 0.295, -0.275, 0.196), (0.092, 0.034, 0.114), rubber)
    block("Latch body", (side * 0.295, -0.296, 0.202), (0.071, 0.027, 0.088), steel, 0.009)
    block("Latch release", (side * 0.295, -0.313, 0.202), (0.047, 0.014, 0.047), amber, 0.006)
    for z in (0.192, 0.202, 0.212):
        block("Latch grip", (side * 0.295, -0.321, z), (0.035, 0.004, 0.004), steel, 0.001)
    block("Hinge plate", (side * 0.286, 0.271, 0.216), (0.109, 0.040, 0.082), steel)
    pin("Hinge barrel", (side * 0.286, 0.289, 0.226), 0.017, 0.126, rubber, (0, math.pi / 2, 0))
    block("Handle anchor", (side * 0.137, -0.263, 0.103), (0.056, 0.060, 0.064), steel)
    arm = block("Handle arm", (side * 0.122, -0.308, 0.106), (0.037, 0.100, 0.029), rubber, 0.010)
    arm.rotation_euler.z = side * -0.17
    for y in (-0.132, 0.0, 0.132):
        block("Side impact rib", (side * 0.445, y, 0.138), (0.025, 0.029, 0.122), edge, 0.009)

block("Carry grip", (0, -0.346, 0.108), (0.229, 0.039, 0.039), rubber, 0.016, 3)
for i in range(-6, 7):
    block("Carry grip ridges", (i * 0.014, -0.347, 0.127), (0.005, 0.022, 0.006), steel, 0.002)
for i in range(3):
    stripe = block("Amber handling stripe", (-0.273 + 0.026 * i, -0.001, 0.325),
                   (0.012, 0.102 - 0.012 * i, 0.003), amber, 0.001)
    stripe.rotation_euler.z = -0.25

SOURCE.mkdir(parents=True, exist_ok=True)
EXPORT.mkdir(parents=True, exist_ok=True)


def point_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, xyz, power, color, size):
    bpy.ops.object.light_add(type="AREA", location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy = power
    obj.data.color = color
    obj.data.shape = "DISK"
    obj.data.size = size
    point_at(obj, (0, 0, 0.10))


case_objects = list(bpy.context.scene.objects)
ground = material("Studio slate", (0.037, 0.044, 0.049), 0.06, 0.63)
block("Studio floor", (0, 0, -0.032), (200, 200, 0.06), ground, 0)
area("Warm key", (-0.9, -0.95, 1.75), 74, (1, 0.88, 0.72), 0.98)
area("Cool fill", (1.15, -0.38, 0.81), 27, (0.73, 0.84, 1), 0.85)
area("Top rim", (0.50, 0.82, 1.31), 104, (1, 0.94, 0.82), 0.73)
bpy.ops.object.camera_add(location=(1.08, -1.56, 1.35))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.33
point_at(camera, (0, -0.008, 0.163))
scene = bpy.context.scene
scene.camera = camera
scene.world = bpy.data.worlds.new("Studio ambient")
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.27, 0.31, 0.34, 1)
scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.29
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1080
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100

bpy.ops.object.select_all(action="DESELECT")
for item in case_objects:
    item.select_set(True)
bpy.context.view_layer.objects.active = case_objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "field-reserve.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(EXPORT / "field-reserve.glb"), use_selection=True, export_apply=True,
)

if "--" in sys.argv:
    scene.render.filepath = sys.argv[sys.argv.index("--") + 1]
    bpy.ops.render.render(write_still=True)
