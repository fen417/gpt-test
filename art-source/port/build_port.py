"""Build the editable Port Rubezh scene and its two game geometry layers."""
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / "tank"))
from build_rubezh import Assembly


def rgb(value):
    return tuple((c / 255 / 12.92 if c <= 10 else (c / 255 + .055) / 1.055)
                 ** (1 if c <= 10 else 2.4) for c in bytes.fromhex(value.lstrip("#")))


def shade(color, amount):
    return tuple(min(1, c * amount) for c in color)


CREAM = rgb("e0d5aa")
YELLOW = rgb("c99538")
CHARCOAL = rgb("353b39")
STEEL = rgb("4b5759")
ZINC = rgb("899791")
IRON = rgb("575758")
RUST = rgb("9b6347")
CONCRETE = rgb("a9aaa0")
GLASS = rgb("4e777a")
FROST = rgb("8cb1ad")
RUBBER = rgb("303534")
WOOD = rgb("a18460")
PAPER = rgb("ab936b")
ORANGE = rgb("ae6339")
TILE = {"concrete": 5.5, "deck": 9, "asphalt": 7, "metal": 3.6,
        "painted": 2.9, "wood": 1.35, "marking": 2, "glazing": 2}
SKINS = {"deck": "concrete"}
DIGITS = {
    "0": ("111","101","101","101","111"),
    "2": ("111","001","111","100","111"),
    "4": ("101","101","111","001","001"),
    "6": ("111","100","111","101","111"),
}


class Mesh(Assembly):
    def box(self, center, size, color, bevel=0):
        if min(size) > .001:
            super().box(center, size, color, bevel)

    def floor(self, x, y, z, w, d, color):
        self.add([(x-w/2,y,z-d/2),(x-w/2,y,z+d/2),
                  (x+w/2,y,z+d/2),(x+w/2,y,z-d/2)], [(0,1,2,3)], color)

    def beam(self, a, b, width, color, depth=None):
        start, end = Vector(a), Vector(b)
        forward = (end-start).normalized()
        right = forward.cross(Vector((0,1,0) if abs(forward.y)<.95 else (0,0,1))).normalized()
        up = forward.cross(right)
        self.rings([[(p+right*s*width/2+up*t*(depth or width)/2)[:]
                     for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]] for p in (start,end)],color)

    def extend(self, mesh, position, yaw):
        x,y,z = position
        sine,cosine = math.sin(yaw),math.cos(yaw)
        offset = len(self.vertices)
        self.vertices.extend((x+a*cosine+c*sine,y+b,z-a*sine+c*cosine) for a,b,c in mesh.vertices)
        self.faces.extend(tuple(offset+i for i in face) for face in mesh.faces)
        self.colors.extend(mesh.colors)


def material(surface):
    if surface in bpy.data.materials:
        return bpy.data.materials[surface]
    mat=bpy.data.materials.new(surface)
    mat.use_backface_culling=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    shader=nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value={"metal": .64, "painted": .71, "glazing": .28}.get(surface,.90)
    shader.inputs["Metallic"].default_value=.25 if surface in ("metal","painted") else 0
    color=nodes.new("ShaderNodeVertexColor")
    color.layer_name="Paint"
    image=REPO/"src"/"assets"/"surfaces"/(SKINS.get(surface,surface)+".webp")
    if surface=="painted":
        image=REPO/"src"/"assets"/"port"/"paint.webp"
    if image.exists():
        texture=nodes.new("ShaderNodeTexImage")
        texture.image=bpy.data.images.load(str(image),check_existing=True)
        texture.image.pack()
        multiply=nodes.new("ShaderNodeMixRGB")
        multiply.blend_type="MULTIPLY"
        multiply.inputs[0].default_value=1
        links.new(color.outputs["Color"],multiply.inputs[1])
        links.new(texture.outputs["Color"],multiply.inputs[2])
        links.new(multiply.outputs[0],shader.inputs["Base Color"])
    else:
        links.new(color.outputs["Color"],shader.inputs["Base Color"])
    return mat


def mesh_object(mesh, name, collection, surface, cast, textured=True):
    obj=mesh.object(name,collection)
    obj["portSurface"]=surface
    obj["portCaster"]=cast
    uv=obj.data.uv_layers.active
    uv.name="Surface"
    scale=TILE[surface]
    for face in obj.data.polygons:
        nx,nz,ny=face.normal
        for index in face.loop_indices:
            x,z,y=obj.data.vertices[obj.data.loops[index].vertex_index].co
            u,v=(x,-z) if abs(ny)>.6 else ((-z,y) if abs(nx)>abs(nz) else (x,y))
            uv.uv[index].vector=(u/scale,v/scale)
    if textured:
        obj.data.materials.append(material(surface))
    return obj


class Port:
    def __init__(self):
        self.source=[]
        for title in ("Port · Core geometry","Port · High detail"):
            collection=bpy.data.collections.new(title)
            bpy.context.scene.collection.children.link(collection)
            self.source.append(collection)
        self.export_batches={}

    def place(self, name, position, build, yaw=0):
        parts={}
        def layer(surface="metal",detail=False,cast=None):
            return parts.setdefault((int(detail),surface,not detail if cast is None else cast),Mesh())
        build(layer)
        for (level,surface,cast), mesh in parts.items():
            if not mesh.faces:
                continue
            obj=mesh_object(mesh,f"{name} · {surface}",self.source[level],surface,cast)
            x,y,z=position
            obj.location=(x,-z,y)
            obj.rotation_euler.z=yaw
            key=(level,math.floor(x/72),math.floor(z/72),surface,cast)
            self.export_batches.setdefault(key,Mesh()).extend(mesh,position,yaw)

    def export(self, level, path):
        collection=bpy.data.collections.new("Runtime chunks")
        bpy.context.scene.collection.children.link(collection)
        bpy.ops.object.select_all(action="DESELECT")
        for (tier,x,z,surface,cast),mesh in self.export_batches.items():
            if tier==level:
                mesh_object(mesh,f"S{x}_{z}_{surface}_{int(cast)}",collection,surface,cast,False).select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,export_extras=True,
                                  export_materials="NONE",export_vertex_color="ACTIVE",
                                  export_meshopt_compression_enable=False)
        for obj in list(collection.objects):
            data=obj.data
            bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.meshes.remove(data)
        bpy.data.collections.remove(collection)


