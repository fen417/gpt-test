"""Editable two-seat utility ATV, with matching steering and wheel pivots.

Design reference: Polaris Sportsman Touring 570, especially the split seat,
cargo decks and space around the independent wheels. Dimensions follow the game.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0,str(HERE.parent))
from weapon_mesh import Assembly
from weapon_finish import shader_finish

OLIVE = (.169,.220,.103)
PANEL = (.116,.154,.078)
OLIVE_EDGE = (.231,.281,.145)
CHARCOAL = (.036,.043,.038)
FRAME = (.048,.059,.055)
STEEL = (.139,.164,.159)
CAST = (.095,.113,.106)
ALLOY = (.260,.289,.280)
RUBBER = (.023,.028,.024)
TREAD = (.040,.047,.038)
SEAT = (.054,.060,.050)
GRAIN = (.081,.091,.075)
STITCH = (.247,.233,.164)
SAND = (.271,.224,.139)
LAMP = (.712,.739,.607)
AMBER = (.653,.216,.034)
RED = (.402,.036,.027)
DISPLAY = (.145,.311,.268)
INK = (.586,.640,.514)
STEERING = (0,1.06,-.48)
AXLES = [(side*.54,.31,direction*.73) for side in [-1,1] for direction in [-1,1]]


def rod(mesh,a,b,r,color,sides=8):
    start,end=Vector(a),Vector(b)
    axis=(end-start).normalized()
    right=axis.cross(Vector((1,0,0) if abs(axis.x)<.9 else (0,0,1))).normalized()
    up=axis.cross(right)
    mesh.rings([[tuple(p+r*(right*math.cos(i*math.tau/sides)+up*math.sin(i*math.tau/sides)))
                 for i in range(sides)] for p in (start,end)],color)


def shell(mesh,sections,color):
    for z,bottom,shoulder,top,width,top_width in sections:
        assert bottom<shoulder<top
    mesh.rings([[(-w*.79,b,z),(w*.79,b,z),(w,s,z),(t,y,z),(-t,y,z),(-w,s,z)]
                for z,b,s,y,w,t in sections],color)


def lens(mesh,side,shape,z,depth,color):
    mesh.rings([[(side*x,y,z-depth*t+x*.13) for x,y in shape] for t in (0,1)],color)


def fender(mesh,side,direction):
    rings=[]
    for a in range(24,157,11):
        angle=math.radians(a)
        contour=[]
        for x,r in [(.245,.373),(.35,.422),(.564,.405),(.682,.361),(.684,.347),(.54,.359),(.255,.338)]:
            contour.append((side*x,.31+math.sin(angle)*r,direction*.73+math.cos(angle)*r))
        rings.append(contour)
    first=len(mesh.faces)
    mesh.rings(rings,OLIVE)
    mesh.smooth_faces.extend(first+1+row*7+col for row in range(len(rings)-1) for col in (0,1,2))
    # A short rubber flap behind the tread leaves the suspension leg visible.
    mesh.box((side*.504,.402,direction*.73+.325),(.294,.132,.037),CHARCOAL,.012)


def rack(mesh,z0,z1,y,width):
    path=[(-width+.065,y,z0),(-width,y,z0+.05),(-width,y,z1-.05),
          (-width+.065,y,z1),(width-.065,y,z1),(width,y,z1-.05),
          (width,y,z0+.05),(width-.065,y,z0)]
    for a,b in zip(path,path[1:]+path[:1]):
        rod(mesh,a,b,.019,FRAME)
    for z in [z0+.095,(z0+z1)/2,z1-.095]:
        rod(mesh,(-width,y,z),(width,y,z),.014,FRAME,6)


def chassis():
    body=Assembly()
    body.smooth_faces=[]
    shell(body,[(-.98,.33,.44,.56,.24,.20),(-.66,.28,.48,.66,.292,.23),
                (.36,.27,.50,.69,.298,.24),(.96,.36,.47,.60,.235,.204)],FRAME)
    shell(body,[(-1.084,.56,.645,.731,.289,.257),(-.948,.57,.751,.829,.405,.337),
                (-.72,.58,.801,.888,.38,.302),(-.48,.62,.798,.937,.29,.215),
                (-.31,.653,.765,.846,.21,.176),(-.14,.67,.74,.782,.16,.153)],OLIVE)
    shell(body,[(.28,.51,.60,.775,.229,.204),(.605,.50,.64,.792,.321,.27),
                (.84,.49,.653,.792,.409,.33),(1.08,.519,.621,.741,.361,.30)],PANEL)
    shell(body,[(-.378,.57,.662,.765,.165,.133),(-.13,.57,.69,.784,.196,.167),
                (.28,.59,.673,.767,.207,.156),(.57,.62,.695,.772,.198,.155)],FRAME)
    shell(body,[(-.4,.74,.78,.824,.148,.135),(-.253,.746,.792,.847,.206,.178),
                (.073,.741,.795,.853,.224,.186),(.233,.738,.784,.821,.203,.177)],SEAT)
    shell(body,[(.217,.742,.793,.853,.19,.169),(.359,.745,.807,.890,.225,.186),
                (.601,.742,.824,.902,.217,.187),(.672,.749,.823,.866,.192,.162)],SEAT)
    shell(body,[(.624,.805,.915,1.019,.173,.142),(.69,.796,.927,1.096,.196,.163),
                (.758,.785,.925,1.075,.180,.145)],CHARCOAL)
    body.box((0,.638,-1.060),(.322,.148,.073),CHARCOAL,.022)
    front=[(.157,.712),(.308,.709),(.366,.756),(.267,.801),(.168,.783)]
    for side in [-1,1]:
        for z,top,bottom,x in [(-.884,.902,.825,.232),(-.639,.902,.871,.244),
                               (.861,.812,.783,.302),(1.022,.812,.759,.310)]:
            rod(body,(side*x,bottom,z),(side*x,top,z),.026,CAST,8)
        fender(body,side,-1)
        fender(body,side,1)
        body.box((side*.418,.396,.052),(.31,.087,.736),CHARCOAL,.029)
        rod(body,(side*.268,.45,-.59),(side*.27,.43,.58),.027,FRAME,8)
        rod(body,(side*.25,.441,-.72),(side*.515,.31,-.73),.026,FRAME)
        rod(body,(side*.22,.45,.71),(side*.515,.31,.73),.026,FRAME)
        rod(body,(side*.221,.503,-.61),(side*.485,.321,-.73),.016,STEEL)
        rod(body,(side*.239,.505,.57),(side*.485,.321,.73),.016,STEEL)
        lens(body,side,front,-1.079,.030,CHARCOAL)
        inset=[(.181,.724),(.285,.725),(.317,.753),(.267,.780),(.185,.769)]
        lens(body,side,inset,-1.108,.009,LAMP)
        body.box((side*.246,.671,1.072),(.167,.079,.036),CHARCOAL,.013)
        body.box((side*.246,.676,1.094),(.137,.042,.014),RED,.009)
        rod(body,(side*.28,.795,.246),(side*.33,.835,.34),.017,FRAME)
        rod(body,(side*.33,.835,.34),(side*.33,.835,.59),.017,FRAME)
        rod(body,(side*.33,.835,.59),(side*.289,.769,.724),.017,FRAME)
    rack(body,-.968,-.565,.913,.339)
    rack(body,.785,1.094,.825,.386)
    for side in [-1,1]:
        rod(body,(side*.354,.604,-1.085),(side*.309,.435,-1.154),.025,FRAME)
        rod(body,(side*.309,.435,-1.154),(side*.248,.365,-1.003),.023,FRAME)
        rod(body,(side*.359,.574,1.078),(side*.28,.443,1.139),.021,FRAME)
    rod(body,(-.309,.435,-1.154),(.309,.435,-1.154),.025,FRAME)
    rod(body,(-.28,.443,1.139),(.28,.443,1.139),.021,FRAME)
    return body


def spring(mesh,a,b,r):
    start,end=Vector(a),Vector(b)
    axis=(end-start).normalized()
    right=axis.cross(Vector((0,0,1))).normalized()
    up=axis.cross(right)
    turns,steps=5,50
    path=[]
    for i in range(steps+1):
        t=i/steps
        radial=right*math.cos(t*turns*math.tau)+up*math.sin(t*turns*math.tau)
        p=start.lerp(end,t)+radial*r
        path.append((p,radial))
    rings=[]
    for i,(p,radial) in enumerate(path):
        tangent=(path[min(i+1,steps)][0]-path[max(0,i-1)][0]).normalized()
        side=tangent.cross(radial).normalized()
        rings.append([tuple(p+.007*(radial*math.cos(t)+side*math.sin(t)))
                      for t in (j*math.tau/6 for j in range(6))])
    mesh.rings(rings,OLIVE_EDGE)


def hardware():
    part=Assembly()
    for i in range(7):
        y=.583+i*.016
        part.box((0,y,-1.099),(.291-i*.008,.006,.009),STEEL,.001)
    for z,y,width in [(-.881,.916,.54),(-.754,.916,.54),(-.621,.916,.54),
                      (.878,.828,.615),(1.003,.828,.615)]:
        for side in [-1,1]:
            part.box((side*width*.25,y,z),(width*.43,.013,.063),CAST,.005)
    for side in [-1,1]:
        for z in (-.73,.73):
            top=(side*.271,.576,z+(.06 if z<0 else -.055))
            lower=(side*.425,.325,z)
            rod(part,top,lower,.018,ALLOY)
            spring(part,top,lower,.036)
        for j in range(7):
            y=.485+j*.024
            part.box((side*.286,y,-.093),(.062,.010,.27-j*.012),CAST,.004)
        for j in range(5):
            z=-.235+j*.128
            part.box((side*.418,.446,z),(.238,.013,.035),STEEL,.003)
        for z,y in [(-.376,.805),(-.002,.842),(.324,.872),(.575,.89)]:
            rod(part,(side*.137,y,z),(side*.17,y,z+.014),.0034,STITCH,5)
        for z in [-.925,-.626,.824,1.054]:
            part.cylinder((side*.279,.914 if z<0 else .829,z),.012,.010,"y",ALLOY,6)
        for z in [-.535,.57]:
            part.cylinder((side*.307,.571,z),.019,.012,"x",ALLOY,6)
        part.box((side*.396,.661,-.914),(.034,.047,.107),AMBER,.008)
        part.box((side*.251,.679,1.104),(.027,.031,.008),LAMP,.004)
        part.box((side*.195,.558,.993),(.055,.089,.044),RUBBER,.008)
    # The exhaust and its guard sit below the rear plastic, clear of the rack.
    rod(part,(.227,.472,.18),(.251,.497,.55),.035,CAST,10)
    rod(part,(.251,.497,.55),(.262,.549,.658),.034,CAST,10)
    part.cylinder((.262,.549,.82),.062,.32,"z",CAST,14)
    part.cylinder((.262,.549,.981),.050,.015,"z",ALLOY,12)
    part.cylinder((.262,.549,.993),.032,.014,"z",RUBBER,12)
    part.box((.314,.549,.825),(.039,.084,.228),STEEL,.013)
    part.box((0,.419,1.028),(.158,.086,.114),CAST,.011)
    return part


def controls(detail=False):
    part=Assembly()
    if detail:
        for side in [-1,1]:
            for j in range(8):
                x=side*(.295+j*.014)
                part.tube((x,.028,.02),[(-.0025,.027),(.0025,.027)],"x",TREAD,8)
            rod(part,(side*.274,.04,-.006),(side*.320,.034,-.043),.007,ALLOY)
            rod(part,(side*.320,.034,-.043),(side*.416,.032,-.058),.007,ALLOY)
            part.box((side*.310,.056,-.012),(.037,.014,.028),RED if side<0 else AMBER,.005)
            rod(part,(side*.266,.020,.006),(side*.175,-.085,.016),.0045,RUBBER)
            rod(part,(side*.175,-.085,.016),(0,-.205,.051),.0045,RUBBER)
        four=("101","101","111","001","001")
        cross=("101","101","010","101","101")
        for k,glyph in enumerate((four,cross,four)):
            for row,line in enumerate(glyph):
                for col,pixel in enumerate(line):
                    if pixel=="1":
                        x=-.044+(k*4+col)*.008
                        z=-.095+row*.008
                        part.add([(x,.071,z),(x,.071,z+.006),(x+.006,.071,z+.006),(x+.006,.071,z)],
                                 [(0,1,2,3)],INK)
    else:
        rod(part,(0,-.291,.045),(0,-.033,.009),.031,FRAME)
        for side in [-1,1]:
            rod(part,(0,-.033,.009),(side*.206,.018,-.015),.018,STEEL)
            rod(part,(side*.206,.018,-.015),(side*.289,.028,.020),.018,STEEL)
            rod(part,(side*.284,.028,.020),(side*.433,.028,.020),.026,RUBBER,10)
            part.cylinder((side*.437,.028,.020),.026,.012,"x",CAST,8)
            part.box((side*.272,.031,.023),(.045,.052,.064),CHARCOAL,.009)
        part.box((0,.017,-.061),(.242,.075,.177),CHARCOAL,.019)
        part.box((0,.056,-.076),(.173,.012,.096),CAST,.007)
        part.box((0,.065,-.079),(.142,.010,.075),DISPLAY,.004)
    return part


def wheel(detailed):
    part=Assembly()
    n=28 if detailed else 14
    radius=.287 if detailed else .309
    part.tube((0,0,0),[(-.139,.204),(-.134,.239),(-.099,radius),(.092,radius),
                       (.13,.25),(.141,.205)],"x",RUBBER,n)
    part.tube((0,0,0),[(.14,.177),(.152,.177),(.158,.149),(.146,.132)],"x",STEEL,n)
    part.cylinder((.16,0,0),.066,.028,"x",CAST,12 if detailed else 8)
    for k in range(5):
        a=k*math.tau/5
        if detailed:
            rod(part,(.161,.052*math.cos(a),.052*math.sin(a)),
                (.155,.145*math.cos(a+.10),.145*math.sin(a+.10)),.014,CAST,6)
            part.cylinder((.175,.048*math.cos(a),.048*math.sin(a)),.008,.012,"x",ALLOY,6)
        else:
            rod(part,(.152,.048*math.cos(a),.048*math.sin(a)),
                (.148,.144*math.cos(a+.10),.144*math.sin(a+.10)),.014,CAST,4)
    if detailed:
        # Offset left and right rows form the deep chevron tread and shoulder lugs.
        def lug(x,r,a):
            return (x,r*math.cos(a),r*math.sin(a))
        for k in range(22):
            a=k*math.tau/22
            for side in (-1,1):
                adjust=.045 if side<0 else 0
                base=[(side*.017,a+adjust-.056),(side*.113,a+adjust+.032),
                      (side*.113,a+adjust+.132),(side*.017,a+adjust+.027)]
                part.rings([[lug(x,r,t) for x,t in base] for r in (.281,.310)],TREAD)
                pad=[(side*.109,a+adjust+.039),(side*.138,a+adjust+.11),
                     (side*.138,a+adjust+.184),(side*.109,a+adjust+.11)]
                part.rings([[lug(x,r,t) for x,t in pad] for r in (.256,.287)],TREAD)
    return part


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    collection=scene.collection
    paint=bpy.data.materials.new("ATV finishes")
    paint.use_backface_culling=True
    graph=paint.node_tree
    bsdf=graph.nodes.get("Principled BSDF")
    colors=graph.nodes.new("ShaderNodeVertexColor")
    colors.layer_name="Paint"
    graph.links.new(colors.outputs["Color"],bsdf.inputs["Base Color"])
    finishes=((.64,.08,.12),(.81,.03,.22),(.51,.60,.11),(.89,0,.19))
    shader_finish(paint,bsdf,4,finishes)
    rows={CHARCOAL:1,RUBBER:1,TREAD:1,FRAME:2,STEEL:2,CAST:2,ALLOY:2,SEAT:3,GRAIN:3,STITCH:3}
    badge=Assembly()
    badge.box((0,.923,-.766),(.156,.022,.090),SAND,.004)
    parts={"Body":chassis(),"BodyDetail":hardware(),"Controls":controls(),"ControlDetail":controls(True),
           "Wheel":wheel(True),"WheelLow":wheel(False),"Badge":badge}
    for name,mesh in parts.items():
        obj=mesh.object(name,collection)
        for i in getattr(mesh,"smooth_faces",()):
            obj.data.polygons[i].use_smooth=True
        uv=obj.data.uv_layers.active
        uv.name="Surface finish"
        for face,color in zip(obj.data.polygons,mesh.colors):
            nx,nz,ny=face.normal
            row=rows.get(color,0)
            for i in face.loop_indices:
                x,z,y=obj.data.vertices[obj.data.loops[i].vertex_index].co
                u,v=(-z,x) if abs(ny)>.65 else ((-z,y) if abs(nx)>abs(nz) else (x,y))
                uv.uv[i].vector=(.5+.26*u,(row+.48+.24*v)/4)
        obj.data.materials.append(paint)
    output=HERE.parents[1]/"src"/"assets"/"atv"/"atv.glb"
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",export_vertex_color="ACTIVE",
                              export_meshopt_compression_enable=True,export_meshopt_extension="EXT_meshopt_compression")
    for name in ("Controls","ControlDetail"):
        x,y,z=STEERING
        collection.objects[name].location=(x,-z,y)
    template=collection.objects["Wheel"]
    for i,(x,y,z) in enumerate(AXLES):
        obj=template.copy()
        obj.name=f"Wheel {i+1}"
        obj.location=(x,-z,y)
        if x<0:
            obj.rotation_euler.z=math.pi
        collection.objects.link(obj)
    for name in ("Wheel","WheelLow"):
        collection.objects[name].hide_set(True)
        collection.objects[name].hide_render=True
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                view=area.spaces.active
                view.shading.color_type="VERTEX"
                view.region_3d.view_location=(0,0,.58)
                view.region_3d.view_distance=3.6
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"utility-atv.blend"),compress=True)


if __name__=="__main__":
    main()
