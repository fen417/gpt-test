"""Build the editable Al-Hadra set and its base and high-detail game layers."""
import json
import math
import random
import shutil
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
sys.path.insert(0,str(HERE.parent/"laguna"))
sys.path.insert(0,str(HERE.parent/"village"))
from build_laguna import LayeredMap, rgb, shade
from build_village import material, new_mesh, source_mesh
from depot_props import truck, truck_wreck, car, generator, reservoir, drum, Mesh

PALE=rgb("c4aa86")
LIME=rgb("c8b898")
TIMBER=rgb("80674d")
DARK=rgb("665645")
IRON=rgb("5a6060")
STONE=rgb("a38c6f")
CLAY=rgb("a6795d")
TEAL=rgb("70877b")
OLIVE=rgb("868363")
CHALK=rgb("d7c7a6")
PAINT=[rgb(t) for t in ("bda68b","b5a183","b19a7d","b6aa91","a9a28a")]
TILING={"concrete":4.3,"village-stucco":4.0,"wood":1.85,"metal":2.1,"plain":3.1,"leaf":2.0,
        "canvas":.75,"vehicle-paint":1.9,"vehicle-glass":2.0}


def authored_mesh(mesh,name,collection,surface,cast,editable):
    data=new_mesh(name,collection,surface,cast,[(x,-z,y) for x,y,z in mesh.vertices],mesh.faces)
    if surface=="canvas":
        data.materials[0].use_backface_culling=False
    # Detached faces have authored winding. Reorient the connected solids only.
    solids=bmesh.new()
    solids.from_mesh(data)
    bmesh.ops.recalc_face_normals(solids,faces=[
        face for face in solids.faces if any(len(edge.link_faces)>1 for edge in face.edges)
    ])
    solids.to_mesh(data)
    solids.free()
    data.update()
    paint=data.color_attributes.new(name="Paint",type="FLOAT_COLOR",domain="CORNER")
    data.color_attributes.active_color=paint
    uv=data.uv_layers.new(name="Tile")
    for face,color in zip(data.polygons,mesh.colors):
        axis=max(range(3),key=lambda i:abs(face.normal[i]))
        for index in face.loop_indices:
            x,z,y=data.vertices[data.loops[index].vertex_index].co
            u,v=((-z,y),(x,y),(x,-z))[axis]
            uv.uv[index].vector=(u/TILING[surface],v/TILING[surface])
            paint.data[index].color=(*color,1)
    return bpy.data.objects[name]


