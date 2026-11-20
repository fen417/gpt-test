"""Build the editable Rubezh asset and export the rigid game assemblies."""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector


PAINT = (0.32, 0.36, 0.27)
PANEL = (0.30, 0.33, 0.25)
EDGE = (0.36, 0.39, 0.30)
METAL = (0.065, 0.079, 0.062)
RUBBER = (0.022, 0.029, 0.026)
GLASS = (0.033, 0.087, 0.095)
LENS = (0.62, 0.59, 0.40)


class Assembly:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.colors = []

    def add(self, vertices, faces, color):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + index for index in face) for face in faces)
        self.colors.extend([color] * len(faces))

    def box(self, center, size, color=PAINT, bevel=0.025):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vert in bm.verts:
            vert.co = Vector(c + d * p for c, d, p in zip(center, size, vert.co))
        if bevel:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * .22),
                           segments=1, affect='EDGES')
        bm.verts.index_update()
        self.add([tuple(v.co) for v in bm.verts], [tuple(v.index for v in f.verts) for f in bm.faces], color)
        bm.free()

    def rings(self, rings, color):
        count = len(rings[0])
        faces = [tuple(reversed(range(count)))]
        for row in range(len(rings) - 1):
            for i in range(count):
                j = (i + 1) % count
                faces.append((row * count + i, row * count + j,
                              (row + 1) * count + j, (row + 1) * count + i))
        end = (len(rings) - 1) * count
        faces.append(tuple(end + i for i in range(count)))
        self.add([p for ring in rings for p in ring], faces, color)

    def tube(self, center, profile, axis, color, sides):
        x, y, z = center
        rings = []
        for along, radius in profile:
            ring = []
            for i in range(sides):
                angle = math.tau * i / sides
                a, b = radius * math.cos(angle), radius * math.sin(angle)
                if axis == 'x':
                    ring.append((x + along, y + a, z + b))
                elif axis == 'y':
                    ring.append((x + a, y + along, z + b))
                else:
                    ring.append((x + a, y + b, z + along))
            rings.append(ring)
        self.rings(rings, color)

    def cylinder(self, center, radius, length, axis, color, sides):
        lip = min(length / 4, radius * .16)
        self.tube(center, [(-length / 2, radius - lip), (-length / 2 + lip, radius),
                           (length / 2 - lip, radius), (length / 2, radius - lip)], axis, color, sides)

    def object(self, name, collection):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(x, -z, y) for x,y,z in self.vertices], [], self.faces)
        mesh.color_attributes.new(name='Paint', type='FLOAT_COLOR', domain='CORNER')
        mesh.color_attributes.active_color = mesh.color_attributes['Paint']
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        uv = mesh.uv_layers.new(name='Camouflage')
        for face, color in zip(mesh.polygons, self.colors):
            nx, nz, ny = face.normal
            for i in face.loop_indices:
                x, z, y = mesh.vertices[mesh.loops[i].vertex_index].co
                z = -z
                u, v = (x,z) if abs(ny)>.65 else ((z,y) if abs(nx)>abs(nz) else (x,y))
                uv.uv[i].vector = (u*.18+.5, v*.18+.5)
                mesh.color_attributes['Paint'].data[i].color = (*color,1)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def make_level(level, collection):
    sides = (24, 14, 8)[level]
    hull, turret, cannon, hatch, tracks, wheel, mount, mg = [Assembly() for _ in range(8)]

    # Sloped glacis, narrow lower tub and the rear transmission compartment.
    contours = [(-3.40,.56,.92,1.36,1.10),(-2.11,.40,1.49,1.46,1.16),
                (2.72,.40,1.49,1.49,1.15),(3.43,.61,1.32,1.37,1.12)]
    hull.rings([[(-lower,bottom,z),(lower,bottom,z),(wide,top,z),(-wide,top,z)]
                for z,bottom,top,wide,lower in contours], PAINT)
    for side in (-1,1):
        hull.box((side*1.48,1.44,.02),(.60,.12,6.68),EDGE)
        sections=(6,3,2)[level]
        for i in range(sections):
            span=6.22/sections
            z=-3.11+(i+.5)*span
            hull.box((side*1.737,1.145,z),(.112,.54,span-.035),PAINT if i%2 else PANEL)
            if level==0:
                for end in (-1,1):
                    hull.cylinder((side*1.797,1.34,z+end*(span/2-.13)),.046,.035,'x',METAL,6)
                hull.box((side*1.768,.88,z),(.057,.048,span-.12),METAL)
        hull.box((side*1.24,1.09,-3.28),(.29,.24,.18),METAL)
        hull.cylinder((side*1.24,1.12,-3.4),.082,.07,'z',LENS,sides)
        hull.box((side*.96,.82,3.34),(.25,.34,.30),PANEL)
        hull.cylinder((side*1.0,1.10,3.45),.061,.035,'z',(.29,.042,.021),8)
        if level<2:
            hull.cylinder((side*.89,1.02,3.18),.259,.60,'z',PANEL,sides)
            for z in (2.98,3.39):
                hull.cylinder((side*.89,1.02,z),.271,.058,'z',METAL,sides)
            hull.box((side*1.14,1.54,2.01),(.28,.10,1.09),PANEL)
        if level==0:
            for i in range(4):
                z=-3.02+i*.216
                hull.box((side*.56,1.11+i*.095,z),(.96,.105,.175),EDGE)
    hull.box((0,1.493,2.12),(1.86,.040,1.42),METAL)
    for i in range((13,7,3)[level]):
        count=(13,7,3)[level]
        hull.box((0,1.527,1.47+i*1.29/(count-1)),(1.86,.05,.065 if level==0 else .11),PANEL,.008)
    hull.box((0,.69,3.43),(.73,.20,.12),METAL)
    hatch.cylinder((-.62,1.51,-1.9),.32,.08,'y',METAL,sides)
    hatch.cylinder((-.62,1.57,-1.9),.29,.082,'y',PANEL,sides)
    hatch.box((-.62,1.634,-2.015),(.23,.08,.09),GLASS)

    # Low cast turret with broad cheeks, overlapping roof hatches and sights.
    turret.cylinder((0,-.025,0),1.06,.13,'y',METAL,sides)
    shapes=[(.013,1.10,1.19),(.14,1.36,1.31),(.37,1.30,1.26),
            (.55,1.10,.99),(.66,.76,.70)]
    turret.rings([[(w*math.cos(math.tau*i/sides),y,.10+d*math.sin(math.tau*i/sides))
                   for i in range(sides)] for y,w,d in shapes], PAINT)
    for side in (-1,1):
        turret.box((side*.78,.32,1.08),(.71,.32,.52),PANEL)
        turret.cylinder((side*.45,.649,.35),.305,.12,'y',METAL,sides)
        turret.cylinder((side*.45,.73,.35),.28,.082,'y',PAINT,sides)
        turret.box((side*.80,.557,-.42),(.22,.147,.21),METAL)
        turret.box((side*.80,.558,-.534),(.135,.079,.026),GLASS)
        if level<2:
            for i in range(3 if level==0 else 2):
                turret.cylinder((side*(1.06+.048*i),.29+i*.123,-.51+i*.035),.065,.29,'z',METAL,8)
            turret.box((side*.78,.50,1.11),(.48,.06,.35),EDGE)
    if level<2:
        turret.cylinder((-.78,1.09,.72),.017,.87,'y',METAL,7)
        turret.cylinder((-.78,.69,.72),.048,.11,'y',METAL,8)
    if level==0:
        turret.box((.53,.82,.42),(.21,.042,.036),METAL,.008)
        turret.box((-.53,.82,.42),(.21,.042,.036),METAL,.008)

    cannon.box((0,0,.06),(.53,.38,.60),PANEL)
    cannon.tube((0,0,0),[(-4.15,.082),(-4.09,.097),(-3.67,.087),(-2.20,.105),
                          (-1.72,.132),(-.92,.134),(-.74,.112),(0,.105)],'z',PAINT,sides)
    cannon.cylinder((0,0,-2.15),.132,.29,'z',PANEL,sides)
    cannon.cylinder((0,0,-4.14),.061,.021,'z',RUBBER,sides)
    if level<2:
        cannon.cylinder((.284,-.035,-.33),.032,.71,'z',METAL,8)
        cannon.cylinder((0,0,-.38),.151,.31,'z',METAL,sides)

    # Both belts are open meshes. Their tread shells are shaded by the game.
    profile=[(-3.43,.28),(-3.30,.11),(-3.08,.02),(3.02,.02),(3.31,.14),(3.45,.31),
             (3.44,.63),(3.26,.83),(3.02,.94),(-3.05,.94),(-3.31,.76),(-3.44,.57)]
    inner=[(z*.966,.465+(y-.465)*.70) for z,y in profile]
    for side in (-1,1):
        center=side*1.49
        outer_left=[(center-.285,y,z) for z,y in profile]
        outer_right=[(center+.285,y,z) for z,y in profile]
        inner_left=[(center-.285,y,z) for z,y in inner]
        inner_right=[(center+.285,y,z) for z,y in inner]
        rings=[outer_left,outer_right,inner_right,inner_left]
        n=len(profile)
        faces=[]
        for ring in range(4):
            for i in range(n):
                j=(i+1)%n
                a,b=ring*n,(ring+1)%4*n
                faces.append((a+i,a+j,b+j,b+i))
        tracks.add([p for ring in rings for p in ring],faces,METAL)
        if level==0:
            for i in range(23):
                z=-2.99+i*.261
                for y in (.036,.934):
                    tracks.box((center,y,z),(.586,.042,.110),RUBBER,0)
        for z in (-3.055,3.055):
            tracks.cylinder((center,.46,z),.309,.39,'x',RUBBER,sides)
            tracks.cylinder((center,.46,z),.221,.43,'x',METAL,sides)
    wheel.cylinder((0,0,0),.344,.15,'x',RUBBER,sides)
    wheel.cylinder((0,0,0),.278,.186,'x',PANEL,sides)
    wheel.cylinder((0,0,0),.109,.278,'x',METAL,sides)
    if level==0:
        for direction in (-1,1):
            for i in range(6):
                turn=math.tau*i/6
                wheel.cylinder((direction*.107,.192*math.cos(turn),.192*math.sin(turn)),.026,.035,'x',EDGE,6)

    # The support extends down into the turret silhouette, at a fixed hull pivot.
    # It stays attached to the hull while the mount and gun traverse independently.
    mount.cylinder((0,-.285,0),.17,.66,'y',METAL,sides)
    mount.cylinder((0,-.028,0),.20,.17,'y',PANEL,sides)
    mount.box((0,.056,-.047),(.32,.102,.37),PANEL)
    mg.box((0,.12,-.23),(.142,.144,.47),METAL)
    mg.box((.12,.105,-.19),(.15,.15,.24),PANEL)
    mg.cylinder((0,.12,-.79),.034,.86,'z',METAL,sides)
    mg.cylinder((0,.12,-1.245),.055,.07,'z',RUBBER,sides)

    for name, part in (('hull',hull),('turret',turret),('cannon',cannon),('hatch',hatch),
                       ('belt',tracks),('wheel',wheel),('mg_mount',mount),('mg_barrel',mg)):
        part.object(f'LOD{level}_{name}', collection)