def position(record):
    return record["x"],record.get("baseY",0),record["z"]


def fit(record):
    return record["w"],record["d"],record["h"]


def number_plate(mesh, text, x, y, z, side, cell, paint):
    for index,digit in enumerate(text):
        for row,line in enumerate(DIGITS[digit]):
            for column,pixel in enumerate(line):
                if pixel=="1":
                    mesh.box((x+side*((index-(len(text)-1)/2)*4+column-1)*cell,
                              y+(2-row)*cell,z),(cell,.99*cell,.018),paint)


def panels(mesh, length, lower, upper, depth, side, color, stride=.52):
    """Folded metal siding. Each strip shares its edges with the next one."""
    count=max(1,round(length/stride))
    step=length/count
    for i in range(count):
        left=-length/2+i*step
        offsets=(0,.16,.34,.67,.84,1)
        ridges=(0,0,1,1,0,0)
        vertices=[(left+step*t,y,side*(depth+rib*.065))
                  for y in (lower,upper) for t,rib in zip(offsets,ridges)]
        for j,contrast in enumerate((.80,.94,1.04,.90,.78)):
            face=(j,j+1,j+7,j+6)
            mesh.add(vertices,[face if side>0 else face[::-1]],shade(color,contrast))


def cargo(layer, length, width, height, paint, code=0, details=True):
    shell=layer()
    shell.box((0,height/2,0),(length-.10,height-.11,width-.16),paint)
    for side in (-1,1):
        for y in (.09,height-.09):
            shell.box((0,y,side*(width/2-.04)),(length,.17,.08),shade(paint,.73))
        count=max(6,round(length/.54))
        width_of_rib=(length-.40)/count
        for i in range(count):
            x=-length/2+.20+(i+.5)*width_of_rib
            z=side*(width/2-.078)
            vertices=[(x-.17*width_of_rib,.175,z),(x+.17*width_of_rib,.175,z),
                      (x+.17*width_of_rib,height-.175,z),(x-.17*width_of_rib,height-.175,z)]
            shell.add(vertices,[(0,1,2,3) if side>0 else (3,2,1,0)],shade(paint,.76))
    for x in (-length/2+.09,length/2-.09):
        for z in (-width/2+.095,width/2-.095):
            shell.box((x,height/2,z),(.18,height,.19),shade(paint,.75))
    if not details:
        return
    skin=layer("painted",True)
    tags=layer("marking",True)
    rng=random.Random(code+251)
    for side in (-1,1):
        panels(skin,length-.36,.18,height-.18,width/2-.068,side,paint)
        for n in range(6):
            x=rng.uniform(-length*.40,length*.4)
            y=rng.uniform(.26,height-.29)
            tags.box((x,y,side*(width/2+.012)),(rng.uniform(.09,.36),rng.uniform(.022,.065),.015),
                     rng.choice((RUST,CHARCOAL,ZINC)))
        for i in range(3):
            tags.box((-length/2+.5+i*.19,2.04,side*(width/2+.014)),(.12,.25,.014),CREAM)
        tags.box((-length/2+1.16,1.845,side*(width/2+.016)),(1.45,.056,.012),CREAM)
        tags.box((length/2-.46,.39,side*(width/2+.018)),(.26,.30,.016),YELLOW)
    front=length/2-.014
    for side in (-1,1):
        skin.box((front,height/2,side*width*.225),(.075,height-.32,width*.426),shade(paint,.87))
        for y in (.42,height-.43):
            skin.box((front+.051,y,side*width*.433),(.048,.136,.15),ZINC)
        for z in (side*width*.14,side*width*.31):
            skin.cylinder((front+.055,height/2,z),.032,height-.39,"y",ZINC,8)
            skin.beam((front+.056,.84,z),(front+.069,.84,z+.23),.053,IRON)
        tags.box((front+.057,height*.72,side*width*.244),(.018,.17,.41),CREAM)
    for x in (-length/2+.12,length/2-.12):
        for z in (-width/2+.12,width/2-.12):
            for y in (.095,height-.095):
                skin.box((x,y,z),(.235,.19,.235),shade(paint,.67),.021)


def stack(port, box, code, full=True):
    w,d,h=fit(box)
    levels=box.get("levels",1)
    length,width=max(w,d),min(w,d)
    paint=rgb(box["color"])
    for i in range(levels):
        x,y,z=position(box)
        port.place(f"Container {code:03d}.{i+1}",(x,y+i*h/levels,z),
                   lambda layer: cargo(layer,length,width,h/levels,shade(paint,1+i*.067),code*13+i,full),
                   (-math.pi/2 if d>w else 0)+box.get("modelRotation",{}).get("y",0))


