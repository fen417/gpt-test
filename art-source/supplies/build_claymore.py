"""Build the fictional SECTOR 09 sentry mine and its optional studio render."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EXPORT = ROOT / "src" / "assets" / "equipment" / "claymore.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgb, roughness=.55, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


body = material("Molded field olive", (.115, .158, .077), .57, .08)
band = material("Reinforced graphite", (.034, .043, .040), .63, .08)
rim = material("Olive edge trim", (.183, .227, .114), .50, .15)
metal = material("Dark anodized hardware", (.081, .103, .102), .36, .62)
orange = material("Amber field markings", (.73, .32, .065), .43, .15)
ink = material("Ivory field stencil", (.68, .71, .54), .70)
lens = material("Burgundy sensor glass", (.27, .026, .017), .25, .29)


def finish(name, mat, bevel=.003, segments=2):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Rounded edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.harden_normals = True
        normals = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
    return obj


def block(name, xyz, size, mat, bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    bpy.context.object.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(name, mat, bevel)


def cylinder(name, xyz, radius, length, mat, horizontal=True):
    angle = (math.pi / 2, 0, 0) if horizontal else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=length,
                                       location=xyz, rotation=angle)
    return finish(name, mat, .001)


def curved_panel(name, width, low, high, front, depth, mat, bevel):
    count = 13
    points = []
    for index in range(count):
        t = index / (count - 1) * 2 - 1
        x = t * width / 2
        y = front - .041 * t * t
        points += [(x, y, low), (x, y, high), (x, y - depth, high), (x, y - depth, low)]
    faces = [(0, 3, 2, 1), (4*count-4, 4*count-3, 4*count-2, 4*count-1)]
    for row in range(count-1):
        for j in range(4):
            faces.append((4*row+j, 4*row+(j+1)%4, 4*(row+1)+(j+1)%4, 4*(row+1)+j))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    finish(name, mat, bevel, 3)
    obj.select_set(False)


curved_panel("Main bowed shell", .398, .101, .278, .090, .077, body, .015)
curved_panel("Gasket", .405, .109, .257, .091, .051, band, .010)
curved_panel("Reinforced front face", .387, .118, .251, .101, .024, body, .010)
curved_panel("Upper brow", .382, .235, .266, .098, .035, rim, .007)
curved_panel("Lower frame", .382, .108, .128, .096, .029, rim, .006)

for side in (-1, 1):
    x = side * .150
    block("Leg hinge block", (x, -.007, .113), (.045, .081, .035), band, .007)
    cylinder("Hinge cap", (x, .043, .114), .013, .009, metal)
    for slope in (-1, 1):
        a = Vector((x, .015, .111))
        b = Vector((x + side * .047, .015 + slope * .100, .014))
        leg = block("Flared support", (a+b)/2, (.025, .022, (a-b).length), metal, .004)
        leg.rotation_euler = (a-b).to_track_quat("Z", "Y").to_euler()
        block("Support shoe", b, (.044, .034, .028), band, .006)
    for z in (.141, .216):
        cylinder("Fastener inset", (side * .170, .073, z), .009, .008, band)
        cylinder("Captured fastener", (side * .170, .078, z), .0056, .004, metal)
    for i in range(3):
        rib = block("Rear stiffening rib", (side * (.089+i*.028), .007-i*.005, .188),
                    (.010, .016, .096), rim, .003)
        rib.rotation_euler.z = side * -.18
    for i in range(3):
        x = side * (.118+i*.012)
        mark = block("Warning stripe", (x, .102-.041*(x/.1935)**2, .154),
                     (.006, .003, .029), orange, .001)
        mark.rotation_euler.y = -.32

block("Badge recess", (0, .101, .177), (.172, .005, .066), band, .006)
for z, label, size, mat in [(.188, "FRONT", .022, ink), (.168, "SECTOR 09", .011, orange)]:
    bpy.ops.object.text_add(location=(0, .104, z), rotation=(math.pi/2, 0, math.pi))
    stencil = bpy.context.object
    stencil.data.body = label
    stencil.data.align_x = "CENTER"
    stencil.data.size = size
    stencil.data.space_character = 1.19
    stencil.data.resolution_u = 3
    bpy.ops.object.convert(target="MESH")
    finish(label, mat, 0)

cylinder("Sensor bezel", (0, .109, .220), .016, .016, band)
cylinder("Sensor trim", (0, .119, .220), .011, .004, metal)
cylinder("Signal glass", (0, .122, .220), .008, .004, lens)
block("Recessed rear panel", (0, .012, .186), (.117, .018, .071), band, .006)
block("Rear identity strip", (0, .002, .210), (.073, .002, .009), orange, .002)
bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, .126, .220))
bpy.context.object.name = "Signal_Origin"
model = list(bpy.context.scene.objects)


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z", "Y").to_euler()


def softbox(name, where, power, size, color):
    bpy.ops.object.light_add(type="AREA", location=where)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy = power
    obj.data.size = size
    obj.data.color = color
    aim(obj, (0, 0, .15))


ground = material("Studio slate", (.052, .059, .062), .66)
block("Studio floor", (0, 0, -.017), (40, 40, .03), ground, 0)
softbox("Warm key", (-.55, .78, .86), 29, .64, (1, .89, .75))
softbox("Soft fill", (.64, .32, .41), 10, .52, (.78, .89, 1))
softbox("Cool rim", (.31, -.62, .71), 36, .58, (.72, .83, 1))
bpy.ops.object.camera_add(location=(.52, 1.14, .68))
scene = bpy.context.scene
scene.camera = bpy.context.object
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = .65
aim(scene.camera, (0, .035, .137))
scene.world = bpy.data.worlds.new("Studio light")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.22, .26, .29, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .31
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1080
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100

bpy.ops.object.select_all(action="DESELECT")
for obj in model:
    obj.select_set(True)
bpy.context.view_layer.objects.active = model[0]
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "claymore.blend"))
if "--" in sys.argv:
    scene.render.filepath = sys.argv[sys.argv.index("--") + 1]
    bpy.ops.render.render(write_still=True)

# Keep the Blender source editable. Join baked pieces by material only in GLB.
bpy.ops.object.select_all(action="DESELECT")
export_objects = [obj for obj in model if obj.type == "EMPTY"]
for mat in (body, band, rim, metal, orange, ink, lens):
    objects = [obj for obj in model if obj.type == "MESH" and obj.data.materials[0] == mat]
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    if len(objects) > 1:
        bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = mat.name
    export_objects.append(merged)
    merged.select_set(False)
    model = [obj for obj in model if obj not in objects[1:]]
for obj in export_objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(EXPORT), use_selection=True, export_apply=True,
    export_meshopt_compression_enable=True,
)