def main():
    glb_path, blend_path = map(Path, sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for level in range(3):
        collection = bpy.data.collections.new(f'Rubezh LOD{level}')
        bpy.context.scene.collection.children.link(collection)
        make_level(level,collection)

    glb_path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(glb_path),export_format='GLB',export_materials='NONE',
                              export_vertex_color='ACTIVE',export_extras=False,
                              export_meshopt_compression_enable=True,
                              export_meshopt_extension='EXT_meshopt_compression')

    # Keep the editable scene assembled. glTF parts stay at their rig-local origin.
    for level in range(3):
        collection=bpy.data.collections[f'Rubezh LOD{level}']
        def part(name):
            return bpy.data.objects[f'LOD{level}_{name}']

        part('turret').location=(0,.4,1.53)
        part('cannon').parent=part('turret')
        part('cannon').location=(0,.9,.34)
        part('mg_mount').location=(.45,.4,2.66)
        part('mg_barrel').parent=part('mg_mount')
        for name in ('turret','mg_mount','hatch','belt'):
            part(name).parent=part('hull')
        wheel=bpy.data.objects[f'LOD{level}_wheel']
        for i in range(12):
            copy=wheel.copy()
            copy.parent=part('hull')
            copy.location=(-1.67 if i<6 else 1.67,2.65-(i%6)*1.06,.414)
            collection.objects.link(copy)
        bpy.data.objects.remove(wheel,do_unlink=True)
        collection.hide_viewport=level>0
        collection.hide_render=level>0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.shading.color_type='VERTEX'
                space.region_3d.view_distance=13
                space.region_3d.view_location=(0,0,1)
                space.region_3d.view_rotation=Euler((math.radians(68),0,math.radians(142))).to_quaternion()
    bpy.context.preferences.filepaths.save_version=0
    blend_path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))


if __name__=='__main__':
    main()