def warehouse_wall(port, box):
    w,d,h=fit(box)
    paint=rgb(box["color"])
    def build(layer):
        layer().box((0,h/2,0),(w,h,d),paint)
        facade=layer("painted",True)
        trim=layer("concrete",True)
        if box["kind"]=="port-wall":
            trim.box((0,.38,0),(w+.09,.76,d+.09),shade(CONCRETE,.78))
        for side in (-1,1):
            panels(facade,w,.83 if box["kind"]=="port-wall" else .20,h-.23,d/2+.025,side,paint,.55)
            facade.box((0,h-.19,side*(d/2+.079)),(w,.16,.16),shade(STEEL,1.19))
            if box["kind"]=="port-wall" and h>6:
                panel_color={"#7c8989":rgb("628c8f"),"#958978":rgb("bc8150"),
                             "#858f81":rgb("839d79")}.get(box["color"],ZINC)
                facade.box((0,2.15,side*(d/2+.102)),(w-.04,.39,.029),panel_color)
            if w>6:
                for i in range(1,max(2,round(w/3.8))):
                    x=-w/2+i*w/max(2,round(w/3.8))
                    facade.box((x,h/2,side*(d/2+.096)),(.16,h-.10,.12),shade(paint,.72))
    yaw=math.pi/2 if d>w else 0
    if d>w:
        w,d=d,w
    port.place(f"Wall {box['id']}",position(box),build,yaw)


def warehouse(port, building):
    w,d,h=fit(building)
    tone={"racks": rgb("667f84"),"transit":rgb("947557"),"reefer":rgb("728171")}[building["stock"]]
    door=building["doorHeight"]
    code={"racks":"02","transit":"04","reefer":"06"}[building["stock"]]
    def build(layer):
        roof=layer()
        steel=layer("metal",True)
        markings=layer("marking",True)
        glass=layer("glazing",True)
        roof.box((0,h+.16,0),(w+1,.32,d+1),shade(tone,.72))
        def top(z):
            return h+.38+max(0,1-abs(z)/(d/2+.48))*.96
        for side in (-1,1):
            steel.box((0,h+.32,side*(d/2+.36)),(w+1,.30,.26),tone)
            edge=side*(d/2+.48)
            steel.rings([[(x,top(edge)-.13,edge),(x,top(edge),edge),(x,top(0),0),(x,top(0)-.13,0)]
                         for x in (-w/2-.48,w/2+.48)],shade(tone,.76))
            for i in range(round(w/.94)):
                x=(i+.5)*w/round(w/.94)-w/2
                steel.beam((x,top(edge)+.043,edge),(x,top(0)+.043,0),.067,shade(tone,1.23))
            for x in building["gates"]:
                z=side*(d/2+.83)
                steel.box((x,door+.34,z),(building["width"]+.74,.58,.53),CHARCOAL,.025)
                steel.box((x,door+.43,z+side*.30),(building["width"]+.64,.25,.12),tone)
                for end in (-1,1):
                    px=x+end*(building["width"]/2+.12)
                    steel.box((px,door*.51,z),(.23,door*1.03,.30),shade(ZINC,.83))
                    steel.box((px,.51,z+side*.58),(.24,.99,.30),YELLOW,.015)
                    for stripe in range(4):
                        markings.box((px,.22+stripe*.17,z+side*.742),(.227,.055,.014),CHARCOAL)
                for i in range(6):
                    steel.box((x+building["width"]*(i/5-.5),door+.30,z+side*.37),(.034,.45,.023),ZINC)
            face=side*(d/2+.682)
            for i in range(12):
                x=(i-5.5) *.72
                glass.box((x,h-1.15,face),(.64,.54,.031),GLASS if i%3 else FROST)
            steel.box((0,h-1.491,face), (9,.11,.19),ZINC)
            steel.box((0,h-.794,face), (9,.11,.19),ZINC)
            for x in (-w*.407,w*.407):
                z=side*(d/2+.153)
                steel.box((x,h-1.79,z),(2.89,1.89,.12),shade(tone,.57))
                number_plate(markings,code,x,h-1.76,z+side*.08,side,.265,CREAM)
            for y in (door+.23,h-.32):
                steel.box((side*(w/2+.73),y,0),(.22,.16,building["sideGate"]+.64),tone)
            for z in (-building["sideGate"]/2-.12,building["sideGate"]/2+.12):
                steel.box((side*(w/2+.67),door/2,z),(.23,door,.21),ZINC)
        for z in (-d*.36,-d*.18,0,d*.18,d*.36):
            steel.beam((-w/2,h-.86,z),(w/2,h-.86,z),.215,STEEL)
            for i in range(8):
                x=(i/8-.5)*w
                steel.beam((x,h-.84,z),(x+w/16,h-.09,z),.11,ZINC)
                steel.beam((x+w/16,h-.09,z),(x+w/8,h-.84,z),.11,ZINC)
            for x in (-w*.24,w*.24):
                steel.box((x,h-1.12,z),(3.1,.22,.42),CHARCOAL)
                glass.box((x,h-1.25,z),(2.8,.07,.28),CREAM)
        for x in (-w*.25,w*.25):
            for z in (-d*.22,d*.22):
                steel.box((x,top(z)+.055,z),(4.25,.26,4.5),ZINC)
                glass.box((x,top(z)+.236,z),(3.98,.12,4.15),shade(FROST,.84))
                for i in range(4):
                    steel.box((x,top(z)+.322,z+(i-1.5)*.98),(4.02,.039,.052),ZINC)
        for x in (-5.7,5.7):
            markings.floor(x,.052,0,.10,d-.95,YELLOW)
        for side in (-1,1):
            for x in building["gates"]:
                for index in range(7):
                    markings.floor(x+(index-3)*1.21,.062,side*(d/2+1.9),.54,2.06,shade(CREAM,.77))
                for dx in (-building["width"]/2+.61,building["width"]/2-.61):
                    markings.floor(x+dx,.064,side*(d/2+1.92),.15,2.76,YELLOW)
    port.place(building["name"],position(building),build)


