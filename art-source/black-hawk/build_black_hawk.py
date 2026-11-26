"""Build the editable aircraft and export its three game LODs with Blender."""

import math
import random
import struct
import tempfile
import zlib
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
EXPORT = HERE.parents[1] / "src/assets/black-hawk/black-hawk.glb"
PART_PIVOTS = {
    "MainRotor": (0, 4.26, .08),
    "TailRotor": (-.61, 4.01, 7.17),
    "Minigun": (-1.19, 2.09, -.65),
}
MATERIALS = {
    "Olive enamel": ("#454a36", .57, .30),
    "Dark enamel": ("#30362b", .62, .23),
    "Panel enamel": ("#535644", .60, .31),
    "Floor and liners": ("#292d28", .83, .05),
    "Gunmetal": ("#202326", .39, .68),
    "Steel": ("#6f7572", .39, .65),
    "Rubber": ("#141819", .92, 0),
    "Seat canvas": ("#565e4a", .96, 0),
    "Harness webbing": ("#908167", .93, 0),
    "Warning yellow": ("#d6aa4e", .56, .10),
    "Lettering": ("#a9a798", .75, 0),
    "Displays": ("#193b35", .34, .14),
    "Display symbology": ("#86c9a0", .55, 0),
    "Red navigation lamp": ("#d54843", .32, .10),
    "Green navigation lamp": ("#50d3a3", .32, .10),
    "Lamp lens": ("#d7dedb", .27, .18),
    "Glazing": ("#658d99", .21, .15),
}

TEXTURED = {"Olive enamel": (7, False), "Dark enamel": (6, False),
            "Panel enamel": (5, False), "Floor and liners": (9, True),
            "Seat canvas": (9, True), "Harness webbing": (7, True)}


def srgb(color):
    values = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]


def surface_texture(name, color, strength, fabric, directory):
    size = 128
    rgb = [int(color[i:i+2],16) for i in (1,3,5)]
    rng = random.Random(417 + sum(map(ord,name)))
    image = bytearray()
    for y in range(size):
        image.append(0)
        for x in range(size):
            grain = rng.uniform(-.28,.28)
            if fabric:
                grain += .67 if (x+y)%4==0 else -.18
            else:
                grain += .30*math.sin(x*math.tau/size+math.sin(3*y*math.tau/size))
                grain += .28*math.sin((3*x-y)*math.tau/size)
                if rng.random()<.009:
                    grain += .88
            image.extend(max(0,min(255,round(c+grain*strength))) for c in rgb)

    def chunk(kind, data):
        return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data))

    path = directory/(name+".png")
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",size,size,8,2,0,0,0))+
                     chunk(b"IDAT",zlib.compress(image))+chunk(b"IEND",b""))
    texture = bpy.data.images.load(str(path))
    texture.pack()
    texture.name = name+" surface"
    return texture


def make_materials(directory):
    for name, (color, rough, metal) in MATERIALS.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        rgba = (*srgb(color), .34 if name == "Glazing" else 1)
        mat.diffuse_color = rgba
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = rgba
        shader.inputs["Roughness"].default_value = rough
        shader.inputs["Metallic"].default_value = metal
        shader.inputs["Alpha"].default_value = rgba[3]
        if name == "Glazing":
            mat.surface_render_method = 'BLENDED'
        if name in TEXTURED:
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = surface_texture(name,color,*TEXTURED[name],directory)
            mat.node_tree.links.new(node.outputs["Color"],shader.inputs["Base Color"])
        if name.startswith("Display") or "lamp" in name:
            shader.inputs["Emission Color"].default_value = rgba
            shader.inputs["Emission Strength"].default_value = .3


PAINT = "Olive enamel"
DARK = "Dark enamel"
PANEL = "Panel enamel"
LINER = "Floor and liners"
METAL = "Gunmetal"
STEEL = "Steel"
RUBBER = "Rubber"
CLOTH = "Seat canvas"
TAPE = "Harness webbing"
YELLOW = "Warning yellow"


def xyz(point):
    x, y, z = point
    return (x, -z, y)


