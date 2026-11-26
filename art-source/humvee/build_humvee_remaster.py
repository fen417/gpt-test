"""Author the high-detail HMMWV with the original game's anchors and apertures.

Blender: blender -b -t 8 --python art-source/humvee/build_humvee_remaster.py
Optional -- <preview directory> renders the exterior and both crew viewpoints.

Exterior: https://commons.wikimedia.org/wiki/File:M1151_HMMWV.jpg
Cabin: https://www.sundanceequipmentonline.com/listings/2006-am-general-m1152-humvee
The turret and gun are fictional game props.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.noise import noise_vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from build_humvee import (Assembly, STEERING, TURRET, SPEEDOMETER, gauge, glaze,
                         hood_section, hoop, roof, side_profile, tube)
from weapon_finish import finish_image, shader_finish


OLIVE = (.186, .217, .128)
PANEL = (.228, .254, .153)
EDGE = (.282, .311, .192)
FRAME = (.107, .127, .078)
LINER = (.147, .167, .112)
SHIELD = (.157, .179, .101)
RUBBER = (.036, .043, .038)
TREAD = (.051, .056, .042)
BLACK = (.022, .027, .025)
STEEL = (.107, .119, .111)
ALLOY = (.259, .281, .266)
GUNMETAL = (.046, .057, .054)
GUN_PANEL = (.089, .106, .098)
FABRIC = (.119, .137, .095)
CANVAS = (.171, .185, .117)
WEBBING = (.224, .201, .124)
LENS = (.482, .541, .498)
AMBER = (.588, .249, .042)
RED = (.363, .046, .029)
INSERT = (.087, .232, .181)
LABEL = (.571, .575, .428)
INK = (.063, .074, .063)

FINISHES = (
    (.74, .02, .08),   # matte body paint
    (.91, .00, .13),   # rubber
    (.54, .53, .05),   # fasteners and worn alloy
    (.92, .00, .15),   # canvas and webbing
    (.25, .09, .02),   # molded lenses and enamel
    (.64, .26, .08),   # dark coated steel
    (.81, .00, .02),   # instrument and stencil lettering
)
FINISH_ROWS = {
    RUBBER: 1, TREAD: 1, BLACK: 1, STEEL: 2, ALLOY: 2, FABRIC: 3, CANVAS: 3,
    WEBBING: 3, LENS: 4, AMBER: 4, RED: 4, INSERT: 4, GUNMETAL: 5, GUN_PANEL: 5,
    LABEL: 6, INK: 6,
}


def annulus(mesh, center, profile, axis, color, sides=40):
    x, y, z = center
    vertices = []
    for depth, radius in profile:
        for step in range(sides):
            angle = step * math.tau / sides
            a, b = radius * math.cos(angle), radius * math.sin(angle)
            vertices.append((x + depth, y + a, z + b) if axis == 'x' else
                            (x + a, y + depth, z + b) if axis == 'y' else (x + a, y + b, z + depth))
    faces = []
    for row in range(len(profile)):
        next_row = (row + 1) % len(profile)
        for step in range(sides):
            next_step = (step + 1) % sides
            faces.append((row * sides + step, row * sides + next_step,
                          next_row * sides + next_step, next_row * sides + step))
    mesh.add(vertices, faces, color)


def bolts(mesh, points, axis, *, radius=.014, finish=ALLOY):
    for point in points:
        mesh.cylinder(point, radius, .009, axis, finish, 6)


def front_clip(shell, chassis, trim):
    hood_section(shell, [(-2.39,.858,.649,.931,.998), (-2.28,.942,.655,1.013,1.073),
                         (-1.56,.973,.670,1.106,1.224), (-1.322,1.004,.675,1.168,1.270)], OLIVE)
    hood_section(shell, [(-2.285,.659,1.073,1.075,1.092),(-2.164,.762,1.089,1.101,1.125),
                         (-1.465,.757,1.237,1.251,1.272),(-1.356,.681,1.253,1.267,1.283)], PANEL)
    hood_section(shell, [(-2.127,.325,1.118,1.121,1.131),(-1.929,.371,1.157,1.163,1.173),
                         (-1.517,.420,1.245,1.252,1.261)], PANEL)
    for index in range(10):
        z = -1.883 + index * .037
        y = 1.181 + index * .0079
        trim.box((0,y,z),(.586,.016,.021),FRAME,.004)
        trim.box((0,y+.008,z+.010),(.569,.010,.010),EDGE,.002)
    chassis.box((0,.868,-2.407),(1.293,.339,.083),BLACK,.020)
    for index in range(7):
        x = (index-3)*.177
        shell.box((x,.870,-2.467),(.058,.300,.066),PANEL,.012)
    shell.box((0,1.037,-2.448),(1.340,.055,.111),PANEL,.008)
    shell.box((0,.708,-2.446),(1.370,.060,.082),FRAME,.010)
    chassis.box((0,.504,-2.402),(2.194,.181,.179),GUNMETAL,.035)
    chassis.box((0,.514,-2.500),(1.433,.125,.044),STEEL,.012)
    chassis.box((0,.585,-2.475),(.388,.141,.105),GUNMETAL,.023)
    trim.box((0,.601,-2.539),(.240,.057,.021),ALLOY,.006)
    trim.box((0,.601,-2.552),(.152,.025,.006),BLACK,.003)
    for s in (-1,1):
        x = s*.779
        shell.box((x,.879,-2.373),(.325,.380,.112),PANEL,.025)
        chassis.cylinder((x,.935,-2.451),.147,.084,'z',GUNMETAL,32)
        trim.cylinder((x,.935,-2.500),.119,.027,'z',LENS,32)
        for row in range(-3,4):
            width = 2*math.sqrt(.105**2-(row*.024)**2)
            trim.box((x,.935+row*.024,-2.514),(width,.004,.008),ALLOY,.001)
        trim.box((x,.746,-2.470),(.209,.075,.036),BLACK,.009)
        trim.box((x,.746,-2.493),(.170,.048,.017),AMBER,.005)
        for pin in (-.080,.080):
            bolts(trim, [(x+pin,.746,-2.500)], 'z', radius=.006)
        hoop(trim,(s*.697,.500,-2.526),.048,.013,ALLOY,sides=20)
        tube(trim,(s*.982,.555,-2.402),(s*.981,.708,-2.285),.030,STEEL,12)
        tube(trim,(s*.874,1.131,-1.807),(s*.893,1.201,-1.502),.011,GUNMETAL)
        trim.box((s*.887,1.171,-1.627),(.073,.031,.095),STEEL,.009)


def doors_and_roof(shell, chassis, trim):
    shell.box((0,.723,.036),(1.85,.223,3.10),FRAME,.043)
    roof_start = len(shell.colors)
    roof(shell)  # Same hatch and glass aperture locations as the game collision data.
    shell.colors[roof_start:] = [OLIVE]*(len(shell.colors)-roof_start)
    shell.box((0,1.747,-1.107),(1.998,.059,.083),PANEL,.008)
    shell.box((0,1.741,1.404),(1.968,.077,.089),PANEL,.008)
    shell.box((0,1.213,-1.332),(1.998,.164,.156),OLIVE,.015)
    for s in (-1,0,1):
        x = s*.966
        tube(shell,(x,1.262,-1.339),(x,1.752,-1.111),.036,PANEL,8)
        if s:
            tube(shell,(x,1.324,1.428),(x,1.752,1.395),.038,PANEL,8)
            tube(trim,(s*.327,1.314,-1.329),(s*.568,1.505,-1.244),.008,GUNMETAL,8)
            tube(trim,(s*.460,1.331,-1.325),(s*.606,1.547,-1.228),.010,RUBBER,8)
    for s in (-1,1):
        for z, length in ((-.563,1.229),(.727,1.284)):
            shell.box((s*.963,1.106,z),(.142,.472,length),FRAME,.019)
            shell.box((s*1.022,1.119,z),(.113,.417,length-.046),OLIVE,.021)
            shell.box((s*1.080,1.133,z),(.045,.293,length-.205),PANEL,.009)
            shell.box((s*1.048,.961,z),(.107,.077,length-.107),FRAME,.009)
            trim.box((s*1.103,1.236,z+.278),(.028,.090,.221),GUNMETAL,.012)
            tube(trim,(s*1.122,1.248,z+.213),(s*1.124,1.248,z+.351),.014,RUBBER,10)
            for offset in (-.464,.464):
                bolts(trim, [(s*1.105, y,z+offset) for y in (1.020,1.203)], 'x')
            for y in (1.035,1.229):
                trim.box((s*1.086,y,z-.470),(.102,.084,.172),FRAME,.012)
                tube(trim,(s*1.129,y-.044,z-.521),(s*1.129,y+.044,z-.521),.023,STEEL,12)
        for a,b in ((-1.338,-1.035),(-.025,.150),(1.310,1.442)):
            shell.box((s*.975,1.545,(a+b)/2),(.099,.399,b-a),FRAME,.014)
        for z,width in ((-.53,1.01),(.73,1.16)):
            for y in (1.343,1.736):
                shell.box((s*.977,y,z),(.115,.039,width+.076),PANEL,.008)
            for offset in (-1,1):
                shell.box((s*.976,1.540,z+offset*(width/2+.015)),(.100,.346,.031),RUBBER,.004)
        chassis.box((s*.969,.650,.070),(.273,.116,2.278),GUNMETAL,.016)
        for step in range(9):
            trim.box((s*1.054,.711,-.908+step*.227),(.101,.012,.126),STEEL,.003)
        for z in (-1.55,1.55):
            profile = [(z-.624,.875),(z-.536,1.033),(z-.346,1.126),(z+.326,1.126),
                       (z+.565,1.047),(z+.637,.888),(z+.553,.885),(z+.457,1.001),
                       (z+.292,1.057),(z-.291,1.055),(z-.435,.967),(z-.547,.865)]
            side_profile(shell,profile,.163,PANEL,s*1.041)
            side_profile(chassis,[(d,h-.035) for d,h in profile],.088,BLACK,s*.970)
            chassis.box((s*.968,.568,z+.554),(.265,.363,.068),RUBBER,.013)
            for offset in (-.523,.523):
                bolts(trim, [(s*1.125,.944,z+offset)],'x',radius=.010)
            trim.box((s*1.124,1.065,z-.204),(.020,.073,.133),AMBER,.005)
        tube(chassis,(s*1.002,1.299,-.993),(s*1.201,1.395,-1.002),.022,GUNMETAL,12)
        chassis.box((s*1.202,1.398,-1.000),(.196,.230,.082),RUBBER,.026)
        trim.box((s*1.202,1.401,-.954),(.159,.187,.016),LENS,.009)
        tube(trim,(s*.808,1.866,-.852),(s*.808,1.875,1.233),.014,FRAME,8)
        for z in (-.85,1.231):
            trim.box((s*.808,1.882,z),(.075,.031,.095),SHIELD,.010)


def rear_clip(shell, chassis, trim):
    hood_section(shell,[(1.403,1.005,.663,1.279,1.333),(1.739,1.009,.650,1.241,1.291),
                        (2.263,.958,.627,1.172,1.217),(2.405,.867,.630,1.091,1.140)],OLIVE)
    shell.box((0,1.333,1.432),(1.918,.052,.100),PANEL,.009)
    hood_section(shell,[(1.460,.786,1.325,1.331,1.354),(1.721,.800,1.295,1.309,1.323),
                         (2.268,.751,1.207,1.217,1.234)],PANEL)
    shell.box((0,.919,2.417),(1.403,.392,.076),FRAME,.013)
    shell.box((0,.915,2.455),(1.247,.314,.046),PANEL,.012)
    chassis.box((0,.517,2.407),(2.126,.160,.152),GUNMETAL,.025)
    chassis.box((0,.626,2.490),(.226,.139,.118),STEEL,.019)
    for s in (-1,1):
        x = s*.856
        trim.box((x,.916,2.411),(.203,.316,.104),GUNMETAL,.016)
        for y,color in ((1.000,RED),(.910,RED),(.820,AMBER)):
            trim.box((x,y,2.471),(.139,.058,.022),color,.010)
            bolts(trim,[(x-.080,y,2.469),(x+.080,y,2.469)],'z',radius=.006)
        trim.box((s*.580,.992,2.482),(.070,.094,.040),STEEL,.009)
        hoop(trim,(s*.695,.556,2.511),.047,.013,ALLOY,sides=20)
        tube(chassis,(-.80,.477,s*1.55),(.80,.477,s*1.55),.061,STEEL,16)
        chassis.cylinder((0,.485,s*1.55),.151,.283,'x',GUNMETAL,20)
    trim.box((-.410,.878,2.483),(.351,.135,.018),BLACK,.006)
    trim.box((-.410,.878,2.496),(.311,.103,.009),LABEL,.004)
    trim.box((.308,.975,2.486),(.262,.071,.043),GUNMETAL,.011)
    tube(trim,(.225,.975,2.513),(.388,.975,2.513),.013,ALLOY,12)
    chassis.cylinder((.841,1.232,2.084),.041,.170,'y',RUBBER,14)
    tube(chassis,(.840,1.291,2.084),(.746,2.608,2.167),.009,GUNMETAL,10)


def tag(mesh, x, y, z, width, color=LABEL):
    mesh.box((x,y,z),(width,.036,.006),color,.002)
    ink = LABEL if color == GUNMETAL else INK
    for row, proportion in enumerate((.77,.59,.72)):
        mesh.box((x-width*(.43-proportion/2),y+.010-row*.009,z+.004),
                 (width*proportion,.0027,.001),ink,0)


def cabin():
    tub, fittings, instruments = Assembly(), Assembly(), Assembly()
    tub.box((0,.770,.090),(1.875,.105,2.690),LINER,.028)
    side_profile(tub,[(-1.239,.835),(-1.217,1.179),(-.828,1.170),(-.652,1.019),
                      (.483,.985),(1.375,.862),(1.377,.812)],.294,LINER)
    side_profile(tub,[(-1.235,1.258),(-1.123,1.293),(-.953,1.269),(-.855,1.187),
                      (-.789,1.105),(-.817,1.071),(-1.187,1.095)],1.802,LINER)
    tub.box((0,1.243,1.348),(1.811,.185,.103),LINER,.024)
    tub.box((-.525,1.278,-.909),(.620,.176,.100),FRAME,.014)
    tub.box((-.523,1.287,-.858),(.591,.166,.027),GUNMETAL,.013)
    tub.box((.530,1.173,-.851),(.661,.195,.079),FRAME,.015)
    tub.box((.529,1.171,-.803),(.560,.135,.023),LINER,.010)
    tag(fittings,.554,1.196,-.785,.241,GUNMETAL)
    for s in (-1,1):
        x = s*.54
        tub.box((s*.923,.866,.065),(.136,.212,2.670),FRAME,.015)
        tube(fittings,(s*.872,1.748,-1.085),(s*.879,1.752,1.323),.029,LINER,12)
        tube(fittings,(s*.871,1.743,.063),(s*.881,1.216,.066),.030,LINER,12)
        fittings.box((x,1.287,-1.122),(.432,.014,.078),FRAME,.005)
        for i in range(7):
            fittings.box((x-.168+i*.056,1.295,-1.122),(.033,.007,.042),BLACK,.002)
        for z in (-.554,.712):
            tub.box((s*.912,1.099,z),(.096,.385,1.045),LINER,.019)
            tub.box((s*.853,1.044,z),(.032,.226,.755),FRAME,.011)
            tub.box((s*.834,1.151,z),(.065,.065,.509),RUBBER,.014)
            fittings.box((s*.845,1.259,z+.225),(.059,.083,.133),GUNMETAL,.009)
            tube(fittings,(s*.802,1.266,z+.179),(s*.802,1.276,z+.260),.012,ALLOY,10)
            bolts(fittings,[(s*.828,y,z+a) for a in (-.355,.355) for y in (1.012,1.101)],'x',radius=.010)
        for z in (-.574,.735):
            tub.box((x,.833,z),(.405,.105,.472),STEEL,.022)
            tub.box((x,.909,z),(.459,.142,.465),FABRIC,.043)
            tub.box((x,.974,z-.017),(.296,.036,.356),CANVAS,.016)
            side_profile(tub,[(z+.167,.956),(z+.271,.945),(z+.357,1.323),
                              (z+.309,1.425),(z+.213,1.410),(z+.190,1.265)],.465,FABRIC,x)
            side_profile(tub,[(z+.153,1.009),(z+.191,1.015),(z+.229,1.307),
                              (z+.199,1.339),(z+.176,1.296)],.317,CANVAS,x)
            tub.box((x,1.446,z+.263),(.255,.142,.130),FABRIC,.029)
            for offset in (-.182,.182):
                tube(fittings,(x+offset,.970,z-.182),(x+offset,.975,z+.150),.0035,WEBBING,6)
                tube(fittings,(x+offset,.992,z+.157),(x+offset,1.307,z+.196),.004,WEBBING,6)
            fittings.box((x+s*.231,1.134,z+.220),(.038,.271,.018),WEBBING,.004)
            fittings.box((x-s*.235,.982,z+.122),(.044,.084,.052),RUBBER,.007)
            fittings.box((x-s*.235,1.027,z+.122),(.034,.010,.033),RED,.002)
            fittings.box((x,.829,z-.137),(.469,.024,.385),TREAD,.010)
            for row in range(7):
                fittings.box((x,.844,z-.297+row*.050),(.408,.009,.015),RUBBER,.003)
            if z < 0:
                side_profile(fittings,[(z+.284,.987),(z+.363,.991),(z+.407,1.191),
                                       (z+.341,1.205),(z+.298,1.057)],.317,CANVAS,x)
                for offset in (-.101,.101):
                    fittings.box((x+offset,1.091,z+.391),(.021,.178,.012),WEBBING,.003)
                    fittings.box((x+offset,1.132,z+.398),(.031,.026,.012),RUBBER,.004)
                tube(fittings,(x-.126,1.177,z+.403),(x+.126,1.177,z+.403),.004,WEBBING,6)
    tube(fittings,(.281,1.178,-.771),(.697,1.178,-.771),.018,RUBBER,12)
    for x in (.281,.697):
        tube(fittings,(x,1.178,-.815),(x,1.178,-.771),.017,STEEL)
    for x,y,r in ((-.565,1.316,.067),(-.409,1.314,.045),(-.718,1.316,.048),(-.304,1.304,.032)):
        gauge(instruments,x,y,-.853,r)
    for x in (-.730,-.605,-.478,-.353):
        tag(instruments,x,1.224,-.838,.084,GUNMETAL)
        instruments.cylinder((x,1.195,-.831),.014,.024,'z',RUBBER,12)
    for i,color in enumerate((INSERT,RED,AMBER)):
        instruments.box((-.213,1.327-i*.027,-.852),(.028,.016,.012),color,.003)
    tub.box((.022,1.099,-.652),(.304,.221,.296),GUNMETAL,.014)
    instruments.box((-.003,1.143,-.498),(.183,.065,.017),BLACK,.005)
    instruments.box((-.003,1.143,-.487),(.160,.045,.010),INSERT,.004)
    for row in range(2):
        for i in range(5):
            instruments.box((-.061+i*.026,1.154-row*.017,-.480),(.014,.005,.003),LENS,.001)
    for row in range(2):
        for i in range(5):
            instruments.box((-.102+i*.031,1.096-row*.034,-.495),(.019,.019,.019),RUBBER,.004)
    for y in (1.055,1.147):
        instruments.cylinder((.130,y,-.494),.023,.029,'z',TREAD,16)
    for x,z,top in ((-.067,-.266,1.118),(.092,-.327,1.076)):
        fittings.box((x,1.009,z),(.096,.056,.149),GUNMETAL,.010)
        tube(fittings,(x,1.033,z),(x,top,z+.040),.013,ALLOY,12)
        fittings.box((x,top,z+.044),(.061,.032,.047),RUBBER,.010)
    for x,width in ((-.660,.110),(-.493,.067)):
        tube(fittings,(x,.953,-.960),(x,.858,-.878),.014,STEEL,10)
        fittings.box((x,.853,-.878),(width,.024,.080),RUBBER,.006)
    return tub, fittings, instruments


def steering():
    mesh = Assembly()
    hoop(mesh,(0,.024,0),.175,.019,RUBBER,-.28,56)
    mesh.box((0,.024,.001),(.126,.089,.049),GUNMETAL,.012)
    for x in (-1,1):
        tube(mesh,(x*.042,.029,.006),(x*.174,.036,.000),.022,GUN_PANEL,12)
    tube(mesh,(0,.010,.005),(0,-.143,.046),.025,GUN_PANEL,12)
    mesh.box((0,.024,.032),(.078,.048,.019),RUBBER,.008)
    mesh.box((0,.025,.043),(.035,.010,.003),ALLOY,.001)
    tube(mesh,(0,.022,-.029),(0,-.037,-.234),.031,GUNMETAL,18)
    return mesh


def wheel():
    mesh = Assembly()
    annulus(mesh,(0,0,0),[(-.194,.302),(-.188,.402),(-.160,.455),(-.120,.473),
                           (.120,.473),(.162,.454),(.187,.404),(.194,.301),
                           (.152,.289),(-.156,.289)],'x',RUBBER,56)
    mesh.cylinder((0,0,0),.312,.346,'x',GUNMETAL,40)
    mesh.cylinder((-.183,0,0),.284,.042,'x',STEEL,28)
    annulus(mesh,(.168,0,0),[(0,.303),(.030,.306),(.039,.278),
                            (.026,.248),(0,.247)],'x',STEEL,40)
    mesh.cylinder((.189,0,0),.218,.051,'x',FRAME,32)
    mesh.cylinder((.221,0,0),.095,.067,'x',GUNMETAL,24)
    mesh.cylinder((.252,0,0),.060,.020,'x',STEEL,20)
    for i in range(8):
        a = math.tau*i/8
        y,z = .149*math.cos(a),.149*math.sin(a)
        mesh.cylinder((.222,y,z),.027,.029,'x',STEEL,10)
        mesh.cylinder((.240,y,z),.017,.025,'x',ALLOY,6)
    for i in range(38):
        for s in (-1,1):
            a = math.tau*(i+s*.15)/38
            xy = ((.000,-.041),(.100,-.059),(.159,-.029),(.157,.031),(.068,.034),(.005,.056))
            rings = [[(s*x,r*math.cos(a+k),r*math.sin(a+k)) for x,k in xy] for r in (.450,.488)]
            mesh.rings(rings,TREAD)
    return mesh


def turret():
    guard, prop = Assembly(), Assembly()
    annulus(guard,(0,0,0),[(-.313,.494),(-.260,.491),(-.232,.455),
                             (-.232,.395),(-.312,.394)],'y',GUNMETAL,52)
    annulus(guard,(0,0,0),[(-.243,.465),(-.207,.459),(-.206,.416),
                             (-.247,.417)],'y',FRAME,52)
    for step in range(12):
        a = step*math.tau/12
        bolts(guard,[(.437*math.cos(a),-.200,.437*math.sin(a))],'y',radius=.013,finish=STEEL)
    guard.box((0,-.185,-.251),(.553,.069,.085),GUNMETAL,.014)
    guard.box((0,-.118,-.253),(.210,.170,.096),GUN_PANEL,.022)
    for s in (-1,1):
        side_profile(guard,[(-.373,-.215),(-.339,.102),(-.241,.124),(-.153,.089),
                            (.179,-.010),(.249,-.149),(.232,-.206)],.064,SHIELD,s*.384)
        side_profile(guard,[(-.323,-.154),(-.296,.067),(-.237,.086),(.145,-.030),(.176,-.140)],
                     .026,FRAME,s*.424)
        side_profile(guard,[(-.314,-.134),(-.287,.055),(-.231,.080),(.157,-.034),(.179,-.134)],
                     .022,PANEL,s*.347)
        guard.box((s*.277,-.018,-.351),(.183,.240,.063),SHIELD,.027)
        guard.box((s*.283,-.082,-.311),(.129,.101,.018),GUNMETAL,.012)
        for z,y in ((-.275,.032),(-.245,-.131),(.128,-.064),(.117,-.142)):
            bolts(guard,[(s*.332,y,z),(s*.440,y,z)],'x',radius=.013)
    # Shape the rear housing clear of the camera at full elevation.
    side_profile(prop,[(-.693,.038),(-.639,.096),(-.556,.108),(-.312,.106),
                        (-.249,.062),(-.224,.019),(-.257,-.039),(-.543,-.068),(-.651,-.028)],
                 .157,GUNMETAL)
    side_profile(prop,[(-.595,.087),(-.550,.116),(-.313,.116),(-.274,.083),(-.270,.071)],
                 .127,GUN_PANEL)
    prop.box((0,.115,-.419),(.066,.009,.207),GUNMETAL,.002)
    for s in (-1,1):
        prop.box((s*.043,.118,-.425),(.013,.007,.186),STEEL,.002)
        bolts(prop,[(s*.045,.122,z) for z in (-.509,-.331)],'y',radius=.008)
    prop.box((0,.120,-.382),(.036,.003,.060),FRAME,.001)
    for i in range(3):
        prop.box((0,.122,-.399+i*.013),(.021-i*.004,.002,.003),LABEL,0)
    for s in (-1,1):
        side_profile(prop,[(-.575,.029),(-.551,.081),(-.328,.088),(-.270,.064),(-.246,.009),
                            (-.295,-.026),(-.518,-.025)],.023,GUN_PANEL,s*.080)
        bolts(prop,[(s*.095,.033,z) for z in (-.536,-.352,-.277)],'x',radius=.009)
        for i in range(5):
            prop.box((s*.092,.058,-.468+i*.032),(.006,.025,.014),BLACK,.002)
        tube(prop,(s*.048,.028,-.150),(s*.110,-.004,.068),.020,GUNMETAL,14)
        tube(prop,(s*.110,-.052,.070),(s*.110,.032,.070),.025,RUBBER,18)
        for i in range(4):
            prop.cylinder((s*.110,-.035+i*.016,.070),.026,.007,'y',TREAD,14)
    prop.box((0,.022,-.250),(.110,.064,.051),GUN_PANEL,.010)
    prop.box((0,.082,-.283),(.090,.015,.049),GUNMETAL,.004)
    for x in (-.031,.031):
        prop.box((x,.092,-.274),(.021,.008,.021),STEEL,.002)
        bolts(prop,[(x,.098,-.274)],'y',radius=.007,finish=ALLOY)
    prop.tube((0,.058,0),[(-1.478,.038),(-1.454,.052),(-1.347,.052),(-1.315,.031),
                          (-.733,.034),(-.690,.052),(-.528,.053)],'z',GUNMETAL,32)
    prop.cylinder((0,.058,-1.483),.028,.006,'z',BLACK,24)
    for z in (-.689,-.639,-.589):
        prop.cylinder((0,.058,z),.064,.028,'z',GUN_PANEL,24)
    prop.box((0,.086,-1.158),(.064,.059,.044),GUNMETAL,.008)
    for x in (-.029,.029):
        prop.box((x,.137,-1.158),(.014,.063,.037),GUNMETAL,.004)
    prop.box((0,.117,-1.158),(.010,.019,.021),LABEL,.002)
    prop.box((-.221,.013,-.398),(.224,.247,.346),FRAME,.025)
    prop.box((-.220,.145,-.393),(.233,.045,.354),SHIELD,.011)
    prop.box((-.221,.040,-.221),(.177,.167,.017),PANEL,.012)
    prop.box((-.221,.133,-.210),(.121,.046,.021),GUNMETAL,.007)
    tube(prop,(-.267,.134,-.191),(-.173,.134,-.191),.008,STEEL,12)
    for x in (-.271,-.169):
        prop.box((x,.139,-.195),(.019,.037,.016),GUN_PANEL,.004)
        bolts(prop,[(x,.146,-.184)],'z',radius=.005,finish=ALLOY)
    tag(prop,-.225,.062,-.209,.113,GUNMETAL)
    for x in (-.287,-.155):
        prop.box((x,.171,-.398),(.024,.014,.286),EDGE,.004)
        bolts(prop,[(x,.180,z) for z in (-.510,-.285)],'y',radius=.008,finish=STEEL)
    return guard, prop


def pigment(size):
    pixels = []
    for row in range(len(FINISHES)):
        for j in range(size):
            y = j/size
            for i in range(size):
                x = i/size
                grain, fleck, cloud = noise_vector((x*81,y*81,row*2.17))
                streak = noise_vector((x*59,y*7,row+14))[0]
                field = noise_vector((x*7,y*7,row+29))[1]
                if row == 0:
                    dust = max(0,field)*.15
                    shade = .82 + .12*field + .085*grain + .08*max(0,streak)
                    tint = (shade+dust,shade+.37*dust,shade-.49*dust)
                else:
                    shade = .89 + .095*field + .065*grain + .036*fleck + .039*streak + .025*cloud
                    tint = (shade,)*3
                pixels.append((*(max(0,min(1,c))**(1/2.2) for c in tint),1))
    texture = finish_image('Pigment, dust and scuffs',pixels,size)
    texture.colorspace_settings.name = 'sRGB'
    return texture


def painted_surface():
    material = bpy.data.materials.new('HMMWV • painted armor, rubber, fabric and steel')
    material.use_nodes = True
    graph = material.node_tree
    color = graph.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Paint'
    shader = graph.nodes.get('Principled BSDF')
    atlas = graph.nodes.new('ShaderNodeTexImage')
    atlas.image = pigment(192)
    blend = graph.nodes.new('ShaderNodeMixRGB')
    blend.blend_type = 'MULTIPLY'
    blend.inputs[0].default_value = 1
    graph.links.new(atlas.outputs['Color'],blend.inputs[1])
    graph.links.new(color.outputs['Color'],blend.inputs[2])
    graph.links.new(blend.outputs['Color'],shader.inputs['Base Color'])
    shader_finish(material,shader,len(FINISHES),FINISHES,fabric_rows=(3,),size=192,roughness_variation=.66)
    return material


def apply_surface(obj, assembly, material, exposed):
    mesh = obj.data
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(31))
    uv = mesh.uv_layers.active.uv
    colors = mesh.color_attributes['Paint'].data
    for face, base in zip(mesh.polygons, assembly.colors):
        nx, nz, ny = face.normal
        row = FINISH_ROWS.get(base,0)
        for i in face.loop_indices:
            x, nz_pos, y = mesh.vertices[mesh.loops[i].vertex_index].co
            z = -nz_pos
            u,v = (x,z*.68) if abs(ny)>.65 else ((z*.68,y-.8) if abs(nx)>abs(nz) else (x,y-.8))
            uv[i].vector = (.5 + .24*u,(row+.50+.25*v)/len(FINISHES))
            if base in (LABEL,INK,LENS,AMBER,RED,INSERT):
                continue
            variation = 1 + .065*math.sin(15*x+7*y)*math.cos(11*z+4*x) + .04*math.sin(29*z+13*y)
            dust = max(0,1-y/1.25)*.18 if exposed else 0
            colors[i].color = (*(c*variation*(1-dust) + d*dust
                                 for c,d in zip(base,(.204,.173,.112))),1)


def glass_material():
    material = bpy.data.materials.new('Laminated safety glass')
    material.use_nodes = True
    material.surface_render_method = 'BLENDED'
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.177,.281,.282,1)
    shader.inputs['Alpha'].default_value = .13
    shader.inputs['Roughness'].default_value = .24
    shader.inputs['Metallic'].default_value = .05
    return material


def blender_point(point):
    x,y,z = point
    return (x,-z,y)


def studio(scene):
    stage = bpy.data.collections.new('Presentation')
    scene.collection.children.link(stage)
    views = {
        'Exterior': ((4.79,2.97,-5.85),(0,1.29,0),39),
        'Driver': ((-.54,1.58,-.52),(-.36,1.18,-1.490),14),
        'Passenger': ((.54,1.60,.71),(-.28,1.14,-.490),14),
        'Gunner': ((0,2.38,.19),(0,2.38,-1.910),14),
    }
    cameras = {}
    for name,(position,target,lens) in views.items():
        data = bpy.data.cameras.new(name)
        data.lens = lens
        data.clip_start = .045
        camera = bpy.data.objects.new(name,data)
        stage.objects.link(camera)
        camera.location = blender_point(position)
        camera.rotation_euler = (Vector(blender_point(target))-camera.location).to_track_quat('-Z','Y').to_euler()
        cameras[name] = camera
    scene.camera = cameras['Exterior']
    world = bpy.data.worlds.new('Neutral daylight')
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs[0].default_value = (.24,.28,.34,1)
    world.node_tree.nodes.get('Background').inputs[1].default_value = .30
    scene.world = world
    for name,position,power,size,color in (
        ('Key',(-3,6,-4),980,5,(1,.91,.79)), ('Fill',(4,4,-1),590,5,(.77,.87,1)),
        ('Rim',(0,4,5),720,4,(1,.95,.84)), ('Cabin bounce',(0,1.57,.36),18,1,(.86,.92,1)),
    ):
        data = bpy.data.lights.new(name,'AREA')
        data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
        light = bpy.data.objects.new(name,data)
        stage.objects.link(light)
        light.location = blender_point(position)
        light.rotation_euler = (Vector((0,0,1.1))-light.location).to_track_quat('-Z','Y').to_euler()
    return cameras


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    collection = bpy.data.collections.new('HMMWV')
    scene.collection.children.link(collection)
    surface = painted_surface()
    glass = glass_material()
    shell, chassis, exterior = Assembly(), Assembly(), Assembly()
    front_clip(shell,chassis,exterior)
    doors_and_roof(shell,chassis,exterior)
    rear_clip(shell,chassis,exterior)
    tub, fittings, instruments = cabin()
    guard, gun = turret()
    needle = Assembly()
    tube(needle,(0,-.008,.003),(0,.048,.003),.0025,RED,8)
    marks = Assembly()
    for s in (-1,1):
        marks.box((s*1.105,1.142,-.562),(.005,.088,.226),LABEL,.001)
    marks.box((-.410,.878,2.504),(.172,.058,.006),LABEL,.001)
    parts = {
        'BodyPaint':shell, 'Chassis':chassis, 'ExteriorDetail':exterior, 'Cabin':tub,
        'CabinDetail':fittings, 'Instruments':instruments, 'Steering':steering(),
        'Wheel':wheel(), 'Turret':guard, 'GunVisual':gun, 'SpeedNeedle':needle, 'Markings':marks,
    }
    for name,assembly in parts.items():
        apply_surface(assembly.object(name,collection),assembly,surface,name in ('BodyPaint','Chassis','ExteriorDetail'))
    for i,pane in enumerate(glaze()):
        pane.object(f'glass{i}',collection).data.materials.append(glass)
    output = HERE.parents[1]/'src'/'assets'/'humvee'/'humvee-high.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_vertex_color='ACTIVE',
                              export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')

    for name,point in {'Steering':STEERING,'SpeedNeedle':SPEEDOMETER}.items():
        collection.objects[name].location = blender_point(point)
    yaw = bpy.data.objects.new('Turret yaw',None)
    pitch = bpy.data.objects.new('Turret pitch',None)
    collection.objects.link(yaw)
    collection.objects.link(pitch)
    yaw.location = blender_point(TURRET)
    yaw.empty_display_size = pitch.empty_display_size = .14
    pitch.parent = yaw
    collection.objects['Turret'].parent = yaw
    collection.objects['GunVisual'].parent = pitch
    collection.objects['SpeedNeedle'].rotation_euler.y = -math.radians(135)
    template = collection.objects['Wheel']
    for i,(x,z) in enumerate(((-.89,-1.55),(.89,-1.55),(-.89,1.55),(.89,1.55)),1):
        tire = template.copy()
        tire.name = f'Wheel {i}'
        tire.location = blender_point((x,.49,z))
        tire.rotation_euler.z = math.pi if x<0 else 0
        collection.objects.link(tire)
    template.hide_set(True)
    template.hide_render = True
    cameras = studio(scene)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                view = area.spaces.active
                view.shading.color_type = 'VERTEX'
                view.region_3d.view_location = (0,0,1.10)
                view.region_3d.view_distance = 7.6
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 840
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'humvee-high.blend'),compress=True)
    if '--' in sys.argv and (args := sys.argv[sys.argv.index('--')+1:]):
        previews = Path(args[0])
        previews.mkdir(parents=True,exist_ok=True)
        for name,camera in cameras.items():
            scene.camera = camera
            scene.render.filepath = str(previews/f'{name.lower()}.png')
            bpy.ops.render.render(write_still=True)
        camera = scene.camera = cameras['Gunner']
        for name,angle in (('elevated',.85),('lowered',-.25)):
            pitch.rotation_euler.x = angle
            forward = Vector(blender_point((0,math.sin(angle),-math.cos(angle))))
            camera.rotation_euler = forward.to_track_quat('-Z','Y').to_euler()
            scene.render.filepath = str(previews/f'gunner-{name}.png')
            bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    build()
