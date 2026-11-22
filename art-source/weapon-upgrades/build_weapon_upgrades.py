"""Author the three modular upgrade families in the existing weapon socket space."""
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Quaternion, Vector

ART = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ART))
from weapon_mesh import Assembly, side_profile, sight_ring

SOURCES = {
    "ar416": "ar416/ar416.blend", "ak12": "ak12m/ak12m.blend",
    "mcx9": "smg/mcx9.blend", "vk45": "smg/vk45.blend",
    "mg36": "machine-guns/mg36.blend", "pkp": "machine-guns/pkp.blend",
    "dmr12": "marksman/dmr12.blend", "sv98": "marksman/sv98.blend",
    "p19": "pistols/p19.blend", "m50": "pistols/m50.blend",
}
INTEGRAL_MUZZLE = {"ar416": .799, "ak12": .762}
STEEL = (.15, .16, .16)
EDGE = (.22, .23, .225)
POLYMER = (.105, .115, .108)
PAD = (.065, .070, .066)
RECESS = (.038, .042, .040)


def group_for(module, weapon):
    group = bpy.data.objects.new(module + "_" + weapon, None)
    scene.collection.objects.link(group)
    return group


def mesh_copy(original, socket, name, group, adjust):
    mesh = original.data.copy()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = group
    relative = socket.matrix_basis.inverted() @ original.matrix_basis
    for vertex in mesh.vertices:
        vertex.co = adjust(relative @ vertex.co)
    mesh.update()
    return obj


def magazine_variant(weapon, stock, compact=False):
    group = group_for("fast-magazine" if compact else "extended-magazine", weapon)
    body, socket = stock["MagazineBody"], stock["Mount_Magazine"]
    relative = socket.matrix_basis.inverted() @ body.matrix_basis
    points = [relative @ v.co for v in body.data.vertices]
    floor, top = min(p.z for p in points), max(p.z for p in points)
    extension = .038 if weapon in {"p19", "m50"} else (top - floor) * .20
    if compact:
        extension = -(top - floor) * .14
    knee = floor + (top - floor) * (.22 if weapon in {"p19", "m50"} else .85)
    depth = knee - floor

    def deepen(point):
        weight = max(0, min(1, (knee - point.z) / depth))
        point.z -= extension * weight
        return point

    mesh_copy(body, socket, group.name + "_MagazineBody", group, deepen)
    if compact:
        heel = [p for p in points if p.z<=floor+(top-floor)*.12]
        back, front = min(p.y for p in heel), max(p.y for p in heel)
        width = max(p.x for p in heel) - min(p.x for p in heel)
        base = Assembly()
        base.box((0,floor-extension+.003,-(back+front)/2),
                 (max(.012,width*.86),.014,max(.017,(front-back)*.74)), EDGE, .004)
        pad = base.object(group.name+"_PullTab", scene.collection)
        pad.parent = group
        pad.data.materials.append(polymer_material)
    return group


def stock_variant(weapon, stock, stable=False):
    group = group_for("stable-stock" if stable else "light-stock", weapon)
    socket, original = stock["Mount_Stock"], stock["Stock"]
    points = [original.matrix_basis @ v.co - socket.location for v in original.data.vertices]
    reach = max(.24, -min(v.y for v in points))
    heel = min(v.z for v in points) + .014
    comb = min(.038, max(v.z for v in points) - .008)
    fit_y = -(.018 if weapon in {"mg36", "pkp"} else .010)
    narrow = .044 if weapon in {"mcx9", "vk45"} else .054
    mesh = Assembly()
    mesh.box((0, fit_y, reach*.105), (narrow, .048, reach*.24), STEEL, .005)
    side_profile(mesh, [(reach*.18,fit_y+.023),(reach*.84,comb+.012),
                        (reach*.95,comb+.008),(reach*.90,comb-.018),(reach*.20,fit_y-.02)],
                 narrow, POLYMER)
    side_profile(mesh, [(reach*.17,fit_y-.015),(reach*.78,heel+.018),(reach*.92,heel+.018),
                        (reach*.92,heel-.009),(reach*.74,heel-.009),(reach*.13,fit_y-.038)],
                 narrow*.73, POLYMER)
    cheek = .032 if weapon in {"dmr12", "sv98"} else .018
    mesh.box((0, comb+cheek*.4, reach*.66), (narrow+.009, cheek, reach*.37), EDGE, .004)
    if stable:
        side_profile(mesh, [(reach*.24,comb+.019),(reach*.89,comb+.026),
                            (reach*.91,heel+.01),(reach*.68,heel+.028),(reach*.29,fit_y-.043)],
                     narrow*1.24, POLYMER)
        mesh.box((0,comb+.027,reach*.64),(narrow+.017,.029,reach*.48),PAD,.006)
        for x in [-narrow*.64,narrow*.64]:
            for index in range(3):
                mesh.box((x,comb-.036,reach*(.61+.09*index)),(.004,.040,.017),RECESS,.0015)
    side_profile(mesh, [(reach*.88,comb+.026),(reach,comb+.036),
                        (reach+.007,heel-.004),(reach*.92,heel-.016)],
                 narrow+.014, PAD)
    for i in range(6):
        y = heel+.009+i*(comb-heel+.017)/6
        mesh.box((0,y,reach+.001), (narrow+.008,.006,.011), POLYMER, .001)
    for x in [-narrow*.48, narrow*.48]:
        for z, y in [(reach*.18,fit_y),(reach*.87,comb-.003)]:
            mesh.cylinder((x,y,z), .006, .006, "x", STEEL, 12)
    part = mesh.object(group.name + "_Frame", scene.collection)
    part.parent = group
    part.data.materials.append(polymer_material)
    return group


