"""Build the detailed AR-416 from the existing game prop and attachment layout."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_ar416 as base
from weapon_finish import grip_finish_uv, shader_finish
from weapon_detail import DetailedAssembly, engraved_mark, molded_grip, round_aperture
from weapon_mesh import export_weapon, side_profile


FRAME = (.156, .101, .053)
UPPER = (.186, .119, .066)
EDGE = (.222, .154, .087)
STEEL = (.065, .076, .079)
BOLT = (.205, .228, .235)
FURNITURE = (.104, .070, .040)
POLYMER = (.035, .041, .041)
RECESS = (.023, .028, .027)
RUBBER = (.035, .031, .027)
GRIP = (.063, .043, .027)
STIPPLE = (.048, .033, .023)
STOCK_TUBE = (.055, .061, .059)
STOCK_COMB = (.123, .089, .056)
MARK = (.268, .225, .177)
SELECTOR = (.280, .048, .023)


class AR416Assembly(DetailedAssembly):
    varied_finishes = (FRAME, UPPER, EDGE)


def round_slot(mesh, side, z, color):
    # Each cell has a real rounded opening and a recessed inner wall.
    angles = [math.tau * i/32 for i in range(32)]
    contours = []
    for row, x in enumerate((.037, .049, .052, .052)):
        contour = []
        for theta in angles:
            u, v = math.cos(theta), math.sin(theta)
            if row == 3:
                shrink = max(abs(u), abs(v))
                p, q = .0225*u/shrink, .030*v/shrink
            else:
                radius = .009 if row == 2 else .007
                p = radius*u + math.copysign(.008, u)
                q = radius*v
            contour.append((side*x, .010+q, z+p))
        contours.append(contour)
    length = len(angles)
    start = len(mesh.vertices)
    mesh.vertices.extend(point for contour in contours for point in contour)
    for band, tint in enumerate((STEEL, EDGE, color)):
        faces = []
        for i in range(length):
            j = (i+1) % length
            face = (band*length+i, band*length+j, (band+1)*length+j, (band+1)*length+i)
            faces.append(face if side > 0 else face[::-1])
        mesh.faces.extend(tuple(start + i for i in face) for face in faces)
        mesh.colors.extend([tint]*len(faces))


def pistol_grip():
    grip = AR416Assembly()
    molded_grip(grip,[(-.083,.100,.046,.0215),(-.090,.100,.040,.0227),
                      (-.101,.101,.035,.024),(-.119,.104,.033,.0245),
                      (-.126,.106,.034,.0246),(-.145,.109,.036,.0246),
                      (-.185,.118,.047,.024),(-.207,.124,.051,.0236),
                      (-.219,.128,.058,.0233),(-.227,.128,.062,.0225),
                      (-.234,.122,.063,.021),(-.237,.118,.066,.0195)],
                GRIP,STIPPLE,panel=(-.220,-.124))
    for i in range(10):
        t = i/9
        grip.box((0,-.141-t*.073,.0358+t*.021),(.029,.0021,.0026),GRIP,.00065)
    grip.box((0,-.237,.092),(.042,.004,.053),POLYMER,.0015)
    grip.box((0,-.239,.097),(.019,.0018,.021),RECESS,.0006)

    return grip


def stock_model():
    stock = AR416Assembly()
    angles = [i*math.tau/48 for i in range(48)]
    cross_section = [(math.copysign(abs(math.cos(a))**.64,math.cos(a)),
                      math.copysign(abs(math.sin(a))**.66,math.sin(a))) for a in angles]
    stock.tube((0,.015,0),[(.084,.026),(.087,.030),(.093,.032),(.119,.032),
                         (.126,.0305),(.202,.0305),(.230,.030),(.282,.025)],'z',STOCK_TUBE,72)
    stock.tube((0,.015,0),[(.097,.032),(.099,.0348),(.104,.035),
                         (.107,.0335),(.111,.0335),(.114,.035),(.118,.0346),
                         (.123,.032)],'z',STOCK_TUBE,72)
    for i in range(6):
        angle = i*math.tau/6
        stock.cylinder((.033*math.cos(angle),.015+.033*math.sin(angle),.106),
                       .0034,.008,'z',POLYMER,10)

    # Rounded molded shell with a raised top comb, narrowing into the tube.
    shell = [(.208,.042,-.016,.030),(.214,.048,-.022,.034),(.226,.052,-.026,.038),
             (.248,.053,-.030,.040),(.287,.052,-.036,.041),(.331,.051,-.040,.042),
             (.375,.051,-.042,.042),(.411,.050,-.042,.040),(.432,.045,-.039,.036),
             (.447,.035,-.035,.032)]
    stock.rings([[(u*width*(.93+.07*v), (top+bottom+(top-bottom)*v)/2, z)
                  for u,v in cross_section] for z,top,bottom,width in shell],FURNITURE)
    comb = [(.240,.047,.030,.030),(.249,.054,.027,.032),(.273,.056,.026,.034),
            (.328,.056,.025,.035),(.381,.056,.025,.035),(.411,.054,.025,.033),
            (.427,.047,.022,.031)]
    stock.rings([[(u*width, (top+bottom+(top-bottom)*v)/2,z)
                  for u,v in cross_section] for z,top,bottom,width in comb],STOCK_COMB)

    side_profile(stock,[(.237,-.016),(.294,-.028),(.369,-.092),(.410,-.120),
                        (.438,-.127),(.440,-.152),(.418,-.160),(.397,-.146),
                        (.354,-.113),(.288,-.069),(.248,-.048)],.059,FURNITURE)
    stock.box((0,-.051,.309),(.041,.012,.060),POLYMER,.003)
    stock.tube((0,-.052,.318),[(-.025,.004),(-.023,.007),(.023,.007),
                             (.025,.004)],'x',STOCK_TUBE,32)

    # Concave rubber pad, molded flange and a separate backing plate.
    for color,layers in (
        (POLYMER,[(-.026,.86),(-.023,.96),(-.016,1),(-.013,.98)]),
        (RECESS,[(-.014,.975),(-.012,.975),(-.010,.97)]),
        (RUBBER,[(-.011,.957),(-.008,1),(.001,1),(.006,.972),(.009,.91)]),
    ):
        stock.rings([[(u*size*(.034+.004*v),-.061+.109*v*size,
                      .454+.009*v+.007*v*v+depth) for u,v in cross_section]
                     for depth,size in layers],color)
    for i in range(13):
        v = .82-i*.132
        width = .056*(1-abs(v)**2)**.46
        stock.box((0,-.061+.106*v,.463+.009*v+.007*v*v),
                  (width,.0063,.0045),RUBBER,.0011)

    for side in (-1,1):
        side_profile(stock,[(.257,.012),(.282,.024),(.391,.026),(.415,.017),
                            (.416,.003),(.399,-.012),(.342,-.016),(.278,-.010)],
                     .008,STOCK_COMB,side*.039)
        side_profile(stock,[(.276,.012),(.290,.019),(.378,.020),(.395,.014),
                            (.394,.002),(.369,-.008),(.288,-.004)],.003,FURNITURE,side*.043)
        side_profile(stock,[(.278,-.045),(.303,-.048),(.383,-.106),(.412,-.124),
                            (.405,-.130),(.376,-.114),(.306,-.068)],.003,STOCK_COMB,side*.028)
        # Open rim around the sling socket, with the dark wall and floor behind it.
        profile = [(.042,.0124),(.045,.0133),(.047,.0122),(.048,.0105),
                   (.0475,.0082),(.0455,.007),(.042,.007)]
        rings = [[(side*x,.002+r*math.cos(a),.399+r*math.sin(a)) for a in angles]
                 for x,r in profile]
        count = len(angles)
        faces = []
        for row in range(len(rings)):
            start, next_start = row*count, ((row+1)%len(rings))*count
            for i in range(count):
                j = (i+1)%count
                faces.append((start+i,start+j,next_start+j,next_start+i)[::side])
        stock.add([point for ring in rings for point in ring],faces,STOCK_TUBE)
        stock.cylinder((side*.044,.002,.399),.0083,.002,'x',RECESS,18)
        for i in range(5):
            z = .306+i*.013
            side_profile(stock,[(z,-.014),(z+.003,-.004),(z+.007,-.004),
                                (z+.004,-.014)],.0025,STOCK_COMB,side*.0445)
        stock.cylinder((side*.032,-.141,.415),.0063,.005,'x',STOCK_TUBE,12)
        stock.box((side*.035,-.141,.415),(.0009,.0016,.0067),RECESS,.0003)
    return stock


def magazine():
    body = AR416Assembly()
    rows = [(-.072,-.060,-.178),(-.087,-.060,-.178),(-.136,-.057,-.181),
            (-.225,-.070,-.193),(-.274,-.083,-.208),(-.290,-.089,-.215)]
    body.rings([[(math.copysign(abs(math.cos(a))**.55,math.cos(a))*.0355,
                  y+.005*math.sin(a),
                  (rear+fore)/2+math.copysign(abs(math.sin(a))**.55,math.sin(a))*(rear-fore)/2)
                 for a in (i*math.tau/40 for i in range(40))] for y,rear,fore in rows],POLYMER)
    side_profile(body,[(-.080,-.277),(-.213,-.289),(-.223,-.299),(-.219,-.302),
                       (-.088,-.298),(-.082,-.293)],.080,STEEL)
    for side in (-1,1):
        for z in (-.089,-.119,-.151):
            side_profile(body,[(z,-.152),(z-.007,-.151),(z-.021,-.272),(z-.014,-.273)],
                         .005,POLYMER,side*.034)
        for i in range(3):
            body.cylinder((side*.036,-.186-i*.018,-.134-i*.008),.0038,.002,'x',STEEL,12)
    return body


def finish(material, shader, rows):
    material.name = 'AR-416 · anodized alloy / polymer / steel / rubber'
    shader_finish(material, shader, rows, finishes=((.52,.45,.034),(.76,.015,.064),
                                                   (.36,.86,.028),(.86,0,.072),(.72,.012,.89),
                                                   (.59,.54,.020)),
                  fabric_rows=(),stipple_rows=(4,),size=384,roughness_variation=.44)


def project_finishes(mesh, colors, rows, row_count):
    grip_finish_uv(mesh,colors,rows,row_count,STIPPLE,depth=(.029,.134),height=(-.221,-.119))


def main():
    glb, blend = map(Path,sys.argv[sys.argv.index('--')+1:])
    base.Assembly = AR416Assembly
    base.surface_mark = engraved_mark
    base.sight_ring = round_aperture
    for name in ('FRAME','UPPER','EDGE','STEEL','BOLT','FURNITURE','POLYMER','RECESS','MARK','SELECTOR'):
        setattr(base,name,globals()[name])
    receiver = base.receiver()
    for side in (-1,1):
        receiver.box((side*.039,-.030,-.081),(.002,.003,.220),RECESS,.0006)
        receiver.cylinder((side*.042,-.042,-.171),.0038,.002,'x',STEEL,12)
    receiver.box((.061,-.016,-.093),(.007,.006,.100),EDGE,.0017)
    for z in (-.145,-.043):
        receiver.cylinder((.057,-.042,z),.0046,.012,'z',STEEL,18)
    receiver.box((.050,.027,-.106),(.0015,.024,.091),RECESS,.0006)
    side_profile(receiver,[(.045,.047),(.025,.041),(-.172,.041),(-.192,.047)],.005,EDGE,-.042)
    side_profile(receiver,[(.021,.036),(.009,.030),(-.174,.030),(-.185,.036)],.002,UPPER,-.042)

    _, barrel = base.front()
    guard = AR416Assembly()
    for y in (-.040,.060):
        guard.box((0,y,-.438),(.083,.021,.355),FRAME,.0045)
    for side in (-1,1):
        guard.box((side*.046,.044,-.438),(.012,.011,.352),FRAME,.0025)
        for i in range(8):
            round_slot(guard,side,-.280-i*.045,UPPER)
        for z in (-.278,-.599):
            guard.cylinder((side*.053,.014,z),.0065,.003,'x',STEEL,18)
            guard.box((side*.0548,.014,z),(.001,.0015,.007),RECESS,.0003)
    guard.box((0,-.054,-.441),(.052,.013,.335),STEEL,.003)
    for i in range(16):
        guard.box((0,-.063,-.289-i*.020),(.066,.009,.011),FRAME,.0015)
    base.rail(guard,-.272,19)

    bolt = AR416Assembly()
    bolt.box((.026,.023,-.089),(.034,.042,.108),BOLT,.006)
    bolt.box((.043,.022,-.057),(.006,.016,.039),STEEL,.003)
    bolt.box((0,.072,.113),(.095,.017,.024),STEEL,.004)
    for side in (-1,1):
        bolt.box((side*.046,.069,.101),(.016,.015,.031),FRAME,.003)
    parts = [('Receiver',receiver),('Handguard',guard),('Barrel',barrel),
             ('Grip',pistol_grip()),('Stock',stock_model()),
             ('Sights',base.sights()),('Magazine',magazine()),('Bolt',bolt)]
    anchors = {'Mount_Optic':(0,.095,-.087),'Mount_Barrel':(0,.015,-.207),
               'Mount_Magazine':(0,-.075,-.139),'Mount_Stock':(0,.015,.084)}
    export_weapon(parts,glb,blend,mounts=anchors,modular=True,finish_shader=finish,finish_projection=project_finishes,
                  finish_rows={FURNITURE:1,POLYMER:1,RECESS:1,MARK:1,SELECTOR:1,
                               GRIP:1,STEEL:2,BOLT:2,RUBBER:3,STIPPLE:4,STOCK_TUBE:5,STOCK_COMB:1})


if __name__ == '__main__':
    main()
