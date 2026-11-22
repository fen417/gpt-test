"""Author modular upgrades in the existing weapon socket space."""
from collections import Counter
from math import cos, pi, sin, tau
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Quaternion, Vector

ART = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ART))
from weapon_finish import finish_uv, shader_finish
from weapon_mesh import Assembly, optic_coating, optic_lens, optic_shell, side_profile, sight_ring

SOURCES = {
    "ar416": "ar416/ar416.blend", "ak12": "ak12m/ak12m.blend",
    "mcx9": "smg/mcx9.blend", "vk45": "smg/vk45.blend",
    "mg36": "machine-guns/mg36.blend", "pkp": "machine-guns/pkp.blend",
    "dmr12": "marksman/dmr12.blend", "sv98": "marksman/sv98.blend",
    "p19": "pistols/p19.blend", "m50": "pistols/m50.blend",
}
INTEGRAL_MUZZLE = {"ar416": .799, "ak12": .762}
STEEL = (.058, .067, .068)
EDGE = (.102, .114, .114)
POLYMER = (.046, .051, .050)
PAD = (.024, .027, .026)
RECESS = (.014, .016, .016)
MARK = (.34, .35, .32)


def dominant_finish(original, select_face):
    paint = original.data.color_attributes['Paint'].data
    weights = Counter()
    for face in original.data.polygons:
        if select_face(face):
            color = tuple(round(channel, 4) for channel in paint[face.loop_start].color[:3])
            weights[color] += face.area
    return weights.most_common(1)[0][0]


def machined_part(mesh, name, group, finish_rows):
    part = mesh.object(group.name + name, scene.collection)
    part.parent = group
    finish_uv(part.data, mesh.colors, finish_rows, 3)
    part.data.materials.append(surface_material)
    return part


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
    return group