def rack(port, box):
    w,d,h=fit(box)
    tone=rgb(box["color"])
    def build(layer):
        frame=layer()
        props=layer("wood",True)
        ties=layer("marking",True)
        for x in (-w/2+.085,w/2-.085):
            for z in (-d/2+.09,d/2-.09):
                frame.box((x,h/2,z),(.17,h,.18),tone)
                for y in (.55,h-.23):
                    props.box((x,y,z),(.21,.17,.26),shade(tone,.77))
        for y in (.17,h*.41,h*.70):
            frame.box((0,y,0),(w,.12,d),tone)
            for i,z in enumerate((-d*.31,0,d*.31)):
                height=min(h-y-.2,1.12)
                package=shade(PAPER,.64+i*.18) if i!=1 else shade(FROST,.56)
                frame.box((0,y+.06+height/2,z),(w-.30,height,d*.245),package)
                for x in (-w*.30,0,w*.30):
                    props.box((x,y+.08,z),(.16,.10,d*.26),WOOD)
                    props.box((x,y+.073+height,z),(.058,.027,d*.247),WOOD)
                for side in (-1,1):
                    ties.box((side*(w/2-.139),y+.45,z+d*.037),(.020,.16,.22),CREAM)
                    ties.box((side*(w/2-.136),y+.52,z-d*.05),(.021,.76,.038),shade(ZINC,.68))
        for x in (-w/2+.11,w/2-.11):
            props.beam((x,.22,-d*.47),(x,h-.18,d*.47),.064,ZINC)
    port.place(f"Cargo rack {box['id']}",position(box),build)


def tire(mesh, x, y, z, radius, width, color=RUBBER, sides=8):
    mesh.tube((x,y,z),[(-width/2,radius*.87),(-width*.35,radius),
                        (width*.35,radius),(width/2,radius*.87)],"x",color,sides)


def forklift(port, box):
    color=rgb(box["color"])
    def build(layer):
        core=layer("painted")
        detail=layer("painted",True)
        glaze=layer("glazing",True)
        core.box((0,.64,.27),(1.65,.83,2.07),color)
        core.box((0,1.04,.63),(.83,.21,.58),RUBBER)
        core.box((0,2.34,.26),(1.47,.16,1.49),STEEL)
        for side in (-1,1):
            for z in (-.70,1.03):
                tire(core,side*.67,.32,z,.33,.34)
                detail.cylinder((side*.851,.32,z),.191,.028,"x",ZINC,12)
                detail.box((side*.74,.73,z),(.25,.21,.54),color,.029)
            for z in (-.33,.91):
                core.box((side*.64,1.59,z),(.096,1.48,.12),STEEL)
            core.box((side*.57,1.13,-.93),(.15,2.23,.18),CHARCOAL)
            core.box((side*.34,.19,-1.376),(.116,.084,.84),ZINC)
            detail.cylinder((side*.418,1.16,-.879),.044,1.6,"y",STEEL,10)
            detail.cylinder((side*.391,1.53,-.883),.021,.80,"y",ZINC,8)
            glaze.box((side*.60,2.19,-.56),(.21,.16,.09),shade(CREAM,1.3))
        detail.box((0,2.41,.56),(.40,.058,.58),ZINC)
        glaze.cylinder((.46,2.42,.21),.091,.14,"y",YELLOW,12)
        for n in range(7):
            detail.box((0,.79-.071*n,1.32),(1.13,.035,.050),CHARCOAL)
        detail.cylinder((-.22,1.25,-.25),.16,.041,"y",CHARCOAL,16)
        for y in (.61,1.65,2.15):
            detail.box((0,y,-.94),(1.06,.069,.13),STEEL)
    port.place(f"Forklift {box['id']}",position(box),build)


def truck(port, box):
    w,d,h=fit(box)
    rotated=w>d
    width,length=min(w,d),max(w,d)
    paint=rgb(box["color"])
    def build(layer):
        core=layer()
        lights=layer("glazing",True)
        trim=layer("metal",True)
        core.box((0,.66,0),(width*.74,.44,length*.94),CHARCOAL)
        core.box((0,h*.51,-length*.34),(width*.89,h*.69,length*.30),paint)
        core.box((0,h*.60,length*.16),(width*.96,h*.79,length*.63),shade(paint,.91))
        for side in (-1,1):
            for z in (-length*.31,length*.22,length*.35):
                tire(core,side*width*.36,.51,z,.5,.36)
                trim.cylinder((side*width*.36+side*.197,.51,z),.25,.031,"x",ZINC,12)
        windscreen=-length*.49-.016
        lights.box((0,h*.69,windscreen),(width*.79,h*.255,.054),GLASS,.013)
        trim.box((0,h*.687,windscreen-.045),(.072,h*.262,.048),ZINC)
        trim.box((0,h*.30,-length*.477),(width*.48,.47,.062),CHARCOAL,.013)
        for i in range(7):
            trim.box(((i-3)*width*.057,h*.30,-length*.50),(.052,.45,.052),STEEL)
        for side in (-1,1):
            lights.box((side*width*.32,h*.31,-length*.5),(.28,.17,.06),CREAM)
            lights.box((side*width*.455,h*.67,-length*.29),(.037,h*.27,length*.11),GLASS)
            trim.beam((side*width*.428,h*.64,-length*.42),(side*width*.523,h*.72,-length*.40),.05,STEEL)
            trim.box((side*width*.515,h*.74,-length*.399),(.12,.31,.08),RUBBER)
            for z in (-length*.08,length*.11,length*.29,length*.45):
                trim.box((side*(width*.49),h*.61,z),(.059,h*.81,.12),shade(paint,.67))
        trim.box((0,h*.23,-length*.5),(width*.95,.22,.14),ZINC)
        trim.box((0,h*.26,length*.485),(width*.975,.19,.17),STEEL)
    port.place(f"Yard tractor {box['id']}",position(box),build,math.pi/2 if rotated else 0)


