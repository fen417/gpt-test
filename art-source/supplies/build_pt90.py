"""Author the game's fictional PT-90 from the external shapes in Saab's M4 photos.

Reference: https://www.saab.com/globalassets/event/ds/carl-gustaf-m4.pdf
"""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring, surface_mark


OLIVE = (.119, .158, .084)
OLIVE_HIGHLIGHT = (.174, .206, .119)
OLIVE_SHADE = (.076, .113, .065)
GRAPHITE = (.037, .047, .048)
POLYMER = (.063, .080, .079)
RUBBER = (.022, .029, .027)
STEEL = (.126, .154, .151)
EDGE = (.249, .270, .242)
LINER = (.055, .065, .064)
IVORY = (.586, .603, .470)
AMBER = (.658, .390, .087)
RED = (.383, .059, .030)
FRONT_DOT = (.630, .373, .108)

TUBE_Y = .025
SIGHT_Y = .145


def shell(mesh, profile, color, sides=48):
    # A closed rectangular cross-section in radius and game-space depth
    # leaves the center open for a shaded, hollow silhouette.
    rings = len(profile)
    vertices = [(r * math.cos(a), TUBE_Y + r * math.sin(a), z)
                for z, r in profile for a in (i * math.tau / sides for i in range(sides))]
    faces = [(row*sides+i, row*sides+(i+1)%sides,
              (row+1)%rings*sides+(i+1)%sides, (row+1)%rings*sides+i)
             for row in range(rings) for i in range(sides)]
    mesh.add(vertices, faces, color)


def collar(mesh, z, radius, width, color):
    a, b = z-width/2, z+width/2
    shell(mesh, [(a,.052),(a,radius-.004),(a+.004,radius),(b-.004,radius),
                 (b,radius-.004),(b,.052)], color)


def body():
    mesh = Assembly()
    shell(mesh, [(-.603,.049),(-.603,.057),(-.567,.062),(-.390,.062),
                 (-.374,.064),(-.086,.064),(-.069,.062),(.105,.060),(.132,.055),(.132,.049)], OLIVE)
    shell(mesh, [(-.623,.048),(-.623,.061),(-.616,.069),(-.585,.071),
                 (-.565,.064),(-.559,.055),(-.566,.048)], GRAPHITE)
    shell(mesh, [(-.623,.047),(-.623,.051),(-.606,.053),(-.595,.053),
                 (-.599,.048),(-.605,.046)], STEEL)
    shell(mesh, [(-.606,.045),(-.606,.047),(-.555,.049),(-.522,.047),(-.522,.043)], LINER)
    mesh.cylinder((0,TUBE_Y,-.521),.046,.006,'z',RUBBER,32)
    for z, radius, width in [(-.469,.067,.023),(-.408,.067,.026),(-.233,.067,.028),
                             (-.046,.070,.037),(.112,.071,.043)]:
        collar(mesh,z,radius,width,GRAPHITE)
    for z in (-.450,-.248,.081):
        collar(mesh,z,.065,.013,OLIVE_HIGHLIGHT)
    for side in (-1,1):
        mesh.box((side*.050,.055,-.308),(.029,.052,.200),OLIVE_SHADE,.009)
        mesh.box((side*.064,.054,-.303),(.006,.039,.176),OLIVE_HIGHLIGHT,.002)
        for z in (-.381,-.228):
            mesh.cylinder((side*.069,.055,z),.006,.006,'x',STEEL,16)
            mesh.box((side*.073,.055,z),(.002,.003,.008),GRAPHITE,.0005)
        surface_mark(mesh,'PT-90',side*.0685,.065,-.302+side*.041,.0047,IVORY,fill=.50)
        mesh.box((side*.060,.027,-.116),(.006,.027,.096),POLYMER,.003)
        surface_mark(mesh,'P90-031',side*.064,.030,-.116+side*.036,.0025,IVORY,fill=.50)
        mesh.box((side*.057,.034,.021),(.006,.038,.085),OLIVE_SHADE,.003)
        for y in (.025,.035,.045):
            mesh.box((side*.061,y,.019),(.003,.004,.065),OLIVE_HIGHLIGHT,.001)
    return mesh


