"""Author both levels of detail for the fictional БД-09 binoculars."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
EXPORT = HERE.parents[1] / "src" / "assets" / "equipment"
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent))
from weapon_mesh import optic_coating

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, roughness=.55, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


olive = material("Textured olive polymer", (.107,.147,.095), .69, .04)
rubber = material("Charcoal rubber", (.025,.031,.029), .77)
metal = material("Anodized ring", (.115,.137,.132), .38, .63)
front_glass = optic_coating("Objective lens coating", (.29,.48,.40,.17))
rear_glass = optic_coating("Eyepiece lens coating", (.43,.55,.58,.09))
glass_edge = material("Tinted optical rim", (.133,.223,.181), .24, .63)
amber = material("Amber control surround", (.53,.276,.060), .5, .22)
stencil = material("Warm grey markings", (.61,.67,.54), .65)


def mesh_part(name, mat, bevel=0):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft tooling edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.harden_normals = True
        normals = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
    return obj


def block(name, xyz, size, mat, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    bpy.context.object.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return mesh_part(name, mat, bevel)


def round_profile(name, x, z, profile, mat, sides, bore=None):
    """Revolve a closed profile in the XZ plane around the view axis."""
    verts = [(x + r*math.cos(a), y, z + r*math.sin(a))
             for y, r in profile for a in (i*math.tau/sides for i in range(sides))]
    faces = []
    for row in range(len(profile)):
        here, there = row*sides, (row+1)%len(profile)*sides
        for i in range(sides):
            j = (i+1)%sides
            faces.append((here+i, here+j, there+j, there+i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if bore:
        obj.data.materials.append(bore)
    for poly in obj.data.polygons:
        ring = poly.index // sides
        poly.use_smooth = ring % (len(profile)-1) != 0
        if bore and ring >= len(profile)-2:
            poly.material_index = 1
    return obj


def disk(name, xyz, radius, depth, mat, sides, vertical=False):
    angle = (0,0,0) if vertical else (math.pi/2,0,0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=depth, location=xyz, rotation=angle)
    return mesh_part(name, mat, min(.0012,depth*.16) if sides>16 else 0)


def window(name, x, y, radius, mat, sides):
    points = [(x+radius*math.cos(a),y,.063+radius*math.sin(a))
              for a in (i*math.tau/sides for i in range(sides))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], [tuple(reversed(range(sides)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)


def lettering(text, xyz, size, mat):
    bpy.ops.object.text_add(location=xyz, rotation=(0,0,math.pi))
    obj = bpy.context.object
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.size = size
    obj.data.resolution_u = 3
    bpy.ops.object.convert(target="MESH")
    mesh_part(text, mat)


def build(high):
    old = set(bpy.context.scene.objects)
    sides = 36 if high else 12
    bevel = .007 if high else .004
    for sign in (-1,1):
        x = sign*.057
        round_profile("Tapered housing", x, .063,
                      [(-.089,.033),(-.062,.036),(.033,.043),(.094,.046),(.098,.040),(-.089,.028)],
                      olive, sides, bore=rubber)
        round_profile("Recessed lens hood", x,.063,
                      [(.083,.044),(.090,.048),(.108,.047),(.111,.041),(.107,.037),(.088,.037)], rubber, sides)
        round_profile("Coated front ring", x,.063,
                      [(.093,.039),(.102,.039),(.103,.035),(.092,.035)], glass_edge, sides)
        window("Objective glass", x,.094,.036,front_glass,sides)
        round_profile("Rear eyecup", x,.063,
                      [(-.108,.027),(-.104,.036),(-.086,.036),(-.074,.031),(-.074,.024),(-.109,.024)], rubber,sides)
        window("Ocular glass", x,-.097,.024,rear_glass,sides)
        block("Side grip pad", (sign*.092,.009,.060),(.027,.092,.046),rubber,bevel)
        if high:
            round_profile("Inner aperture ring", x,.063,
                          [(.041,.036),(.036,.036),(.036,.030),(.041,.030)], metal, sides)
            for j in range(7):
                block("Grip tread", (sign*.105,-.026+j*.011,.060),(.003,.005,.028),olive,.001)
            round_profile("Adjustment ring", x,.063,
                          [(-.077,.034),(-.075,.037),(-.061,.038),(-.059,.035)], metal, sides)
            for j in range(16):
                theta=j*math.tau/16
                tooth=block("Eyecup index", (x+.037*math.cos(theta),-.070,.063+.037*math.sin(theta)),
                            (.003,.009,.004),rubber,.0005)
                tooth.rotation_euler.y=-theta
            block("Lanyard seat", (sign*.099,-.050,.056),(.023,.014,.022),metal,.002)
            block("Lanyard recess", (sign*.111,-.050,.056),(.003,.008,.011),rubber,.001)

    block("Bridge", (0,-.010,.064),(.063,.114,.043),olive,bevel)
    block("Control deck", (0,-.013,.101),(.052,.079,.047),rubber,bevel)
    disk("Focus dial", (0,-.043,.123),.021,.015,metal,sides,True)
    disk("Measure key bezel", (0,.018,.126),.013,.009,amber,sides,True)
    disk("Measure key", (0,.018,.132),.008,.004,rubber,sides,True)
    if high:
        for j in range(14):
            angle=j*math.tau/14
            tooth=block("Focus dial grip", (.021*math.cos(angle),-.043+.021*math.sin(angle),.125),
                        (.003,.004,.010),rubber,.0007)
            tooth.rotation_euler.z=angle
        lettering("BD / 09", (0,-.004,.125),.0075,stencil)
        lettering("SECTOR", (0,.037,.125),.006,stencil)
        for x in (-.022,.022):
            disk("Deck fastener", (x,-.021,.125),.0028,.0015,metal,16,True)

    name = "High detail" if high else "Low detail"
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    objects = [item for item in bpy.context.scene.objects if item not in old]
    for item in objects:
        for parent in list(item.users_collection):
            parent.objects.unlink(item)
        collection.objects.link(item)
    return collection, objects


def point_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, xyz, power, color, size):
    bpy.ops.object.light_add(type="AREA", location=xyz)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.color = color
    light.data.size = size
    point_at(light, (0,0,.065))


_, high = build(True)
low_collection, low = build(False)
low_collection.hide_render = True
low_collection.hide_viewport = True
floor = material("Studio background", (.045,.055,.058), .72)
block("Studio floor", (0,0,-.014), (20,20,.02), floor, 0)
area("Warm broad light", (-.25,.32,.38), 7.6, (1,.91,.78), .33)
area("Coating highlight", (.27,.28,.19), 5.0, (.68,.87,1), .21)
area("Back rim", (.02,-.24,.37), 8.0, (.83,.92,1), .29)
bpy.ops.object.camera_add(location=(.094,.58,.155))
scene = bpy.context.scene
scene.camera = bpy.context.object
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = .375
point_at(scene.camera, (0,.009,.061))
scene.world = bpy.data.worlds.new("Studio ambience")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.23,.29,.34,1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .31
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1080
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "binoculars.blend"))


def export(objects, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    bpy.context.object.name = "Binoculars"
    bpy.ops.export_scene.gltf(filepath=str(EXPORT / filename), use_selection=True, export_apply=True,
                              export_meshopt_compression_enable=True)
    bpy.context.object.name = Path(filename).stem + " export"


if "--" in sys.argv:
    scene.render.filepath = sys.argv[sys.argv.index("--")+1]
    bpy.ops.render.render(write_still=True)
export(high, "binoculars.glb")
low_collection.hide_viewport = False
export(low, "binoculars-low.glb")
