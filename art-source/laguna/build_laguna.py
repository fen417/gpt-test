"""Build the editable Laguna scene and the two runtime map layers."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE.parent/"port"))
from build_port import Mesh, rgb, shade

SLATE=rgb("51595a")
DARK=rgb("343e40")
TEAL=rgb("497173")
WATER=rgb("41858c")
DAMP=rgb("507d80")
MINT=rgb("9aa99d")
TAN=rgb("b7ad93")
STEEL=rgb("555f5d")
ZINC=rgb("8f9996")
ORANGE=rgb("b76340")
WOOD=rgb("8b745c")
LAMP=rgb("f4d6a0")
RUBBER=rgb("3e4947")
TILE={"concrete":5.8,"ceramic":4,"metal":3.4,"wood":1.3,"lamp":2,"water":3,"skylight":4}
FONT={
    "Л":[((-.33,0),(-.19,1)),((-.19,1),(.23,1)),((.23,1),(.23,0))],
    "А":[((-.33,0),(0,1)),((0,1),(.33,0)),((-.21,.36),(.21,.36))],
    "Г":[((-.27,0),(-.27,1)),((-.27,1),(.29,1))],
    "У":[((-.30,1),(0,.53)),((.31,1),(-.21,0))],
    "Н":[((-.29,0),(-.29,1)),((.29,0),(.29,1)),((-.29,.49),(.29,.49))],
}


def surface_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat=bpy.data.materials.new(name)
    graph=mat.node_tree
    shader=graph.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value={"metal":.62,"ceramic":.81,"water":.25}.get(name,.88)
    shader.inputs["Metallic"].default_value=.22 if name=="metal" else 0
    colors=graph.nodes.new("ShaderNodeVertexColor")
    colors.layer_name="Paint"
    folder="laguna" if name in ("ceramic","water") else "surfaces"
    texture=REPO/"src"/"assets"/folder/("ripples.webp" if name=="water" else name+".webp")
    if texture.exists():
        image=graph.nodes.new("ShaderNodeTexImage")
        image.image=bpy.data.images.load(str(texture),check_existing=True)
        image.image.pack()
        mix=graph.nodes.new("ShaderNodeMixRGB")
        mix.blend_type="MULTIPLY"
        mix.inputs[0].default_value=1
        graph.links.new(colors.outputs["Color"],mix.inputs[1])
        graph.links.new(image.outputs["Color"],mix.inputs[2])
        graph.links.new(mix.outputs[0],shader.inputs["Base Color"])
    else:
        graph.links.new(colors.outputs["Color"],shader.inputs["Base Color"])
    if name in ("water","skylight"):
        shader.inputs["Alpha"].default_value=.52 if name=="water" else .35
    if name=="lamp":
        graph.links.new(colors.outputs["Color"],shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value=.28
    return mat


def mesh_object(mesh,name,collection,surface,cast,editable):
    obj=mesh.object(name,collection)
    obj["lagunaSurface"]=surface
    obj["lagunaCaster"]=cast
    uv=obj.data.uv_layers.active
    uv.name="Surface"
    scale=TILE[surface]
    if surface in ("ceramic","water"):
        # The sloped pool is a thin surface. Reorient its upward faces after
        # Blender's closed-volume normal recalculation.
        for face in obj.data.polygons:
            if face.normal.z<-.5 and (surface=="water" or all(abs(obj.data.vertices[i].co.x)<5.701 and
                                         obj.data.vertices[i].co.z<=.019 for i in face.vertices)):
                face.flip()
        obj.data.update()
    for face in obj.data.polygons:
        nx,nz,ny=face.normal
        for index in face.loop_indices:
            x,z,y=obj.data.vertices[obj.data.loops[index].vertex_index].co
            u,v=(x,-z) if abs(ny)>.6 else ((-z,y) if abs(nx)>abs(nz) else (x,y))
            uv.uv[index].vector=(u/scale,v/scale)
    if editable:
        obj.data.materials.append(surface_material(surface))
    return obj


class LayeredMap:
    def __init__(self,titles,make_object,grids=(30,18)):
        self.source=[]
        self.make_object=make_object
        self.grids=grids
        for title in titles:
            collection=bpy.data.collections.new(title)
            bpy.context.scene.collection.children.link(collection)
            self.source.append(collection)
        self.batches={}

    def place(self,name,x,z,build):
        parts={}
        def layer(surface="concrete",detail=False,cast=True):
            return parts.setdefault((detail,surface,cast),Mesh())
        build(layer)
        for (detail,surface,cast),mesh in parts.items():
            if not mesh.faces:
                continue
            self.make_object(mesh,name+" · "+surface,self.source[detail],surface,cast,True)
            grid=self.grids[detail]
            sector=(detail,surface,cast,math.floor((x+10)/grid),math.floor((z+10)/grid))
            self.batches.setdefault(sector,Mesh()).extend(mesh,(0,0,0),0)

    def export(self,tier,path,extra=()):
        collection=bpy.data.collections.new("Runtime geometry")
        bpy.context.scene.collection.children.link(collection)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in extra:
            obj.select_set(True)
        for (detail,surface,cast,x,z),mesh in self.batches.items():
            if detail==tier:
                self.make_object(mesh,f"{surface}-{x}-{z}-{int(cast)}",collection,surface,cast,False).select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
                                  export_extras=True,export_materials="NONE",export_vertex_color="ACTIVE",
                                  export_meshopt_compression_enable=False)
        for obj in list(collection.objects):
            mesh=obj.data
            bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.meshes.remove(mesh)
        bpy.data.collections.remove(collection)


def block(laguna,p):
    x,z,w,d,h,y=(p[key] for key in ("x","z","w","d","h","baseY"))
    role=p["kind"].removeprefix("laguna-")
    paint=rgb(p["color"])
    long_x=w>d
    def build(layer):
        clad=layer("ceramic" if role=="lining" else "concrete")
        clad.box((x,y+h/2,z),(w,h,d),paint)
        if role in ("shell","red","blue","gallery") and h>1.1:
            # The dark tile band adds contrast to the vertical planes at both settings.
            tile=layer("ceramic",cast=False)
            band=shade(paint,.61)
            for sign in [-1,1]:
                if long_x:
                    tile.box((x,y+.43,z+sign*(d/2+.012)),(w-.024,.78,.015),band)
                else:
                    tile.box((x+sign*(w/2+.012),y+.43,z),(.015,.78,d-.024),band)
        if role in ("red","blue") and not long_x and d>2:
            frame=layer("metal",True,False)
            for sign in [-1,1]:
                face=x+sign*(w/2+.026)
                frame.box((face,y+h-.34,z),(.067,.14,d-.44),shade(paint,.77),.014)
                for pos in [-d/2+.26,d/2-.26]:
                    frame.box((face,y+h/2,z+pos),(.08,h-.14,.16),shade(paint,.77),.012)
        if role in ("column","roof") and y>3:
            layer("metal").box((x,y+.018,z),(w+.015,.075,d+.016),DARK,.006)
        if role=="bench":
            wood=layer("wood",True,False)
            for i in range(5):
                span=(d-.12)/5
                wood.box((x,y+h+.041,z-d/2+.06+(i+.5)*span),(w-.035,.091,span-.022),WOOD,.014)
            for side in [-1,1]:
                wood.box((x,y+h-.035,z+side*(d/2-.035)),(w-.13,.14,.075),shade(WOOD,.8),.011)
        if p["id"].startswith("laguna-lockers"):
            steel=layer("metal",True,False)
            side=-1 if x>0 else 1
            for index in range(9):
                pz=z-d/2+.30+index*.60
                xx=x+side*(w/2+.015)
                steel.box((xx,y+h*.5,pz),(.06,h-.19,.55),shade(paint,.65+index%3*.075),.016)
                steel.box((xx+side*.037,y+h*.50,pz+.135),(.065,.12,.045),ZINC,.008)
                for row in range(3):
                    steel.box((xx+side*.031,y+h-.24-row*.052,pz),(.027,.018,.32),DARK)
        if role=="service":
            metal=layer("metal",True,True)
            front=1 if z<0 else -1
            pz=z+front*(d/2+.018)
            metal.box((x,y+h*.56,pz),(w*.76,h*.71,.09),STEEL,.026)
            for row in range(9):
                metal.box((x,y+.51+row*.14,pz+front*.049),(w*.65,.041,.036),DARK,.008)
            for i in [-1,0,1]:
                xx=x+i*.86
                metal.cylinder((xx,y+h+.26,z),.18,.52,"y",TEAL,12)
                metal.cylinder((xx,y+h+.52,z),.26,.12,"y",ZINC,12)
                metal.box((xx,y+h-.12,pz+front*.063),(.31,.10,.06),ORANGE,.012)
    laguna.place(p["id"],x,z,build)


def deck(laguna,data):
    limit=25.22
    profiles=data["floorSections"]
    pools=data["pools"]
    xs=sorted({-limit,limit,-12.5,12.5,-.8,.8,*(s[k] for s in profiles for k in ("minX","maxX"))})
    zs=sorted({-limit,limit,-16.1,16.1,*(s[k] for s in profiles for k in ("minZ","maxZ"))})
    for x0,x1 in zip(xs,xs[1:]):
        for z0,z1 in zip(zs,zs[1:]):
            x,z=(x0+x1)/2,(z0+z1)/2
            if any(p["minX"]<x<p["maxX"] and p["minZ"]<z<p["maxZ"] for p in profiles):
                continue
            def build(layer):
                if abs(x)>12.5:
                    color=rgb("7a7e73")
                elif abs(z)>16.1:
                    color=rgb("7c8278")
                else:
                    color=rgb("8b8d7f")
                layer("ceramic",cast=False).floor(x,0,z,x1-x0,z1-z0,color)
            laguna.place("Deck",x,z,build)
    for section in profiles:
        x0,x1,z0,z1,y0,y1=(section[key] for key in ("minX","maxX","minZ","maxZ","y0","y1"))
        def build(layer):
            ceramic=layer("ceramic",cast=False)
            ceramic.add([(x0,y0,z0),(x0,y1,z1),(x1,y1,z1),(x1,y0,z0)],[(0,1,2,3)],DAMP)
            for x in [-3.64,-1.22,1.22,3.64]:
                ceramic.add([(x-.047,y0+.007,z0),(x-.047,y1+.007,z1),
                             (x+.047,y1+.007,z1),(x+.047,y0+.007,z0)],[(0,1,2,3)],DARK)
        laguna.place("Pool floor and training lanes",0,(z0+z1)/2,build)
    for pool in pools:
        x,z,w,d,y=(pool[key] for key in ("x","z","w","d","waterY"))
        def build(layer):
            layer("water",cast=False).floor(x,y,z,w,d,WATER)
            stone=layer("concrete")
            lanes=layer("ceramic",True,False)
            for split in [-2.7,0,2.7]:
                start,end=z-d/2+.59,z+d/2-.59
                lanes.cylinder((x+split,y+.046,z),.014,end-start,"z",ZINC,6)
                for i in range(23):
                    float_z=start+(end-start)*(i+.5)/23
                    color=ORANGE if i<3 or i>19 else MINT if i%2==0 else TEAL
                    lanes.cylinder((x+split,y+.054,float_z),.068,.145,"z",color,8)
            for side in [-1,1]:
                stone.box((x+side*(w/2+.21),.012,z),(.38,.066,d),MINT,.01)
                stone.box((x,.018,z+side*(d/2+.13)),(w+.8,.049,.26),MINT,.008)
                rail=layer("metal",True,True)
                xr=x+side*(w/2+.17)
                for zz in [z-d/2+.78,z+d/2-.78]:
                    rail.cylinder((xr,.39,zz),.033,.78,"y",ZINC,10)
                    rail.cylinder((xr,.045,zz),.081,.072,"y",STEEL,12)
                for zz in [z-d/2+.78,z+d/2-.78]:
                    a=1 if zz<z else -1
                    rail.beam((xr,.78,zz),(xr,.78-a*.08,zz+a*.70),.061,ZINC)
                    rail.beam((xr,.78-a*.08,zz+a*.70),(xr,.72,zz+a*1.12),.061,ZINC)
                gutter=layer("metal",True,False)
                gutter.box((x+side*(w/2+.53),.013,z),(.122,.028,d),DARK,.005)
                for i in range(36):
                    zz=z-d/2+(i+.5)*d/36
                    gutter.box((x+side*(w/2+.53),.029,zz),(.119,.009,.095),STEEL)
        laguna.place("Basin rim, water and safety handles",x,z,build)


def letters(mesh,sign,y):
    text="ЛАГУНА"
    depth=sign*24.515
    direction=-sign
    for i,char in enumerate(text):
        x=direction*(i-(len(text)-1)*.5)*1.1
        for (a,b),(c,d) in FONT[char]:
            mesh.beam((x+direction*a,y+b*.76,depth),(x+direction*c,y+d*.76,depth),.109,TAN,.066)


def fixtures(laguna):
    for sign in [-1,1]:
        def end_wall(layer):
            base=layer("metal",False,False)
            pz=sign*24.60
            base.box((0,3.53,pz),(7.45,1.36,.10),DARK,.031)
            base.box((0,2.90,pz-sign*.06),(7.25,.066,.05),TEAL,.009)
            letters(layer("lamp",False,False),sign,3.12)
            overhead=layer("metal",True,True)
            for x in [-10.5,10.5]:
                overhead.box((x,4.02,pz),(4.0,.82,.28),DARK,.03)
                for i in range(7):
                    overhead.box((x,3.71+i*.096,pz-sign*.169),(3.69,.032,.07),STEEL,.007)
        laguna.place("Laguna end wall and air registers",0,sign*24.6,end_wall)
        for z in [-20.2,-15,15,20.2]:
            def side_gallery(layer):
                x=sign*18.4
                metal=layer("metal",True,True)
                metal.cylinder((x,3.76,z),.12,2.7,"z",TEAL,12)
                for j in [-1,1]:
                    metal.cylinder((x,3.76,z+j*.33),.15,.10,"z",ZINC,12)
                    metal.box((x,3.87,z+j*.67),(.11,.13,.11),STEEL,.013)
                metal.box((x+sign*2.9,3.79,z),(.43,.14,2.46),DARK,.025)
                lens=layer("lamp",True,False)
                lens.box((x+sign*2.9,3.71,z),(.28,.029,2.16),LAMP,.012)
            laguna.place("Gallery ventilation and lighting",sign*18.4,z,side_gallery)
        for z in [sign*-6.1,sign*6.1]:
            def safety(layer):
                metal=layer("metal",True,False)
                xx=sign*12.463
                metal.box((xx,1.32,z),(.05,.78,.81),DARK,.018)
                ring=layer("ceramic",True,False)
                # Small rescue ring fixed to the arcade wall, above eye level crouched.
                vertices=[]
                for k in range(20):
                    a=k*math.tau/20
                    vertices.extend((xx-sign*(.105+.046*math.cos(b)),
                                   1.33+(.255+.046*math.sin(b))*math.cos(a),
                                   z+(.255+.046*math.sin(b))*math.sin(a))
                                   for b in (j*math.tau/6 for j in range(6)))
                faces=[(i*6+j,((i+1)%20)*6+j,((i+1)%20)*6+(j+1)%6,i*6+(j+1)%6)
                       for i in range(20) for j in range(6)]
                ring.add(vertices,faces,ORANGE)
            laguna.place("Rescue station",sign*12.45,z,safety)
        def gallery_sign(layer):
            x=sign*12.45
            metal=layer("metal",False,False)
            z=sign*6
            metal.box((x,3.27,z),(.10,.53,2.8),DARK,.019)
            mark=layer("lamp",False,False)
            mark.box((x-sign*.059,3.27,z),(.022,.05,2.46),MINT,.008)
            for j in [-1,1]:
                mark.box((x-sign*.059,3.27,z+j*1.12),(.024,.25,.063),TAN,.008)
        laguna.place("Gallery wayfinding band",sign*12.45,sign*6,gallery_sign)
    for z in [-15,-3.1,3.1,15]:
        def across(layer):
            metal=layer("metal",True,True)
            metal.box((0,4.81,z),(20.65,.15,.20),STEEL,.012)
            for k in [-8,-5,-2,2,5,8]:
                metal.beam((k-.24,4.88,z),(k+.50,5.32,z),.075,TEAL)
                metal.box((k,4.65,z),(.71,.15,.27),DARK,.018)
                lamp=layer("lamp",True,False)
                lamp.box((k,4.562,z),(.56,.042,.18),LAMP,.012)
        laguna.place("Overhead lighting bridge",0,z,across)
    for x in [-8.25,8.25]:
        def spine(layer):
            steel=layer("metal",True,True)
            for dx in [-1.90,1.90]:
                steel.box((x+dx,5.305,0),(.14,.17,30.0),TEAL,.016)
            for z in [-15,-11,-7,-3.1,0,3.1,7,11,15]:
                steel.box((x,5.305,z),(3.9,.14,.145),STEEL,.008)
            lens=layer("skylight",True,False)
            for start,end in [(-15,-11),(-11,-7),(-7,-3.1),(-3.1,0),(0,3.1),(3.1,7),(7,11),(11,15)]:
                lens.floor(x,5.295,(start+end)/2,3.72,end-start-.07,MINT)
        laguna.place("Skylight framing",x,0,spine)


def main(source,output):
    data=json.loads(source.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    laguna=LayeredMap(("01 · Decks, pools and structures","02 · Lighting, lockers and mechanical detail"),mesh_object)
    for box in data["boxes"]:
        block(laguna,box)
    deck(laguna,data)
    fixtures(laguna)
    laguna.export(False,output/"base.glb")
    laguna.export(True,output/"detail.glb")
    camera_data=bpy.data.cameras.new("Map selection")
    camera=bpy.data.objects.new("Map selection",camera_data)
    scene.collection.objects.link(camera)
    eye,target=[Vector((x,-z,y)) for x,y,z in (data["menuView"]["eye"],data["menuView"]["target"])]
    camera.location=eye
    camera.rotation_euler=(target-eye).to_track_quat("-Z","Y").to_euler()
    camera_data.angle=math.radians(data["menuView"]["fov"])
    camera_data.clip_start=.12
    scene.camera=camera
    world=bpy.data.worlds.new("Overcast daylight")
    scene.world=world
    background=world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value=(*rgb("9bafb4"),1)
    background.inputs["Strength"].default_value=.72
    lamp=bpy.data.lights.new("Aquatic centre daylight","SUN")
    lamp.energy=2.49
    lamp.angle=math.radians(4)
    lamp.color=rgb("ffecda")
    sun=bpy.data.objects.new(lamp.name,lamp)
    scene.collection.objects.link(sun)
    sun.rotation_euler=Vector((90,65,-75)).to_track_quat("-Z","Y").to_euler()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                view=area.spaces.active
                view.shading.color_type="VERTEX"
                view.region_3d.view_location=(0,0,1.55)
                view.region_3d.view_distance=53
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"laguna.blend"),compress=True)


if __name__=="__main__":
    source,output=map(Path,sys.argv[sys.argv.index("--")+1:])
    main(source.resolve(),output.resolve())