class Aircraft:
    def __init__(self, level, collection):
        self.level = level
        self.collection = collection
        self.parts = defaultdict(list)
        self.group = "Airframe"
        self.sides = (16, 10, 6)[level]

    def mesh(self, name, mat, vertices, faces, smooth=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([xyz(v) for v in vertices], [], faces)
        mesh.update()
        if mat in TEXTURED:
            uv = mesh.uv_layers.new()
            for poly in mesh.polygons:
                axis = max(range(3),key=lambda i:abs(poly.normal[i]))
                u,v = [i for i in range(3) if i!=axis]
                for index in poly.loop_indices:
                    p = mesh.vertices[mesh.loops[index].vertex_index].co
                    uv.uv[index].vector = (p[u]*1.6,p[v]*1.6)
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)
        obj.data.materials.append(bpy.data.materials[mat])
        for poly in mesh.polygons:
            poly.use_smooth = smooth
        self.parts[self.group].append(obj)
        return obj

    def shell(self, name, mat, rings, openings=()):
        n = len(rings[0])
        faces = [tuple(reversed(range(n)))]
        for i in range(len(rings) - 1):
            for j in range(n):
                if (i, j) in openings:
                    continue
                k = (j + 1) % n
                faces.append((i*n+j, i*n+k, (i+1)*n+k, (i+1)*n+j))
        faces.append(tuple(range((len(rings)-1)*n, len(rings)*n)))
        return self.mesh(name, mat, [v for ring in rings for v in ring], faces)

    def box(self, name, mat, p, size, bevel=0):
        x, y, z = p
        a, b, c = (v / 2 for v in size)
        return self.shell_box(name, mat, [
            [(x+dx, y+dy, z+dz) for dx, dy in [(-a,-b),(a,-b),(a,b),(-a,b)]]
            for dz in (-c,c)
        ], bevel)

    def shell_box(self, name, mat, rings, bevel):
        obj = self.shell(name, mat, rings)
        if bevel and self.level < 2:
            mod = obj.modifiers.new("Panel edges", 'BEVEL')
            mod.width, mod.segments = bevel, 2 if self.level == 0 else 1
            mod = obj.modifiers.new("Panel normals", 'WEIGHTED_NORMAL')
            mod.keep_sharp = True
        return obj

    def rod(self, name, mat, a, b, radius, end=None, sides=None):
        a, b = Vector(a), Vector(b)
        direction = (b-a).normalized()
        u = direction.cross(Vector((0, 1, 0) if abs(direction.y) < .9 else (0, 0, 1))).normalized()
        v = direction.cross(u)
        n = sides or self.sides
        rings = [[pos + r * (math.cos(t*math.tau/n)*u + math.sin(t*math.tau/n)*v)
                  for t in range(n)] for pos, r in [(a, radius), (b, end if end is not None else radius)]]
        return self.shell(name, mat, rings)

    def panel(self, name, mat, points, thickness):
        vertices = [Vector(p) for p in points]
        normal = (vertices[1]-vertices[0]).cross(vertices[2]-vertices[0]).normalized()
        return self.shell(name, mat, [[p + normal*d for p in vertices]
                                     for d in (-thickness/2, thickness/2)])

    def label(self, words, side, y, z, size, x):
        font = bpy.data.curves.new(words, 'FONT')
        font.body, font.size, font.align_x, font.align_y = words, size, 'CENTER', 'CENTER'
        obj = bpy.data.objects.new(words, font)
        self.collection.objects.link(obj)
        obj.location = xyz((side*x, y, z))
        obj.rotation_euler = (math.pi/2, 0, side*math.pi/2)
        obj.data.materials.append(bpy.data.materials["Lettering"])
        self.parts[self.group].append(obj)

    def airframe(self):
        # Station rings run from the chin to the rear bulkhead. Omitted faces
        # are the actual windshield, door and cabin openings at every LOD.
        def section(z, w, bottom, sill, header, top):
            return [(x*w, y, z) for x, y in [
                (-.73,bottom),(.73,bottom),(1,bottom+.27),(1,sill),
                (.95,header),(.73,top),(-.73,top),(-.95,header),(-1,sill),(-1,bottom+.27)]]
        rings = [
            section(-4.05,.70,1.12,1.52,1.70,1.79),
            section(-3.57,1.04,.99,1.77,2.02,2.10),
            section(-2.43,1.26,.93,1.92,2.82,3.01),
            section(-1.28,1.31,.92,1.49,2.77,3.06),
            section(1.47,1.31,.99,1.48,2.77,3.04),
            section(2.54,1.10,1.19,1.64,2.69,2.91),
            section(3.47,.66,1.46,1.87,2.56,2.75),
        ]
        windows = [(1, 4), (1, 5), (1, 6), (2, 3), (2, 7)]
        hull = self.shell("Shaped fuselage", PAINT, rings, windows + [(3, 3), (3, 7)])
        if self.level == 0:
            bevel = hull.modifiers.new("Folded skin edges", 'BEVEL')
            bevel.width, bevel.segments, bevel.angle_limit = .043, 2, .30
        for i, j in windows:
            k = (j+1) % len(rings[i])
            points = [rings[i][j], rings[i][k], rings[i+1][k], rings[i+1][j]]
            self.panel("Cockpit glazing", "Glazing", points, .012)
            for a, b in zip(points, points[1:]+points[:1]):
                self.rod("Glazing surround", DARK, a, b, .039 if j == 5 else .046)
        self.rod("Windshield central post", PAINT, (0,2.106,-3.565), (0,3.015,-2.43), .041)
        tail = [section(z, w, bottom, bottom+.4, top-.12, top)
                for z,w,bottom,top in [(3.35,.67,1.50,2.74),(4.1,.53,1.65,2.62),
                                       (6.82,.29,2.12,2.73),(7.69,.20,2.24,2.88)]]
        self.shell("Tapered tail boom", PAINT, tail)
        self.panel("Canted tail pylon", PAINT, [(-.10,2.40,6.42),(-.16,2.42,7.7),
                   (-.40,4.52,7.38),(-.36,4.57,6.94)], .32)
        self.panel("Horizontal stabilator", DARK, [(-2.07,2.44,7.3),(-1.90,2.43,6.56),
                   (1.88,2.43,6.56),(2.06,2.44,7.3)], .12)
        self.rod("Main rotor mast", STEEL, (0,3.58,.08),(0,4.41,.08), .15)
        self.shell("Transmission fairing", DARK, [section(z,w,3.00,3.26,top-.12,top)
                   for z,w,top in [(-1.89,.49,3.41),(-1.12,.86,3.84),
                                    (.76,.81,3.83),(1.65,.53,3.49)]])
        for side in (-1,1):
            x = side
            self.rod("Turbine cowling", PAINT, (x*.79,3.31,-1.70),(x*.92,3.33,1.27), .43, .35)
            self.rod("Intake lip", DARK, (x*.79,3.31,-1.76),(x*.79,3.31,-1.62), .405)
            self.rod("Intake screen", RUBBER, (x*.79,3.31,-1.775),(x*.79,3.31,-1.72), .318)
            self.rod("Exhaust collar", STEEL, (x*.94,3.32,1.12),(x*1.22,3.34,1.84), .32, .283)
            self.rod("Exhaust recess", RUBBER, (x*1.22,3.34,1.845),(x*1.25,3.34,1.91), .226)
            self.shell_box("Sliding door parked aft", PAINT, [
                [(x*a,y,z) for a,y in [(1.16,1.48),(1.26,1.49),(1.23,2.71),(1.14,2.72)]]
                for z in (1.43,3.14)], .05)
            self.box("Sliding door inset", PANEL, (x*1.252,2.16,2.17),(.049,.72,1.09),.023)
            self.box("Door step", METAL, (x*1.16,1.04,-.65),(.51,.11,1.01),.04)
            self.rod("Door lower track", DARK,(x*1.31,1.46,-1.20),(x*1.24,1.46,2.94),.039)
            self.rod("Door upper track", DARK,(x*1.255,2.79,-1.27),(x*1.10,2.79,2.84),.042)
            for z in (-1.26,1.45):
                self.rod("Portal frame", DARK,(x*1.31,1.46,z),(x*1.25,2.78,z),.072)
            self.rod("Main strut", STEEL,(x*.79,1.77,-1.82),(x*1.36,.47,-1.91),.107)
            self.rod("Main drag brace", METAL,(x*.80,1.14,-2.53),(x*1.36,.47,-1.91),.061)
            self.wheel(x*1.39,.43,-1.91,.433,.224)
            self.box("Navigation light housing", DARK,(x*1.36,1.63,1.44),(.15,.15,.25),.05)
            lamp = "Red navigation lamp" if side < 0 else "Green navigation lamp"
            self.box("Position light", lamp,(x*1.435,1.64,1.44),(.054,.116,.17),.028)
            self.rod("Windscreen wiper", METAL,(x*.67,2.12,-3.49),(x*.42,2.57,-3.07),.016)
            if self.level < 2:
                self.exterior_details(side)
        self.rod("Tail fork", STEEL, (0,2.31,6.79),(0,.34,6.15),.078)
        self.rod("Tail fork brace", METAL, (0,1.19,6.42),(0,2.16,5.92),.055)
        self.wheel(0,.32,6.15,.32,.20)
        self.box("Tail position light","Lamp lens",(0,2.66,7.69),(.115,.104,.08),.015)
        self.rod("Tail rotor driveshaft", STEEL, (-.64,4.01,7.17),(-.11,4.01,7.17),.095)
        self.box("Chin searchlight","Lamp lens",(0,1.14,-3.89),(.37,.075,.25),.035)

    def wheel(self, x, y, z, r, width):
        self.rod("Tyre", RUBBER, (x-width/2,y,z),(x+width/2,y,z),r)
        for side in (-1,1):
            a = x+side*width*.50
            self.rod("Wheel hub", METAL,(a,y,z),(a+side*.039,y,z),r*.53)
            self.rod("Wheel axle cap", STEEL,(a+side*.038,y,z),(a+side*.055,y,z),r*.21)
            if self.level == 0:
                for i in range(8):
                    t = i*math.tau/8
                    yy, zz = y+math.cos(t)*r*.37,z+math.sin(t)*r*.37
                    self.rod("Wheel fastener",STEEL,(a+side*.037,yy,zz),(a+side*.054,yy,zz),.018,sides=6)

    def exterior_details(self, side):
        x = side
        self.box("Service hatch", PANEL,(x*1.246,1.28,1.96),(.056,.23,.59),.035)
        self.rod("Grab handle",YELLOW,(x*1.336,1.75,1.37),(x*1.336,1.99,1.37),.028)
        self.rod("Step brace",STEEL,(x*.93,1.20,-1.05),(x*1.36,1.04,-1.08),.026)
        self.rod("Cabin antenna",METAL,(x*.50,1.01,2.10),(x*.61,.42,2.56),.017)
        self.rod("Nose pitot silhouette",STEEL,(x*.87,1.55,-3.58),(x*.98,1.60,-4.23),.025,.014)
        if self.level == 0:
            self.rod("Side panel break",DARK,(x*1.15,1.11,-2.91),(x*1.27,1.14,-1.15),.013,sides=6)
            self.rod("Side panel break",DARK,(x*1.286,1.15,-1.15),(x*1.29,1.18,1.41),.013,sides=6)
            for i in range(10):
                self.rod("Lower skin rivet",STEEL,(x*1.28,1.17,-1.14+i*.26),
                         (x*1.306,1.17,-1.14+i*.26),.010,sides=6)
            self.rod("Tail access seam",DARK,(x*.45,2.25,4.56),(x*.287,2.39,6.62),.012,sides=6)
            self.rod("Tail boom antenna",METAL,(x*.31,2.2,6.42),(x*.45,1.59,6.84),.014,.004)
            self.rod("Main strut dust collar",DARK,(x*1.20,.84,-1.89),(x*1.27,.68,-1.90),.12)
            self.box("Door window recess",DARK,(x*1.281,2.34,2.17),(.034,.39,.84),.037)
            self.box("Door window","Glazing",(x*1.303,2.34,2.17),(.016,.32,.75),.03)
            self.box("Door handle",STEEL,(x*1.286,2.07,1.69),(.068,.069,.18),.019)
            for i in range(13):
                z = -1.15+i*.203
                for y,xx in [(1.44,1.31),(2.81,1.23)]:
                    self.rod("Door frame fastener",STEEL,(x*xx,y,z),(x*(xx+.013),y,z),.016,sides=6)
            for i in range(7):
                self.box("Cowling cooling louvre", METAL,(x*1.20,3.48,-.89+i*.125),(.027,.102,.050),.01)
            for j in range(4):
                self.box("Step grip",RUBBER,(x*(1.017+j*.10),1.103,-.65),(.036,.018,.78))
            self.label("SECTOR 09",side,1.99,2.37,.13,1.285)
            self.label("RESCUE",side,1.76,2.23,.093,1.275)

    def cabin(self):
        self.group = "Cabin"
        self.box("Anti-slip cabin floor",LINER,(0,1.345,-.44),(2.36,.087,4.54),.033)
        self.box("Cabin rear bulkhead",LINER,(0,2.045,1.76),(2.16,1.33,.10),.05)
        self.box("Cockpit instrument coaming",DARK,(0,1.94,-2.91),(2.06,.27,.53),.078)
        self.box("Centre console",METAL,(0,1.63,-2.37),(.36,.47,1.02),.045)
        self.seat(-.59,-2.06,1.64,0,"Pilot")
        self.seat(.59,-2.06,1.64,0,"Copilot")
        self.seat(-.68,-.64,1.61,math.pi/2,"Gunner")
        self.seat(.69,.04,1.61,-math.pi/2,"Forward rifleman")
        self.seat(.69,.99,1.61,-math.pi/2,"Aft rifleman")
        for x in (-.59,.59):
            self.rod("Flight control",METAL,(x,1.38,-2.39),(x,1.76,-2.43),.037)
            self.rod("Cyclic grip",RUBBER,(x-.078,1.77,-2.45),(x+.075,1.77,-2.45),.035)
            if self.level < 2:
                for i in (-1,1):
                    self.box("Pedal",METAL,(x+i*.135,1.47,-2.82),(.16,.16,.093),.024)
                    self.box("Instrument bezel",RUBBER,(x+i*.21,1.99,-2.629),(.33,.20,.050),.021)
                    self.box("Glass instrument display","Displays",(x+i*.21,1.99,-2.598),(.260,.14,.017),.012)
                    if self.level == 0:
                        self.instrument(x+i*.21,1.99)
        if self.level < 2:
            for z in (-1.32,-.20,.97,1.65):
                for side in (-1,1):
                    self.rod("Overhead rib",STEEL,(side*1.17,2.68,z),(side*.93,2.85,z),.034)
                    self.rod("Overhead rib",STEEL,(side*.93,2.85,z),(0,2.91,z),.034)
            self.box("Minigun ammunition bin",PANEL,(-.87,1.55,.21),(.49,.40,.46),.035)
            for x in (-.50,.50):
                self.box("Cargo tie-down track",METAL,(x,1.393,.03),(.074,.036,2.65),.01)
            self.box("Overhead avionics panel",DARK,(0,2.84,-2.35),(.54,.14,.77),.027)
        if self.level == 0:
            for i in range(9):
                z = -1.18+i*.292
                for x in (-.50,.50):
                    self.box("Track socket",STEEL,(x,1.418,z),(.047,.017,.075),.004)
            for i in range(10):
                for j in range(3):
                    self.box("Console switch", "Lamp lens" if i%4==0 else STEEL,
                             ((j-1)*.090,1.877,-2.77+i*.076),(.024,.021,.031),.004)
            for i in range(5):
                self.box("Fire extinguisher strap",STEEL,(-.91,1.48+i*.035,1.59),(.18,.021,.22))
            self.rod("Fire extinguisher","Red navigation lamp",(-.91,1.48,1.58),(-.91,1.85,1.58),.09)
            for side in (-1,1):
                self.rod("Ceiling wiring loom",METAL,(side*.91,2.84,-1.36),(side*.91,2.84,1.63),.024)
                self.box("Cabin dome light","Lamp lens",(side*.75,2.872,.42),(.22,.038,.31),.035)

    def instrument(self,x,y):
        for side in (-1,1):
            xx=x+side*.096
            self.box("Instrument tape","Display symbology",(xx,y,-2.587),(.005,.102,.003))
            for i in range(5):
                self.box("Instrument tape tick","Display symbology",(xx-side*.008,y+.016*(i-2),-2.586),
                         (.014,.003,.003))
        self.box("Artificial horizon","Display symbology",(x,y,-2.586),(.112,.004,.003))
        for i in (-2,-1,1,2):
            self.box("Pitch ladder","Display symbology",(x,y+i*.018,-2.586),(.05 if abs(i)==2 else .032,.0025,.003))
        for side in (-1,1):
            self.box("Heading bug",YELLOW,(x+side*.024,y+.011,-2.583),(.029,.004,.004))

    def seat(self,x,z,y,yaw,name):
        c,s=math.cos(yaw), math.sin(yaw)
        def p(a,b,d):
            return (x+a*c+d*s,y+b,z-a*s+d*c)
        def pad(label, mat, width, height, depth, b, d):
            return self.shell_box(name+" "+label,mat,[
                [p(a,h,dd) for a,h in [(-width/2,b-height/2),(width/2,b-height/2),
                                        (width/2,b+height/2),(-width/2,b+height/2)]]
                for dd in (d-depth/2,d+depth/2)],.044)
        pad("seat pan",CLOTH,.48,.14,.51,0,-.04)
        pad("back rest",CLOTH,.45,.60,.11,.31,.217)
        pad("headrest",RUBBER,.27,.19,.10,.66,.22)
        for a in (-.18,.18):
            self.rod("Seat frame",STEEL,p(a,-.24,-.17),p(a,-.058,.14),.026)
        if self.level == 0:
            for side in (-1,1):
                self.rod("Harness shoulder strap",TAPE,p(side*.15,.54,.155),p(side*.054,.13,.12),.025)
                self.rod("Harness lap strap",TAPE,p(side*.22,.07,-.03),p(0,.081,-.095),.024)
            pad("harness buckle",STEEL,.089,.055,.078,.092,-.095)

    def rotors(self):
        self.group = "MainRotor"
        self.rod("Rotor head",METAL,(0,0,0),(0,.19,0),.23)
        for i in range(4):
            t = i*math.tau/4
            def blade(x,y,z):
                return (math.cos(t)*x+math.sin(t)*z,y,-math.sin(t)*x+math.cos(t)*z)
            self.panel("Main rotor blade", DARK,[blade(*p) for p in
                       [(-.16,.15,.59),(-.30,.07,7.92),(.06,.06,8.15),(.30,.14,.80)]],.047)
            self.panel("Rotor blade tip", PANEL,[blade(*p) for p in
                       [(-.291,.102,7.48),(-.30,.102,7.92),(.06,.095,8.15),(.082,.102,7.55)]],.009)
            self.rod("Rotor hinge",STEEL,blade(0,.12,.12),blade(0,.14,.89),.076)
            if self.level < 2:
                self.rod("Pitch link", STEEL,blade(.15,-.14,.27),blade(.16,.095,.69),.021)
        self.group = "TailRotor"
        self.rod("Tail rotor hub",STEEL,(.08,0,0),(-.11,0,0),.12)
        for i in range(4):
            t = i*math.tau/4+.3
            def tail(y,z):
                return (-.075,y*math.cos(t)-z*math.sin(t),y*math.sin(t)+z*math.cos(t))
            self.panel("Tail rotor blade",DARK,[tail(*p) for p in [(.12,-.072),(1.02,-.115),
                       (1.11,.081),(.15,.100)]],.028)
    def systems(self):
        self.rotors()
        self.group = "Minigun"
        self.rod("Drive housing",METAL,(0,0,.19),(0,0,-.24),.113,sides=12)
        self.rod("Rear plate",STEEL,(0,0,.197),(0,0,.225),.093,sides=12)
        self.box("Drive motor",METAL,(.10,-.027,.018),(.10,.127,.29),.018)
        self.box("Feed guide",STEEL,(-.095,-.017,-.07),(.12,.105,.23),.021)
        self.box("Cradle",METAL,(0,-.134,-.027),(.24,.061,.43),.018)
        self.rod("Spade grip crossbar",STEEL,(-.163,.019,.255),(.163,.019,.255),.016)
        for side in (-1,1):
            x = side*.153
            self.rod("Spade grip",RUBBER,(x,-.076,.271),(x,.072,.243),.023)
            self.box("Grip cap",METAL,(x,.077,.242),(.041,.025,.045),.006)
            if self.level < 2:
                self.rod("Receiver fastener",STEEL,(side*.063,.024,.223),(side*.063,.024,.233),.011,sides=6)
        self.rod("Barrel hub",METAL,(0,0,-.25),(0,0,-.36),.104)
        self.group = "MinigunBarrels"
        self.rod("Barrel brace",STEEL,(0,0,-.68),(0,0,-.70),.088)
        self.rod("Muzzle clamp",METAL,(0,0,-1.064),(0,0,-1.094),.093)
        for i in range(6):
            t=i*math.tau/6
            x,y=.061*math.cos(t),.061*math.sin(t)
            self.rod("Barrel",STEEL,(x,y,-.32),(x,y,-1.136),.019,sides=10 if self.level<2 else 6)
            self.rod("Muzzle sleeve",METAL,(x,y,-1.106),(x,y,-1.151),.022,sides=10 if self.level<2 else 6)
            self.rod("Bore",RUBBER,(x,y,-1.151),(x,y,-1.153),.013,sides=8 if self.level<2 else 6)
        self.group = "Cabin"
        self.rod("Pintle post",METAL,(-1.19,1.40,-.65),(-1.19,2.09,-.65),.058)
        if self.level < 2:
            self.rod("Pintle brace",STEEL,(-1.19,1.60,-.65),(-1.05,1.42,-.34),.037)

    def export_groups(self, root):
        copies = []
        groups = {}
        for part, objects in self.parts.items():
            parent = groups["Minigun"] if part == "MinigunBarrels" else root
            group = empty(root.name+"_"+part, self.collection, parent, PART_PIVOTS.get(part,(0,0,0)))
            groups[part] = group
            if part == "Minigun":
                group.rotation_euler.z = math.pi/2
            # Join detail by material, retaining named editable source meshes
            # in the .blend and producing only a few draw calls per component.
            by_material = defaultdict(list)
            for obj in objects:
                by_material[obj.data.materials[0].name].append(obj)
            for name, sources in by_material.items():
                bpy.ops.object.select_all(action='DESELECT')
                converted = []
                for src in sources:
                    obj = src.copy()
                    obj.data = src.data.copy()
                    obj.parent = None
                    self.collection.objects.link(obj)
                    obj.select_set(True)
                    converted.append(obj)
                bpy.context.view_layer.objects.active = converted[0]
                bpy.ops.object.convert(target='MESH')
                bpy.ops.object.join()
                obj = bpy.context.object
                obj.name = part+" "+name
                # Shapes were authored in the coordinate frame of this part.
                # Transform the text vertices into the same local frame.
                obj.data.transform(obj.matrix_basis)
                obj.parent = group
                obj.matrix_basis.identity()
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.mesh.normals_make_consistent(inside=False)
                bpy.ops.object.mode_set(mode='OBJECT')
                copies.append(obj)
        return copies


