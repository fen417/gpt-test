"""Bake the collision-aligned Tel Mazin town and its optional detail layer."""
import json
import math
import random
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
from build_alhadra import LayeredMap, authored_mesh, awning, palm_crown, preview_materials, rgb, shade, source_mesh

STONE=rgb("baa783")
BRICK=rgb("ab805b")
WOOD=rgb("7f6040")
METAL=rgb("6b6e62")
OCHRE=rgb("b39662")
CREAM=rgb("d8c7a4")
TEAL=rgb("627d70")
SACK=rgb("9c8965")
TILE=rgb("b88869")


def facade(setup,s,index):
    x,y,z,w,d,h=(s[k] for k in ("x","baseY","z","w","d","h"))
    paint=rgb(s["color"])
    trim=(TEAL,WOOD,BRICK,OCHRE)[index%4]
    plan=s.get("plan")
    rng=random.Random(2239+index)
    gap=(s.get("doorWidth",3.6)+.50)/2
    def build(layer):
        base=layer("village-stucco",cast=False)
        concrete=layer("concrete")
        masonry=layer("village-stucco",True,False)
        timber=layer("wood",True,False)
        for side in (-1,1):
            front=z+side*(d/2+.206)
            edge=x+side*(w/2+.199)
            span=w/2-gap-.06
            for wing in (-1,1):
                px=x+wing*(gap+span/2)
                base.box((px,y+.245,front),(span,.45,.08),shade(paint,.71),.009)
                base.box((px,y+.494,front),(span,.061,.09),shade(trim,1.06),.011)
                for j in range(3):
                    at=px+rng.uniform(-span*.35,span*.35)
                    masonry.box((at,y+.79+j*.23,front+side*.047),
                        (rng.uniform(.19,.42),rng.uniform(.077,.142),.018),shade(paint,rng.uniform(.71,.92)),.003)
            base.box((edge,y+.244,z),(.074,.45,d-.42),shade(paint,.74),.009)
            concrete.box((x,y+h+.126,z+side*(d/2+.091)),(w+.40,.142,.36),shade(STONE,.89),.028)
            concrete.box((x+side*(w/2+.105),y+h+.126,z),(.36,.142,d-.01),shade(STONE,.88),.028)
            for wing in (-1,1):
                for j in range(3):
                    masonry.box((x+wing*(w/2-.26),y+.91+j*.58,front+side*.022),
                                (.36 if j%2 else .53,.186,.076),shade(paint,.87+.035*j),.008)
            for rafter in range(4):
                px=x+(rafter/3-.5)*(w-1.22)
                timber.box((px,y+h-.159,front),(.154,.165,.39),WOOD,.019)
        if plan in ("tea","shop","workshop","mayor"):
            front=z- (d/2+.247)
            frame=layer("wood")
            frame.box((x,y+2.49,front),(gap*2+.35,.173,.28),trim,.021)
            timber.box((x,y+2.64,front-.18),(gap*2+.63,.078,.61),shade(trim,.79),.014)
            for sign in (-1,1):
                timber.beam((x+sign*gap*.87,y+2.26,front),(x+sign*gap*.87,y+2.62,front-.40),.057,WOOD)
        if plan:
            for side in (-1,1):
                inner=x+side*(w/2-.178)
                base.box((inner,y+.295,z),(.045,.526,d-.4),shade(trim,1.15),.005)
                for wing in (-1,1):
                    px=x+wing*(gap+span/2)
                    base.box((px,y+.295,z+side*(d/2-.178)),(span,.526,.045),shade(trim,1.15),.005)
            if plan in ("workshop","tea","shop"):
                for j in range(3):
                    px=x+(j-1)*w*.25
                    timber.box((px,y+2.865,z),(.164,.137,d-.22),shade(WOOD,.88),.009)
        if plan=="mg":
            walkway=-math.copysign(1,z)
            front=z+walkway*(d/2+.20)
            masonry.box((x,y+3.423,front),(3.81,.13,.19),shade(STONE,.75),.012)
            timber.box((x,y+5.291,front),(3.81,.112,.19),WOOD,.013)
    setup.place(s["id"]+" façade",x,z,build)


