"""Build the detailed AR-416 from the existing game prop and attachment layout."""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_ar416 as base
from weapon_finish import shader_finish
from weapon_mesh import Assembly, export_weapon, optic_shell, side_profile


FRAME = (.156, .101, .053)
UPPER = (.186, .119, .066)
EDGE = (.222, .154, .087)
STEEL = (.065, .076, .079)
BOLT = (.205, .228, .235)
FURNITURE = (.104, .070, .040)
POLYMER = (.035, .041, .041)
RECESS = (.023, .028, .027)
RUBBER = (.035, .031, .027)
MARK = (.268, .225, .177)
SELECTOR = (.280, .048, .023)


class DetailedAssembly(Assembly):
    def box(self, center, size, color=FRAME, bevel=.002):
        if not bevel:
            return super().box(center, size, color, bevel)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vertex in bm.verts:
            vertex.co = Vector(c + extent * p for c, extent, p in zip(center, size, vertex.co))
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size)*.22),
                       segments=3, affect='EDGES')
        bm.verts.index_update()
        self.add([tuple(v.co) for v in bm.verts], [tuple(v.index for v in f.verts) for f in bm.faces], color)
        bm.free()

    def cylinder(self, center, radius, length, axis, color, sides):
        super().cylinder(center, radius, length, axis, color, max(32, sides * 2))

    def object(self, name, collection):
        obj = super().object(name, collection)
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        for face in bm.faces:
            face.smooth = True
        for edge in bm.edges:
            edge.smooth = edge.is_manifold and edge.calc_face_angle() < math.radians(48)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        # Large cast faces stay flat. Smooth bevels and circular flanks catch
        # their own highlights in both Blender and the GLB.
        normals = obj.modifiers.new('Face-weighted normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        normals.weight = 32
        paint = mesh.color_attributes['Paint'].data
        for face, finish in zip(mesh.polygons, self.colors):
            for loop in face.loop_indices:
                x, z, y = mesh.vertices[mesh.loops[loop].vertex_index].co
                mottling = math.sin(31*z + 17*y) * math.sin(47*y - 13*x)
                tint = 1 + mottling * (.026 if finish in (FRAME, UPPER, EDGE) else .014)
                paint[loop].color = (*(channel * tint for channel in finish), 1)
        return obj


def round_slot(mesh, side, z, color):
    # Each cell has a real rounded opening and a recessed inner wall.
    angles = [math.tau * i/32 for i in range(32)]
    contours = []
    for row, x in enumerate((.037, .049, .052, .052)):
        contour = []
        for theta in angles:
            u, v = math.cos(theta), math.sin(theta)
            if row == 3:
                shrink = max(abs(u), abs(v))
                p, q = .0225*u/shrink, .030*v/shrink
            else:
                radius = .009 if row == 2 else .007
                p = radius*u + math.copysign(.008, u)
                q = radius*v
            contour.append((side*x, .010+q, z+p))
        contours.append(contour)
    length = len(angles)
    start = len(mesh.vertices)
    mesh.vertices.extend(point for contour in contours for point in contour)
    for band, tint in enumerate((STEEL, EDGE, color)):
        faces = []
        for i in range(length):
            j = (i+1) % length
            face = (band*length+i, band*length+j, (band+1)*length+j, (band+1)*length+i)
            faces.append(face if side > 0 else face[::-1])
        mesh.faces.extend(tuple(start + i for i in face) for face in faces)
        mesh.colors.extend([tint]*len(faces))


def stock_and_grip():
    grip, stock = DetailedAssembly(), DetailedAssembly()
    rings = []
    for y, rear, front, width in [
        (-.083,.100,.046,.043), (-.098,.101,.035,.048),
        (-.127,.105,.033,.048), (-.185,.118,.047,.047),
        (-.224,.130,.061,.045), (-.235,.119,.063,.040),
    ]:
        ring = []
        for i in range(40):
            a = i*math.tau/40
            x, z = math.cos(a), math.sin(a)
            ring.append((math.copysign(abs(x)**.56,x)*width/2, y,
                         (rear+front)/2+math.copysign(abs(z)**.56,z)*(rear-front)/2))
        rings.append(ring)
    grip.rings(rings, FURNITURE)
    for i in range(6):
        t = i/5
        grip.box((0,-.144-t*.069,.037+t*.019),(.033,.004,.004),POLYMER,.0015)
    grip.box((0,-.236,.091),(.036,.004,.044),POLYMER,.0012)

    # Preserve the original stock envelope and draw the tube with continuous
    # circular shading, a seam near the collar and a different steel finish.
    stock.tube((0,.015,0),[(.085,.027),(.088,.031),(.095,.032),(.105,.032),
                         (.108,.030),(.114,.030),(.117,.032),(.208,.032),
                         (.228,.028),(.274,.027),(.282,.022)],'z',STEEL,64)
    stock.tube((0,.015,0),[(.100,.031),(.103,.036),(.116,.036),(.120,.034),
                         (.124,.033),(.126,.031)],'z',POLYMER,64)
    profile = [(.211,.032),(.225,.043),(.417,.046),(.445,.041),(.456,.027),
               (.448,-.025),(.399,-.037),(.344,-.034),(.286,-.023),(.225,-.021),(.211,-.015)]
    sections = [(-.041,.87),(-.040,.94),(-.036,.982),(-.030,1),
                (.030,1),(.036,.982),(.040,.94),(.041,.87)]
    stock.rings([[(x,.012+(y-.012)*scale,.339+(z-.339)*scale) for z,y in profile]
                  for x,scale in sections],FURNITURE)
    side_profile(stock,[(.241,-.021),(.270,-.021),(.398,-.121),(.426,-.140),
                        (.435,-.155),(.401,-.162),(.387,-.145)],.059,FURNITURE)
    side_profile(stock,[(.443,.038),(.465,.034),(.472,.025),(.468,-.031),
                        (.460,-.127),(.450,-.161),(.433,-.168),(.422,-.160),
                        (.432,-.132),(.436,-.035)],.076,RUBBER)
    stock.box((0,-.055,.304),(.040,.014,.059),POLYMER,.004)
    stock.cylinder((0,-.051,.320),.008,.038,'x',STEEL,18)
    for side in (-1,1):
        panel = [(z,y) for z,y in [(.267,.022),(.409,.025),(.426,.017),(.420,.002),
                                  (.389,-.007),(.278,-.007),(.259,.001)]]
        side_profile(stock,panel,.0025,POLYMER,side*.040)
        stock.cylinder((side*.042,.008,.395),.011,.004,'x',STEEL,20)
        stock.cylinder((side*.0445,.008,.395),.006,.0014,'x',RECESS,20)
        for z in (.312,.326,.340):
            side_profile(stock,[(z,-.003),(z+.008,.018),(z+.003,.018),(z-.005,-.003)],
                         .0024,FURNITURE,side*.041)
        for i in range(8):
            t = i/7
            stock.box((side*.036,.013-t*.151,.467-t*.012),(.004,.007,.007),RUBBER,.0014)
    return grip, stock


def marks(mesh, text, x, y, z, spacing, color, fill=None):
    font = bpy.data.curves.new('Engraved marking', 'FONT')
    font.body, font.size, font.resolution_u = text, spacing*5.7, 4
    label = bpy.data.objects.new('Engraved marking',font)
    bpy.context.scene.collection.objects.link(label)
    bpy.context.view_layer.update()
    surface = bpy.data.meshes.new_from_object(label.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    sign = math.copysign(1,x)
    mesh.add([(x,y+v.co.y-spacing*4,z-sign*v.co.x) for v in surface.vertices],
             [tuple(f.vertices) if x > 0 else tuple(reversed(f.vertices)) for f in surface.polygons],color)
    bpy.data.meshes.remove(surface)
    bpy.data.objects.remove(label,do_unlink=True)
    bpy.data.curves.remove(font)


def magazine():
    body = DetailedAssembly()
    rows = [(-.072,-.060,-.178),(-.087,-.060,-.178),(-.136,-.057,-.181),
            (-.225,-.070,-.193),(-.274,-.083,-.208),(-.290,-.089,-.215)]
    body.rings([[(math.copysign(abs(math.cos(a))**.55,math.cos(a))*.0355,
                  y+.005*math.sin(a),
                  (rear+fore)/2+math.copysign(abs(math.sin(a))**.55,math.sin(a))*(rear-fore)/2)
                 for a in (i*math.tau/40 for i in range(40))] for y,rear,fore in rows],POLYMER)
    side_profile(body,[(-.080,-.277),(-.213,-.289),(-.223,-.299),(-.219,-.302),
                       (-.088,-.298),(-.082,-.293)],.080,STEEL)
    for side in (-1,1):
        for z in (-.089,-.119,-.151):
            side_profile(body,[(z,-.152),(z-.007,-.151),(z-.021,-.272),(z-.014,-.273)],
                         .005,POLYMER,side*.034)
        for i in range(3):
            body.cylinder((side*.036,-.186-i*.018,-.134-i*.008),.0038,.002,'x',STEEL,12)
    return body


def finish(material, shader, rows):
    material.name = 'AR-416 · anodized alloy / polymer / steel / rubber'
    shader_finish(material, shader, rows, finishes=((.52,.45,.034),(.76,.015,.064),
                                                   (.36,.86,.028),(.86,0,.072)),
                  fabric_rows=(),size=256,roughness_variation=.44)


def round_aperture(mesh, y, z, inner, outer, depth, color):
    front, rear = z-depth/2, z+depth/2
    bevel = min(.0014, depth/5)
    optic_shell(mesh,y,[(front,outer-bevel),(front+bevel,outer),
                        (rear-bevel,outer),(rear,outer-bevel)],
                [(front,inner+bevel),(front+bevel,inner),(rear-bevel,inner),
                 (rear,inner+bevel)],color,sides=64)


def main():
    glb, blend = map(Path,sys.argv[sys.argv.index('--')+1:])
    base.Assembly = DetailedAssembly
    base.surface_mark = marks
    base.sight_ring = round_aperture
    for name in ('FRAME','UPPER','EDGE','STEEL','BOLT','FURNITURE','POLYMER','RECESS','MARK','SELECTOR'):
        setattr(base,name,globals()[name])
    receiver = base.receiver()
    for side in (-1,1):
        receiver.box((side*.039,-.030,-.081),(.002,.003,.220),RECESS,.0006)
        receiver.cylinder((side*.042,-.042,-.171),.0038,.002,'x',STEEL,12)
    receiver.box((.061,-.016,-.093),(.007,.006,.100),EDGE,.0017)
    for z in (-.145,-.043):
        receiver.cylinder((.057,-.042,z),.0046,.012,'z',STEEL,18)
    receiver.box((.050,.027,-.106),(.0015,.024,.091),RECESS,.0006)
    side_profile(receiver,[(.045,.047),(.025,.041),(-.172,.041),(-.192,.047)],.005,EDGE,-.042)
    side_profile(receiver,[(.021,.036),(.009,.030),(-.174,.030),(-.185,.036)],.002,UPPER,-.042)

    _, barrel = base.front()
    guard = DetailedAssembly()
    for y in (-.040,.060):
        guard.box((0,y,-.438),(.083,.021,.355),FRAME,.0045)
    for side in (-1,1):
        guard.box((side*.046,.044,-.438),(.012,.011,.352),FRAME,.0025)
        for i in range(8):
            round_slot(guard,side,-.280-i*.045,UPPER)
        for z in (-.278,-.599):
            guard.cylinder((side*.053,.014,z),.0065,.003,'x',STEEL,18)
            guard.box((side*.0548,.014,z),(.001,.0015,.007),RECESS,.0003)
    guard.box((0,-.054,-.441),(.052,.013,.335),STEEL,.003)
    for i in range(16):
        guard.box((0,-.063,-.289-i*.020),(.066,.009,.011),FRAME,.0015)
    base.rail(guard,-.272,19)

    bolt = DetailedAssembly()
    bolt.box((.026,.023,-.089),(.034,.042,.108),BOLT,.006)
    bolt.box((.043,.022,-.057),(.006,.016,.039),STEEL,.003)
    bolt.box((0,.072,.113),(.095,.017,.024),STEEL,.004)
    for side in (-1,1):
        bolt.box((side*.046,.069,.101),(.016,.015,.031),FRAME,.003)
    grip, stock = stock_and_grip()
    parts = [('Receiver',receiver),('Handguard',guard),('Barrel',barrel),('Grip',grip),('Stock',stock),
             ('Sights',base.sights()),('Magazine',magazine()),('Bolt',bolt)]
    anchors = {'Mount_Optic':(0,.095,-.087),'Mount_Barrel':(0,.015,-.207),
               'Mount_Magazine':(0,-.075,-.139),'Mount_Stock':(0,.015,.084)}
    export_weapon(parts,glb,blend,mounts=anchors,modular=True,finish_shader=finish,
                  finish_rows={FURNITURE:1,POLYMER:1,RECESS:1,MARK:1,SELECTOR:1,
                               STEEL:2,BOLT:2,RUBBER:3})


if __name__ == '__main__':
    main()