def house(setup,s,index):
    x,y,z,w,d,h=(s[k] for k in ("x","baseY","z","w","d","h"))
    school=s["id"]=="school"
    wall=s["wallThickness"]/2
    gap=s["doorWidth"]/2
    lintel=s["doorHeight"]
    sill,window_height,window_width=(.86,1.64,3.55) if school else (1.15,1.10,2.60)
    plaster=rgb("b8ad8c") if school else PAINT[index%len(PAINT)]
    trim=TEAL if school else (CLAY,OLIVE,TIMBER,TEAL)[index%4]
    rng=random.Random(1427+index)

    def finishes(layer):
        floor=layer("concrete",cast=False)
        floor.floor(x,y+.033,z,w-.42,d-.42,shade(STONE,1.08))
        plaster_mesh=layer("village-stucco",cast=False)
        frames=layer("wood")
        roof=layer("concrete")
        timber=layer("wood",True,False)
        paint=layer("village-stucco",True,False)
        iron=layer("metal",True,False)
        for side in (-1,1):
            face=z+side*(d/2+wall+.052)
            for wing in (-1,1):
                span=w/2-gap-.20
                center=x+wing*(gap+.13+span/2)
                plaster_mesh.box((center,y+.43,face),(span,.64,.08),shade(plaster,.72),.014)
                plaster_mesh.box((center,y+.788,face), (span,.080,.087),plaster,.010)
                frames.box((x+wing*(gap+.092),y+lintel/2,face),(.164,lintel,.108),TIMBER,.014)
                if school:
                    paint.box((center,y+1.134,face+side*.053),(span-.04,.136,.028),TEAL,.004)
                for course in range(4):
                    material=shade(PALE,rng.uniform(.70,.90))
                    paint.box((x+wing*(w/2-.37),y+.96+course*.48,face+side*.036),
                              (.55 if course%2 else .36,.16,.038),material,.012)
            frames.box((x,y+lintel+.105,face),(2*gap+.39,.183,.123),TIMBER,.017)
            timber.box((x,y+lintel+.226,face+side*.024),(2*gap+.48,.055,.143),DARK,.012)
            roof.box((x,y+h+.167,z+side*(d/2+.285)),(w+.58,.125,.18),LIME,.017)
            roof.box((x+side*(w/2+.284),y+h+.167,z),(.18,.125,d+.43),LIME,.017)
            for beam in range(5 if school else 4):
                px=x+(beam/(4 if school else 3)-.5)*(w-1.48)
                timber.box((px,y+h-.205,face),(.18,.215,.31),TIMBER,.022)
            for window in (-1,1):
                pz=z+window*d*.24
                wall_x=x+side*(w/2+wall+.061)
                for edge in (-1,1):
                    post=pz+edge*(window_width/2+.074)
                    frames.box((wall_x,y+sill+window_height/2,post),(.14,window_height+.09,.118),trim,.018)
                    if not school:
                        panel=post+edge*.302
                        timber.box((wall_x+side*.049,y+sill+window_height/2,panel),(.09,window_height*.92,.46),trim,.016)
                        for row in range(5):
                            timber.box((wall_x+side*.098,y+sill+.17+row*window_height*.15,panel),
                                       (.024,.036,.409),shade(TIMBER,.68),.004)
                    for height in (.22,window_height-.19):
                        iron.box((wall_x+side*.088,y+sill+height,post),(.045,.063,.14),IRON,.006)
                roof.box((wall_x,y+sill+window_height+.068,pz),(.216,.135,window_width+.28),LIME,.018)
                if not school:
                    roof.box((wall_x,y+sill-.055,pz),(.278,.135,window_width+.30),PALE,.024)
            inner=x+side*(w/2-wall-.025)
            for wing in (-1,1):
                pz=z+wing*(d/2-.54)
                paint.box((inner,y+.305,pz),(.029,.50,.68),shade(plaster,.75),.007)
        if school:
            for side in (-1,1):
                face=z+side*(d/2+wall+.046)
                emblem=layer("concrete",True,False)
                emblem.box((x,y+3.57,face),(2.18,.59,.12),shade(TEAL,.72),.035)
                for delta in (-.66,.66):
                    timber.box((x+delta,y+3.57,face+side*.064),(.73,.072,.034),LIME,.009)
                emblem.cylinder((x,y+3.57,face+side*.083),.141,.035,"z",CHALK,14)
            for column in range(7):
                px=x+(column-3)*.385
                for row in range(34):
                    high=layer("concrete",True,False)
                    high.floor(px,y+.044,z+(row-16.5)*.397,.385,.397,
                               shade(LIME,.83) if (column+row)%2 else shade(TEAL,.75))
            for side in (-1,1):
                for i in range(3):
                    center=x+side*(3.25+i*1.6)
                    paint.box((center,y+.41,z-d/2+wall+.017),(1.51,.62,.028),
                              shade(TEAL,.75+i*.07),.006)
        else:
            # Shallow exterior rain marks and repair patches avoid apertures.
            for _ in range(14):
                side=rng.choice((-1,1))
                a=rng.uniform(-w*.44,w*.44)
                height=rng.uniform(.40,h-.46)
                if abs(a)<gap+.31 and height<lintel+.36:
                    continue
                face=z+side*(d/2+wall+.014)
                top=height+rng.uniform(.11,.36)
                span=rng.uniform(.16,.43)
                marks=[(x+a-span,y+height,face),(x+a+span,y+height+.09,face),
                       (x+a+span*.71,y+top,face),(x+a-span*.65,y+top+.07,face)]
                paint.add(marks,[(0,1,2,3) if side==1 else (3,2,1,0)],shade(plaster,rng.uniform(.55,.81)))
    setup.place("School · masonry and open thresholds" if school else f"House {index+1:02d} · plaster and joinery",x,z,finishes)