def rear():
    mesh = Assembly()
    shell(mesh, [(.102,.042),(.102,.052),(.130,.061),(.176,.052),(.216,.064),
                 (.244,.079),(.282,.087),(.302,.085),(.308,.079),(.308,.067),
                 (.298,.064),(.270,.060),(.217,.044),(.156,.037),(.139,.038)], GRAPHITE)
    shell(mesh, [(.249,.077),(.249,.082),(.275,.089),(.296,.089),(.304,.084),
                 (.304,.077),(.289,.080)], STEEL)
    shell(mesh, [(.300,.058),(.300,.065),(.272,.061),(.229,.052),(.211,.044),
                 (.211,.041)], LINER)
    mesh.cylinder((0,TUBE_Y,.191),.045,.008,'z',RUBBER,32)
    for side in (-1,1):
        mesh.box((side*.056,.027,.129),(.079,.042,.046),POLYMER,.008)
        mesh.cylinder((side*.092,.026,.132),.013,.025,'x',STEEL,16)
        mesh.box((side*.107,.026,.132),(.004,.004,.013),GRAPHITE,.001)
    mesh.box((-.065,.057,.112),(.020,.015,.098),STEEL,.003)
    mesh.box((-.063,.062,.150),(.024,.016,.048),POLYMER,.003)
    for z in (.136,.146,.156,.166):
        mesh.box((-.065,.071,z),(.021,.003,.005),EDGE,.0006)
    mesh.box((.063,.050,.172),(.013,.027,.026),AMBER,.003)
    mesh.box((.070,.054,.171),(.003,.004,.019),GRAPHITE,0)
    # Ribbed pad and bracket under the rear of the tube.
    side_profile(mesh, [(-.039,-.032),(-.017,-.083),(.035,-.101),(.121,-.090),
                        (.163,-.059),(.168,-.039),(.134,-.040),(.104,-.064),(.032,-.070),
                        (-.007,-.046)], .070, POLYMER)
    mesh.box((0,-.093,.069),(.080,.018,.112),RUBBER,.007)
    for z in (.030,.050,.070,.090,.110):
        mesh.box((0,-.103,z),(.066,.004,.007),GRAPHITE,.0015)
    return mesh


def grips():
    mesh = Assembly()
    mesh.box((0,-.034,-.167),(.063,.028,.126),GRAPHITE,.007)
    side_profile(mesh,[(-.193,-.056),(-.155,-.049),(-.128,-.058),(-.104,-.165),
                       (-.113,-.194),(-.157,-.201),(-.171,-.186),(-.176,-.097)],.036,POLYMER)
    for side in (-1,1):
        mesh.box((side*.018,-.132,-.146),(.009,.102,.052),RUBBER,.006)
        for y in (-.092,-.106,-.120,-.134,-.148,-.162,-.176):
            mesh.box((side*.023,y,-.146-(y+.133)*.23),(.004,.005,.036),GRAPHITE,.001)
        mesh.cylinder((side*.024,-.070,-.156),.008,.007,'x',STEEL,16)
        mesh.cylinder((side*.034,-.034,-.198),.010,.007,'x',GRAPHITE,16)
    mesh.box((0,-.190,-.131),(.047,.019,.054),GRAPHITE,.005)
    # Open trigger guard and simplified decorative trigger silhouette.
    side_profile(mesh,[(-.234,-.040),(-.252,-.058),(-.248,-.096),(-.222,-.114),
                       (-.168,-.110),(-.170,-.100),(-.215,-.101),(-.236,-.089),
                       (-.240,-.059),(-.227,-.048)], .025, GRAPHITE)
    side_profile(mesh,[(-.204,-.048),(-.193,-.049),(-.194,-.068),(-.183,-.083),
                       (-.191,-.089),(-.205,-.069)], .011, STEEL)
    mesh.box((.035,-.037,-.164),(.008,.011,.019),RED,.002)
    side_profile(mesh,[(-.426,-.021),(-.402,-.065),(-.321,-.065),(-.302,-.045),
                       (-.305,-.028),(-.330,-.019)], .072, POLYMER)
    for z in (-.410,-.395,-.380,-.365,-.350,-.335,-.320):
        mesh.box((0,-.064,z),(.070,.013,.008),RUBBER,.002)
    for side in (-1,1):
        mesh.box((side*.039,-.046,-.368),(.007,.023,.084),GRAPHITE,.003)
        for z in (-.399,-.336):
            mesh.cylinder((side*.045,-.045,z),.005,.005,'x',STEEL,12)
    return mesh