def frame_openings(setup,data):
    houses={s["id"]:s for s in data["structures"]}
    for item in data["interactives"]:
        if item["type"] not in ("door","shutter"):
            continue
        info=item["part"]
        ident=item["id"].rsplit("-door-",1)[0].rsplit("-shutter-",1)[0]
        s=houses.get(ident)
        if s is None:
            continue
        x,z,y,w,d,h=(info[key] for key in ("x","z","baseY","w","d","h"))
        shutter=item["type"]=="shutter"
        def opening(layer):
            wood=layer("wood",cast=False)
            stone=layer("concrete",True,False)
            if shutter:
                outer=x+math.copysign(.225,x-s["x"])
                for side in (-1,1):
                    wood.box((outer,y+h*.51,z+side*(d/2+.049)),(.106,h+.10,.098),WOOD,.010)
                wood.box((outer,y+h+.045,z),(.115,.112,d+.21),shade(WOOD,.77),.010)
                stone.box((outer,y-.052,z),(.30,.104,d+.27),STONE,.014)
            else:
                outer=z+math.copysign(.246,z-s["z"])
                for side in (-1,1):
                    wood.box((x+side*(w/2+.057),y+h*.5,outer),(.113,h,.13),WOOD,.012)
                wood.box((x,y+h+.050,outer),(w+.23,.12,.18),WOOD,.015)
                stone.box((x,y+.015,outer),(w+.05,.035,.44),shade(STONE,.86),.006)
        setup.place(item["id"]+" frame",x,z,opening)


