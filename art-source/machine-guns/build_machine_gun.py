"""Build the stock MG-36 and PKP game meshes and Blender sources."""
import sys
from pathlib import Path

from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring, surface_mark


BLACK = (.033,.039,.043)
POLYMER = (.055,.064,.063)
PAD = (.020,.022,.021)
STEEL = (.050,.059,.070)
EDGE = (.127,.144,.157)
VOID = (.010,.014,.017)
OLIVE = (.120,.147,.064)
OLIVE_RIB = (.149,.166,.083)
WEBBING = (.209,.167,.086)
MOULDED_STOCK = (.081,.057,.042)
BRASS = (.38,.251,.097)
COPPER = (.30,.133,.070)
MARK = (.39,.42,.39)
RED = (.38,.047,.033)
GLASS = (.043,.091,.096)


def beam(mesh, start, end, width, depth, color):
    a,b = Vector(start),Vector(end)
    direction = (b-a).normalized()
    side = direction.cross(Vector((1,0,0))).normalized() * (depth/2)
    across = side.cross(direction).normalized() * (width/2)
    mesh.rings([[tuple(point + sx*across + sy*side)
                 for sx,sy in ((-1,-1),(1,-1),(1,1),(-1,1))] for point in (a,b)],color)


def pin(mesh, x, y, z, radius=.007):
    mesh.cylinder((x,y,z),radius,.005,'x',EDGE,16)
    mesh.box((x+(.003 if x>0 else -.003),y,z),(.001,.0018,radius),VOID,0)


def bipod(z, y, back, width):
    hinge, left, right = Assembly(), Assembly(), Assembly()
    hinge.cylinder((0,y,z),.019,2*width+.009,'x',STEEL,20)
    for side,leg in ((-1,left),(1,right)):
        x = side*width
        pin(hinge,x,y,z,.011)
        beam(leg,(x,y-.008,z),(x*1.16,y-.032,z+.084),.028,.022,STEEL)
        beam(leg,(x*1.16,y-.032,z+.071),(x*1.18,y-.045,back),.021,.020,STEEL)
        beam(leg,(x*1.18,y-.039,back-.012),(x*1.18,y-.047,back+.008),.029,.016,EDGE)
        for s in (.18,.32,.46,.60):
            leg.box((x*1.14,y-.032,z+(back-z)*s),(.019,.014,.005),EDGE,.001)
    return hinge,left,right


def muzzle(y, end, wide=False):
    mesh=Assembly()
    radius=.025 if wide else .021
    mesh.tube((0,y,0),[(end,radius-.002),(end+.006,radius),(end+.050,radius),
                      (end+.066,radius-.004),(end+.079,radius-.004)],'z',STEEL,24)
    sight_ring(mesh,y,end-.001,.013 if wide else .010,radius-.002,.005,EDGE)
    mesh.cylinder((0,y,end-.001),.010,.001,'z',VOID,20)
    for side in (-1,1):
        for z in (end+.022,end+.041):
            mesh.box((side*(radius-.001),y,z),(.006,.009,.012),VOID,.0012)
    return mesh


def skeleton_stock(pkp):
    mesh=Assembly()
    finish=MOULDED_STOCK if pkp else POLYMER
    start, rear = (.141,.496) if pkp else (.132,.475)
    side_profile(mesh,[(start,.038),(start+.093,.042),(rear-.018,.025),(rear-.018,-.011),
                       (start+.124,-.005),(start+.018,-.022),(start,-.012)],.072,finish)
    if pkp:
        bridge=[(.152,-.006),(.185,-.026),(.233,-.071),(.415,-.082),(.446,-.060),(.471,-.059),
                (.472,-.114),(.438,-.123),(.226,-.111),(.181,-.068),(.151,-.027)]
    else:
        bridge=[(.162,-.008),(.222,-.009),(.430,-.094),(.460,-.108),
                (.458,-.143),(.405,-.127),(.153,-.031)]
    side_profile(mesh,bridge,.056,finish)
    side_profile(mesh,[(rear-.047,.024),(rear,.024),(rear+.003,-.131),(rear-.011,-.152),
                        (rear-.049,-.132),(rear-.038,-.063)],.061, PAD if not pkp else BLACK)
    for index in range(10):
        mesh.box((0,.009-.014*index,rear+.002-index*.0008),(.060,.004,.006),POLYMER,.0006)
    if not pkp:
        mesh.box((0,.006,.255),(.046,.039,.019),POLYMER,.002)
        pin(mesh,.037,.010,.158,.013)
    else:
        mesh.box((0,.028,.471),(.035,.018,.019),STEEL,.002)
    return mesh