def railcar(port, box, index):
    w,d,h=fit(box)
    color=rgb(box["color"])
    def build(layer):
        core=layer()
        trim=layer("metal",True)
        marks=layer("marking",True)
        core.box((0,.94,0),(w,.34,d),STEEL)
        for z in (-d*.34,d*.34):
            core.box((0,.49,z),(2.12,.36,2.49),CHARCOAL)
            for side in (-1,1):
                for axle in (-.84,.84):
                    tire(core,side*.79,.52,z+axle,.42,.21)
                    trim.cylinder((side*.916,.52,z+axle),.215,.035,"x",IRON,12)
                trim.box((side*.99,.63,z),(.13,.22,2.20),IRON)
        if box["carType"]=="box":
            core.box((0,(h+1.10)*.5,0),(w-.11,h-1.10,d-.22),color)
            for side in (-1,1):
                x=side*(w/2-.02)
                for z in range(-int(d/2)+1,int(d/2)):
                    trim.box((x,2.52,z),(.074,2.72,.10),shade(color,.67))
                trim.box((x+side*.07,2.47,0),(.115,2.64,3.92),shade(color,1.24))
                for y in (1.17,3.81):
                    trim.box((x+side*.12,y,0),(.10,.12,4.34),ZINC)
                marks.box((x+side*.151,2.86,-1.18),(.016,.28,1.12),CREAM)
                for y in (1.31,1.57,1.83,2.09):
                    trim.box((x+side*.074,y,d*.457),(.16,.058,.30),ZINC)
        for side in (-1,1):
            z=side*d/2
            trim.box((0,.96,z+side*.10),(.37,.24,.39),CHARCOAL,.02)
            for x in (-1.19,1.19):
                trim.cylinder((x,.98,z+side*.19),.15,.36,"z",ZINC,12)
    port.place(f"Freight wagon {index:02d}",position(box),build)
    if box["carType"]=="flat":
        for z in (-d*.24,d*.24):
            stack(port,{"x":box["x"],"z":box["z"]+z,"baseY":1.12,"w":2.6,"d":d*.43,"h":2.66,
                        "levels":1,"color":box["color"]},index*2+(z>0))


def crate(port, box):
    w,d,h=fit(box)
    paint=rgb(box["color"])
    def build(layer):
        layer().box((0,h/2,0),(w,h,d),paint)
        boards=layer("wood",True)
        hooks=layer("metal",True)
        for side in (-1,1):
            for x in (-w*.36,w*.36):
                boards.box((x,h/2,side*(d/2+.032)),(.16,h,.082),shade(WOOD,.71))
                hooks.box((x,h*.83,side*(d/2+.088)),(.083,.085,.033),ZINC)
            for y in (.16,h-.17):
                boards.box((side*(w/2+.032),y,0),(.077,.17,d),shade(WOOD,.83))
        for i in range(max(3,round(w/.45))):
            x=(i+.5)/max(3,round(w/.45))*w-w/2
            boards.box((x,h+.026,0),(.031,.047,d*.97),shade(WOOD,.68))
    port.place(f"Shipping crate {box['id']}",position(box),build)


def barrier(port, box):
    w,d,h=fit(box)
    rotated=d>w
    length,width=max(w,d),min(w,d)
    color=rgb(box["color"])
    def build(layer):
        core=layer("concrete")
        rings=[[(x,y,z) for y,z in [(0,-width/2),(0,width/2),(h*.27,width/2),
                                    (h,width*.26),(h,-width*.26),(h*.27,-width/2)]]
               for x in (-length/2,length/2)]
        core.rings(rings,color)
        warning=layer("marking",True)
        for z in (-.1,.1):
            warning.floor(0,h+.019,z,length*.91,.075,YELLOW)
        for i in range(max(2,round(length/.54))):
            x=(i+.5)/max(2,round(length/.54))*length-length/2
            warning.floor(x,h+.028,0,.158,width*.41,CHARCOAL)
    port.place(f"Traffic barrier {box['id']}",position(box),build,math.pi/2 if rotated else 0)


def gatehouse(port, box):
    w,d,h=fit(box)
    color=rgb(box["color"])
    def build(layer):
        core=layer()
        trim=layer("metal",True)
        glass=layer("glazing",True)
        core.box((0,h/2,0),(w-.11,h-.15,d-.13),color)
        core.box((0,h-.09,0),(w,.18,d),STEEL)
        for side in (-1,1):
            glass.box((0,h*.65,side*d/2),(w*.72,h*.28,.039),GLASS,.015)
            for x in (-w*.21,0,w*.21):
                trim.box((x,h*.65,side*(d/2+.025)),(.063,h*.29,.08),ZINC)
            trim.box((side*(w/2+.03),.96,0),(.069,1.87,.87),shade(color,.78))
        trim.box((0,h+.17,0),(w+.21,.19,d+.19),ZINC)
    port.place(f"Gatehouse {box['id']}",position(box),build)