def stock_variant(weapon, stock, stable=False):
    group = group_for("stable-stock" if stable else "light-stock", weapon)
    socket, original = stock["Mount_Stock"], stock["Stock"]
    relative = socket.matrix_basis.inverted() @ original.matrix_basis
    points = [relative @ vertex.co for vertex in original.data.vertices]
    reach = -min(point.y for point in points)
    shank = [point for point in points if point.y > -reach * .18]
    fit_top = max(point.z for point in shank)
    fit_bottom = min(point.z for point in shank)
    fit_y = (fit_top + fit_bottom) / 2
    fit_width = max(abs(point.x) for point in shank) * 2
    heel = min(point.z for point in points) + .011
    comb = max(point.z for point in points if point.y < -reach * .43) - .007
    width = max(fit_width * .93, max(abs(point.x) for point in points) * (1.76 if stable else 1.42))
    paint = dominant_finish(original, lambda face: abs(face.normal.x) > .65
                            and -.82 * reach < (relative @ face.center).y < -.13 * reach)
    trim = tuple(channel * .74 for channel in paint)
    rail = tuple(channel * .88 for channel in paint)
    start = -max(point.y for point in points) - .008
    adapter_end = reach * .24
    mesh = Assembly()
    side_profile(mesh, [(start,fit_bottom+.004),(start,fit_top-.003),
                        (reach*.16,fit_top),(adapter_end,fit_top-.003),
                        (adapter_end,fit_bottom+.007),(reach*.11,fit_bottom)], fit_width, rail)
    outline = [(reach*.18,fit_top-.005),(reach*.34,comb),(.84*reach,comb),
               (.94*reach,comb-.016),(.92*reach,heel+.008),(.80*reach,heel),
               (.65*reach,heel+.012),(.18*reach,fit_bottom)]
    if stable:
        side_profile(mesh, outline, width, paint)
        cheek_height = .023 if weapon in {"dmr12", "sv98"} else .015
        for z in (reach*.47, reach*.76):
            mesh.cylinder((0,comb+.002,z), .011, cheek_height*1.2, 'y', STEEL, 14)
        side_profile(mesh, [(reach*.32,comb+.006),(reach*.41,comb+cheek_height),
                           (reach*.80,comb+cheek_height),(reach*.87,comb+.006),
                           (reach*.80,comb+.003),(reach*.40,comb+.003)], width*1.15, trim)
        for x in (-width*.5,width*.5):
            side_profile(mesh, [(reach*.48,comb-.034),(reach*.80,comb-.031),(reach*.79,comb-.054),
                                (reach*.60,comb-.052)], .003, trim, x)
            mesh.cylinder((x,comb-.045,reach*.77), .013, .007, 'x', PAD, 18)
            mesh.cylinder((x*1.13,comb-.045,reach*.77), .005, .003, 'x', STEEL, 12)
    else:
        # Sweep a chamfered outer edge around the open web of the stock.
        center = (reach*.65, (comb + heel) / 2 + .015)
        opening = [(center[0]+(z-center[0])*.65,center[1]+(y-center[1])*.63) for z,y in outline]
        inset = [(z*.995+center[0]*.005, y*.95+center[1]*.05) for z,y in outline]
        sections = [(-width*.50,inset),(-width*.38,outline),(width*.38,outline),
                    (width*.50,inset),(width*.38,opening),(-width*.38,opening)]
        count = len(outline)
        vertices = [(x,y,z) for x,profile in sections for z,y in profile]
        faces = []
        for row in range(len(sections)):
            current, following = row*count, ((row+1)%len(sections))*count
            for i in range(count):
                j = (i+1)%count
                faces.append((current+i,current+j,following+j,following+i))
        mesh.add(vertices, faces, paint)
        mesh.colors[-2*count:-count] = [trim] * count
    pad_width = width * (1.10 if stable else 1.02)
    pad_depth = .021 if stable else .013
    side_profile(mesh, [(reach*.91,comb-.004),(reach-pad_depth*.35,comb-.014),
                        (reach,comb-.032),(reach-.005,heel+.016),
                        (reach-pad_depth*.64,heel+.004),(.89*reach,heel+.013)], pad_width, PAD)
    for index in range(6):
        t = (index + 1) / 8
        mesh.box((0,heel+.018 + (comb-heel-.052)*t,reach-.005+.004*t),
                 (pad_width*.86,.005,.006), RECESS, .001)
    for x in (-width*.47,width*.47):
        mesh.cylinder((x,fit_y,reach*.23), .006, .008, 'x', STEEL, 14)
        mesh.cylinder((x*1.12,fit_y,reach*.23), .0031, .003, 'x', RECESS, 6)
    machined_part(mesh, '_Frame', group, {paint:1, trim:1, rail:1, PAD:1, RECESS:1, STEEL:2})
    return group