def controls(mesh, pkp):
    handle=MOULDED_STOCK if pkp else POLYMER
    side_profile(mesh,[(.046,-.063),(.111,-.070),(.119,-.116),(.153,-.224),(.143,-.246),
                       (.082,-.240),(.050,-.193),(.029,-.107)],.055,handle)
    side_profile(mesh,[(-.015,-.074),(-.042,-.093),(-.047,-.117),(-.026,-.133),(.034,-.135),
                       (.063,-.114),(.054,-.100),(.026,-.124),(-.019,-.122),(-.035,-.113),
                       (-.032,-.101),(-.010,-.087)], .030,STEEL if pkp else BLACK)
    side_profile(mesh,[(.024,-.075),(.038,-.075),(.033,-.094),(.018,-.116),
                       (.010,-.112),(.020,-.093)], .012,EDGE)
    for side in (-1,1):
        for index in range(10):
            mesh.box((side*.027,-.129-index*.009,.079+index*.003),(.0025,.0025,.034),BLACK,.0004)
        pin(mesh,side*.045,-.051,.058,.010)
        mesh.box((side*.050,-.048,.071),(.006,.009,.026),STEEL,.0014)
        mesh.box((side*.046,-.061,.038),(.0014,.0025,.009),RED,.0002)


def double_drum():
    mesh=Assembly()
    mesh.box((0,-.115,-.144),(.063,.087,.095),BLACK,.006)
    mesh.box((0,-.164,-.145),(.176,.046,.122),POLYMER,.007)
    for side in (-1,1):
        x=side*.077
        mesh.tube((x,-.200,0),[(-.231,.055),(-.224,.068),(-.067,.068),(-.054,.057)],
                  'z',BLACK,32)
        for z in (-.218,-.067):
            mesh.cylinder((x,-.200,z),.058,.012,'z',POLYMER,28)
            mesh.cylinder((x,-.200,z+(.007 if z>-.1 else -.007)),.026,.011,'z',STEEL,22)
        for index in range(8):
            mesh.box((x+side*.064,-.200,-.210+index*.018),(.006,.024,.007),POLYMER,.0013)
        for dx in (-.035,.035):
            mesh.cylinder((x+dx,-.191,-.057),.004,.006,'z',EDGE,12)
    return mesh


def mg_receiver():
    mesh=Assembly()
    side_profile(mesh,[(-.288,.061),(.138,.059),(.151,.026),(.147,-.023),(.122,-.048),
                       (.049,-.061),(-.048,-.059),(-.069,-.097),(-.199,-.098),(-.258,-.047),
                       (-.293,-.021)], .094,POLYMER)
    for side in (-1,1):
        mesh.box((side*.047,.044,-.058),(.006,.009,.333),STEEL,.001)
        mesh.box((side*.048,-.026,-.136),(.003,.013,.156),BLACK,.002)
        for y,z in ((.025,.096),(-.019,.100),(-.028,-.201),(.023,-.256)):
            pin(mesh,side*.047,y,z)
    mesh.box((.050,.027,-.139),(.007,.027,.149),VOID,.003)
    mesh.box((.055,.032,-.076),(.011,.023,.024),STEEL,.003)
    mesh.box((0,-.068,-.139),(.098,.026,.133),BLACK,.004)
    controls(mesh,False)
    surface_mark(mesh,'MG-36',-.0478,.017,-.157,.0038,MARK)
    return mesh


def mg_front():
    mesh=Assembly()
    for y,h in ((.042,.040),(-.027,.032)):
        mesh.box((0,y,-.488),(.079,h,.396),POLYMER,.007)
    for side in (-1,1):
        for y in (-.019,.036):
            mesh.box((side*.045,y,-.490),(.012,.021,.383),POLYMER,.003)
        for i in range(7):
            mesh.box((side*.047,.007,-.314-i*.057),(.012,.038,.028),POLYMER,.003)
        pin(mesh,side*.052,-.015,-.655)
    return mesh


def mg_carry_sight():
    bridge=Assembly()
    side_profile(bridge,[(-.342,.052),(-.265,.137),(-.027,.137),(.010,.120),
                         (.133,.120),(.148,.101),(.134,.067),(.006,.066),
                         (-.027,.120),(-.260,.120),(-.319,.054)],.048,POLYMER)
    bridge.box((0,.102,.072),(.073,.062,.132),BLACK,.009)
    for z in (.022,.106):
        bridge.box((0,.066,z),(.055,.023,.026),BLACK,.002)
    for z in (.143,.005):
        sight_ring(bridge,.104,z,.015,.023,.010,STEEL)
        bridge.cylinder((0,.104,z),.015,.004,'z',GLASS,20)
    bridge.cylinder((.038,.105,.064),.012,.009,'x',EDGE,18)
    # The raised emergency irons provide the game sight line.
    bridge.box((0,.148,.082),(.047,.016,.035),STEEL,.002)
    sight_ring(bridge,.172,.086,.009,.016,.010,BLACK)
    bridge.box((0,.147,-.248),(.040,.017,.029),STEEL,.002)
    bridge.box((0,.158,-.248),(.004,.028,.010),EDGE,.001)
    return bridge


