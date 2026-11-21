"""Renovate the user's Linden Estate shell and build shared-collision scenery."""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE.parent/"laguna"))
from build_laguna import LayeredMap, Mesh, rgb, shade

STONE=rgb("9b907e")
TRIM=rgb("b5a68d")
WALNUT=rgb("765843")
BRASS=rgb("9a7848")
IRON=rgb("3b4142")
SOOT=rgb("353d41")
GLASS=rgb("6d8589")
PLASTER=rgb("a7a995")
RUG=rgb("73574d")
CUSHION=rgb("a9947a")
SOIL=rgb("625744")
LEAF=rgb("58684d")
LIGHT=rgb("efd4a0")
PALE=rgb("beb49c")
LAWN=[rgb(x) for x in ("728061","738063","768366","788366","777e60","747f61")]
TILE={"concrete":4.7,"stone":3.8,"wood":1.9,"metal":2.8,"glass":3,"garden":7.2,
      "fabric":.48,"brick":2.15,"roof":3.6,"water":2.2,"lamp":2}
TEXTURES={"stone":"concrete","garden":"ground","roof":"metal"}
MASONRY={
    "plaster":("concrete",rgb("a9957b")), "trim":("stone",TRIM), "glass":("glass",GLASS),
    "wood":("wood",WALNUT), "stone":("stone",STONE), "floor":("wood",rgb("887153")),
    "roof":("roof",SOOT), "roof seam":("metal",rgb("4b5254")), "ivory":("concrete",PLASTER),
    "sage":("concrete",rgb("7d8572")), "iron":("metal",IRON),
}
SHELL={
    "Chimneys","East landing","East stair foot","East terrace staircase","Eaves and ceiling",
    "Facade string courses","Front stoop","Gallery slab","Hip and ridge caps","Hipped roof",
    "Main staircase","Masonry and window frames","Portico canopy","Portico columns",
    "Roof courses","Room partitions","Room partitions.001","Upper gallery railing",
}


