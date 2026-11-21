"""Blender meshes for the Al-Hadra depot and its mission vehicles."""
import math

from build_port import Mesh, rgb, shade
from mathutils import Vector

OLIVE=rgb("68724c")
OLIVE_LIGHT=rgb("88906a")
FRAME=rgb("3a4038")
RUBBER=rgb("292d29")
DUST=rgb("7a6c51")
STEEL=rgb("81847a")
GLASS=rgb("405758")
GLINT=rgb("637b79")
LAMP=rgb("e0c891")
AMBER=rgb("ae6133")
RED=rgb("8b372d")
TARP=rgb("8c8060")
TARP_SEAM=rgb("a49875")


def wheel(mesh,x,y,z,radius,width,detail,*,tread=False):
    side=math.copysign(1,x)
    mesh.tube((x,y,z),sorted([(-side*width/2,radius),(side*width*.29,radius),
                              (side*width/2,radius*.89)]),"x",RUBBER,12)
    outer=x+math.copysign(width/2,x)
    mesh.tube((outer,y,z),[(0,radius*.46),(math.copysign(.028,x),radius*.39)],"x",STEEL,8)
    if detail is None:
        return
    detail.cylinder((outer+math.copysign(.029,x),y,z),radius*.20,.072,"x",FRAME,10)
    for i in range(6):
        a=i*math.tau/6
        detail.tube((outer+math.copysign(.033,x),y+radius*.29*math.sin(a),z+radius*.29*math.cos(a)),
                    [(0,radius*.052),(math.copysign(.021,x),radius*.052)],"x",OLIVE_LIGHT,5)
    if not tread:
        return
    for i in range(18):
        a=i*math.tau/18
        for band in (-1,1):
            x0=x+band*width*.16
            a0=a+band*.07
            detail.beam((x0-width*.12,y+radius*.964*math.sin(a0),z+radius*.964*math.cos(a0)),
                        (x0+width*.12,y+radius*.964*math.sin(a0+.10),z+radius*.964*math.cos(a0+.10)),
                        .046,shade(RUBBER,1.26),.020)


def body(mesh,sections,paint):
    mesh.rings([[(-w*.89,b,z),(w*.89,b,z),(w,m,z),(t,h,z),(-t,h,z),(-w,m,z)]
                for z,b,m,h,w,t in sections],paint)


def window(mesh,points,span,color):
    a,b,c,d=map(Vector,points)
    normal=(b-a).cross(d-a).normalized()*.006
    u0,u1=span
    mesh.add([tuple(a.lerp(b,u).lerp(d.lerp(c,u),v)+normal)
              for u,v in ((u0,.096),(u1,.096),(u1,.89),(u0,.89))],[(0,1,2,3)],color)