def pkp_receiver():
    mesh=Assembly()
    side_profile(mesh,[(-.296,.054),(.126,.054),(.140,.023),(.128,-.042),(.088,-.065),
                       (-.227,-.064),(-.291,-.033)],.106,STEEL)
    for side in (-1,1):
        mesh.box((side*.053,-.012,-.085),(.006,.013,.310),BLACK,.002)
        mesh.box((side*.052,.041,-.092),(.003,.006,.310),EDGE,.001)
        for y,z in ((-.039,.092),(-.040,-.110),(.011,-.255),(-.036,-.222),(.025,.099)):
            pin(mesh,side*.055,y,z,.007)
    mesh.box((.054,.017,-.100),(.008,.029,.172),VOID,.004)
    mesh.box((.057,-.002,-.101),(.010,.006,.159),EDGE,.002)
    mesh.box((-.055,.027,-.187),(.012,.037,.129),BLACK,.003)
    controls(mesh,True)
    surface_mark(mesh,'6P41',-.0537,.019,.008,.0045,MARK)
    return mesh


def pkp_cover():
    mesh=Assembly()
    side_profile(mesh,[(-.266,.052),(-.248,.094),(-.203,.101),(.093,.103),
                        (.136,.087),(.140,.054)],.115,BLACK)
    for side in (-1,1):
        for i in range(7):
            mesh.box((side*.056,.072,-.219+i*.047),(.005,.012,.027),STEEL,.002)
    mesh.box((0,.091,.113),(.123,.019,.028),STEEL,.004)
    cover, mesh = mesh, Assembly()
    mesh.box((0,.102,-.226),(.061,.013,.074),STEEL,.002)
    mesh.box((0,.118,-.218),(.028,.027,.020),BLACK,.003)
    mesh.box((0,.133,-.213),(.035,.012,.029),BLACK,.002)
    for side in (-1,1):
        mesh.box((side*.013,.144,-.218),(.010,.013,.018),STEEL,.001)
    return cover, mesh


def pkp_box():
    mesh=Assembly()
    mesh.box((0,-.184,-.148),(.163,.187,.202),OLIVE,.019)
    mesh.box((0,-.095,-.150),(.174,.021,.212),OLIVE_RIB,.005)
    mesh.box((0,-.267,-.149),(.155,.019,.189),OLIVE_RIB,.005)
    for side in (-1,1):
        for y in (-.137,-.178,-.218):
            mesh.box((side*.081,y,-.152),(.005,.014,.163),OLIVE_RIB,.003)
        mesh.box((side*.086,-.103,-.219),(.008,.022,.025),STEEL,.003)
    for z in (-.247,-.053):
        mesh.box((0,-.17,z),(.119,.092,.009),OLIVE_RIB,.003)
    points=[(.055,-.115,-.055),(.069,-.124,-.030),(.077,-.163,-.020),
            (.075,-.219,-.024),(.060,-.239,-.050)]
    for a,b in zip(points,points[1:]):
        beam(mesh,a,b,.024,.007,WEBBING)
    belt=[]
    for i in range(4):
        x=.104-i*.015
        y=-.085+i*.032
        belt.append((x,y,-.155))
        mesh.cylinder((x,y,-.158),.007,.060,'z',BRASS,12)
        mesh.tube((x,y,0),[(-.206,.002),(-.194,.006),(-.182,.006)],'z',COPPER,12)
        mesh.box((x,y,-.155),(.018,.016,.015),STEEL,.002)
    for a,b in zip(belt,belt[1:]):
        beam(mesh,a,b,.010,.009,BLACK)
    return mesh