def furnishings(setup,data):
    for i,b in enumerate(data["boxes"]):
        kind=b["kind"]
        if kind=="village-awning":
            awning(setup,b,i)
            continue
        if kind=="village-palm":
            palm_crown(setup,b,i)
            continue
        if kind not in ("village-bench","village-cabinet","village-table","village-shelf",
                        "village-workbench","village-workcase","village-counter","village-cot"):
            continue
        x,y,z,w,d,h=(b[k] for k in ("x","baseY","z","w","d","h"))
        tone=rgb(b["color"])
        rng=random.Random(7901+i)
        def build(layer):
            base=layer("wood")
            joinery=layer("wood",True,False)
            goods=layer("plain",True,False)
            iron=layer("metal",True,False)
            if kind=="village-cot":
                fabric=layer("canvas")
                base.box((x,y+.17,z),(w,.14,d),tone,.022)
                for sx in (-1,1):
                    for sz in (-1,1):
                        base.box((x+sx*w*.39,y+.147,z+sz*d*.433),(.10,.294,.108),WOOD,.010)
                fabric.box((x,y+.346,z),(w-.052,.22,d-.045),CREAM,.049)
                fabric.box((x,y+.455,z+d*.119),(w-.032,.045,d*.66),TEAL,.014)
                fabric.box((x,y+.473,z-d*.347),(w*.60,.067,d*.167),shade(CREAM,1.10),.023)
                joinery.box((x,y+.197,z+d*.474),(w*.93,.105,.058),shade(WOOD,.75),.009)
            elif kind=="village-workcase":
                base.box((x,y+h*.50,z),(w,h,d),tone,.028)
                base.box((x,y+h*.92,z),(w+.02,h*.15,d+.017),shade(tone,1.17),.012)
                for side in (-1,1):
                    iron.box((x+side*w*.37,y+h*.75,z-d*.503),(.059,h*.37,.024),METAL,.003)
                iron.box((x,y+h*.53,z-d*.507),(.24,.057,.029),METAL,.007)
            elif kind in ("village-workbench","village-counter"):
                top=.10
                for side in (-1,1):
                    base.box((x+side*(w/2-.09),y+(h-top)*.5,z),(.18,h-top,d-.058),shade(tone,.73),.014)
                base.box((x,y+h-top/2,z),(w,top,d),shade(tone,1.19),.021)
                base.box((x,y+.228,z),(w-.34,.071,d-.107),tone,.012)
                base.box((x+w*.276,y+.55,z),(.62,.43,d-.1),shade(tone,.84),.021)
                if kind=="village-workbench":
                    for j in range(3):
                        yy=y+.43+j*.12
                        joinery.box((x+w*.276,yy,z-d*.468),(.595,.104,.031),shade(tone,.89+.06*j),.004)
                        iron.box((x+w*.276,yy+.006,z-d*.500),(.178,.031,.04),METAL,.005)
                    iron.box((x-w*.29,y+h+.06,z-d*.245),(.34,.137,.245),METAL,.022)
                    iron.box((x-w*.29,y+h+.207,z-d*.245),(.27,.142,.223),TEAL,.019)
                    iron.beam((x-w*.39,y+h+.254,z-d*.245),(x-w*.19,y+h+.254,z-d*.245),.038,METAL)
                    goods.box((x-w*.12,y+.304,z),(.32,.14,.34),SACK,.019)
                    goods.box((x+w*.028,y+h+.024,z+d*.18),(.27,.039,.30),SACK,.005)
                    iron.beam((x-.091,y+h+.054,z-d*.06),(x+.112,y+h+.052,z+d*.211),.034,METAL)
                else:
                    base.box((x,y+h*.535,z-d*.435),(w-.29,h*.65,.079),tone,.018)
                    for j in range(3):
                        goods.tube((x+(j-1)*w*.195,y+h,z+d*.055),[(0,.056),(.08,.075),(.135,.068)],"y",
                                  rng.choice((CREAM,OCHRE,TILE)),8)
                    goods.box((x-w*.31,y+.39,z),(.39,.23,.39),SACK,.025)
            elif kind in ("village-bench","village-table"):
                for sx in (-1,1):
                    for sz in (-1,1):
                        base.box((x+sx*w*.37,y+h*.45,z+sz*d*.34),(.10,h*.9,.11),shade(tone,.69),.012)
                thickness=.10 if kind=="village-bench" else .083
                for n in range(3):
                    base.box((x,y+h-thickness/2,z+(n-1)*d/3),(w,thickness,d/3-.009),shade(tone,.96+n*.06),.012)
                if kind=="village-table":
                    for n in range(2):
                        px=x+(-.23+n*.42)*w
                        if i%3==0:
                            goods.tube((px,y+h,z-.13),[(0,.048),(.022,.07),(.075,.061)],"y",TILE,8)
                        else:
                            goods.box((px,y+h+.022,z+d*.19),(.24,.043,.174),rng.choice((CREAM,TEAL,OCHRE)),.008)
                    joinery.box((x,y+h-.15,z+d*.42),(w*.87,.071,.076),shade(tone,.66))
            else:
                for side in (-1,1):
                    base.box((x,y+h*.50,z+side*(d/2-.042)),(w,.99*h,.084),tone,.015)
                base.box((x+w*.445,y+h*.51,z),(.092,h,d-.12),shade(tone,.71),.011)
                for level in (.12,.42,.72,.985):
                    base.box((x,y+h*level,z),(w,.049,d-.04),shade(tone,1.05),.011)
                if kind=="village-cabinet":
                    for side in (-1,1):
                        base.box((x-w*.45,y+h*.39,z+side*d*.228),(.063,h*.53,d*.449),shade(tone,.85),.012)
                        iron.box((x-w*.505,y+h*.48,z+side*.091),(.028,.093,.042),METAL,.006)
                for row in (1,2):
                    for n in range(3):
                        if kind=="village-cabinet" and row==1:continue
                        width=rng.uniform(.067,.137)
                        zh=z+(n-1)*d*.214
                        bh=rng.uniform(.105,.237)
                        goods.box((x-w*.22,y+h*(.12+.30*row)+bh/2+.025,zh),
                                  (w*.31,bh,width),rng.choice((CREAM,TEAL,TILE,OCHRE)),.010)
        setup.place(kind.removeprefix("village-")+" · "+str(i),x,z,build)