def truck(layer,paint=OLIVE):
    base=layer("vehicle-paint")
    glass=layer("vehicle-glass",False,False)
    cover=layer("canvas")
    detail=layer("vehicle-paint",True,False)
    seams=layer("canvas",True,False)
    base.box((0,.64,-.11),(1.63,.32,6.18),FRAME)
    base.box((0,1.16,-1.07),(2.82,.31,4.53),shade(paint,.75),.045)
    for side in (-1,1):
        base.box((side*1.32,1.45,-1.04),(.16,.52,4.37),paint,.03)
        base.box((side*1.02,.77,.70),(.60,.48,.88),FRAME,.06)
    base.box((0,1.45,-3.26),(2.80,.52,.19),paint,.024)
    base.box((0,1.54,1.04),(2.73,.62,.12),paint,.018)
    body(base,[
        (1.25,.98,1.82,2.75,1.13,1.02),(2.03,.98,1.82,2.75,1.17,1.04),
        (2.49,.94,1.77,2.58,1.15,1.03)
    ],paint)
    body(base,[(2.42,.94,1.49,1.80,1.08,.83),(3.08,.92,1.43,1.69,1.00,.78),
               (3.43,.91,1.37,1.59,.92,.76)],shade(paint,1.12))
    base.box((0,.76,3.37),(2.70,.22,.22),FRAME,.05)
    base.box((0,.884,-3.279),(2.55,.17,.244),FRAME,.028)
    base.box((0,1.287,3.447),(1.49,.46,.032),FRAME,.012)
    glass.add([(-1.015,2.58,2.512),(-1.11,1.87,2.511),(1.11,1.87,2.511),(1.015,2.58,2.512)],
              [(0,1,2,3)],GLASS)
    for side in (-1,1):
        glass.add([(side*1.087,2.567,1.50),(side*1.163,1.89,1.50),
                   (side*1.183,1.89,2.33),(side*1.085,2.52,2.17)],
                  [(0,1,2,3) if side<0 else (3,2,1,0)],GLASS)
        base.box((side*1.118,1.097,3.215),(.425,.337,.347),shade(paint,.91),.052)
        base.tube((side*1.05,1.09,3.365),[(-.04,.143),(.048,.143)],"z",LAMP,10)
        base.box((side*1.04,.889,-3.415),(.32,.128,.038),RED)
        for index,z in enumerate((-2.52,-.84,2.24)):
            wheel(base,side*1.31,.48,z,.48,.36,detail,tread=True)
            if index!=1:
                base.box((side*1.28,1.055,z),(.43,.13,1.09),shade(paint,.77))
        detail.box((side*1.177,1.736,1.67),(.037,.083,.215),STEEL,.010)
        detail.beam((side*1.109,2.285,2.29),(side*1.40,2.39,2.11),.047,FRAME)
        detail.box((side*1.436,2.44,2.10),(.093,.292,.179),FRAME,.022)
        detail.box((side*1.489,2.445,2.085),(.015,.232,.145),GLINT,.006)
        detail.box((side*1.15,.80,1.49),(.28,.109,.52),STEEL,.015)
        detail.box((side*1.267,1.21,3.365),(.12,.066,.066),AMBER,.013)
        detail.beam((side*.15,1.941,2.528),(side*.65,2.261,2.520),.028,FRAME)
        for i in range(6):
            z=-2.94+i*.72
            detail.box((side*1.404,1.581,z),(.052,.240,.080),shade(paint,.73),.010)
            seams.beam((side*1.351,1.799,z-.09),(side*1.431,1.647,z+.035),.022,TARP_SEAM)
    for i in range(8):
        detail.box((-.624+i*.178,1.305,3.472),(.061,.359,.030),STEEL,.004)
    detail.beam((0,1.871,2.523),(0,2.583,2.518),.047,shade(paint,.91))
    for x in (-.88,.88):
        detail.box((x,1.36,-3.365),(.06,.474,.055),STEEL)
    detail.box((0,.886,-3.41),(.49,.133,.027),DUST,.009)
    detail.tube((1.22,2.40,1.15),[(-1.23,.081),(.48,.081),(.51,.096),
                                   (.54,.096)],"y",FRAME,10)
    # A shaped canvas canopy with seams and restrained variation per panel.
    arch=[(-1.345,1.67),(-1.322,2.81),(-1.102,3.10),
          (-.73,3.235),(0,3.268),(.73,3.235),(1.102,3.10),(1.322,2.81),(1.345,1.67)]
    limits=(-3.265,-2.48,-1.77,-1.05,-.33,.39,1.127)
    for i,(start,end) in enumerate(zip(limits,limits[1:])):
        for j,((xa,ya),(xb,yb)) in enumerate(zip(arch,arch[1:])):
            color=shade(TARP,(.92,.96,1.03,1.06,1.04,1,.96,.90)[j]*(1+.038*((i%3)-1)))
            cover.add([(xa,ya,start),(xa,ya,end),(xb,yb,end),(xb,yb,start)],[(0,1,2,3)],color)
            if i:
                seams.beam((xa*1.003,ya+.011,start),(xb*1.003,yb+.011,start),.045,TARP_SEAM,.023)
    for z,reverse in ((limits[0],True),(limits[-1],False)):
        points=[(x,y,z) for x,y in arch]
        cover.add(points,[tuple(range(len(points))) if reverse else tuple(reversed(range(len(points))))],shade(TARP,.90))
    for side in (-1,1):
        seams.beam((side*1.355,1.716,limits[0]),(side*1.355,1.716,limits[-1]),.063,TARP_SEAM,.039)
    base.box((0,1.32,-3.389),(2.37,.083,.04),shade(paint,.76),.009)


def truck_wreck(layer):
    frame=layer("vehicle-paint")
    canvas=layer("canvas",False,False)
    for index,z in enumerate((-2.91,-1.03,.77)):
        arch=[(-1.29,1.66,z),(-1.20,2.43+index*.15,z+.22),(-.66,2.89-index*.19,z+.33),
              (.66,2.63+index*.15,z+.11),(1.23,2.34,z-.09),(1.30,1.65,z)]
        for start,end in zip(arch,arch[1:]):
            frame.beam(start,end,.052,STEEL)
        canvas.add([arch[0],arch[1],arch[2],(-.79,1.81,z+.49)],[(0,1,2),(2,3,0)],TARP)
    frame.beam((-.66,2.89,-2.58),(-.34,2.46,.93),.049,STEEL)