def pkp_barrel_and_handle():
    barrel,handle,sight=Assembly(),Assembly(),Assembly()
    barrel.tube((0,.016,0),[(-1.020,.024),(-.952,.027),(-.910,.033),(-.562,.033),
                           (-.529,.041),(-.324,.039),(-.265,.032)],'z',STEEL,32)
    barrel.cylinder((0,-.033,-.489),.020,.342,'z',BLACK,20)
    for z in [-.361,-.381,-.402,-.425,-.448]:
        for side in (-1,1):
            barrel.box((side*.037,.014,z),(.008,.012,.011),VOID,.001)
    for z in [-.629,-.915]:
        barrel.cylinder((0,.016,z),.037,.020,'z',BLACK,24)
    side_profile(handle,[(-.643,.033),(-.573,.114),(-.372,.129),(-.341,.111),
                         (-.353,.052),(-.377,.048),(-.381,.095),(-.552,.092),(-.608,.040)],
                 .043,BLACK)
    for i in range(8):
        z=-.557+i*.023
        handle.box((0,.111,z),(.040,.008,.008),STEEL,.001)
    side_profile(sight,[(-.949,.035),(-.920,.037),(-.922,.108),(-.934,.142),(-.947,.130)],
                 .037,BLACK)
    for side in (-1,1):
        sight.box((side*.013,.140,-.932),(.008,.027,.017),STEEL,.002)
    sight.box((0,.138,-.932),(.004,.024,.010),EDGE,.001)
    return barrel,handle,sight


def mounts(bore, muzzle_z, optic, bottom_y, bipod_z, barrel_z, magazine):
    return {
        'Mount_Optic':optic,'Mount_Muzzle':(0,bore,muzzle_z+.064),
        'Mount_Barrel':(0,bore,barrel_z),'Mount_Magazine':magazine,
        'Muzzle_Exit':(0,bore,muzzle_z),'Mount_Stock':(0,.017,.145),
        'Mount_Bipod':(0,bottom_y,bipod_z),
    }


def build_mg36():
    barrel,bolt=Assembly(),Assembly()
    barrel.cylinder((0,.016,-.595),.024,.597,'z',STEEL,24)
    barrel.cylinder((0,.016,-.749),.027,.066,'z',BLACK,24)
    bolt.box((.050,.029,-.136),(.014,.019,.110),EDGE,.003)
    bolt.box((0,.067,-.101),(.073,.012,.032),STEEL,.003)
    z,y,w=-.677,-.042,.047
    hinge,left,right=bipod(z,y,-.403,w)
    parts=[('Receiver',mg_receiver()),('Barrel',barrel),('Handguard',mg_front()),
           ('CarrySight',mg_carry_sight()),('Stock',skeleton_stock(False)),
           ('MuzzleDevice',muzzle(.016,-.949)),('BipodMount',hinge),('BipodLeft',left),
           ('BipodRight',right),('Magazine',double_drum()),('Bolt',bolt)]
    anchors=mounts(.016,-.950,(0,.060,-.094),y,z,-.296,(0,-.125,-.144))
    anchors['Mount_Foregrip']=(0,-.044,-.468)
    anchors['Charge_Grip']=(-.042,.083,-.100)
    return parts,{'Magazine':(0,-.125,-.144),'BipodLeft':(-w,y,z),'BipodRight':(w,y,z)},anchors


def build_pkp():
    barrel,handle,sight=pkp_barrel_and_handle()
    cover,rear_sight=pkp_cover()
    bolt=Assembly()
    bolt.box((.052,.018,-.096),(.023,.018,.107),EDGE,.003)
    bolt.box((.069,.018,-.049),(.039,.013,.027),STEEL,.003)
    z,y,w=-.921,-.014,.047
    hinge,left,right=bipod(z,y,-.459,w)
    parts=[('Receiver',pkp_receiver()),('Barrel',barrel),('CarryHandle',handle),
           ('FrontSight',sight),('FeedCover',cover),('RearSight',rear_sight),('Stock',skeleton_stock(True)),
           ('MuzzleDevice',muzzle(.016,-1.079,True)),('BipodMount',hinge),('BipodLeft',left),
           ('BipodRight',right),('Magazine',pkp_box()),('Bolt',bolt)]
    anchors=mounts(.016,-1.080,(0,.102,-.104),y,z,-.265,(0,-.100,-.148))
    anchors['Charge_Grip']=(.091,.022,-.050)
    return parts,{'Magazine':(0,-.100,-.148),'FeedCover':(0,.055,-.255),
                  'BipodLeft':(-w,y,z),'BipodRight':(w,y,z)},anchors


if __name__ == '__main__':
    name,glb,blend=sys.argv[sys.argv.index('--')+1:]
    parts,pivots,anchors={'mg36':build_mg36,'pkp':build_pkp}[name]()
    finishes={POLYMER:1,PAD:1,MOULDED_STOCK:1,WEBBING:1,VOID:1,MARK:1,RED:1,
              EDGE:2,BRASS:2,COPPER:2}
    export_weapon(parts,Path(glb),Path(blend),pivots=pivots,mounts=anchors,
                  parents={'RearSight':'FeedCover', 'Mount_Optic':'FeedCover'} if name == 'pkp' else None,
                  modular=True,view_distance=2.3,finish_rows=finishes)
