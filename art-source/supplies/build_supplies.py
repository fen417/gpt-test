"""Build the deployable ammo crate and medic pouch for SECTOR 09."""
import sys
from pathlib import Path

from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon


OLIVE = (.119,.158,.079)
OLIVE_EDGE = (.168,.201,.108)
OLIVE_DARK = (.064,.086,.044)
DARK = (.026,.032,.029)
STEEL = (.138,.156,.144)
RUBBER = (.020,.024,.023)
SAND = (.236,.171,.095)
TAPE = (.143,.106,.066)
THREAD = (.354,.275,.167)
WHITE = (.755,.738,.623)
RED = (.443,.059,.042)
RED_EDGE = (.326,.051,.030)
YELLOW = (.484,.327,.073)
BRASS = (.401,.281,.103)
COPPER = (.331,.143,.062)


def webbing(mesh, points, width, thickness, color):
    sections=[]
    path=[Vector(point) for point in points]
    for i,point in enumerate(path):
        tang=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        side=Vector((0,0,1))*width*.5
        normal=tang.cross(side).normalized()*thickness*.5
        sections.append([tuple(point+x*side+y*normal) for x,y in ((-1,-1),(1,-1),(1,1),(-1,1))])
    mesh.rings(sections,color)


def ammo():
    crate,lid,contents=Assembly(),Assembly(),Assembly()
    crate.box((0,.025,0),(.514,.050,.344),OLIVE_DARK,.013)
    for side in (-1,1):
        crate.box((side*.244,.132,0),(.026,.182,.327),OLIVE,.006)
        crate.box((0,.132,side*.158),(.466,.182,.020),OLIVE,.004)
        crate.box((side*.244,.218,0),(.036,.026,.347),OLIVE_EDGE,.004)
        crate.box((0,.218,side*.160),(.471,.026,.033),OLIVE_EDGE,.004)
        for end in (-1,1):
            crate.box((side*.224,.118,end*.155),(.032,.177,.038),OLIVE_DARK,.007)
            crate.box((side*.221,.017,end*.135),(.047,.028,.061),RUBBER,.005)
        for y in (.076,.162):
            crate.box((0,y,side*.169),(.355,.017,.009),OLIVE_EDGE,.003)
        crate.box((side*.258,.117,0),(.006,.074,.160),OLIVE_DARK,.004)
        for z in (-.070,.070):
            crate.box((side*.261,.118,z),(.011,.038,.019),STEEL,.003)
        crate.box((side*.266,.119,0),(.010,.023,.141),DARK,.003)
    for x in (-.179,.179):
        crate.box((x,.169,-.172),(.038,.053,.015),STEEL,.004)
        crate.box((x,.164,-.179),(.025,.039,.010),OLIVE_DARK,.002)
        crate.cylinder((x,.222,.161),.012,.053,'x',STEEL,16)
        lid.cylinder((x,.236,.163),.013,.027,'x',STEEL,16)
        lid.box((x,.235,-.167),(.034,.017,.014),OLIVE_DARK,.003)
    crate.box((0,.119,-.172),(.146,.065,.004),OLIVE_DARK,.0013)
    for x in (-.035,0,.035):
        crate.box((x,.113,-.175),(.014,.030,.003),YELLOW,.0012)
        crate.box((x,.133,-.175),(.009,.013,.003),YELLOW,.0012)
    lid.box((0,.235,0),(.519,.019,.347),OLIVE,.006)
    lid.box((0,.224,0),(.487,.005,.314),RUBBER,.001)
    lid.box((0,.247,0),(.333,.008,.195),OLIVE_EDGE,.0017)
    for x in (-.158,.158):
        lid.box((x,.252,0),(.021,.008,.233),OLIVE_DARK,.002)
    for side in (-1,1):
        lid.box((0,.222,side*.097),(.416,.006,.019),OLIVE_EDGE,.001)
        lid.box((side*.247,.242,0),(.019,.010,.306),OLIVE_EDGE,.002)
    lid.box((0,.254,.008),(.113,.005,.048),OLIVE_DARK,.002)
    webbing(lid,[(-.062,.254,.008),(-.051,.268,.008),(.051,.268,.008),(.062,.254,.008)],.029,.006,DARK)
    for x in (-.154,.151):
        contents.box((x,.104,.057),(.121,.125,.170),SAND,.006)
        for z in (.015,.089):
            contents.box((x,.170,z),(.124,.009,.012),TAPE,.0018)
        contents.box((x,.177,.045),(.066,.003,.042),WHITE,.0008)
        for j in range(3):
            contents.box((x-.019+j*.018,.179,.045),(.008,.002,.026),TAPE,.0004)
    contents.box((0,.086,-.018),(.153,.089,.281),OLIVE_DARK,.005)
    for x in (-.051,0,.051):
        for z in (-.084,.051):
            contents.cylinder((x,.144,z),.011,.090,'z',BRASS,16)
            contents.tube((x,.144,z),[(-.065,.002),(-.053,.007),(-.043,.007)],'z',COPPER,16)
            contents.cylinder((x,.144,z+.044),.012,.010,'z',BRASS,16)
    return [('Crate',crate),('Lid',lid),('Contents',contents)],{'Lid':(0,.232,.163)}


