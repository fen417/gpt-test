"""Author the industrial kits in metres and export their high-detail meshes."""
import json
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / "port"))
from build_port import Mesh, mesh_object, rgb, shade

IRON = rgb("515c56")
EDGE = rgb("838e83")
ZINC = rgb("aaa698")
RUBBER = rgb("343837")
RUST = rgb("936148")
GOLD = rgb("d1a254")
CREAM = rgb("c7bb92")
TEAL = rgb("5d8079")
RED = rgb("9e5c44")

PAINTS = {"transfer": "807c55", "crusher": "986e4d", "pump": "59796e", "service": "7a7759"}
LETTERS = {
    "0": ("111","101","101","101","111"),
    "1": ("010","110","010","010","111"),
    "2": ("111","001","111","100","111"),
    "3": ("111","001","111","001","111"),
    "4": ("101","101","111","001","001"),
    "P": ("110","101","110","100","100"),
}


def mark(mesh, text, x, y, z, side, cell):
    for index, char in enumerate(text):
        for row, line in enumerate(LETTERS[char]):
            for col, value in enumerate(line):
                if value == "1":
                    px = x + side * ((index * 4 + col) - (4 * len(text) - 2) / 2) * cell
                    mesh.box((px, y + (2 - row) * cell, z), (cell * .94, cell * .94, .012), CREAM)


def frame(trim, paint, centre, axis, width, top):
    x, z = centre
    def piece(u, y, v, horizontal, height, depth, color):
        if axis == "x":
            trim.box((x+u,y,z+v),(horizontal,height,depth),color,.018)
        else:
            trim.box((x+v,y,z+u),(depth,height,horizontal),color,.018)
    for side in [-1, 1]:
        piece(side*(width/2+.11),top/2,0,.17,top,.52,IRON)
        piece(side*(width/2+.22),.78,0,.09,1.35,.57,GOLD)
    piece(0,top+.10,0,width+.5,.17,.55,paint)
    piece(0,top+.25,0,width+.54,.055,.57,EDGE)


def shell_detail(name, kit, trim, equipment):
    w, d, h = (kit[key] for key in ("w","d","h"))
    paint = rgb(PAINTS[name])
    for side, key in [(1,"front"),(-1,"back")]:
        door = kit[key]
        z = (d/2-.22)*side
        frame(trim,paint,(door["at"],z),"x",door["width"],door["top"])
        for j in [-1,1]:
            x = j*(w/2-.7)
            trim.box((x,h/2,side*(d/2+.028)),(.24,h-.24,.15),paint,.02)
            trim.box((x,h*.71,side*(d/2+.113)),(.28,.19,.048),EDGE,.012)
        header = min(h-.58,door["top"]+.66)
        trim.box((door["at"],header,side*(d/2+.04)),(1.72,.57,.10),shade(paint,.55),.016)
        mark(trim,"P0"+str(list(PAINTS).index(name)+1),door["at"],header,side*(d/2+.098),side,.08)
        window=kit.get(key+"Light")
        if window:
            for y in (window["sill"]-.045,window["top"]+.045):
                trim.box((window["at"],y,z),(window["width"]+.2,.12,.53),paint,.018)
            for x in [window["at"]-window["width"]/2,window["at"],window["at"]+window["width"]/2]:
                trim.box((x,(window["top"]+window["sill"])/2,z),
                         (.12,window["top"]-window["sill"],.49),EDGE,.016)
        for j in [-1,1]:
            a = -w/2+.78 if j < 0 else door["at"]+door["width"]/2+.38
            b = door["at"]-door["width"]/2-.38 if j < 0 else w/2-.78
            if b-a > .4:
                trim.box(((a+b)/2,.69,side*(d/2+.01)),(b-a,.30,.034),paint)
                trim.box(((a+b)/2,h-.55,side*(d/2+.016)),(b-a,.24,.07),IRON,.015)
    front=kit["front"]
    trim.box((front["at"],front["top"]+.20,d/2+1.91),(front["width"]+.97,.23,.10),paint,.018)
    for x in [front["at"]-front["width"]/2-.24,front["at"]+front["width"]/2+.24]:
        trim.beam((x,front["top"]+1.01,d/2+.05),(x,front["top"]+.29,d/2+1.78),.075,IRON)
    door = kit["side"]
    frame(trim,paint,(w/2-.22,door["at"]),"z",door["width"],door["top"])
    for y in (1.05,2.73):
        trim.box((-w/2-.03,y,-2.4),(.14,.16,3.6),EDGE,.02)
    for z in (-4.13,-.67):
        trim.box((-w/2-.03,1.9,z),(.125,1.5,.14),IRON,.019)
    for side in [-1,1]:
        trim.box((side*(w/2+.27),h+.16,0),(.17,.24,d+.65),paint,.02)
        trim.box((0,h+.17,side*(d/2+.27)),(w+.7,.25,.16),paint,.02)
        trim.cylinder((side*(w/2+.11),h/2,side*(d/2-.95)),.079,h-.32,"y",RUST,8)
    # Rafters and enamel fixture strips sit above the navigable door volume.
    for z in [-d*.33,0,d*.33]:
        trim.box((0,h-.32,z),(w-.92,.28,.22),IRON,.017)
        trim.box((0,h-.48,z),(w-.92,.054,.41),EDGE,.014)
        for x in [-w*.27,w*.27]:
            trim.beam((x,h-.52,z),(x,h-.81,z),.036,IRON)
            trim.box((x,h-.85,z),(1.58,.14,.34),IRON,.036)
            trim.box((x,h-.928,z),(1.22,.036,.21),CREAM,.014)
    for x,z in [(-w*.28,-d*.30),(w*.30,d*.29)]:
        equipment.box((x,h+.53,z),(1.8,.50,1.22),paint,.055)
        equipment.box((x,h+.82,z),(1.92,.14,1.34),ZINC,.032)
        for j in range(5):
            trim.box((x,h+.46+j*.069,z+.619),(1.42,.031,.025),IRON)
    for x in [-w*.22,0,w*.22]:
        trim.box((x,h+.294,0),(.105,.045,d-.2),EDGE,.012)
    for side,door in [(1,kit["front"]),(-1,kit["back"])]:
        for j in [-1,1]:
            x = door["at"]+j*(door["width"]/2-.33)
            trim.box((x,.046,side*(d/2-.95)),(.075,.013,1.8),GOLD)
            trim.box((x,.048,side*(d/2-1.83)),(.37,.014,.075),GOLD)