def palm_crown(setup,b,index):
    x,y,z=(b["x"],b["baseY"]+b["h"],b["z"])
    rng=random.Random(3319+index)
    def crown(layer):
        leaves=layer("leaf",True)
        for frond in range(14):
            turn=frond*math.tau/14+rng.uniform(-.17,.17)
            dx,dz=math.cos(turn),math.sin(turn)
            length,sag=rng.uniform(2.72,3.82),rng.uniform(.90,2.0)
            arch=rng.uniform(.35,.95)
            def spine(t):
                return (x+dx*length*t,y+math.sin(math.pi*t)*arch-sag*t*t,z+dz*length*t)
            for row in range(11):
                t=.04+row*.085
                a,b,c=spine(t)
                ex,ey,ez=spine(t+.086)
                leaves.add([(a-dz*.023,b,c+dx*.023),(a+dz*.023,b,c-dx*.023),(ex,ey,ez)],
                           [(0,1,2)],shade(OLIVE,1.24))
                for side in (-1,1):
                    width=.57*math.sin(t*math.pi)**.76*rng.uniform(.83,1.18)
                    tip=(a+dx*.31-dz*side*width,b-rng.uniform(.035,.225),c+dz*.31+dx*side*width)
                    leaves.add([(a,b,c),tip,(ex-dx*.062,ey-.031,ez-dz*.062)],[(0,1,2)],
                               shade(rgb("68764e") if frond%4 else OLIVE,rng.uniform(.79,1.25)))
    setup.place("Date palm fronds",x,z,crown)


def awning(setup,b,index):
    x,y,z,w,d=(b[k] for k in ("x","baseY","z","w","d"))
    paint=rgb(b["color"])
    stripe=(rgb("ae9575"),TEAL,CLAY,PALE)[index%4]
    n=max(5,2*math.floor(w/.58)+1)
    def shape(layer):
        fabric=layer("canvas")
        cord=layer("wood",True,False)
        def finish(u,v):
            yy=.020-.15*(1-(v*2-1)**2)+.054*math.cos(u*2*math.pi)*math.sin(math.pi*v)
            return (x+(u-.5)*w,y+yy,z+(v-.5)*d)
        for j in range(n):
            u,v=j/n,(j+1)/n
            tone=shade(stripe if j%4==1 else paint,.82+(j%3)*.09)
            for i in range(4):
                a,b=i/4,(i+1)/4
                fabric.add([finish(u,a),finish(u,b),finish(v,b),finish(v,a)],[(0,1,2,3)],tone)
            for side in (0,1):
                ax,ay,az=finish(u,side)
                bx,by,bz=finish(v,side)
                bottom=.113+.042*math.cos(j*1.21)
                fabric.add([(ax,ay,az),(bx,by,bz),(bx,by-bottom,bz),(ax,ay-bottom,az)],[(0,1,2,3)],shade(tone,.86))
        for side in (0,1):
            cord.beam(finish(0,side),finish(1,side),.055,TIMBER)
    setup.place("Striped market canvas",x,z,shape)