def medkit():
    bag,web,mark=Assembly(),Assembly(),Assembly()
    # Scalloped cross-sections give the filled pouch rounded corners and soft gussets.
    sections=[(-.084,.123,.026,.133,.013),(-.072,.138,.015,.147,.015),
              (-.030,.141,.010,.153,.016),(.045,.134,.009,.153,.016),(.080,.124,.015,.145,.015)]
    rings=[]
    for z,x,base,high,c in sections:
        rings.append([(vx,vy,z) for vx,vy in (
            (-x+c,base),(x-c,base),(x,base+c),(x,high-c),(x-c,high),
            (-x+c,high),(-x,high-c),(-x,base+c))])
    bag.rings(rings,SAND)
    bag.box((0,.014,0),(.256,.028,.146),TAPE,.010)
    bag.box((0,.084,-.080),(.230,.100,.019),RED,.007)
    bag.box((0,.085,.080),(.230,.100,.017),SAND,.006)
    for side in (-1,1):
        bag.box((side*.131,.078,.004),(.020,.100,.128),TAPE,.006)
        web.box((side*.129,.107,.004),(.020,.016,.113),DARK,.003)
        bag.box((side*.124,.090,-.084),(.017,.085,.005),RED_EDGE,.002)
        for y in (.048,.122):
            for i in range(9):
                mark.box((side*(.024+i*.010),y,-.090),(.0038,.0012,.002),THREAD,0)
        for i in range(5):
            mark.box((side*.104,.058+i*.012,-.091),(.0018,.0038,.0018),THREAD,0)
    # Zipper track wraps around the top and ends in an angled pull tab.
    track_z=-.026
    web.box((0,.149,track_z),(.247,.010,.012),DARK,.0015)
    for i in range(25):
        web.box((-.108+i*.009,.155,track_z),(.004,.002,.006),STEEL,0)
    web.box((.091,.158,track_z),(.015,.008,.017),STEEL,.0016)
    tab=Assembly()
    tab.box((.090,.152,-.046),(.008,.006,.029),DARK,.001)
    for x in (-.055,.055):
        web.box((x,.144,.026),(.026,.010,.035),TAPE,.003)
    webbing(web,[(-.063,.147,.028),(-.052,.181,.028),(-.035,.191,.028),
                 (.035,.191,.028),(.052,.181,.028),(.063,.147,.028)],.024,.006,DARK)
    # Repeat the cross on two faces so the kit reads from either approach.
    for side in (-1,1):
        if side>0:
            mark.box((0,.085,.089),(.112,.088,.004),RED,.002)
        z=.092 if side>0 else -.090
        mark.box((0,.087,z),(.066,.016,.003),WHITE,.0018)
        mark.box((0,.087,z),(.017,.066,.003),WHITE,.0018)
    return [('Pouch',bag),('Webbing',web),('MedicalMark',mark),('ZipperPull',tab)],{}


if __name__ == '__main__':
    kind,glb,blend=sys.argv[sys.argv.index('--')+1:]
    parts,pivots={'ammo':ammo,'medkit':medkit}[kind]()
    finish={DARK:1,RUBBER:1,STEEL:2,BRASS:2,COPPER:2,
            SAND:3,TAPE:3,THREAD:3,RED:3,RED_EDGE:3,WHITE:3}
    export_weapon(parts,Path(glb),Path(blend),pivots=pivots,view_distance=.95,finish_rows=finish)