def empty(name, collection, parent=None, position=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent, obj.location = parent, xyz(position)
    obj.empty_display_size = .18
    return obj


def build(texture_directory):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.filepaths.save_version = 0
    make_materials(texture_directory)
    scene = bpy.context.scene
    source = bpy.data.collections.new("Black Hawk • editable parts")
    scene.collection.children.link(source)
    aircraft = []
    for level in range(3):
        collection = bpy.data.collections.new(f"LOD{level} source")
        source.children.link(collection)
        model = Aircraft(level,collection)
        model.airframe()
        model.cabin()
        model.systems()
        aircraft.append(model)
        anchors = {}
        for part, objects in model.parts.items():
            parent = anchors["Minigun"] if part == "MinigunBarrels" else None
            anchor = empty(part+" source",collection,parent,PART_PIVOTS.get(part,(0,0,0)))
            anchors[part] = anchor
            if part == "Minigun":
                anchor.rotation_euler.z = math.pi/2
            for obj in objects:
                obj.parent = anchor
        collection.hide_viewport = level > 0
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 22
            area.spaces.active.region_3d.view_location = (0,0,2)
            area.spaces.active.shading.color_type = 'MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "black-hawk.blend"), compress=True, relative_remap=False)
    export = bpy.data.collections.new("Export")
    scene.collection.children.link(export)
    for level, model in enumerate(aircraft):
        collection = bpy.data.collections.new(f"Export LOD{level}")
        export.children.link(collection)
        model.collection = collection
        root = empty(f"LOD{level}", collection)
        model.export_groups(root)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export.all_objects:
        obj.select_set(True)
    EXPORT.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                              export_animations=False,export_cameras=False,export_lights=False)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as directory:
        build(Path(directory))