def prop_detail(setup,boxes,desert=False):
    for index,b in enumerate(boxes):
        x,y,z,w,d,h=(b[k] for k in ("x","baseY","z","w","d","h"))
        kind=b["kind"]
        reference_x,reference_z=(x+150,z+105) if desert else (x,z)
        repair=(-13<reference_x<3 and 42<reference_z<52)
        school=(144<reference_x<156 and 99<reference_z<104)
        if kind in ("truck","car","generator","fueltank"):
            def equipment(layer):
                parts={}
                def part(surface,detail=False,cast=True):
                    return parts.setdefault((surface,detail,cast),Mesh())
                paint=rgb(b["color"])
                if kind=="truck":
                    truck(part,paint)
                elif kind=="car":
                    car(part,paint)
                elif kind=="generator":
                    generator(part,w,d,h,paint)
                else:
                    reservoir(part,w,d,h,paint)
                for key,mesh in parts.items():
                    layer(*key).extend(mesh,(x,y,z),b.get("modelRotation",{}).get("y",0))
            setup.place({"truck":"Parked utility truck","car":"Civilian saloon",
                         "generator":"Enclosed generator","fueltank":"Workshop reservoir"}[kind],x,z,equipment)
        elif kind=="village-palm":
            palm_crown(setup,b,index)
        elif kind=="village-awning":
            awning(setup,b,index)
        elif kind=="village-table" and (repair or school):
            def desk(layer):
                wood=layer("wood",True,False)
                paper=layer("plain",True,False)
                for side in (-1,1):
                    px=x+side*w*.28
                    if school:
                        wood.box((px,y+h+.022,z),(.33,.035,.235),TEAL if side>0 else CLAY,.011)
                        paper.box((px,y+h+.037,z),(.294,.013,.207),CHALK,.004)
                        wood.box((px+.098,y+h+.055,z-.043),(.015,.015,.18),TIMBER,.003)
                    else:
                        layer("metal",True,False).box((px,y+h+.031,z),(.43,.048,.076),IRON,.007)
            setup.place("Schoolbooks" if school else "Repair workbench tools",x,z,desk)
        elif kind=="crate" and (-105<reference_x<58 or reference_x<-199) and not b.get("modelRotation"):
            def case(layer):
                metal=layer("metal",True,False)
                for side in (-1,1):
                    px=x+side*w*.34
                    metal.box((px,y+h+.014,z),(.063,.022,d-.05),IRON,.005)
                    metal.box((px,y+h*.49,z+d/2+.013),(.062,h*.97,.023),IRON,.005)
                layer("plain",True,False).box((x,y+h*.65,z+d/2+.025),(.29,.14,.017),shade(CHALK,.81),.004)
            setup.place("Supply crate bands",x,z,case)


def export_depot_props(source,props):
    collection=bpy.data.collections.new("05 · Mission trucks and fuel drums")
    bpy.context.scene.collection.children.link(collection)
    bpy.ops.object.select_all(action="DESELECT")
    placed=[]
    hidden=[]
    for name,build,wreck,locations in (
        ("DepotTruck",truck,truck_wreck,[p for p in props if p["kind"]=="truck"]),
        ("FuelDrum",drum,None,[p for p in props if "campaignFuel" in p]),
    ):
        root=bpy.data.objects.new(name,None)
        collection.objects.link(root)
        root.select_set(True)
        meshes=[]
        for burned,make in ((False,build),(True,wreck)):
            if make is None:
                continue
            parts={}
            def part(surface,detail=False,cast=True):
                return parts.setdefault((surface,detail,cast),Mesh())
            make(part)
            for (surface,detail,cast),mesh in parts.items():
                label=f"{name} {'wreck' if burned else 'trim' if detail else 'body'} {surface}"
                obj=authored_mesh(mesh,label,collection,surface,cast,True)
                obj.parent=root
                obj["depotDetail"]=detail
                obj["depotWreck"]=burned
                obj.select_set(True)
                meshes.append(obj)
                if burned:
                    hidden.append(obj)
        placed.append((root,meshes,locations))
    bpy.ops.export_scene.gltf(filepath=str(source/"depot-props.glb"),export_format="GLB",use_selection=True,
                              export_extras=True,export_materials="NONE",export_vertex_color="ACTIVE",
                              export_meshopt_compression_enable=False)
    for root,meshes,locations in placed:
        if not locations:
            continue
        first,*others=locations
        root.location=(first["x"],-first["z"],first["baseY"])
        for point in others:
            for obj in meshes:
                if obj["depotWreck"]:
                    continue
                copy=obj.copy()
                copy.parent=None
                copy.location=(point["x"],-point["z"],point["baseY"])
                collection.objects.link(copy)
    for obj in hidden:
        obj.hide_set(True)
        obj.hide_render=True