def tower_details(setup,data):
    tower,stairs=data["tower"],data["towerStairs"]
    x,y,z=tower["x"],tower["y"],tower["z"]
    def deck(layer):
        wooden=layer("wood")
        metal=layer("metal")
        high=layer("wood",True)
        stone=layer("concrete",True,False)
        for sign in (-1,1):
            cx=x+sign*2.32
            for j in range(4):
                cy=tower["baseY"]+j*2.95+.31
                stone.box((cx,cy,z+sign*1.95),(.72,.23,.72),STONE,.029)
            wooden.beam((cx,y-4.1,z-1.95),(cx,y-.28,z+1.95),.142,WOOD)
            wooden.beam((cx,y-.28,z-1.95),(cx,y-4.1,z+1.95),.138,WOOD)
        metal.tube((59.93,y,-42.62),[(.095,.65),(.21,.732),(1.31,.732),(1.49,.64)],
                   "y",rgb("6c796f"),14)
        for cy in (.40,1.16):
            metal.tube((59.93,y+cy,-42.62),[(-.031,.74),(.031,.74)],"y",METAL,14)
        high.box((59.9,y+.18,-41.82),(.49,.14,.16),WOOD,.015)
        metal.beam((60.38,y+.86,-42.10),(60.62,y+.86,-41.77),.075,METAL)
    setup.place("Sniper observation deck",x,z,deck)
    for i in range(stairs["flights"]):
        away=i%2==0
        sx=stairs["left"] if away else stairs["right"]
        start,end=(stairs["near"],stairs["far"]) if away else (stairs["far"],stairs["near"])
        bottom=tower["baseY"]+stairs["rise"]*i
        rise=stairs["rise"]
        def staircase(layer):
            base=layer("wood")
            high=layer("wood",True)
            for side in (-1,1):
                hx=sx+side*(stairs["width"]/2+.02)
                base.beam((hx,bottom+.14,start),(hx,bottom+rise-.067,end),.121,WOOD,.15)
                high.beam((hx,bottom+.94,start),(hx,bottom+rise+.83,end),.077,WOOD,.071)
                for j in range(4):
                    t=(j+.17)/4
                    v=bottom+t*rise+.45
                    high.box((hx,v,start+(end-start)*t),(.066,.75,.072),WOOD,.011)
        setup.place("Observation stairs · flight "+str(i+1),sx,(start+end)/2,staircase)


def main(source,runtime):
    data=json.loads((source/"village.json").read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    imported=[]
    for name in ("01 · Ground and walkable building shells","03 · Street dressing and vegetation"):
        collection=bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        imported.append(collection)
    for incoming in data["meshes"]:source_mesh(incoming,imported[bool(incoming["detail"])])
    setup=LayeredMap(("02 · Tel Mazin architecture and furniture","04 · Finish, railings and workshop details"),
                    authored_mesh,grids=(38,25))
    for i,structure in enumerate(data["structures"]):facade(setup,structure,i)
    frame_openings(setup,data)
    furnishings(setup,data)
    tower_details(setup,data)
    for tier,name in enumerate(("base","detail")):
        setup.export(bool(tier),source/(name+".glb"),imported[tier].objects)
    runtime.mkdir(parents=True,exist_ok=True)
    for name in ("roads.webp","labels.webp"):
        shutil.copyfile(source/name,runtime/name)
    manifest={"layout":data["layout"],"span":data["span"],"batches":len(setup.batches)}
    (runtime/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    preview_materials(source,data["span"])
    camera=bpy.data.objects.new("Market and observation stairs",bpy.data.cameras.new("Tel Mazin town"))
    scene.collection.objects.link(camera)
    camera.location=(14,53,20)
    camera.rotation_euler=(Vector((58,41,6))-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.clip_end=2400
    camera.data.lens=42
    scene.camera=camera
    sun=bpy.data.objects.new("Morning sun",bpy.data.lights.new("Morning sun","SUN"))
    sun.data.energy=2.8
    sun.rotation_euler=Vector((35,-25,-56)).to_track_quat("-Z","Y").to_euler()
    scene.collection.objects.link(sun)
    scene.world=bpy.data.worlds.new("Tel Mazin sky")
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.6
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.clip_end=2600
                space.shading.color_type="VERTEX"
                space.region_3d.view_location=(47,24,3)
                space.region_3d.view_distance=109
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"tel-mazin.blend"),compress=True)


if __name__=="__main__":
    main(*(Path(value).resolve() for value in sys.argv[sys.argv.index("--")+1:]))