def scope(module, reach, rear, front, kind):
    group=group_for(module,"Shared")
    axis=.053 if kind==0 else .061
    back=reach*.42
    nose=-reach*.58
    waist=min(rear,front)*.75
    mesh=Assembly()
    shell=[(nose,front),(nose+.011,front),(nose+.031,waist),
           (back-.044,waist),(back-.023,rear),(back,rear)]
    # Build through-bore geometry so the lenses read from the side and rear.
    rings=shell+[(back,rear*.77),(back-.012,rear*.77),(nose+.012,front*.70),(nose,front*.73)]
    sides=8 if kind==0 else 24
    from math import cos, sin, tau
    verts=[(r*cos(i*tau/sides),axis+r*sin(i*tau/sides),z) for z,r in rings for i in range(sides)]
    faces=[(row*sides+i,row*sides+(i+1)%sides,((row+1)%len(rings))*sides+(i+1)%sides,
            ((row+1)%len(rings))*sides+i) for row in range(len(rings)) for i in range(sides)]
    mesh.add(verts,faces,STEEL)
    mesh.box((0,.010,0),(.071,.020,min(reach*.84,.22)),POLYMER,.004)
    for z in [-reach*.22,reach*.23]:
        mesh.box((0,.025,z),(.057,.037,.026),POLYMER,.004)
        for x in [-.037,.037]:
            mesh.cylinder((x,.012,z),.006,.010,"x",EDGE,12)
    mesh.cylinder((0,axis+waist+.008,-.013),.013,.017,"y",EDGE,16)
    if kind==1:
        mesh.cylinder((0,axis,back-.029),rear+.004,.019,"z",POLYMER,24)
        mesh.box((.009,axis+rear+.009,back-.028),(.014,.018,.019),EDGE,.002)
    if kind==2:
        mesh.cylinder((.037,axis,-.017),.013,.021,"x",EDGE,16)
        for z in [nose+.005,back-.007]:
            sight_ring(mesh,axis,z,waist*.82,(rear if z>0 else front)+.002,.010,EDGE)
    part=mesh.object(group.name+"_Housing",scene.collection)
    part.parent=group
    part.data.materials.append(steel_material)
    lens=Assembly()
    lens.cylinder((0,axis,nose+.013),front*.70,.003,"z",(.075,.271,.231),24)
    lens.cylinder((0,axis,back-.010),rear*.76,.003,"z",(.092,.234,.205),24)
    glass=lens.object(group.name+"_Lenses",scene.collection)
    glass.parent=group
    glass.data.materials.append(lens_material)
    eye=bpy.data.objects.new(group.name+"_Eye",None)
    scene.collection.objects.link(eye)
    eye.parent=group
    eye.location=(0,-back,axis)
    return group


