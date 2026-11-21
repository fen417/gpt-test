"""Build the game HMMWV exterior, cabin, and independent visual assemblies.

Exterior reference: https://www.amgeneral.com/wp-content/uploads/2019/12/M1151.pdf
Cabin reference: https://www.armytrucksinc.com/grid-c1on
Coordinates fit the game's existing seats, collision and window openings.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0,str(HERE.parent))
from weapon_mesh import Assembly, side_profile
from weapon_finish import shader_finish


PAINT = (.164,.190,.123)
LIGHT = (.227,.247,.162)
DARK_PAINT = (.106,.117,.076)
WORN = (.276,.280,.195)
STEEL = (.073,.087,.088)
EDGE = (.219,.235,.230)
RUBBER = (.025,.031,.028)
TREAD = (.038,.043,.034)
CABIN = (.104,.113,.083)
FABRIC = (.082,.094,.061)
SEAT_INSERT = (.125,.137,.092)
STITCH = (.157,.173,.109)
TAN = (.275,.216,.123)
PAPER = (.652,.604,.456)
NEEDLE = (.650,.119,.062)
AMBER = (.566,.247,.040)
RED = (.390,.054,.041)
GLASS = (.182,.282,.302)
LAMP = (.780,.643,.374)
DISPLAY = (.103,.312,.244)
INK = (.660,.722,.630)

SEATS = ((-.54,-.52),(.54,-.52),(-.54,.71),(.54,.71))
STEERING = (-.54,1.24,-.825)
TURRET = (0,2.18,.19)
SPEEDOMETER = (-.565,1.316,-.831)


def tube(mesh, a, b, radius, color, sides=10):
    start,end=Vector(a),Vector(b)
    axis=(end-start).normalized()
    normal=axis.cross(Vector((1,0,0) if abs(axis.x)<.9 else (0,0,1))).normalized()
    binormal=axis.cross(normal)
    circles=[[tuple(p+radius*(normal*math.cos(t)+binormal*math.sin(t)))
              for t in (i*math.tau/sides for i in range(sides))] for p in (start,end)]
    mesh.rings(circles,color)


def hoop(mesh, origin, radius, thickness, color, tilt=0, sides=40):
    x,y,z=origin
    vertices=[]
    for i in range(sides):
        a=i*math.tau/sides
        for j in range(8):
            b=j*math.tau/8
            r=radius+thickness*math.cos(b)
            u,v,w=r*math.cos(a),r*math.sin(a),thickness*math.sin(b)
            vertices.append((x+u,y+v*math.cos(tilt)-w*math.sin(tilt),z+v*math.sin(tilt)+w*math.cos(tilt)))
    faces=[(i*8+j,i*8+(j+1)%8,((i+1)%sides)*8+(j+1)%8,((i+1)%sides)*8+j)
           for i in range(sides) for j in range(8)]
    mesh.add(vertices,faces,color)


def hood_section(mesh,zs,color):
    sections=[]
    for z,w,lower,shoulder,top in zs:
        sections.append([(-w,lower,z),(w,lower,z),(w,shoulder,z),(w-.125,top,z),
                         (-w+.125,top,z),(-w,shoulder,z)])
    mesh.rings(sections,color)


def roof(mesh):
    z0=.19
    points=[]
    for y,inner,xside,zfront,zrear in [(1.752,.467,1.009,-1.118,1.446),(1.873,.481,.965,-1.084,1.408)]:
        for outside in (False,True):
            for i in range(48):
                a=i*math.tau/48
                x,z=math.cos(a),math.sin(a)
                r=min(xside/max(abs(x),.00001),(zrear-z0)/max(z,.00001) if z>0 else (z0-zfront)/max(-z,.00001))
                r=r if outside else inner
                points.append((x*r,y,z0+z*r))
    faces=[]
    for ring,other in ((0,1),(1,3),(3,2),(2,0)):
        for i in range(48):
            j=(i+1)%48
            faces.append((ring*48+i,ring*48+j,other*48+j,other*48+i))
    mesh.add(points,faces,PAINT)


def hull():
    body,chassis,trim=Assembly(),Assembly(),Assembly()
    hood_section(body,[(-2.385,.873,.635,.970,1.024),(-2.225,.950,.640,1.040,1.104),
                       (-1.540,.961,.653,1.118,1.245),(-1.331,1.001,.657,1.201,1.276)],PAINT)
    hood_section(body,[(-2.310,.696,1.023,1.047,1.064),(-2.100,.803,1.084,1.113,1.132),
                       (-1.537,.787,1.202,1.236,1.257),(-1.396,.722,1.217,1.242,1.264)],LIGHT)
    body.box((0,.723,.036),(1.85,.223,3.10),DARK_PAINT,.043)
    hood_section(body,[(1.412,.987,.663,1.281,1.322),(1.714,1.006,.650,1.241,1.286),
                       (2.245,.970,.627,1.182,1.216),(2.403,.881,.631,1.110,1.148)],PAINT)
    body.box((0,.906,2.405),(1.772,.426,.065),LIGHT,.025)
    body.box((0,1.18,1.45),(1.96,.269,.125),PAINT,.020)
    roof(body)
    for side in (-1,1):
        # Armour below each opening, with distinct front and rear door seams.
        for offset,width in [(-.575,1.255),(.740,1.307)]:
            body.box((side*.979,1.105,offset),(.135,.478,width),PAINT,.024)
            body.box((side*1.039,1.147,offset),(.028,.305,width-.115),LIGHT,.012)
            body.box((side*1.045,.989,offset),(.022,.090,width-.134),DARK_PAINT,.007)
        for a,b in [(-1.338,-1.035),(-.025,.150),(1.310,1.442)]:
            body.box((side*.975,1.545,(a+b)/2),(.093,.399,b-a),DARK_PAINT,.012)
        for offset,width in [(-.53,1.01),(.73,1.16)]:
            for y in (1.343,1.736):
                body.box((side*.976,y,offset),(.111,.037,width+.08),PAINT,.006)
            for z in (offset-width/2-.019,offset+width/2+.019):
                chassis.box((side*.969,1.54,z),(.105,.347,.041),RUBBER,.004)
        # Cut-out fenders. The road tyres and their steering envelope are clear.
        for z in (-1.55,1.55):
            for sign in (-1,1):
                za=z+sign*.475
                body.box((side*1.013,.873,za),(.188,.223,.281),DARK_PAINT,.030)
            side_profile(body,[(z-.60,.981),(z-.48,1.105),(z-.25,1.125),(z+.27,1.125),
                              (z+.54,1.07),(z+.61,.981),(z+.514,.926),(z+.42,1.011),
                              (z-.32,1.019),(z-.495,.913)],.222,PAINT,side*1.024)
            chassis.box((side*1.038,.567,z+.531),(.118,.324,.065),RUBBER,.012)
            chassis.box((side*1.145,1.046,z-.173),(.019,.104,.087),AMBER,.006)
        for z in (-1.09,.135,1.302):
            for y in (1.022,1.245):
                trim.box((side*1.059,y,z),(.043,.077,.130),DARK_PAINT,.009)
                trim.cylinder((side*1.084,y,z),.015,.009,'x',EDGE,10)
        for z in (-.164,1.099):
            trim.box((side*1.063,1.242,z),(.104,.094,.195),RUBBER,.019)
            trim.box((side*1.115,1.246,z),(.030,.034,.118),EDGE,.005)
        for z in (-.98,1.109):
            trim.box((side*1.054,1.105,z),(.018,.029,.087),PAPER,.003)
        chassis.box((side*.965,.633,.103),(.253,.102,2.35),STEEL,.010)
        for n in range(20):
            trim.box((side*1.042,.695,-.945+n*.110),(.129,.015,.036),TREAD,.002)
        tube(chassis,(side*.976,1.294,-.988),(side*1.172,1.380,-.929),.027,STEEL)
        chassis.box((side*1.185,1.389,-.927),(.164,.212,.072),RUBBER,.021)
        chassis.box((side*1.188,1.386,-.888),(.128,.164,.008),EDGE,.008)
        trim.box((side*.964,.999,-1.445),(.055,.125,.143),STEEL,.010)
        trim.box((side*.980,1.006,-1.441),(.069,.049,.044),EDGE,.006)
        for n in range(5):
            trim.box((side*.857,1.236,-1.68+.049*n),(.118,.013,.018),DARK_PAINT,.001)
    body.box((0,1.211,-1.332),(1.998,.155,.153),PAINT,.010)
    body.box((0,1.747,-1.107),(1.998,.059,.083),LIGHT,.008)
    body.box((0,1.74,1.404),(1.97,.075,.089),LIGHT,.009)
    body.box((0,1.329,1.435),(1.935,.057,.092),DARK_PAINT,.010)
    for side in (-1,0,1):
        x=side*.965
        tube(body,(x,1.262,-1.339),(x,1.752,-1.111),.033,LIGHT,8)
        if side:
            tube(body,(x,1.324,1.428),(x,1.752,1.395),.038,PAINT,8)
            tube(trim,(side*.325,1.317,-1.326),(side*.594,1.514,-1.234),.010,STEEL,8)
            tube(trim,(side*.477,1.332,-1.325),(side*.615,1.544,-1.222),.012,RUBBER,8)
    chassis.box((0,.515,-2.410),(2.193,.165,.177),STEEL,.026)
    chassis.box((0,.510,2.378),(2.118,.154,.175),STEEL,.029)
    chassis.box((0,.906,-2.386),(1.205,.341,.075),RUBBER,.015)
    for i in range(7):
        x=(i-3)*.158
        chassis.box((x,.912,-2.432),(.063,.276,.046),DARK_PAINT,.006)
        trim.box((x,.921,-2.460),(.026,.271,.011),EDGE,.003)
    for z in (-1.55,1.55):
        tube(chassis,(-.81,.478,z),(.81,.478,z),.060,STEEL,12)
    for side in (-1,1):
        chassis.cylinder((side*.785,.941,-2.370),.165,.090,'z',STEEL,24)
        chassis.cylinder((side*.785,.941,-2.423),.139,.045,'z',EDGE,24)
        chassis.cylinder((side*.785,.941,-2.450),.120,.024,'z',LAMP,24)
        for y in (.91,.947,.983):
            trim.box((side*.785,y,-2.463),(.163,.007,.005),PAPER,.002)
        chassis.box((side*.802,.748,-2.447),(.191,.068,.043),AMBER,.009)
        chassis.box((side*.889,.891,2.418),(.158,.285,.049),RUBBER,.019)
        chassis.box((side*.889,.942,2.447),(.114,.091,.022),RED,.009)
        chassis.box((side*.889,.829,2.447),(.114,.059,.022),AMBER,.007)
        hoop(trim,(side*.726,.623,-2.513),.075,.018,EDGE,sides=20)
        hoop(trim,(side*.739,.621,2.491),.069,.017,EDGE,sides=20)
        tube(trim,(side*.720,1.173,-2.349),(side*.721,.690,-2.510),.027,STEEL)
    tube(trim,(-.722,1.173,-2.349),(.722,1.173,-2.349),.026,STEEL)
    chassis.box((0,.654,2.467),(.231,.148,.100),STEEL,.023)
    trim.box((.367,.966,2.453),(.315,.143,.017),PAPER,.006)
    chassis.cylinder((-.293,.872,2.416),.319,.215,'z',RUBBER,28)
    chassis.cylinder((-.293,.872,2.540),.188,.035,'z',STEEL,22)
    for i in range(6):
        a=i*math.tau/6
        trim.cylinder((-.293+math.cos(a)*.108,.872+math.sin(a)*.108,2.566),.024,.025,'z',EDGE,10)
    trim.box((.671,1.302,1.906),(.304,.258,.323),DARK_PAINT,.028)
    for x in (.578,.755):
        trim.box((x,1.423,1.906),(.034,.031,.304),EDGE,.004)
    tube(chassis,(.849,1.182,2.167),(.819,2.707,2.119),.011,STEEL,8)
    chassis.cylinder((.847,1.233,2.165),.031,.124,'y',RUBBER,12)
    return body,chassis,trim


def glaze():
    panes=[Assembly() for _ in range(7)]

    def front_z(y):
        return -1.34+(y-1.26)*.23/.49

    def rear_z(y):
        return 1.43+(y-1.32)*(-.035)/.43

    for i,(a,b) in enumerate([(-.942,-.024),(.024,.942)]):
        low,high=1.303,1.707
        panes[i].add([(a,low,front_z(low)),(b,low,front_z(low)),(b,high,front_z(high)),(a,high,front_z(high))],[(0,1,2,3)],GLASS)
    panes[2].add([(-.941,1.346,rear_z(1.346)),(.941,1.346,rear_z(1.346)),
                  (.941,1.714,rear_z(1.714)),(-.941,1.714,rear_z(1.714))],[(0,1,2,3)],GLASS)
    for i,side in enumerate((-1,1)):
        for j,(z,w) in enumerate(((-.53,1.01),(.73,1.16))):
            a,b=z-w/2,z+w/2
            panes[3+i*2+j].add([(side*.975,1.365,a),(side*.975,1.365,b),
                                (side*.975,1.715,b),(side*.975,1.715,a)],[(0,1,2,3)],GLASS)
    return panes


def gauge(mesh,x,y,z,r):
    mesh.cylinder((x,y,z),r+.009,.020,'z',EDGE,24)
    mesh.cylinder((x,y,z+.012),r,.013,'z',RUBBER,24)
    for i in range(10):
        a=math.radians(225-270*i/9)
        centre=(x+math.cos(a)*r*.74,y+math.sin(a)*r*.74,z+.019)
        tip=(x+math.cos(a)*r*.9,y+math.sin(a)*r*.9,z+.019)
        tube(mesh,centre,tip,.0027 if i%3==0 else .0016,INK,5)
        if r>.06 and i%3==0:
            dial_label(mesh,str(i//3*20),x+math.cos(a)*r*.55,y+math.sin(a)*r*.55,z+.020)
    mesh.cylinder((x,y,z+.020),r*.14,.005,'z',STEEL,10)
    if r<.06:
        tube(mesh,(x,y,z+.024),(x-r*.53,y-r*.43,z+.024),.002,NEEDLE,5)


def dial_label(mesh,label,x,y,z):
    glyphs={
        '0':("111","101","101","101","111"),
        '2':("111","001","111","100","111"),
        '4':("101","101","111","001","001"),
        '6':("111","100","111","101","111"),
    }
    step=.0016
    for index,digit in enumerate(label):
        offset=(index-(len(label)-1)/2)*4
        for row,line in enumerate(glyphs[digit]):
            for col,pixel in enumerate(line):
                if pixel=="1":
                    x0,y0=x+(offset+col-1.45)*step,y+(1.55-row)*step
                    mesh.add([(x0,y0,z),(x0+step,y0,z),(x0+step,y0+step,z),(x0,y0+step,z)],[(0,1,2,3)],INK)


def cabin():
    cabin,detail=Assembly(),Assembly()
    cabin.box((0,.757,.085),(1.871,.090,2.663),CABIN,.025)
    cabin.box((0,.990,-.958),(.339,.385,.871),CABIN,.054)
    cabin.box((0,.906,.344),(.269,.198,1.039),CABIN,.036)
    side_profile(cabin,[(-1.208,1.125),(-1.198,1.272),(-.966,1.292),(-.847,1.208),
                        (-.786,1.134),(-.761,1.036),(-1.077,1.054)],1.798,CABIN)
    cabin.box((-.481,1.284,-.918),(.614,.171,.109),STEEL,.017)
    cabin.box((.516,1.169,-.874),(.651,.198,.078),CABIN,.018)
    tube(detail,(.315,1.178,-.814),(.688,1.178,-.814),.019,RUBBER)
    cabin.box((.519,1.247,-.982),(.672,.017,.222),RUBBER,.013)
    for x in (-.54,.54):
        cabin.box((math.copysign(.927,x),.851,.052),(.145,.187,2.724),DARK_PAINT,.021)
        for z in (-.57,.728):
            cabin.box((x,.815,z),(.416,.127,.437),STEEL,.031)
            cabin.box((x,.897,z),(.450,.134,.450),FABRIC,.036)
            side_profile(cabin,[(z+.169,.956),(z+.269,.940),(z+.365,1.336),(z+.332,1.508),
                                (z+.236,1.509),(z+.203,1.286)],.431,FABRIC,x)
            cabin.box((x,1.448,z+.294),(.258,.176,.111),FABRIC,.033)
            cabin.box((x,.963,z-.009),(.282,.029,.357),SEAT_INSERT,.014)
            side_profile(cabin,[(z+.158,1.003),(z+.177,1.004),(z+.235,1.291),
                                (z+.227,1.351),(z+.199,1.353)],.287,SEAT_INSERT,x)
            side_profile(detail,[(z+.300,1.088),(z+.312,1.088),(z+.369,1.324),(z+.360,1.325)],
                         .300,SEAT_INSERT,x)
            detail.box((x,1.318,z+.367),(.278,.023,.010),STITCH,.004)
            detail.box((x,1.443,z+.347),(.176,.081,.009),SEAT_INSERT,.008)
            for offset in (-.183,.183):
                detail.box((x+offset,.958,z),(.011,.004,.374),STITCH,.002)
                detail.box((x+offset,1.23,z+.203),(.014,.235,.009),STITCH,.003)
            detail.box((x-(.233 if x>0 else -.233),.950,z+.103),(.046,.081,.061),RUBBER,.008)
            detail.box((x-(.233 if x>0 else -.233),.992,z+.104),(.035,.010,.039),RED,.003)
            detail.box((x,.815,z-.080),(.489,.022,.327),TREAD,.012)
            for i in range(6):
                detail.box((x,.830,z-.218+i*.048),(.404,.010,.017),RUBBER,.003)
        for z in (-.549,.721):
            cabin.box((math.copysign(.908,x),1.103,z),(.060,.335,1.048),CABIN,.023)
            detail.box((math.copysign(.870,x),1.169,z),(.067,.067,.607),RUBBER,.018)
            detail.box((math.copysign(.866,x),1.260,z+.254),(.037,.067,.139),STEEL,.008)
        detail.box((math.copysign(.930,x),1.579,-.034),(.031,.109,.077),RUBBER,.008)
        tube(detail,(math.copysign(.908,x),1.528,-.034),(math.copysign(.803,x),.994,-.288),.015,TAN,8)
        detail.box((x,1.278,-1.109),(.488,.025,.077),STEEL,.005)
        for i in range(7):
            detail.box((x-.205+i*.065,1.297,-1.109),(.042,.008,.045),RUBBER,.002)
    for x,y,r in [(-.565,1.316,.067),(-.408,1.314,.041),(-.706,1.319,.043),(-.311,1.297,.034)]:
        gauge(detail,x,y,-.853,r)
    for x in (-.697,-.542,-.381):
        detail.box((x,1.229,-.847),(.080,.019,.009),PAPER,.003)
        detail.cylinder((x,1.201,-.855),.013,.018,'z',RUBBER,12)
    # Cabin radio, floor selector, transfer lever and driver pedals.
    cabin.box((.031,1.104,-.652),(.298,.199,.289),STEEL,.016)
    detail.box((.021,1.151,-.503),(.157,.054,.012),DISPLAY,.004)
    for n,width in enumerate((.039,.025,.047)):
        detail.box((-.049+width/2,1.163-.012*n,-.4965),(width,.0045,.002),INK)
    for i in range(5):
        detail.box((-.057+i*.034,1.090,-.500),(.019,.032,.010),RUBBER,.004)
    for y in (1.092,1.153):
        detail.cylinder((.136,y,-.500),.024,.021,'z',TREAD,16)
    for x,z in ((-.045,-.272),(.121,-.306)):
        detail.box((x,.974,z),(.090,.038,.143),STEEL,.012)
        tube(detail,(x,.991,z),(x,1.106,z+.044),.014,EDGE)
        detail.box((x,1.111,z+.048),(.053,.037,.050),RUBBER,.012)
    for x,w in ((-.658,.111),(-.499,.056)):
        tube(detail,(x,.94,-.985),(x,.85,-.893),.012,STEEL)
        detail.box((x,.853,-.893),(w,.024,.073),RUBBER,.006)
    detail.box((.463,.954,1.379),(.328,.217,.171),TAN,.023)
    detail.box((.463,1.052,1.386),(.25,.021,.139),STITCH,.006)
    return cabin,detail


def steering():
    mesh=Assembly()
    hoop(mesh,(0,.024,0),.177,.020,RUBBER,-.40,44)
    mesh.box((0,.024,.020),(.115,.100,.049),STEEL,.016)
    for end in [(-.177,.071,-.022),(.177,.071,-.022),(0,-.151,.060)]:
        tube(mesh,(0,.024,.019),end,.025,STEEL)
    mesh.box((0,.033,.050),(.062,.038,.013),DARK_PAINT,.005)
    tube(mesh,(0,.022,-.030),(0,-.031,-.246),.032,STEEL,14)
    return mesh


def wheel(high):
    mesh=Assembly()
    sides=44 if high else 20
    mesh.tube((0,0,0),[(-.192,.313),(-.190,.401),(-.161,.459),
                        (-.119,.477),(.119,.477),(.163,.455),(.188,.399),(.190,.312)],'x',RUBBER,sides)
    for x in (-.181,.181):
        mesh.cylinder((x,0,0),.291,.038,'x',STEEL,sides)
        for ring,r in ((.209,.251),(.228,.179)):
            mesh.cylinder((math.copysign(ring,x),0,0),r,.028,'x',EDGE if ring<.22 else STEEL,sides)
        for i in range(8 if high else 6):
            a=i*math.tau/(8 if high else 6)
            y,z=math.cos(a)*.132,math.sin(a)*.132
            mesh.cylinder((math.copysign(.248,x),y,z),.023,.021,'x',EDGE,8 if high else 5)
    bands=36 if high else 18
    for i in range(bands):
        angle=i*math.tau/bands
        for side in (-1,1):
            a=angle+side*.026
            def tread(x,r,k):
                return (x,r*math.cos(a+k),r*math.sin(a+k))
            q=.045 if high else .081
            points=[tread(side*x,r,k) for r in (.473,.490) for x,k in
                    [(.020,-q),(.150,-q*.37),(.153,q*.85),(.021,q*.54)]]
            mesh.add(points,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],TREAD)
    return mesh


def mount():
    shield,gun=Assembly(),Assembly()
    shield.cylinder((0,-.218,0),.438,.085,'y',STEEL,32)
    shield.cylinder((0,-.152,0),.274,.154,'y',EDGE,26)
    shield.box((0,-.087,-.255),(.738,.156,.075),PAINT,.018)
    for side in (-1,1):
        side_profile(shield,[(-.325,-.106),(-.302,.106),(-.223,.129),(.065,.024),(.076,-.108)],.056,PAINT,side*.395)
        shield.box((side*.296,.086,-.305),(.223,.132,.051),LIGHT,.019)
        for z in (-.297,-.159,-.001):
            shield.cylinder((side*.426,-.018,z),.016,.018,'x',EDGE,10)
    gun.box((0,.054,-.371),(.151,.147,.552),STEEL,.015)
    gun.box((0,.136,-.473),(.118,.026,.314),EDGE,.004)
    gun.cylinder((0,.058,-.993),.043,.785,'z',STEEL,20)
    gun.cylinder((0,.058,-1.392),.061,.16,'z',STEEL,24)
    gun.cylinder((0,.058,-1.476),.041,.009,'z',RUBBER,24)
    gun.cylinder((0,.058,-.663),.062,.270,'z',STEEL,20)
    for n in range(6):
        gun.cylinder((0,.058,-.550-n*.047),.066,.016,'z',EDGE,18)
    gun.box((0,.146,-1.202),(.032,.092,.042),STEEL,.005)
    gun.box((-.211,.000,-.352),(.229,.214,.332),DARK_PAINT,.019)
    gun.box((-.213,.117,-.351),(.221,.027,.325),LIGHT,.006)
    for side in (-1,1):
        tube(gun,(side*.052,.027,-.141),(side*.11,-.016,.07),.016,STEEL)
        tube(gun,(side*.11,-.049,.07),(side*.11,.026,.07),.026,RUBBER)
    return shield,gun


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    collection=scene.collection
    paint=bpy.data.materials.new("HMMWV finishes")
    glass=bpy.data.materials.new("Safety glass")
    paint.use_backface_culling=True
    nodes=paint.node_tree.nodes
    bsdf=nodes.get("Principled BSDF")
    rgb=nodes.new("ShaderNodeVertexColor")
    rgb.layer_name="Paint"
    paint.node_tree.links.new(rgb.outputs["Color"],bsdf.inputs["Base Color"])
    shader_finish(paint,bsdf,4)
    gs=glass.node_tree.nodes.get("Principled BSDF")
    gs.inputs["Base Color"].default_value=(*GLASS,1)
    gs.inputs["Alpha"].default_value=.23
    gs.inputs["Roughness"].default_value=.20
    finish={RUBBER:1,TREAD:1,CABIN:1,STEEL:2,EDGE:2,GLASS:1,FABRIC:3,SEAT_INSERT:3,STITCH:3,TAN:3}
    body,chassis,trim=hull()
    inside,inside_detail=cabin()
    shield,gun=mount()
    needle=Assembly()
    tube(needle,(0,-.007,.003),(0,.049,.003),.0026,NEEDLE,6)
    markings=Assembly()
    for side in (-1,1):
        markings.box((side*1.056,1.159,-.58),(.008,.089,.209),PAPER,.003)
    markings.box((.367,.966,2.464),(.193,.084,.012),PAPER,.003)
    parts=[("BodyPaint",body),("Chassis",chassis),("ExteriorDetail",trim),
           ("Cabin",inside),("CabinDetail",inside_detail),("Steering",steering()),
           ("Wheel",wheel(True)),("WheelLow",wheel(False)),("Turret",shield),("GunVisual",gun),
           ("SpeedNeedle",needle),("Markings",markings)]
    parts.extend((f"glass{i}",pane) for i,pane in enumerate(glaze()))
    for name,mesh in parts:
        obj=mesh.object(name,collection)
        uv=obj.data.uv_layers.active
        uv.name="Surface finish"
        for face,color in zip(obj.data.polygons,mesh.colors):
            nx,nz,ny=face.normal
            row=finish.get(color,0)
            for index in face.loop_indices:
                x,z,y=obj.data.vertices[obj.data.loops[index].vertex_index].co
                u,v=(-z,x) if abs(ny)>.65 else ((-z,y) if abs(nx)>abs(nz) else (x,y))
                uv.data[index].uv=(.5+.18*u,(row+.5+.14*v)/4)
        obj.data.materials.append(glass if name.startswith("glass") else paint)
    output=HERE.parents[1]/"src"/"assets"/"humvee"/"humvee.glb"
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",export_vertex_color="ACTIVE",
                              export_meshopt_compression_enable=True,export_meshopt_extension="EXT_meshopt_compression")
    def place(name,point):
        x,y,z=point
        collection.objects[name].location=(x,-z,y)
    place("Steering",STEERING)
    place("Turret",TURRET)
    place("GunVisual",TURRET)
    place("SpeedNeedle",SPEEDOMETER)
    collection.objects["SpeedNeedle"].rotation_euler.y=-math.radians(135)
    wheel_template=collection.objects["Wheel"]
    for i,(x,z) in enumerate([(-.89,-1.55),(.89,-1.55),(-.89,1.55),(.89,1.55)]):
        obj=wheel_template.copy()
        obj.name=f"Wheel {i+1}"
        obj.location=(x,-z,.49)
        if x<0:
            obj.rotation_euler.z=math.pi
        collection.objects.link(obj)
    wheel_template.hide_set(True)
    wheel_template.hide_render=True
    collection.objects["WheelLow"].hide_set(True)
    collection.objects["WheelLow"].hide_render=True
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                view=area.spaces.active
                view.shading.color_type="VERTEX"
                view.region_3d.view_location=(0,0,1.16)
                view.region_3d.view_distance=7.2
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"humvee.blend"),compress=True)


if __name__=="__main__":
    build()