def crane(port, item, index):
    h=item["height"]
    paint=shade(rgb(item["color"]),1.14)
    def build(layer):
        frame=layer("painted")
        decking=layer("painted",True)
        detail=layer("painted",True,True)
        glass=layer("glazing",True)
        hazard=layer("marking",True)
        for side in (-1,1):
            x=side*8
            for z in (-7,7):
                frame.box((x,h/2,z),(2.10,h,2.10),paint)
                frame.box((x,.64,z),(2.20,1.26,2.20),STEEL)
                for y in (1.32,8.5,h-4):
                    decking.box((x,y,z),(2.19,.21,2.19),shade(paint,.64))
            frame.box((x,h-1.24,0),(1.35,1.54,16.7),paint)
            frame.beam((x,9.6,-7),(x,h-2.01,7),.37,shade(paint,.74))
            for y in (9.6,17.5):
                detail.beam((x,y,-7),(x,y+7.3,7),.40,shade(paint,.82))
                detail.beam((x,y,7),(x,y+7.3,-7),.37,shade(paint,.79))
            decking.box((x,h-3.61,0),(2.78,.19,16.9),STEEL)
            for z in range(-8,9,2):
                decking.box((x+side*1.30,h-3.02,z),(.057,1.12,.058),YELLOW)
            for y in (h-2.46,h-3.01):
                decking.beam((x+side*1.30,y,-8),(x+side*1.30,y,8),.06,YELLOW)
            ladder_x=x+side*1.104
            for z in (6.58,7.31):
                decking.beam((ladder_x,.46,z),(ladder_x,h-3.43,z),.067,ZINC)
            for i in range(int((h-4)/.37)):
                y=.65+i*.37
                decking.beam((ladder_x,y,6.58),(ladder_x,y,7.31),.059,ZINC)
        for z in (-1.75,1.75):
            frame.box((-13,h+.27,z),(58,.83,.77),paint)
            frame.box((-13,h+2.74,z),(58,.43,.47),paint)
            for x in range(-41,15,4):
                frame.beam((x,h+.6,z),(x+3.8,h+2.59,z),.23,shade(paint,.88))
                decking.beam((x,h+.63,z),(x,h+2.56,z),.16,ZINC)
            frame.beam((-9,h+2.9,z),(-5,h+11,z),.54,paint)
            frame.beam((7,h+2.75,z),(-5,h+11,z),.51,paint)
            decking.beam((-41.5,h+2.8,z),(-5,h+11,z),.098,ZINC)
            decking.beam((15.8,h+2.8,z),(-5,h+11,z),.098,ZINC)
        frame.box((-24.15,h-1.36,0),(6.48,1.94,3.98),STEEL)
        frame.box((-24.5,h-13.5,0),(6.8,.53,2.55),YELLOW)
        for z in (-.94,.94):
            frame.beam((-21.45,h-2.23,z),(-21.45,h-13.35,z),.083,CHARCOAL)
            frame.beam((-26.85,h-2.23,z),(-26.85,h-13.35,z),.083,CHARCOAL)
        decking.box((-22.35,h-2.94,2.01),(2.86,1.84,2.13),paint,.08)
        glass.box((-22.35,h-2.80,3.096),(2.51,1.09,.041),GLASS,.02)
        glass.box((-23.82,h-2.79,2.19),(.04,1.06,1.61),shade(GLASS,1.32))
        for x in (-23.47,-22.36,-21.28):
            decking.box((x,h-2.79,3.12),(.074,1.19,.052),ZINC)
        for x in (-27.4,-26.43,-25.46,-24.49,-23.52,-22.55,-21.58):
            hazard.box((x,h-13.48,1.289),(.45,.38,.034),CHARCOAL)
        for x in (-41,-5,15):
            glass.cylinder((x,h+(11.22 if x==-5 else 3.07),1.75),.11,.14,"y",ORANGE,12)
    port.place(f"Quayside crane {index+1}",position(item),build)