def car(layer,paint):
    base=layer("vehicle-paint")
    glass=layer("vehicle-glass",False,False)
    high=layer("vehicle-paint",True,False)
    body(base,[(-2.22,.45,.78,.89,.86,.74),(-1.83,.35,.99,1.05,1.02,.90),
               (1.63,.35,.99,1.04,1.01,.89),(2.17,.42,.75,.89,.88,.74)],paint)
    cabin=[(-.885,1.025,-1.38),(.885,1.025,-1.38),(.875,1.02,1.17),(-.875,1.02,1.17),
           (-.721,1.66,-.875),(.721,1.66,-.875),(.725,1.66,.454),(-.725,1.66,.454)]
    faces=[(1,0,4,5),(0,3,7,4),(3,2,6,7),(2,1,5,6),(4,7,6,5)]
    base.add(cabin,[*faces,(0,1,2,3)],shade(paint,1.11))
    for i,face in enumerate(faces[:4]):
        pane=[cabin[j] for j in face]
        spans=((.09,.475),(.530,.91)) if i%2 else ((.071,.929),)
        for span in spans:
            window(glass,pane,span,GLASS if i%2 else GLINT)
    for side in (-1,1):
        for z in (-1.37,1.35):
            wheel(base,side*.955,.34,z,.34,.235,high)
        base.box((side*.72,.731,2.16),(.35,.183,.105),LAMP,.016)
        base.box((side*.75,.762,-2.21),(.32,.16,.054),RED,.012)
        high.box((side*1.008,.909,.23),(.041,.047,.16),STEEL,.007)
        high.box((side*1.004,.909,-.77),(.037,.045,.153),STEEL,.008)
        high.beam((side*.876,1.10,.765),(side*1.055,1.176,.695),.039,FRAME)
        high.box((side*1.07,1.162,.704),(.21,.093,.172),FRAME,.013)
        high.beam((side*.11,1.173,1.014),(side*.54,1.242,.939),.021,FRAME)
        high.beam((side*1.010,.751,-.91),(side*1.008,.962,-.91),.017,shade(paint,.66))
        high.beam((side*1.013,.757,-.88),(side*1.011,.794,.88),.042,shade(paint,.73))
    for z in (-2.202,2.17):
        base.box((0,.51,z),(1.89,.17,.13),FRAME,.023)
    base.box((0,.751,2.18),(1.06,.17,.043),FRAME,.013)
    for y in (.700,.735,.770,.805):
        high.box((0,y,2.206),(.991,.013,.017),STEEL)
    for z in (-2.280,2.243):
        high.box((0,.52,z),(.327,.112,.024),DUST,.007)
    high.box((0,.778,2.219),(.077,.049,.020),OLIVE_LIGHT,.005)


def generator(layer,w,d,h,paint):
    base=layer("vehicle-paint")
    high=layer("vehicle-paint",True,False)
    base.box((0,.11,0),(w,.22,d),FRAME,.024)
    base.box((0,h*.50,0),(w*.89,h*.76,d*.86),paint,.056)
    base.box((0,h*.51,d*.44),(w*.51,h*.40,.037),FRAME,.009)
    base.box((0,h*.89,0),(w*.93,.095,d*.9),shade(paint,1.19),.023)
    for side in (-1,1):
        for i in range(5):
            high.box((side*w*.359,h*(.35+i*.081),d*.438),(w*.129,.049,.034),FRAME,.007)
        high.box((side*w*.21,h*.56,d*.468),(w*.064,.06,.023),AMBER if side>0 else LAMP,.004)
    high.box((0,h*.60,d*.468),(w*.16,h*.10,.021),GLINT,.006)
    high.beam((w*.36,h*.90,-d*.24),(w*.36,h+.17,-d*.24),.092,FRAME)
    if h>1.7:
        x=-w*.32
        base.box((x,h+1.53,d*.19),(.077,3.20,.077),STEEL,.006)
        base.box((x,h+3.10,d*.19),(1.10,.105,.13),FRAME,.009)
        for side in (-1,1):
            base.box((x+side*.41,h+3.06,d*.23),(.29,.22,.17),LAMP,.030)
            high.beam((x,h+2.84,d*.19),(x+side*.35,h+3.03,d*.19),.032,FRAME)


def reservoir(layer,w,d,h,paint):
    base=layer("vehicle-paint")
    high=layer("vehicle-paint",True,False)
    rad=w*.456
    center=h-rad-.14
    for z in (-d*.28,d*.28):
        base.box((0,.26,z),(w*.82,.52,.50),FRAME,.055)
    profile=[(-d*.49,rad*.55),(-d*.46,rad*.84),(-d*.40,rad),(d*.40,rad),
             (d*.46,rad*.84),(d*.49,rad*.55)]
    base.tube((0,center,0),profile,"z",paint,14)
    for z in (-d*.27,d*.27):
        high.tube((0,center,z),[(-.093,rad+.013),(.093,rad+.013)],"z",STEEL,14)
    base.tube((0,center+rad+.025,-.30),[(-.032,.21),(.102,.21)],"y",FRAME,10)
    high.tube((.70,.46,d*.36),[(0,.12),(.43,.12)],"z",AMBER,9)
    high.box((0,center+.077,d*.496),(.43,.30,.026),LAMP,.020)


def drum(layer):
    base=layer("vehicle-paint")
    high=layer("vehicle-paint",True,False)
    paint=rgb("805544")
    base.tube((0,0,0),[(0,.49),(.09,.535),(1.25,.535),(1.34,.49)],"y",paint,12)
    base.tube((0,0,0),[(.60,.537),(.82,.537)],"y",rgb("ac8861"),12)
    for y in (.065,.42,.98,1.26):
        high.tube((0,y,0),[(-.029,.534),(0,.552),(.029,.534)],"y",shade(paint,.74),12)
    high.tube((.24,1.348,-.11),[(-.008,.081),(.022,.081)],"y",STEEL,9)
    high.tube((-.18,1.348,.12),[(-.008,.043),(.014,.043)],"y",FRAME,8)