def compensator(weapon, stock):
    group = group_for("compensator", weapon)
    socket = stock["Mount_Barrel"]
    barrel = mesh_copy(stock["Barrel"], socket, group.name + "_Barrel", group, lambda p: p)
    if weapon in INTEGRAL_MUZZLE:
        collar = INTEGRAL_MUZZLE[weapon] - socket.location.y
        bm = bmesh.new()
        bm.from_mesh(barrel.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                              dist=.00001, plane_co=(0, collar+.008, 0),
                              plane_no=(0, 1, 0), clear_outer=True)
        bm.to_mesh(barrel.data)
        bm.free()
        barrel.data.update()
    else:
        collar = max(v.co.y for v in barrel.data.vertices) - .017
    radius = .033 if weapon in {"pkp", "sv98", "dmr12"} else .027
    length = .098 if radius > .03 else .081
    # Beveled end rings and narrow ribs frame the open slots in the sidewalls.
    mesh = Assembly()
    mesh.tube((0,0,0), [(-collar-.019,radius*.90),(-collar+.004,radius*.86),
                        (-collar+.015,radius*.66)], "z", STEEL, 16)
    nose = -collar - length
    sight_ring(mesh, 0, nose+.004, radius*.37, radius*.93, .010, EDGE)
    mesh.cylinder((0,0,nose+.013), radius*.43, .002, "z", RECESS, 16)
    for sign in [-1, 1]:
        for y in [-radius*.65, radius*.65]:
            mesh.box((sign*radius*.68,y,nose+length*.48),
                     (radius*.58,radius*.49,length*.87), STEEL, .003)
        for offset in [.27,.52,.76]:
            mesh.box((sign*radius*.69,0,nose+length*offset),
                     (radius*.56,radius*1.37,.007), EDGE, .0015)
    part = mesh.object(group.name + "_Ports", scene.collection)
    part.parent = group
    part.data.materials.append(steel_material)
    tip = bpy.data.objects.new(group.name + "_Muzzle", None)
    scene.collection.objects.link(tip)
    tip.parent = group
    tip.location = (0, -nose+.001, 0)
    return group


def finish(name, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    color = material.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Paint"
    material.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    return material


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
steel_material = finish("Parkérisé gris", .58, .44)
polymer_material = finish("Polymère armé", .10, .62)
lens_material = finish("Verre optique traité", .30, .16)
gallery = []
for index, (weapon, source) in enumerate(SOURCES.items()):
    with bpy.data.libraries.load(str(ART / source)) as (available, loaded):
        names = [name for name in ("Mount_Magazine", "MagazineBody", "Mount_Stock", "Stock",
                                  "Mount_Barrel", "Barrel") if name in available.objects]
        loaded.objects = names.copy()
    stock = dict(zip(names, loaded.objects))
    gallery.append((magazine_variant(weapon, stock), index, 0))
    if "Stock" in stock:
        gallery.append((stock_variant(weapon, stock), index, 1))
        gallery.append((compensator(weapon, stock), index, 2))
        gallery.append((magazine_variant(weapon, stock, compact=True), index, 3))
        gallery.append((stock_variant(weapon, stock, stable=True), index, 4))
    for obj in stock.values():
        bpy.data.objects.remove(obj, do_unlink=True)

for index,(name,reach,rear,front) in enumerate([
    ("prism-2",.143,.030,.038),("variable-12",.239,.032,.034),("tactical-3",.201,.029,.043),
]):
    gallery.append((scope(name,reach,rear,front,index),index,5))

# Export socket-local meshes. The game supplies the original barrel and
# magazine materials, and its own finishes for the newly modeled housings.
output = ART.parent / "src/assets/infantry/weapon-upgrades.glb"
source_finishes = []
for group, _, _ in gallery:
    for part in group.children:
        if part.type == "MESH" and tuple(part.data.materials) not in {(steel_material,), (polymer_material,), (lens_material,)}:
            source_finishes.append((part, list(part.data.materials)))
            part.data.materials.clear()
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_vertex_color="ACTIVE",
                          export_meshopt_compression_enable=True,
                          export_meshopt_extension="EXT_meshopt_compression")
for part, materials in source_finishes:
    for material in materials:
        part.data.materials.append(material)

for group, column, row in gallery:
    group.location = (column*.48, -row*1.16, 0)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            view = area.spaces.active
            view.shading.color_type = "VERTEX"
            view.region_3d.view_location = Vector((2.15, -2.7, -.04))
            view.region_3d.view_rotation = Quaternion((1,0,0,0))
            view.region_3d.view_distance = 8.0
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name("weapon-upgrades.blend")), compress=True)