def fixture_detail(fixture, trim, equipment, paint):
    x, z, w, d, h, floor = (fixture[key] for key in ("x","z","w","d","h","baseY"))
    top, near, far = floor+h, z+d/2, z-d/2
    name = fixture["model"]
    trim.box((x,top+.046,z),(w+.11,.096,d+.11),paint,.026)
    for face in [-1,1]:
        depth = z+face*(d/2+.018)
        trim.box((x,floor+.16,depth),(w,.22,.04),RUBBER,.01)
        for j in [-1,1]:
            trim.box((x+j*(w/2-.08),floor+h/2,depth),(.13,h,.045),IRON,.012)
    if name in ("lockers","panels","separator"):
        count = 5 if name=="lockers" else 4
        pitch = w/count
        for i in range(count):
            px = x-w/2+pitch*(i+.5)
            trim.box((px,floor+h/2,near+.051),(pitch-.09,h-.29,.097),shade(paint,.76+i*.085),.022)
            for j in range(4):
                trim.box((px,top-.19-j*.06,near+.106),(pitch*.57,.023,.024),RUBBER,.003)
            trim.box((px+pitch*.22,floor+h*.54,near+.123),(.043,.25,.062),ZINC,.008)
            if name=="panels":
                trim.box((px,floor+h*.70,near+.114),(pitch*.58,.26,.052),RUBBER,.012)
                for j,color in [(-1,RED),(0,GOLD),(1,TEAL)]:
                    trim.cylinder((px+j*.12,floor+h*.70,near+.148),.039,.028,"z",color,8)
        if name=="separator":
            equipment.box((x,top+.24,z),(w+.35,.37,d+.25),IRON,.075)
    elif name in ("mill","pumps"):
        for i in [-1,0,1]:
            px = x+i*w*.29
            radius = min(.66,d*.24)
            equipment.cylinder((px,top+.23,z),radius,.38,"z",IRON,12)
            equipment.cylinder((px,top+.23,z+.22),radius*.82,.12,"z",RUST,12)
            equipment.cylinder((px,top+.23,z+.294),radius*.53,.10,"z",ZINC,10)
            for j in range(8):
                angle = j*math.tau/8
                trim.cylinder((px+math.cos(angle)*radius*.7,top+.23+math.sin(angle)*radius*.7,z+.29),
                              .025,.035,"z",RUBBER,6)
            trim.box((px,floor+h*.45,near+.062),(w*.25,h*.5,.164),shade(paint,.78),.021)
        equipment.cylinder((x,top+.27,far+.38),.13,w*.89,"x",TEAL,10)
        for i in [-1,1]:
            equipment.cylinder((x+i*w*.40,top+.155,far+.38),.14,.31,"y",RUST,10)
    elif name in ("freight","shelves"):
        for i in range(3):
            px=x+(i-1)*w/3
            for height in (floor+.28,top-.27):
                trim.box((px,height,near+.039),(w/3-.16,.12,.085),ZINC,.013)
            trim.box((px,top-.43,near+.059),(.27,.14,.046),CREAM,.01)
        for i in [-1,0,1]:
            trim.box((x+i*w*.32,top+.104,z),(.11,.06,d+.13),RUST,.012)
        if name=="shelves":
            for side in [-1,1]:
                trim.beam((x-w*.48,floor+.22,z+side*(d/2+.047)),
                          (x+w*.48,top-.07,z+side*(d/2+.047)),.065,IRON)
    else:
        for i in range(5):
            px=x+(i-2)*w*.185
            trim.box((px,floor+h*.54,near+.044),(w*.17,.21,.055),shade(paint,.72+i*.1),.014)
            trim.box((px,floor+h*.56,near+.09),(.19,.04,.06),ZINC,.008)
        equipment.box((x+w*.27,top+.14,z),(.44,.26,.45),IRON,.04)
        equipment.cylinder((x+w*.27,top+.27,z),.078,.67,"x",RUST,8)