def fittings():
    mesh = Assembly()
    # The carrying handle is parked off the sight line.
    for z in (-.409,-.190):
        mesh.box((.045,.077,z),(.052,.025,.037),GRAPHITE,.005)
        mesh.cylinder((.071,.080,z),.012,.014,'x',STEEL,16)
    side_profile(mesh,[(-.414,.087),(-.394,.109),(-.359,.124),(-.238,.124),(-.204,.108),
                       (-.184,.086),(-.203,.083),(-.226,.098),(-.249,.107),(-.356,.107),
                       (-.384,.097),(-.399,.081)], .026, POLYMER,.064)
    for z in (-.350,-.333,-.316,-.299,-.282,-.265,-.248):
        mesh.box((.064,.124,z),(.020,.004,.006),RUBBER,.001)
    mesh.box((-.045,.067,-.095),(.036,.049,.151),GRAPHITE,.006)
    for z in (-.159,-.135,-.111,-.087,-.063,-.039):
        mesh.box((-.057,.092,z),(.030,.012,.011),POLYMER,.002)
    for z in (-.301,.103):
        mesh.box((-.057,.007,z),(.024,.035,.035),GRAPHITE,.005)
        mesh.cylinder((-.073,.009,z),.012,.008,'x',STEEL,12)
    return mesh


def sights():
    mesh = Assembly()
    mesh.box((0,.095,-.062),(.058,.032,.089),GRAPHITE,.006)
    mesh.box((0,.115,-.055),(.043,.018,.047),POLYMER,.003)
    sight_ring(mesh,SIGHT_Y,-.045,.0165,.026,.014,GRAPHITE)
    sight_ring(mesh,SIGHT_Y,-.037,.0155,.020,.003,STEEL)
    for side in (-1,1):
        side_profile(mesh,[(-.082,.114),(-.071,.146),(-.053,.169),(-.036,.170),
                           (-.029,.158),(-.053,.145),(-.047,.116)], .008, GRAPHITE,side*.025)
        mesh.cylinder((side*.032,.120,-.055),.010,.013,'x',POLYMER,16)
        mesh.box((side*.040,.120,-.055),(.003,.004,.009),STEEL,.0008)
    mesh.box((0,.095,-.515),(.049,.029,.053),GRAPHITE,.006)
    for side in (-1,1):
        side_profile(mesh,[(-.533,.106),(-.524,.145),(-.507,.155),(-.492,.149),
                           (-.493,.139),(-.507,.141),(-.514,.107)],.007,GRAPHITE,side*.019)
    mesh.box((0,.124,-.512),(.008,.044,.012),GRAPHITE,.001)
    mesh.box((0,.1425,-.505),(.004,.005,.004),FRONT_DOT,.001)
    return mesh


if __name__ == '__main__':
    glb, blend = map(Path, sys.argv[sys.argv.index('--')+1:])
    parts = [('Tube', body()), ('RearHousing', rear()), ('Grips', grips()),
             ('ExternalFittings', fittings()), ('IronSights', sights())]
    finish = {GRAPHITE:1, POLYMER:1, RUBBER:1, STEEL:2, EDGE:2, LINER:2,
              IVORY:1, AMBER:1, RED:1, FRONT_DOT:1}
    mounts = {'SightEye': (0,SIGHT_Y,-.036), 'FrontPost': (0,SIGHT_Y,-.506)}
    export_weapon(parts, glb, blend, mounts=mounts, view_distance=1.75, finish_rows=finish)