def make_material(surface):
    key="Estate · "+surface
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    mat=bpy.data.materials.new(key)
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    shader=nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value={"metal":.62,"glass":.27,"roof":.79,"water":.25}.get(surface,.86)
    shader.inputs["Metallic"].default_value=.28 if surface=="metal" else 0
    colors=nodes.new("ShaderNodeVertexColor")
    colors.layer_name="Paint"
    texture=REPO/"src"/"assets"/"surfaces"/(TEXTURES.get(surface,surface)+".webp")
    if surface=="water":
        texture=REPO/"src"/"assets"/"laguna"/"ripples.webp"
    elif surface=="fabric":
        texture=REPO/"src"/"assets"/"estate"/"weave.webp"
    if texture.exists():
        image=nodes.new("ShaderNodeTexImage")
        image.image=bpy.data.images.load(str(texture),check_existing=True)
        image.image.pack()
        mix=nodes.new("ShaderNodeMixRGB")
        mix.blend_type="MULTIPLY"
        mix.inputs[0].default_value=1
        links.new(colors.outputs["Color"],mix.inputs[1])
        links.new(image.outputs["Color"],mix.inputs[2])
        links.new(mix.outputs[0],shader.inputs["Base Color"])
    else:
        links.new(colors.outputs["Color"],shader.inputs["Base Color"])
    if surface in ("glass","water"):
        shader.inputs["Alpha"].default_value=.28 if surface=="glass" else .48
    if surface=="lamp":
        links.new(colors.outputs["Color"],shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value=.30
    return mat


def estate_object(mesh,name,collection,surface,cast,editable):
    data=bpy.data.meshes.new(name)
    data.from_pydata([(x,-z,y) for x,y,z in mesh.vertices],[],mesh.faces)
    # A triangle imported from the original building is already oriented.
    # Recalculating normals on detached triangles removes visible halves of walls.
    solid=bmesh.new()
    solid.from_mesh(data)
    bmesh.ops.recalc_face_normals(solid,faces=[
        face for face in solid.faces if any(len(edge.link_faces)>1 for edge in face.edges)
    ])
    solid.to_mesh(data)
    solid.free()
    data.update()
    paint=data.color_attributes.new(name="Paint",type="FLOAT_COLOR",domain="CORNER")
    data.color_attributes.active_color=paint
    uv=data.uv_layers.new(name="Surface")
    obj=bpy.data.objects.new(name,data)
    collection.objects.link(obj)
    obj["estateSurface"]=surface
    obj["estateCaster"]=cast
    scale=TILE[surface]
    for face,color in zip(data.polygons,mesh.colors):
        nx,nz,ny=face.normal
        for index in face.loop_indices:
            x,z,y=data.vertices[data.loops[index].vertex_index].co
            u,v=(x,-z) if abs(ny)>.6 else ((-z,y) if abs(nx)>abs(nz) else (x,y))
            uv.uv[index].vector=(u/scale,v/scale)
            paint.data[index].color=(*color,1)
    if editable:
        obj.data.materials.append(make_material(surface))
    return obj


def original_shell(estate,data):
    scale=data["widthScale"]
    bpy.ops.import_scene.gltf(filepath=str(HERE/"original-shell.glb"))
    imported=list(bpy.context.selected_objects)
    for obj in imported:
        if obj.type!="MESH" or obj.name not in SHELL:
            continue
        parts={}
        world=[obj.matrix_world@v.co for v in obj.data.vertices]
        for face in obj.data.polygons:
            original=obj.material_slots[face.material_index].material.name.split(".")[0]
            surface,color=MASONRY[original]
            points=[world[i] for i in face.vertices]
            if obj.name=="Room partitions" and all(abs(p.y+2.30)<.18 and p.z<=3.06 for p in points):
                west,east=min(p.x for p in points),max(p.x for p in points)
                if original=="ivory" and west>=10.01 and east<=11.81:
                    continue
                if original=="trim" and ((west>=9.97 and east<=10.09) or
                                          (west>=8.69 and east<=10.11 and min(p.z for p in points)>2.38)):
                    continue
            vertices=[(p.x*scale,p.z,-p.y) for p in points]
            x,y,z=[sum(v[i] for v in vertices)/len(vertices) for i in range(3)]
            # The lower rooms use separate finishes to keep the interior legible.
            if obj.name.startswith("Room partitions") and surface=="concrete":
                color=rgb("8d7c69") if x<-5.8 and z>0 else rgb("859080") if x<0 else rgb("a49b89")
            if obj.name=="Masonry and window frames" and surface=="concrete":
                color=shade(color,.83) if y<.8 else color
            detail=obj.name=="Roof courses"
            key=(int(x//12),int(z//12),surface,detail)
            parts.setdefault(key,Mesh()).add(vertices,[tuple(range(len(vertices)))],color)
        for (ix,iz,surface,detail),mesh in parts.items():
            estate.place(obj.name,ix*12,iz*12,lambda layer,m=mesh,s=surface,d=detail:
                         layer(s,d,s not in ("glass","wood") or "stair" in obj.name.lower()).extend(m,(0,0,0),0))
    for obj in imported:
        bpy.data.objects.remove(obj,do_unlink=True)
    lintel=next(b for b in data["boxes"] if b["id"]=="estate-pantry-lintel")
    x,z,w,d,y,h=(lintel[key] for key in ("x","z","w","d","baseY","h"))
    def pantry_opening(layer):
        layer("concrete").box((x,y+h/2,z),(w,h,d),PLASTER)
        layer("stone").box((x,y+.021,z),(w,.076,d+.10),TRIM,.012)
    estate.place("Pantry opening",x,z,pantry_opening)


def ellipsoid(mesh,x,y,z,rx,ry,rz,color,sides=10,rows=5):
    mesh.rings([[(x+rx*math.cos(a)*math.sin(p),y+ry*math.cos(p),z+rz*math.sin(a)*math.sin(p))
                 for a in (i*math.tau/sides for i in range(sides))]
                for p in (.10+j*(math.pi-.2)/(rows-1) for j in range(rows))],color)


def floor_and_garden(estate,data):
    s=data["widthScale"]
    p=data["pool"]
    px0,px1=p["x"]-p["w"]/2,p["x"]+p["w"]/2
    pz0,pz1=p["z"]-p["d"]/2,p["z"]+p["d"]/2
    xs=sorted({-35.9,35.9,-24.56*s,24.56*s,-12*s,12*s,px0,px1,-3.1,3.1,-10.7,10.7})
    zs=sorted({-22,35,-18.6,32.15,-7,7,pz0,pz1,9.6,13.95,21.1})
    rng=random.Random(560)
    for ix,(x0,x1) in enumerate(zip(xs,xs[1:])):
        for iz,(z0,z1) in enumerate(zip(zs,zs[1:])):
            x,z=(x0+x1)/2,(z0+z1)/2
            if px0<x<px1 and pz0<z<pz1:
                continue
            color=rng.choice(LAWN)
            indoor=abs(x)<12*s and abs(z)<7
            paving=(abs(x)<3.1 and -17<z<23) or (abs(x)<10.7 and 9.6<z<21.1)
            def build(layer):
                if indoor:
                    layer("wood",cast=False).floor(x,.2,z,x1-x0,z1-z0,rgb("997f62"))
                else:
                    layer("garden",cast=False).floor(x,0,z,x1-x0,z1-z0,color)
                    if paving:
                        layer("stone",cast=False).floor(x,.012,z,x1-x0,z1-z0,rgb("938777"))
            estate.place("Ground surfaces",x,z,build)
    def vestibule(layer):
        check=layer("stone",cast=False)
        w=6.84
        for i in range(16):
            for j in range(32):
                check.floor(-2.24+(i-7.5)*w/16,.212,(j-15.5)*.422,w/16,.422,
                            rgb("8d806e") if (i+j)%2 else rgb("5b5c51"))
        high=layer("fabric",True,False)
        for x,z,w,d in [(-10.78,5.33,3.06,2.20),(6.09,5.12,3.08,2.66),(-9.92,-5.18,2.55,2.23)]:
            high.floor(x,.224,z,w,d,RUG)
            high.floor(x,.227,z,w-.21,d-.23,shade(RUG,.78))
            for dz in [-d/2+.16,d/2-.16]:
                high.floor(x,.231,z+dz,w-.18,.045,BRASS)
        for x,z in [(-10.90,4.34),(11.95,4.48),(-10.48,-4.47)]:
            high.floor(x,3.316,z,2.32,1.92,RUG)
    estate.place("Stone vestibule and rugs",0,0,vestibule)
    def foundation(layer):
        stone=layer("stone")
        for side in [-1,1]:
            stone.box((0,.091,side*7.12),(24*s,.227,.42),STONE,.023)
            stone.box((side*11.98*s,.091,0),(.40,.227,13.88),STONE,.023)
    estate.place("Limestone foundation",0,0,foundation)
    def basin(layer):
        lining=layer("stone",cast=False)
        sections=[(px0,0,px0+p["ramp"],-p["depth"]),
                  (px0+p["ramp"],-p["depth"],px1-p["ramp"],-p["depth"]),
                  (px1-p["ramp"],-p["depth"],px1,0)]
        for x0,y0,x1,y1 in sections:
            lining.add([(x0,y0,pz0),(x0,y0,pz1),(x1,y1,pz1),(x1,y1,pz0)],[(0,1,2,3)],rgb("5d8278"))
        for z in [pz0-.17,pz1+.17]:
            layer("stone").box((p["x"],.035,z),(p["w"]+.22,.105,.31),TRIM,.025)
        wet=layer("water",cast=False)
        wet.floor(p["x"],-.27,p["z"],p["w"],p["d"],rgb("4c8887"))
        iron=layer("metal",True,True)
        for x in [px0+1.2,px1-1.2]:
            iron.cylinder((x,.37,pz1+.12),.031,.74,"y",IRON,10)
            iron.beam((x,.73,pz1+.12),(x,.68,pz1-.72),.062,IRON)
    estate.place("Garden pool with shallow ends",p["x"],p["z"],basin)


def furniture(estate,prop):
    x,z,w,d,y=(prop[key] for key in ("x","z","w","d","y"))
    role=prop["type"]
    def build(layer):
        for piece in prop["parts"]:
            surface=piece["surface"]
            key={"oak":"wood","leather":"fabric","linen":"fabric","sage":"fabric",
                 "hedge":"garden","limestone":"stone","plaster":"concrete"}.get(surface,surface)
            h=piece["h"]
            if role=="lamp":
                if piece["id"].endswith("-light"):
                    layer("lamp",cast=False).box((x,2.215,z),(.20,.21,.20),LIGHT,.013)
                    layer("metal").box((x,2.351,z),(.28,.058,.27),SOOT,.016)
                else:
                    layer("metal").cylinder((x,piece["baseY"]+h/2,z),piece["d"]/2,h,"y",IRON,8)
                continue
            layer(key).box((piece["x"],piece["baseY"]+h/2,piece["z"]),
                            (piece["w"],h,piece["d"]),rgb(piece["color"]),min(.024,h*.11))
        wood=layer("wood",True,False)
        metal=layer("metal",True,False)
        fabric=layer("fabric",True,False)
        if role=="sofa":
            direction=prop.get("facing",1)
            for i in [-1,1]:
                fabric.box((x+i*w*.199,y+.504,z-direction*.085),(w*.365,.11,d*.60),CUSHION,.034)
                fabric.box((x+i*w*.181,y+.68,z+direction*d*.19),(w*.302,.29,.178),shade(CUSHION,.72),.048)
            wood.box((x,y+.12,z),(w-.26,.06,d-.23),WALNUT,.012)
        elif role=="bed":
            fabric.box((x,y+.675,z-.23),(w-.10,.072,d*.62),shade(RUG,.91),.037)
            for side in [-1,1]:
                fabric.box((x+side*w*.23,y+.718,z+d*.27),(w*.385,.165,.36),CUSHION,.052)
            wood.box((x,y+.91,z+d/2-.144),(w-.12,.18,.035),WALNUT,.026)
        elif role=="shelf":
            sign=prop.get("facing",1)
            face=x+sign*w*.34
            h=prop["h"]
            palette=[rgb("636b58"),rgb("a98c62"),rgb("645350"),rgb("83554a"),rgb("a59883")]
            for j in range(5):
                row=y+.085+j*(h-.085)/5
                for i in range(11):
                    if (i+j*3)%7==0:
                        continue
                    pz=z-d*.39+i*d*.077
                    height=.19+((i*9+j*3)%8)*.018
                    fabric.box((face-sign*(i%3)*.028,row+height/2,pz),
                               (.16,height,.081+i%3*.016),palette[(i+j)%5],.005)
        elif role=="case":
            h=prop["h"]
            sign=prop.get("facing",-1 if z>2 else 1)
            front=z+sign*d/2
            for i in [-1,1]:
                column=x+i*w*.25
                if prop.get("wardrobe"):
                    wood.box((column,y+h*.53,front+sign*.025),(w*.45,h*.85,.052),WALNUT,.025)
                    metal.box((x+i*.11,y+h*.49,front+sign*.068),(.046,.164,.06),BRASS,.012)
                    continue
                for j in range(2):
                    yy=y+h*.33+j*h*.32
                    wood.box((column,yy,front+sign*.02),(w*.46,h*.28,.057),WALNUT,.016)
                    metal.box((column,yy+.036,front+sign*.054),(.19,.045,.054),BRASS,.010)
            if prop.get("sink"):
                top=layer("stone")
                sink_x=x+w*.21
                for px,span in [(x-w*.17,w*.64),(x+w*.423,w*.147)]:
                    top.box((px,y+h+.028,z),(span,.067,d+.081),TRIM,.023)
                layer("metal").box((sink_x,y+h+.01,z),(.65,.031,d-.06),SOOT,.039)
                metal.box((sink_x,y+h+.028,z),(.48,.026,d-.17),IRON,.012)
                metal.cylinder((sink_x,y+h+.18,z-d*.39),.024,.30,"y",IRON,10)
                metal.beam((sink_x,y+h+.32,z-d*.39),(sink_x,y+h+.32,z-.07),.041,IRON)
            elif not prop.get("wardrobe"):
                layer("stone",True,False).box((x,y+h+.026,z),(w+.094,.063,d+.085),TRIM,.025)
        elif role in ("table","bench","chair"):
            top=prop.get("top",{"table":.81,"bench":.51,"chair":.48}[role])
            if role=="bench":
                for i in range(4):
                    wood.box((x,y+top+.021,z+(i-1.5)*d*.227),(w-.058,.051,d*.184),WALNUT,.016)
            elif role=="chair":
                fabric.box((x,y+top+.04,z-prop.get("facing",1)*.056),(w-.086,.088,d-.213),RUG,.027)
            else:
                wood.box((x,y+top-.1,z),(w-.085,.094,d-.088),shade(WALNUT,.71),.014)
        elif role=="planter":
            h=prop["h"]
            stone=layer("stone",True,False)
            stone.box((x,y+h+.038,z),(w+.14,.087,d+.12),TRIM,.032)
            green=layer("garden",True,False)
            for i in range(max(2,math.ceil(w/.57))):
                count=max(2,math.ceil(w/.57))
                xx=x-w*.42+i*.84*w/(count-1)
                zz=z+math.sin(i*4.8)*.26
                ellipsoid(green,xx,y+h+.20,zz,.36,.31+i%3*.06,.31,shade(LEAF,.93+i%4*.15),9,5)
                ellipsoid(green,xx+.10,y+h+.12,zz-.18,.24,.19,.27,shade(LEAF,1.09),7,4)
                if i%2==0:
                    flowers=layer("fabric",True,False)
                    for j in range(3):
                        shade_color=rgb("c4906c") if j%2==0 else rgb("cdab8c")
                        dx,dz=(j-1)*.12,math.sin(j*2.4)*.10
                        ellipsoid(flowers,xx+dx,y+h+.48+i%3*.055,zz+dz,.071,.055,.073,shade_color,6,3)
        elif role=="hedge":
            green=layer("garden",True,False)
            for i in range(10):
                pz=z-d*.43+i*d*.095
                ellipsoid(green,x,y+prop["h"]-.08,pz,w*.49,.29,d*.075,shade(LEAF,.87+i%4*.07),8,4)
        elif role=="tree":
            branch=layer("wood")
            crown=layer("garden",cast=False)
            for sign in [-1,1]:
                branch.beam((x,2.2,z),(x+sign*.63,3.58,z+.42),.20,WALNUT)
            ellipsoid(crown,x,4.04,z,1.45,1.63,1.32,LEAF,10,5)
            heavy=layer("garden",True,False)
            for i in range(9):
                angle=i*math.tau/9
                ellipsoid(heavy,x+math.cos(angle)*.83,3.91+i%3*.37,z+math.sin(angle)*.85,
                          .84,.83,.77,shade(LEAF,.85+i%5*.065),9,5)
    estate.place(prop["id"],x,z,build)


def yard_walls(estate,boxes):
    for b in boxes:
        if b["id"].startswith(("estate-yard-","estate-pool-side-")):
            x,z,w,d,h,y=(b[key] for key in ("x","z","w","d","h","baseY"))
            def build(layer):
                stroke=layer("brick" if b["id"].startswith("estate-yard-") else "stone")
                stroke.box((x,y+h/2,z),(w,h,d),rgb(b["color"]))
                if b["id"].startswith("estate-yard-"):
                    layer("stone").box((x,y+h+.032,z),(w+.13,.12,d+.13),TRIM,.024)
                    if h<2.8 and max(w,d)<20:
                        plinth=layer("stone",True,False)
                        plinth.box((x,y+.22,z),(w+.075,.37,d+.075),shade(STONE,.74),.012)
            estate.place(b["id"],x,z,build)


def architectural_detail(estate,scale):
    facades=[
        (-1,[-9,-5.7,-1,7.4,10.3],[-11.88,-7.34,-3.45,1.77,5.33,8.82,11.88]),
        (1,[-9,-6,-3,3.8,7,10],[-11.88,-7.50,-4.50,-1.77,1.77,5.38,8.50,11.88]),
    ]
    for side,windows,piers in facades:
        z=side*7.27
        for x0 in windows:
            x=x0*scale
            def surrounds(layer):
                stone=layer("stone",True,True)
                stone.box((x,3.89,z+side*.106),(1.28,.115,.34),TRIM,.028)
                stone.box((x,5.77,z+side*.06),(1.96,.136,.23),TRIM,.023)
                layer("stone",True,False).box((x,4.01,z+side*.225),(1.15,.235,.38),rgb("987156"),.037)
                for j in [-1,0,1]:
                    ellipsoid(layer("garden",True,False),x+j*.32,4.19,z+side*.23,
                              .23,.17,.22,shade(LEAF,1.0+(j+1)*.085),8,4)
            estate.place("Sills and ironwork",x,z,surrounds)
        for x0 in piers:
            x=x0*scale
            def moulding(layer):
                stone=layer("stone",True,True)
                stone.box((x,3.15,z+side*.037),(.30,5.77,.16),shade(STONE,.95),.028)
                for y in [.38,3.15,6.13]:
                    stone.box((x,y,z+side*.076),(.40,.13,.19),TRIM,.020)
            estate.place("Facade pilasters",x,z,moulding)
    for x,z,ceiling in [(-8.5,-4.8,3.02),(-8.4,4.5,3.02),(0,1.6,3.03),(5.7,4.8,3.01),
                        (10.3,-4.2,3.03),(-8.8,-4.3,6.25),(6.2,-.8,6.25),(-8.5,4.3,6.25)]:
        def lighting(layer):
            body=layer("metal",True,False)
            body.cylinder((x,ceiling-.105,z),.072,.175,"y",BRASS,10)
            for j in range(5):
                angle=j*math.tau/5
                ex,ez=x+.44*math.cos(angle),z+.44*math.sin(angle)
                body.beam((x,ceiling-.27,z),(ex,ceiling-.21,ez),.044,BRASS)
                body.cylinder((ex,ceiling-.223,ez),.09,.104,"y",IRON,10)
                layer("lamp",True,False).cylinder((ex,ceiling-.16,ez),.063,.10,"y",LIGHT,10)
        estate.place("Brass ceiling fixture",x,z,lighting)
def interior_trim(estate,scale):
    # Flat panels and sash curtains sit tight to walls and clear all passages.
    for x,z,side,y in [(-9,6.71,1,.2),(-9,-6.72,-1,.2),(10,6.71,1,.2),
                      (-9,6.71,1,3.3),(10,6.71,1,3.3),(7.4,-6.72,-1,3.3)]:
        x*=scale
        def dressing(layer):
            cloth=layer("fabric",True,False)
            bronze=layer("metal",True,False)
            front=z-side*.10
            bronze.cylinder((x,y+2.43,front),.025,2.16,"x",BRASS,9)
            for direction in [-1,1]:
                end=x+direction*.88
                bronze.cylinder((x+direction*1.09,y+2.43,front),.047,.09,"x",BRASS,9)
                color=rgb("a89b7d") if x<0 else rgb("7f8670")
                for i in range(5):
                    pos=end+direction*(i-2)*.068
                    cloth.box((pos,y+1.53,front-side*math.sin(i*1.65)*.035),
                              (.079,1.71,.068),shade(color,1.0-(i%2)*.14),.028)
                bronze.box((end,y+1.15,front-side*.056),(.335,.054,.095),BRASS,.015)
        estate.place("Linen sash curtains",x,z,dressing)
    for x,z,y,side in [(-.88,2.161,1.58,-1),(-.88,2.161,4.87,-1),
                       (-10.12,2.49,1.58,1),(4.03,-2.724,4.86,1)]:
        x*=scale
        def framed_panel(layer):
            walnut=layer("wood",True,False)
            walnut.box((x,y,z),(1.04,.74,.065),WALNUT,.017)
            print_layer=layer("fabric",True,False)
            front=z+side*.037
            print_layer.box((x,y,front),(.934,.628,.021),rgb("b8aa88"))
            for i,(dx,dy,w,h) in enumerate([(-.13,-.143,.57,.13),(.16,-.048,.43,.14),
                                           (-.15,.030,.36,.10),(.19,.15,.124,.122)]):
                print_layer.box((x+dx,y+dy,front+side*.014),(w,h,.011),
                                rgb(("766f55","8c7b55","5b6855","b38a51")[i]),.008)
        estate.place("Framed garden prints",x,z,framed_panel)


def main(source,output):
    data=json.loads(source.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    estate=LayeredMap(("01 · Manor, gardens and playable furniture","02 · Trim, upholstery, planting and lights"),estate_object)
    original_shell(estate,data)
    floor_and_garden(estate,data)
    for prop in data["furnishings"]:
        furniture(estate,prop)
    yard_walls(estate,data["boxes"])
    architectural_detail(estate,data["widthScale"])
    interior_trim(estate,data["widthScale"])
    estate.export(False,output/"base.glb")
    estate.export(True,output/"detail.glb")
    camera_data=bpy.data.cameras.new("Garden view")
    camera=bpy.data.objects.new("Garden view",camera_data)
    scene.collection.objects.link(camera)
    eye,target=[Vector((x,-z,y)) for x,y,z in (data["menuView"]["eye"],data["menuView"]["target"])]
    camera.location=eye
    camera.rotation_euler=(target-eye).to_track_quat("-Z","Y").to_euler()
    camera_data.angle=math.radians(data["menuView"]["fov"])
    scene.camera=camera
    world=bpy.data.worlds.new("Estate daylight")
    scene.world=world
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.75
    light=bpy.data.lights.new("Daylight","SUN")
    light.energy=2.23
    sun=bpy.data.objects.new(light.name,light)
    scene.collection.objects.link(sun)
    sun.rotation_euler=Vector((90,65,-75)).to_track_quat("-Z","Y").to_euler()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                view=area.spaces.active
                view.shading.color_type="VERTEX"
                view.region_3d.view_location=(0,-7,2.8)
                view.region_3d.view_distance=72
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"linden-estate.blend"),compress=True)


if __name__=="__main__":
    source,output=map(Path,sys.argv[sys.argv.index("--")+1:])
    main(source.resolve(),output.resolve())