def scope(module, reach, rear, front, kind):
    group=group_for(module,"Shared")
    axis=.053 if kind==0 else .061
    back=reach*.42
    nose=-reach*.58
    waist=min(rear,front)*.77
    mesh=Assembly()
    sides, aspect, phase = (8,1.17,pi/8) if kind==0 else (28,1,0)
    front_bore, rear_bore = front*.76, rear*.80
    outer = [(nose,front*.97),(nose+.006,front),(nose+.025,front),
             (nose+.045,waist+.001),(back-.048,waist),(back-.034,rear*.92),
             (back-.009,rear),(back,rear*.97)]
    bore = [(nose,front_bore),(nose+.016,front_bore),(nose+.045,waist*.80),
            (back-.041,waist*.80),(back-.016,rear_bore),(back,rear_bore)]
    optic_shell(mesh,axis,outer,bore,STEEL,sides,aspect,phase)
    mount_length = min(reach*.71,.145)
    mesh.box((0,.006,0),(.069,.024,mount_length),STEEL,.004)
    mesh.box((0,.022,0),(.046,.020,mount_length*.87),POLYMER,.004)
    for z in (-mount_length*.31,mount_length*.31):
        for x in (-.035,.035):
            mesh.cylinder((x,.010,z),.0056,.007,'x',EDGE,14)
            mesh.cylinder((x*1.12,.010,z),.0028,.0014,'x',RECESS,6)
    mesh.cylinder((0,axis+waist+.005,-.011),.012,.013,'y',POLYMER,20)
    for step in range(12):
        angle = step * tau / 12
        mesh.box((.011*cos(angle),axis+waist+.007,-.011+.011*sin(angle)),
                 (.004,.007,.004),EDGE,.0006)
    if kind==0:
        for x in (-.026,.026):
            side_profile(mesh, [(nose+.006,axis-.017),(nose+.017,axis+.016),
                                (back-.024,axis+.011),(back-.019,axis-.015)], .019,POLYMER,x)
            mesh.box((x*1.37,axis+.006,nose+.035),(.002,.002,.018),MARK,.0003)
    if kind==1:
        dial = back-.020
        sight_ring(mesh,axis,dial,rear*.83,rear+.002,.019,POLYMER)
        for step in range(16):
            angle = step * tau / 16
            mesh.cylinder(((rear+.002)*cos(angle),axis+(rear+.002)*sin(angle),dial),
                          .0021,.015,'z',EDGE,8)
        mesh.box((.014,axis+rear+.006,dial),(.012,.017,.014),POLYMER,.002)
        mesh.box((.017,axis+rear+.014,dial),(.003,.001,.009),MARK,.0002)
    if kind==2:
        mesh.cylinder((.027,axis,-.011),.013,.020,'x',EDGE,20)
        mesh.cylinder((.039,axis,-.011),.011,.007,'x',POLYMER,20)
        mesh.box((.042,axis,-.011),(.0016,.002,.014),MARK,.0002)
        sight_ring(mesh,axis,nose+.009,front*.95,front+.004,.011,EDGE)
        sight_ring(mesh,axis,back-.006,rear*.92,rear+.002,.010,POLYMER)
    machined_part(mesh,'_Housing',group,{POLYMER:1,RECESS:1,EDGE:2,MARK:1})
    for name,z,radius,coating in [('_FrontLens',nose+.012,front_bore,front_coating),
                                  ('_RearLens',back-.008,rear_bore,rear_coating)]:
        glass = optic_lens(axis,z,radius,sides,aspect,phase).object(group.name+name,scene.collection)
        glass.parent = group
        glass.data.materials.append(coating)
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
    paint = dominant_finish(stock['Barrel'], lambda face: abs(face.normal.y) < .65)
    radius = .033 if weapon in {"pkp", "sv98", "dmr12"} else .027
    length = .098 if radius > .03 else .081
    # Beveled end rings and narrow ribs frame the open slots in the sidewalls.
    mesh = Assembly()
    mesh.tube((0,0,0), [(-collar-.019,radius*.90),(-collar+.004,radius*.86),
                        (-collar+.015,radius*.66)], "z", paint, 16)
    nose = -collar - length
    sight_ring(mesh, 0, nose+.004, radius*.37, radius*.93, .010, EDGE)
    mesh.cylinder((0,0,nose+.013), radius*.43, .002, "z", RECESS, 16)
    for sign in [-1, 1]:
        for y in [-radius*.65, radius*.65]:
            mesh.box((sign*radius*.68,y,nose+length*.48),
                     (radius*.58,radius*.49,length*.87), paint, .003)
        for offset in [.27,.52,.76]:
            mesh.box((sign*radius*.69,0,nose+length*offset),
                     (radius*.56,radius*1.37,.007), EDGE, .0015)
    machined_part(mesh, '_Ports', group, {EDGE:2, RECESS:1})
    tip = bpy.data.objects.new(group.name + "_Muzzle", None)
    scene.collection.objects.link(tip)
    tip.parent = group
    tip.location = (0, -nose+.001, 0)
    return group


def surface_finish(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    color = material.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Paint"
    material.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    shader_finish(material, shader, 3)
    return material


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
surface_material = surface_finish("Coated alloy and molded polymer")
front_coating = optic_coating('Front lens coating', (.29,.48,.40,.17))
rear_coating = optic_coating('Rear lens coating', (.43,.55,.58,.09))
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
        if part.type == "MESH" and tuple(part.data.materials) not in {(surface_material,), (front_coating,), (rear_coating,)}:
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