def ground_height(data,x,z):
    grid=data["ground"]
    col,row=(x-grid["minX"])/grid["spacing"],(z-grid["minZ"])/grid["spacing"]
    n=grid["columns"]
    values=grid["elevations"]
    ix=min(n-2,max(0,math.floor(col)))
    iz=min(len(values)//n-2,max(0,math.floor(row)))
    fx,fz=max(0,min(1,col-ix)),max(0,min(1,row-iz))
    if "reserveRoute" in data:
        a,b,c,d=(values[iz*n+ix],values[iz*n+ix+1],values[(iz+1)*n+ix],values[(iz+1)*n+ix+1])
        return a+(b-a)*fx+(c-a)*fz if fx+fz<=1 else d+(c-d)*(1-fx)+(b-d)*(1-fz)
    lower=values[iz*n+ix]*(1-fx)+values[iz*n+ix+1]*fx
    upper=values[(iz+1)*n+ix]*(1-fx)+values[(iz+1)*n+ix+1]*fx
    return lower*(1-fz)+upper*fz


def terrain_detail(setup,data):
    rng=random.Random(3689)
    sites=[
        ("Wadi banks",(-214,-123),(-158,-98),28,36,39),
        ("Wadi shingle",(-158,-98),(-105,-48),19,32,36),
        ("Ridge scree",(-124,-56),(-50,-17),20,34,42),
        ("Depot tracks",(-12,15),(48,52),10,15,38),
        ("Dry channel", (48,9),(154,44),11,18,46),
        ("Farmland edges",(89,72),(197,149),10,22,46),
    ]
    if "reserveRoute" in data:
        sites=[
            ("Western cuts",(-945,-560),(-755,-460),19,54,42),
            ("Ridge apron",(-686,-482),(-572,-422),28,65,40),
            ("Convoy approach",(-435,-316),(-240,-255),14,55,48),
            ("Village approach",(-235,-246),(-90,-118),24,54,44),
            ("Southern pass scree",(275,-316),(135,-344),26,56,48),
            ("Dry wash deposits",(115,-345),(-125,-323),12,55,54),
            ("Outskirts and field edges",(-55,-104),(84,-14),17,36,32),
        ]
    for title,a,b,near,far,count in sites:
        for i in range(count):
            t=i/count
            side=1 if i%2 else -1
            dx,dz=b[0]-a[0],b[1]-a[1]
            length=math.hypot(dx,dz)
            drift=rng.uniform(near,far)*side
            x=a[0]+dx*t-dz/length*drift
            z=a[1]+dz*t+dx/length*drift
            if any(abs(x-s["x"])<s["w"]/2+2.6 and abs(z-s["z"])<s["d"]/2+2.6 for s in data["structures"]):
                continue
            def weathering(layer):
                stone=layer("concrete",True,False)
                for j in range(4):
                    xx,zz=x+rng.uniform(-2.3,2.3),z+rng.uniform(-1.8,1.8)
                    span=rng.uniform(.12,.58)
                    pts=[(xx+a*span,zz+b*span) for a,b in ((-.6,-.55),(-.56,.55),(.6,.61),(.65,-.32))]
                    face=[(px,ground_height(data,px,pz)+.064,pz) for px,pz in pts]
                    center=(xx,ground_height(data,xx,zz)+rng.uniform(.105,.220),zz)
                    stone.add([*face,center],[(j,(j+1)%4,4) for j in range(4)],shade(STONE,rng.uniform(.70,1.13)))
                if i%3==0:
                    tufts=layer("leaf",True,False)
                    yy=ground_height(data,x,z)+.05
                    for vane in range(6):
                        turn=rng.uniform(0,math.tau)
                        dx,dz=math.cos(turn),math.sin(turn)
                        tip=rng.uniform(.22,.42)
                        tufts.add([(x+dz*.026,yy,z-dx*.026),
                                   (x+dx*tip,yy+rng.uniform(.16,.39),z+dz*tip),
                                   (x-dz*.026,yy,z+dx*.026)],[(0,1,2)],shade(OLIVE,rng.uniform(.68,1.08)))
            setup.place(title,x,z,weathering)


def battlefield_detail(setup,data):
    for b in data["depotProps"]:
        x,z,y=b["x"],b["z"],b["baseY"]
        is_truck=b["kind"]=="truck"
        def burned(layer):
            parts={}
            def part(surface,detail=False,cast=True):
                return parts.setdefault((surface,detail,cast),Mesh())
            if is_truck:
                truck(part)
                for key in tuple(parts):
                    if key[0]=="canvas":del parts[key]
                truck_wreck(part)
            else:
                drum(part)
            for (surface,detail,cast),mesh in parts.items():
                mesh.colors=[shade(color,.32 if surface!="vehicle-glass" else .19) for color in mesh.colors]
                if not is_truck and b["campaignFuel"]%3!=0:
                    mesh.vertices=[(-p,.545+q,r) for q,p,r in mesh.vertices]
                layer(surface,detail,cast).extend(mesh,(x,y,z),0)
            if is_truck:
                stain=layer("plain",True,False)
                rng=random.Random(int(x*41+z*17))
                for side in (-1,1):
                    for dot in range(12):
                        cx,cz=x+side*(1.4+rng.random()*1.25),z+rng.uniform(-3.8,3.65)
                        width,depth=rng.uniform(.18,.64),rng.uniform(.22,.94)
                        points=[(cx+dx,ground_height(data,cx+dx,cz+dz)+.038,cz+dz)
                                for dx,dz in ((-width,-depth),(-width,depth),(width,depth),(width,-depth))]
                        stain.add(points,[(0,1,2,3)],shade(DARK,rng.uniform(.7,1.1)))
        setup.place("Burned supply truck" if is_truck else "Scorched fuel drum",x,z,burned)

def preview_materials(source,span):
    for mat in bpy.data.materials:
        name=mat.name
        if name=="road-sand":
            path=REPO/"src"/"assets"/"surfaces"/"village-sand.webp"
        elif name in ("rock","sign"):
            path=source/("rock.webp" if name=="rock" else "labels.webp")
        elif name=="canvas":
            path=REPO/"src"/"assets"/"estate"/"weave.webp"
        elif name=="vehicle-paint":
            path=REPO/"src"/"assets"/"port"/"paint.webp"
        else:
            path=REPO/"src"/"assets"/"surfaces"/(name+".webp")
        if name.startswith("vehicle-"):
            shader=mat.node_tree.nodes.get("Principled BSDF")
            shader.inputs["Roughness"].default_value=.68 if name=="vehicle-paint" else .32
            shader.inputs["Metallic"].default_value=.16
        if not path.is_file():
            continue
        graph=mat.node_tree
        nodes,links=graph.nodes,graph.links
        image=nodes.new("ShaderNodeTexImage")
        image.image=bpy.data.images.load(str(path),check_existing=True)
        image.image.pack()
        paint=next(node for node in nodes if node.type=="VERTEX_COLOR")
        mix=nodes.new("ShaderNodeMixRGB")
        mix.blend_type="MULTIPLY"
        mix.inputs[0].default_value=1
        links.new(image.outputs["Color"],mix.inputs[1])
        links.new(paint.outputs["Color"],mix.inputs[2])
        final=mix.outputs["Color"]
        if name=="road-sand":
            position=nodes.new("ShaderNodeNewGeometry")
            scale=nodes.new("ShaderNodeVectorMath")
            scale.operation="SCALE"
            scale.inputs[3].default_value=1/span
            links.new(position.outputs["Position"],scale.inputs[0])
            translate=nodes.new("ShaderNodeVectorMath")
            translate.operation="ADD"
            translate.inputs[1].default_value=(.5,.5,0)
            links.new(scale.outputs["Vector"],translate.inputs[0])
            roads=nodes.new("ShaderNodeTexImage")
            roads.image=bpy.data.images.load(str(source/"roads.webp"),check_existing=True)
            roads.image.colorspace_settings.name="Non-Color"
            roads.image.pack()
            links.new(translate.outputs["Vector"],roads.inputs["Vector"])
            tint=nodes.new("ShaderNodeMixRGB")
            tint.inputs[1].default_value=(1,1,1,1)
            tint.inputs[2].default_value=(.80,.71,.61,1)
            links.new(roads.outputs["Color"],tint.inputs[0])
            dirt=nodes.new("ShaderNodeMixRGB")
            dirt.blend_type="MULTIPLY"
            dirt.inputs[0].default_value=1
            links.new(final,dirt.inputs[1])
            links.new(tint.outputs["Color"],dirt.inputs[2])
            final=dirt.outputs["Color"]
        links.new(final,nodes.get("Principled BSDF").inputs["Base Color"])


def main(source,runtime):
    data=json.loads((source/"village.json").read_text(encoding="utf-8"))
    desert=data.get("mapId")=="alhadra-desert"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    imported=[]
    for title in ("01 · Ground, collision-aligned walls and cover", "03 · Existing dressing and equipment"):
        collection=bpy.data.collections.new(title)
        scene.collection.children.link(collection)
        imported.append(collection)
    for incoming in data["meshes"]:
        source_mesh(incoming,imported[bool(incoming["detail"])])
    setup=LayeredMap(("02 · Village and school joinery", "04 · Weathering, classroom and terrain detail"),
                     authored_mesh,grids=(86,70) if desert else (60,48))
    for index,s in enumerate(data["structures"]):
        if s["kind"]=="village-house":
            house(setup,s,index)
    prop_detail(setup,data["boxes"],desert)
    terrain_detail(setup,data)
    if desert:battlefield_detail(setup,data)
    for tier,name in enumerate(("base","detail")):
        setup.export(bool(tier),source/(name+".glb"),imported[tier].objects)
    if not desert:export_depot_props(source,data["depotProps"])
    runtime.mkdir(parents=True,exist_ok=True)
    for name in (("roads.webp","labels.webp") if desert else ("roads.webp","rock.webp","labels.webp")):
        shutil.copyfile(source/name,runtime/name)
    manifest={"layout":data["layout"],"span":data["span"],
              "baseTriangles":sum(len(obj.data.polygons) for obj in imported[0].objects),
              "batches":len(setup.batches)}
    (runtime/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    preview_materials(source,data["span"])
    label="Dunes and southern pass" if desert else "School approach"
    preview=bpy.data.cameras.new(label)
    camera=bpy.data.objects.new(label,preview)
    scene.collection.objects.link(camera)
    camera.location=(-226,255,49) if desert else (162,-85,5.2)
    target=(-40,157,3.8) if desert else (146,-103,2.3)
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler()
    preview.lens=35
    preview.clip_end=3600 if desert else 1200
    scene.camera=camera
    lamp=bpy.data.lights.new("Dawn","SUN")
    lamp.energy=2.45
    sun=bpy.data.objects.new("Dawn",lamp)
    scene.collection.objects.link(sun)
    sun.rotation_euler=Vector((80,42,-63)).to_track_quat("-Z","Y").to_euler()
    scene.world=bpy.data.worlds.new("Al-Hadra dawn sky")
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.80
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.clip_end=3600 if desert else 1700
                space.shading.color_type="VERTEX"
                space.region_3d.view_location=(-100,185,3) if desert else (130,-98,1.7)
                space.region_3d.view_distance=380 if desert else 120
    blend="alhadra-desert.blend" if desert else "alhadra.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/blend),compress=True)


if __name__=="__main__":
    args=(Path(value).resolve() for value in sys.argv[sys.argv.index("--")+1:])
    main(*args)
