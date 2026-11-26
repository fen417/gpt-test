"""Build the detailed AK-12M game prop from the existing stock silhouette."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_ak12m as base
from weapon_detail import DetailedAssembly, engraved_mark, round_aperture
from weapon_finish import shader_finish
from weapon_mesh import export_weapon, side_profile


FRAME = (.072, .083, .094)
COVER = (.040, .050, .061)
POLYMER = (.032, .035, .039)
MOLDING = (.054, .058, .062)
STEEL = (.151, .170, .184)
EDGE = (.098, .112, .128)
RUBBER = (.022, .023, .024)
RECESS = (.015, .018, .020)
MARK = (.168, .186, .197)


class AK12MAssembly(DetailedAssembly):
    varied_finishes = (FRAME, COVER, EDGE)


def rounded_profile(mesh, points, width, color, x=0):
    center_z = sum(z for z, _ in points)/len(points)
    center_y = sum(y for _, y in points)/len(points)
    sections = [(-.5,.90),(-.49,.95),(-.46,.983),(-.40,1),
                 (.40,1),(.46,.983),(.49,.95),(.5,.90)]
    mesh.rings([[(x+width*s,center_y+(y-center_y)*scale,center_z+(z-center_z)*scale)
                 for z,y in points] for s,scale in sections],color)


def rounded_section(y, rear, fore, width, tilt=0):
    for i in range(40):
        angle = i*math.tau/40
        x, z = math.cos(angle), math.sin(angle)
        yield (math.copysign(abs(x)**.52,x)*width, y+tilt*z,
               (rear+fore)/2+math.copysign(abs(z)**.52,z)*(rear-fore)/2)


def furniture():
    grip, stock = AK12MAssembly(), AK12MAssembly()
    dimensions = [(-.073,.063,-.036,.025),(-.085,.070,-.034,.029),
                  (-.116,.084,-.029,.030),(-.155,.103,.009,.031),
                  (-.193,.123,.041,.030),(-.218,.132,.057,.028),
                  (-.228,.120,.064,.025)]
    grip.rings([list(rounded_section(*row)) for row in dimensions],POLYMER)
    for side in (-1,1):
        rounded_profile(grip,[(.038,-.143),(.087,-.139),(.109,-.198),
                              (.080,-.214),(.059,-.202)],.0034,MOLDING,side*.028)
        for i in range(7):
            grip.box((side*.030,-.149-i*.007,.059+i*.003),(.003,.004,.032),POLYMER,.001)
    grip.box((0,-.226,.088),(.050,.005,.052),RECESS,.0015)
    rounded_profile(grip,[(-.030,-.117),(-.058,-.127),(-.104,-.127),(-.151,-.107),
                          (-.165,-.078),(-.150,-.078),(-.140,-.097),(-.101,-.116),(-.052,-.115)],
                    .037,COVER)
    side_profile(grip,[(-.066,-.075),(-.084,-.075),(-.080,-.105),(-.064,-.112),(-.056,-.107)],.013,STEEL)

    # The inner guide is a rounded oblong under the existing stock body.
    stock.tube((0,-.024,0),[(.131,.023),(.135,.028),(.147,.029),(.168,.029),
                           (.180,.025),(.330,.024),(.345,.021)],'z',COVER,56)
    stock.box((0,-.046,.242),(.037,.020,.209),MOLDING,.003)
    stock.box((0,-.025,.143),(.072,.067,.023),FRAME,.005)
    rounded_profile(stock,[(.153,.007),(.172,.016),(.427,.015),(.450,.008),
                           (.461,-.013),(.452,-.044),(.362,-.066),(.313,-.053),
                           (.157,-.061)],.073,POLYMER)
    rounded_profile(stock,[(.394,-.031),(.456,-.027),(.441,-.071),(.398,-.188),
                           (.377,-.191),(.400,-.083)],.055,MOLDING)
    rounded_profile(stock,[(.464,.010),(.487,.006),(.492,-.007),(.483,-.176),
                           (.475,-.195),(.457,-.200),(.436,-.192),(.450,-.048)],.068,RUBBER)
    side_profile(stock,[(.465,-.173),(.465,-.193),(.383,-.197),(.380,-.180)],.056,POLYMER)
    stock.box((0,-.096,.428),(.052,.019,.040),MOLDING,.005)
    for side in (-1,1):
        rounded_profile(stock,[(.226,-.005),(.403,-.002),(.424,-.013),(.409,-.035),
                              (.365,-.044),(.237,-.035)],.0024,RECESS,side*.035)
        stock.cylinder((side*.036,-.024,.183),.013,.006,'x',MOLDING,22)
        stock.cylinder((side*.040,-.024,.183),.007,.0024,'x',STEEL,20)
        for i in range(3):
            stock.box((side*.036,-.018,.350+i*.016),(.003,.020,.006),MOLDING,.0011)
    for i in range(10):
        stock.box((0,-.011-i*.018,.490-i*.0014),(.060,.006,.006),RUBBER,.0015)
    return grip, stock


def side_vent(mesh, side, z):
    """A rounded recess with a bevel into the darker handguard channel."""
    contours = []
    for ring, x in enumerate((.039,.045,.048,.048)):
        points = []
        for i in range(24):
            angle = i*math.tau/24
            u, v = math.cos(angle), math.sin(angle)
            if ring == 3:
                edge = max(abs(u),abs(v))
                along, up = .01025*u/edge, .016*v/edge
            else:
                radius = (.0034,.0036,.005)[ring]
                along, up = radius*u+math.copysign(.002,u), radius*v
            points.append((side*x,.017+up,z+along))
        contours.append(points)
    offset = len(mesh.vertices)
    mesh.vertices.extend(vertex for row in contours for vertex in row)
    for band, color in enumerate((RECESS,COVER,MOLDING)):
        for i in range(24):
            j = (i+1)%24
            face = (i,j,24+j,24+i)
            mesh.faces.append(tuple(offset+24*band+k for k in (face if side > 0 else face[::-1])))
            mesh.colors.append(color)


def handguard():
    guard = AK12MAssembly()
    side = [(-.274,.001),(-.283,-.041),(-.309,-.061),(-.510,-.061),
            (-.533,-.044),(-.534,.003),(-.521,.011),(-.287,.010)]
    rounded_profile(guard,side,.085,POLYMER)
    guard.box((0,.057,-.403),(.071,.019,.257),COVER,.004)
    for direction in (-1,1):
        guard.box((direction*.039,.033,-.404),(.019,.011,.246),MOLDING,.0024)
        guard.box((direction*.039,.004,-.404),(.016,.012,.247),COVER,.0024)
        guard.box((direction*.038,.017,-.404),(.003,.026,.246),RECESS,.0006)
        for i in range(11):
            side_vent(guard,direction,-.3025-i*.0205)
        rounded_profile(guard,[(-.298,-.011),(-.317,-.021),(-.499,-.021),(-.519,-.012),
                               (-.501,-.008),(-.314,-.008)],.006,MOLDING,direction*.041)
        for z in (-.292,-.516):
            guard.cylinder((direction*.047,-.023,z),.0062,.0035,'x',COVER,18)
    guard.box((0,-.059,-.425),(.049,.014,.202),COVER,.0034)
    for i in range(11):
        guard.box((0,-.065,-.337-i*.017),(.060,.008,.009),MOLDING,.0012)
    return guard


def magazine():
    mag = AK12MAssembly()
    rows = [(-.067,-.189,-.292,.0335),(-.114,-.187,-.289,.036),
            (-.156,-.190,-.290,.036),(-.198,-.197,-.296,.036),
            (-.240,-.207,-.305,.035),(-.279,-.218,-.315,.034),
            (-.308,-.227,-.323,.033)]
    mag.rings([list(rounded_section(*row,.008)) for row in rows],POLYMER)
    mag.rings([list(rounded_section(y,rear,fore,width,.008)) for y,rear,fore,width in [
        (-.306,-.224,-.325,.033),(-.310,-.228,-.326,.036),
        (-.319,-.231,-.327,.036),(-.324,-.231,-.327,.0345)]],COVER)
    for side in (-1,1):
        for y,rear,fore,width in rows[2:]:
            # Molded reinforcing ribs follow the arc rather than a straight strip.
            mid=(rear+fore)/2
            rounded_profile(mag,[(mid+.033,y+.004),(mid-.032,y-.005),
                                 (mid-.032,y-.009),(mid+.033,y)],.0032,MOLDING,side*(width-.0008))
        for ratio in (.35,.64):
            segments=[]
            for y,rear,fore,width in rows[2:]:
                z=rear+(fore-rear)*ratio
                segments.append((y,z,width))
            for (ay,az,aw),(by,bz,bw) in zip(segments,segments[1:]):
                mag.add([(side*(aw+.0007),ay,az-.002),(side*(aw+.0007),ay,az+.002),
                         (side*(bw+.0007),by,bz+.002),(side*(bw+.0007),by,bz-.002)],
                        [(0,1,2,3) if side>0 else (3,2,1,0)],MOLDING)
    return mag


def finish(material, shader, rows):
    material.name = 'AK-12M · coated steel / molded polymer / matte rubber'
    shader_finish(material,shader,rows,finishes=((.49,.58,.037),(.74,.02,.061),
                                                 (.34,.88,.029),(.87,0,.069)),
                  fabric_rows=(),size=256,roughness_variation=.46)


def main():
    glb, blend = map(Path,sys.argv[sys.argv.index('--')+1:])
    base.Assembly = AK12MAssembly
    base.surface_mark = engraved_mark
    base.sight_ring = round_aperture
    for name in ('FRAME','COVER','POLYMER','MOLDING','STEEL','RUBBER','RECESS','MARK'):
        setattr(base,name,globals()[name])
    # The external controls and receiver edges retain their dark finish.
    base.STEEL = EDGE
    receiver = base.receiver()
    base.STEEL = STEEL
    for side in (-1,1):
        receiver.box((side*.046,.029,-.075),(.0034,.006,.341),EDGE,.0013)
        receiver.box((side*.047,-.058,-.032),(.0028,.004,.238),COVER,.0011)
        for y,z in ((.005,.098),(-.056,-.242),(-.048,.015)):
            receiver.cylinder((side*.050,y,z),.0036,.0022,'x',FRAME,16)
    receiver.box((.056,-.015,-.142),(.004,.011,.048),EDGE,.0018)
    for i in range(4):
        receiver.box((.059,-.014,-.156+i*.008),(.003,.006,.0035),COVER,.0007)
    _, barrel, sights, rail = base.front()
    grip, stock = furniture()
    bolt = AK12MAssembly()
    bolt.box((.044,.027,-.167),(.017,.015,.144),STEEL,.003)
    bolt.box((.064,.026,-.110),(.031,.016,.024),COVER,.004)
    bolt.tube((.082,.027,-.110),[(-.012,.009),(-.008,.012),(.002,.012),(.007,.0105),
                                (.011,.012),(.014,.010)],'x',FRAME,48)
    parts = [('Receiver',receiver),('Grip',grip),('Stock',stock),('Handguard',handguard()),
             ('Barrel',barrel),('Sights',sights),('TopRail',rail),('Magazine',magazine()),('Bolt',bolt)]
    anchors = {'Mount_Optic':(0,.076,-.070),'Mount_Barrel':(0,.015,-.289),
               'Mount_Magazine':(0,-.067,-.235),'Mount_Stock':(0,-.027,.128)}
    export_weapon(parts,glb,blend,mounts=anchors,modular=True,finish_shader=finish,
                  finish_rows={POLYMER:1,MOLDING:1,RECESS:1,MARK:1,STEEL:2,RUBBER:3})


if __name__ == '__main__':
    main()