def collection(name, linked=True):
    result = bpy.data.collections.new(name)
    if linked:
        bpy.context.scene.collection.children.link(result)
    return result


def box_mesh(parts):
    meshes = {}
    for part in parts:
        mesh = meshes.setdefault(part.get("material","concrete"),Mesh())
        mesh.box((part["x"],part["baseY"]+part["h"]/2,part["z"]),
                 (part["w"],part["h"],part["d"]),rgb(part["color"]),0)
    return meshes


def map_reference(data, templates):
    terrain=collection("Ground and road layout")
    size, cell = data["size"], data["cell"]
    count = size//cell+1
    vertices = [(ix*cell-size/2,size/2-iz*cell,data["heights"][iz*count+ix])
                for iz in range(count) for ix in range(count)]
    faces = [(i,i+count,i+count+1,i+1) for i in range(count*count-count) if i%count!=count-1]
    mesh = bpy.data.meshes.new("Map elevation")
    mesh.from_pydata(vertices,[],faces)
    ground = bpy.data.objects.new("Map elevation",mesh)
    terrain.objects.link(ground)
    for name,color in [("Gravel and scree","b9a385"),("Haul road","817962")]:
        mat=bpy.data.materials.new(name)
        mat.diffuse_color=(*rgb(color),1)
        mesh.materials.append(mat)
    roads=[(r,math.cos(r["yaw"]),math.sin(r["yaw"])) for r in data["roads"]]
    mesh.update()
    for face in mesh.polygons:
        x,y,_=face.center
        for road,c,s in roads:
            dx,dz=x-road["x"],-y-road["z"]
            lateral,longitudinal=dx*c-dz*s,dx*s+dz*c
            beyond=max(0,abs(longitudinal)-(road["d"]-road["w"])/2)
            if lateral*lateral+beyond*beyond<(road["w"]/2)**2:
                face.material_index=1
                break
    sites=collection("Quarry buildings")
    for site in data["structures"]:
        if "quarryKit" not in site:
            continue
        obj=bpy.data.objects.new(site["id"],None)
        sites.objects.link(obj)
        obj.instance_type="COLLECTION"
        obj.instance_collection=templates[site["quarryKit"]]
        obj.location=(site["x"],-site["z"],site["baseY"])
        obj.rotation_euler.z=site["quarryFacing"]
    yards=collection("Yards and field cover")
    supports={f"structure:{s['id']}" for s in data["structures"] if "quarryKit" in s}
    for surface,mesh in box_mesh(p for p in data["boxes"] if p.get("editorParent") not in supports).items():
        mesh_object(mesh,"Placement envelopes",yards,surface,False)
    for point in data["points"]:
        obj=bpy.data.objects.new("Sector "+point["id"],None)
        obj.empty_display_type="CIRCLE"
        obj.empty_display_size=6
        obj.location=(point["x"],-point["z"],point["y"]+.12)
        terrain.objects.link(obj)


def main(source, output):
    data=json.loads(source.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.context.scene.unit_settings.system="METRIC"
    templates={}
    detail_objects=[]
    export=collection("Export")
    for name,kit in data["kits"].items():
        template=templates[name]=collection(name.title(),False)
        trim, equipment=Mesh(),Mesh()
        shell_detail(name,kit,trim,equipment)
        for part in kit["parts"]:
            if part.get("model"):
                fixture_detail(part,trim,equipment,rgb(PAINTS[name]))
        for surface, mesh in box_mesh(kit["parts"]).items():
            mesh_object(mesh,"Playable shell",template,surface,True)
        for label, mesh, cast in [("Panels, beams and hardware",trim,False),("Roof and machinery accents",equipment,True)]:
            mesh_object(mesh,label,template,"metal",cast)
            runtime=mesh_object(mesh,name+"-"+("equipment" if cast else "trim"),export,"metal",cast,False)
            runtime["quarryKit"]=name
            runtime["quarryCaster"]=cast
            detail_objects.append(runtime)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in detail_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",use_selection=True,export_extras=True,
                             export_materials="NONE",export_vertex_color="ACTIVE",
                             export_meshopt_compression_enable=False)
    for obj in detail_objects:
        mesh=obj.data
        bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.meshes.remove(mesh)
    bpy.data.collections.remove(export)
    map_reference(data,templates)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                area.spaces.active.clip_end=3000
                area.spaces.active.region_3d.view_distance=480
                area.spaces.active.shading.color_type="MATERIAL"
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"quarry-pass.blend"),compress=True)


if __name__=="__main__":
    source,output=map(Path,sys.argv[sys.argv.index("--")+1:])
    main(source.resolve(),output.resolve())