def ship(port, item):
    width,length=item["w"],item["d"]
    w,l=width/2,length/2
    outline=[(0,-l),(w*.34,-l+3),(w*.64,-l+8),(w*.83,-l+15),(w,-l+27),
             (w,l-9),(w*.92,l-3),(w*.71,l),(-w*.71,l),(-w*.92,l-3),(-w,l-9),
             (-w,-l+27),(-w*.83,-l+15),(-w*.64,-l+8),(-w*.34,-l+3)]
    def build(layer):
        hull=layer("painted")
        skin=layer("painted",True)
        glass=layer("glazing",True)
        marks=layer("marking",True)
        def hull_band(profile,color):
            hull.rings([[(x*wide,y+max(0,(-z-l*.62)*.026),z*long) for x,z in outline]
                        for y,wide,long in profile],color)
        hull_band([(-3.0,.70,.95),(-1.83,.88,.98),(-.49,.985,.999)],rgb("84554a"))
        hull_band([(-.49,.985,.999),(.40,1,1),(3.53,1,1),(4.82,1.014,1.002)],rgb("36505a"))
        hull_band([(4.82,1.014,1.002),(4.96,1.014,1.002)],rgb("75807b"))
        for side in (-1,1):
            for z in range(-int(l)+25,int(l)-7,8):
                skin.box((side*w*1.001,2.58,z),(.045,.053,7.72),shade(STEEL,1.43))
            for z in range(-int(l)+27,int(l)-9,3):
                skin.cylinder((side*w*.969,5.48,z),.045,1.1,"y",ZINC,8)
            for y in (5.55,6.00):
                skin.box((side*w*.969,y,8),(.057,.060,length-49),ZINC)
            for z in (-l+23,l-7):
                skin.box((side*w*.81,5.06,z),(.67,.20,.68),STEEL)
                skin.cylinder((side*w*.81,5.30,z),.31,.46,"y",ZINC,12)
            for y in (.12,.40,.68,.96,1.24,1.52):
                marks.box((side*w*1.003,y,l*.59),(.021,.085,.26),CREAM)
        aft=l-17
        hull.box((0,8.46,aft),(width*.66,7,length*.125),rgb("aeb6aa"))
        hull.box((0,12.63,aft-.91),(width*.82,1.56,length*.105),rgb("c8cbb6"),.10)
        hull.box((0,13.49,aft-.95),(width*.86,.21,length*.110),STEEL)
        hull.box((0,14.79,aft+3.8),(3.65,2.54,4.05),rgb("956345"))
        skin.box((0,16.14,aft+3.8),(3.8,.35,4.21),CHARCOAL)
        for i in range(12):
            x=(i-5.5)*width*.065
            glass.box((x,12.76,aft-.93-length*.0525-.029),(width*.058,.78,.064),GLASS if i%4 else FROST,.017)
        for side in (-1,1):
            for y in (6.5,8.6,10.7):
                x=side*width*.335
                skin.box((x,y-.88,aft),(1.02,.11,length*.121),shade(ZINC,.72))
                for z in (-5.4,-2.7,0,2.7,5.4):
                    glass.box((x,y,aft+z),(.054,.58,.96),shade(GLASS,1.22))
                for z in (-6.2,-2.8,.7,4.3,7):
                    skin.box((x+side*.46,y-.36,aft+z),(.058,1.10,.056),ZINC)
                skin.box((x+side*.46,y+.16,aft+.25),(.070,.061,13.76),ZINC)
            skin.box((side*width*.183,16.38,aft+3.81),(.32,.65,.38),STEEL)
            skin.beam((side*width*.336,5.3,aft+6),(side*width*.336,10.7,aft+2.6),.18,ZINC,.72)
        skin.beam((0,13.59,aft-.84),(0,22.34,aft-.84),.19,ZINC)
        skin.beam((-3.6,20.31,aft-.84),(3.6,20.31,aft-.84),.12,ZINC)
        skin.box((0,21.20,aft-.84),(4.81,.235,.30),CREAM)
        skin.cylinder((1.0,15.8,aft-2.3),.95,.72,"y",CREAM,18)
        skin.box((0,5.29,-l+.80),(1.35,.66,1.05),STEEL)
        for x in (-2.15,2.15):
            skin.cylinder((x,5.26,-l+9.1),.58,.49,"y",ZINC,16)
            skin.beam((x,5.55,-l+9.1),(0,5.21,-l+1.45),.068,IRON)
    port.place("Container carrier · Hull and bridge",position(item),build)
    colors=["#8a4c39","#53757a","#ac8351","#5e7262","#85908b","#a76b53"]
    for row in range(6):
        for col in (-1,0,1):
            levels=1+(row+col*2)%3
            stack(port,{"x":item["x"]+col*4.45,"z":item["z"]-l+25+row*11.2,"baseY":4.98,
                        "w":2.60,"d":10.5,"h":levels*2.61,"levels":levels,
                        "color":colors[(row+col*2)%len(colors)]},190+row*3+col,full=(col!=0))


def grounds(port, data):
    shore,size=data["shoreX"],data["size"]
    for x0 in range(shore,323,64):
        for z0 in range(-320,320,64):
            w,d=min(64,322-x0),min(64,320-z0)
            if w<=0 or d<=0:
                continue
            def slab(layer):
                base=layer("deck",cast=False)
                joints=layer("marking",True)
                base.floor(0,0,0,w,d,shade(CONCRETE,.97+(x0+z0)%5*.017))
                for i in range(1,int(w/8)):
                    joints.floor(-w/2+i*8,.015,0,.057,d,shade(CONCRETE,.54))
                for j in range(1,int(d/8)):
                    joints.floor(0,.023,-d/2+j*8,w,.059,shade(CONCRETE,.55))
            port.place(f"Dock slab {x0}:{z0}",(x0+w/2,0,z0+d/2),slab)
    transverse=[road for road in data["roads"] if road["w"]>road["d"]]
    for index,road in enumerate(data["roads"]):
        w,d=road["w"],road["d"]
        longitudinal=d>w
        sections=[(-d/2,d/2)]
        if longitudinal:
            for cross in transverse:
                if abs(road["x"]-cross["x"])>(w+cross["w"])/2:
                    continue
                low=cross["z"]-road["z"]-cross["d"]/2
                high=low+cross["d"]
                sections=[(a,b) for left,right in sections for a,b in [(left,min(low,right)),(max(high,left),right)] if b>a]
        def paving(layer):
            pavement=layer("asphalt",cast=False)
            paint=layer("marking",cast=False)
            details=layer("marking",True)
            for a,b in sections:
                pavement.floor(0,.035,(a+b)/2,w,b-a,rgb("7b8584"))
            for cell in range(3,int(max(w,d))-4,8):
                n=cell-max(w,d)/2
                if longitudinal and not any(a+2.4<n<b-2.4 for a,b in sections):
                    continue
                if longitudinal:
                    paint.floor(0,.057,n,.105,3.55,shade(CREAM,.91))
                    for x in (-w/2+.43,w/2-.43):
                        details.floor(x,.062,n,.092,6.5,shade(CREAM,.71))
                else:
                    paint.floor(n,.057,0,3.55,.105,shade(CREAM,.91))
                    for z in (-d/2+.43,d/2-.43):
                        details.floor(n,.062,z,6.5,.092,shade(CREAM,.71))
        port.place(f"Service road {index+1}",position(road),paving)
    for z in range(-300,301,60):
        def quay(layer):
            concrete=layer("deck",cast=False)
            paint=layer("marking",cast=False)
            trim=layer("metal",True)
            concrete.box((.51,-.97,0),(1.11,1.94,60),shade(CONCRETE,.82))
            concrete.box((.313,.078,0),(.63,.156,60),shade(CONCRETE,1.11))
            paint.floor(1.45,.014,0,.145,60,YELLOW)
            for i in range(-24,26,8):
                if abs(z+i)>173:
                    continue
                trim.cylinder((.88,.30,i),.105,.59,"y",STEEL,12)
                trim.box((.88,.625,i),(.43,.122,.24),STEEL,.045)
                trim.tube((-.21,-.82,i),[(-.14,.42),(-.075,.52),(.075,.52),(.14,.42)],"x",RUBBER,16)
                trim.box((-.14,-.22,i),(.13,.32,1.06),IRON)
        port.place("Quay wall and bollards",(shore,0,z),quay)
    for side in (-1,1):
        z=side*(size/2+1)
        for x in range(180,-141,-48):
            w=min(48,x+142)
            def fence(layer):
                base=layer()
                wire=layer("metal",True)
                for y in (.20,2.25):
                    base.box((0,y,0),(w,.067,.078),ZINC)
                for i in range(1,w,5):
                    base.box((-w/2+i,1.24,0),(.105,2.48,.107),IRON)
                for i in range(2,w-1,2):
                    wire.beam((-w/2+i,.23,0),(-w/2+i+1.05,2.21,0),.015,ZINC)
            port.place("Perimeter fence",(x-w/2,0,z),fence)


def railroad(port, item):
    dock=item.get("quayTrack",False)
    span=352 if dock else 440
    gauge=.54 if dock else 1.43
    for start in range(-span//2,span//2,44):
        length=min(44,span//2-start)
        def track(layer):
            steel=layer("metal",cast=False)
            ties=layer("wood",True)
            metal=layer("metal",True)
            for side in (-1,1):
                steel.box((side*gauge/2,.082,0),(.092,.103,length),IRON)
                metal.box((side*gauge/2,.155,0),(.095,.041,length),ZINC)
            if not dock:
                for i in range(1,length,2):
                    ties.box((0,.05,i-length/2),(2.55,.082,.264),shade(WOOD,.60+i%3*.1))
                    for x in (-gauge/2,gauge/2):
                        metal.box((x,.108,i-length/2),(.28,.067,.36),CHARCOAL)
        x,y,z=position(item)
        port.place("Freight rail",(x,y,z+start+length/2),track)


def backdrop(port):
    for index,z in enumerate((-44,-15,14,43)):
        def tank(layer):
            core=layer()
            trim=layer("metal",True)
            core.tube((0,0,0),[(0,8),(11.5,8),(12.4,6.8)],"y",rgb("87948c"),20)
            trim.cylinder((0,11.9,0),7.85,.21,"y",ZINC,24)
            for x in (-.9,.9):
                trim.beam((-7.96,.22,x),(-7.96,12.4,x),.13,ZINC)
            for y in range(1,13):
                trim.beam((-8.05,y,-.9),(-8.05,y,.9),.07,STEEL)
            trim.tube((-1,0,2),[(12.3,.38),(15.5,.38)],"y",RUST,12)
        port.place(f"Shore storage tank {index+1}",(231,0,z),tank)
    for i,z in enumerate((-134,-102,88,121)):
        for j,x in enumerate((198,215,233)):
            stack(port,{"x":x,"z":z,"w":12.2,"d":2.6,"h":(2+i%2)*2.66,"levels":2+i%2,
                        "color":["#657876","#745c52","#797a60","#957e55"][i]},270+i*3+j,full=False)


def main(source):
    data=json.loads((source/"port.json").read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system="METRIC"
    port=Port()
    grounds(port,data)
    for i,box in enumerate(data["boxes"]):
        kind=box["kind"]
        if kind=="port-container": stack(port,box,i)
        elif kind in ("port-wall","port-lintel"): warehouse_wall(port,box)
        elif kind=="port-rack": rack(port,box)
        elif kind=="port-forklift": forklift(port,box)
        elif kind=="port-railcar": railcar(port,box,i)
        elif kind=="truck": truck(port,box)
        elif kind=="crate": crate(port,box)
        elif kind=="barrier": barrier(port,box)
        elif kind=="kiosk": gatehouse(port,box)
    for building in data["structures"]:
        warehouse(port,building)
    for i,item in enumerate(data["cranes"]):
        crane(port,item,i)
    for item in data["railTracks"]:
        railroad(port,item)
    ship(port,data["ship"])
    backdrop(port)
    for level,name in enumerate(("base","detail")):
        port.export(level,source/(name+".glb"))
    preview=bpy.data.collections.new("Port · Water reference")
    bpy.context.scene.collection.children.link(preview)
    water=Mesh()
    water.floor(data["shoreX"]-300,-1.60,0,600,650,rgb("456b76"))
    mesh_object(water,"Harbour water",preview,"glazing",False)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                view=area.spaces.active
                view.shading.color_type="VERTEX"
                view.clip_end=2000
                view.region_3d.view_location=(-22,0,3)
                view.region_3d.view_distance=280
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"port-rubezh.blend"),compress=True)
    runtime=REPO/"src"/"assets"/"port"
    runtime.mkdir(parents=True,exist_ok=True)
    manifest={"layout":data["layout"],"baseChunks":sum(key[0]==0 for key in port.export_batches),
              "detailChunks":sum(key[0]==1 for key in port.export_batches)}
    (runtime/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    main(Path(sys.argv[sys.argv.index("--")+1]).resolve())
