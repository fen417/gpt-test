"""Build stock MCX-9 and VK-45 game props with separate animated parts."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring, surface_mark


ANODIZED = (.092, .121, .122)
EDGE = (.140, .171, .174)
STEEL = (.058, .073, .081)
POLYMER = (.038, .043, .047)
VECTOR_CASE = (.076, .074, .070)
GRIP = (.028, .031, .030)
PAD = (.017, .019, .019)
RECESS = (.012, .015, .019)
INSCRIPTION = (.32, .36, .35)
RED = (.40, .058, .043)


def top_rail(mesh, start, count, height, finish):
    length = count * .018
    mesh.box((0, height-.009, start-length/2+.009), (.053,.012,length), finish, .002)
    for index in range(count):
        mesh.box((0, height, start-index*.018), (.066,.010,.010), finish, .0013)


def grip(mesh, back, top):
    side_profile(mesh, [(back-.052,top), (back+.012,top), (back+.027,top-.037),
                        (back+.055,top-.158), (back-.005,top-.177), (back-.024,top-.154),
                        (back-.042,top-.062)], .058, GRIP)
    for side in (-1,1):
        for i in range(12):
            y = top-.058-i*.008
            z = back-.003+i*.003
            mesh.box((side*.0285,y,z),(.003,.0022,.041),POLYMER,.0005)


def stock(vector):
    mesh = Assembly()
    if vector:
        mesh.box((0,.045,.206),(.054,.048,.120),STEEL,.008)
        side_profile(mesh, [(.199,.074),(.377,.073),(.420,.046),(.419,-.066),(.386,-.071),
                            (.387,-.003),(.357,.019),(.205,.021)], .063, VECTOR_CASE)
        for side in (-1,1):
            mesh.box((side*.031,.046,.298),(.003,.009,.147),RECESS,.001)
            mesh.cylinder((side*.031,.045,.380),.009,.006,'x',STEEL,16)
        z, pad_width = .417, .065
    else:
        mesh.box((0,.054,.199),(.041,.037,.112),STEEL,.005)
        side_profile(mesh, [(.210,.077),(.374,.077),(.393,.056),(.384,.024),(.277,.022),
                            (.234,.033),(.213,.035)], .062, POLYMER)
        side_profile(mesh, [(.242,.033),(.272,.031),(.377,-.054),(.382,-.075),(.358,-.081),
                            (.330,-.054)], .041, POLYMER)
        side_profile(mesh, [(.374,.074),(.399,.056),(.405,-.068),(.389,-.086),(.355,-.083),
                            (.366,-.048)], .059, GRIP)
        for side in (-1,1):
            mesh.box((side*.030,.052,.299),(.004,.006,.080),RECESS,.001)
            mesh.cylinder((side*.031,.043,.369),.010,.005,'x',STEEL,16)
        z, pad_width = .402, .063
    mesh.box((0,-.010,z),(pad_width,.130,.016),PAD,.005)
    for i in range(9):
        mesh.box((0,.042-i*.013,z+.007),(pad_width,.003,.004),GRIP,.001)
    return mesh


def sights(front, rear, base, sightline):
    mesh = Assembly()
    for z in (front,rear):
        mesh.box((0,base,z),(.056,.012,.039),STEEL,.002)
        mesh.cylinder((0,base+.007,z),.009,.052,'x',EDGE,16)
        for side in (-1,1):
            mesh.box((side*.016,(base+sightline)/2,z),
                     (.007,sightline-base+.017,.013),POLYMER,.002)
    sight_ring(mesh,sightline,rear,.009,.016,.010,STEEL)
    mesh.box((0,sightline-.013,front),(.004,.026,.010),EDGE,.0005)
    return mesh


def muzzle(y, nose):
    piece = Assembly()
    piece.tube((0,y,0),[(nose,.016),(nose+.004,.021),(nose+.028,.021),
                        (nose+.036,.017),(nose+.060,.017)], 'z', STEEL, 20)
    sight_ring(piece,y,nose-.001,.009,.016,.004,EDGE)
    piece.cylinder((0,y,nose-.002),.009,.001,'z',RECESS,16)
    for side in (-1,1):
        piece.box((side*.019,y,nose+.016),(.005,.007,.018),RECESS,.001)
    return piece


def magazine(rows, vector):
    mesh = Assembly()
    rings = []
    for y, center, half_depth, half_width in rows:
        z0,z1 = center-half_depth,center+half_depth
        bevel = .006
        rings.append([(x,y,z) for x,z in (
            (-half_width+bevel,z0),(half_width-bevel,z0),(half_width,z0+bevel),(half_width,z1-bevel),
            (half_width-bevel,z1),(-half_width+bevel,z1),(-half_width,z1-bevel),(-half_width,z0+bevel))])
    mesh.rings(rings,POLYMER if vector else VECTOR_CASE)
    y,z,depth,width = rows[-1]
    mesh.box((0,y-.006,z),(2*width+.007,.015,2*depth+.007),GRIP,.0025)
    for y,z,depth,width in rows[1:-1]:
        for side in (-1,1):
            mesh.box((side*width,y,z),(.002,.004,2*depth-.014),STEEL,.0005)
            if not vector:
                mesh.box((side*width,y-.009,z+.010),(.0018,.010,.016),RECESS,.001)
    return mesh


def vector_model():
    upper, lower, guard, barrel, bolt = [Assembly() for _ in range(5)]
    side_profile(upper, [(-.435,.057),(.147,.057),(.157,.032),(.146,-.007),(.104,-.018),
                        (-.420,-.023),(-.435,-.013)], .092, VECTOR_CASE)
    top_rail(upper,.132,32,.064,STEEL)
    side_profile(lower,[(-.310,-.010),(-.091,-.012),(-.064,-.038),(-.020,-.162),
                        (.021,-.215),(-.202,-.226),(-.230,-.203),(-.250,-.163),(-.305,-.054)],
                 .103,POLYMER)
    side_profile(lower,[(-.255,-.029),(-.096,-.031),(-.044,-.163),(-.019,-.187),
                        (-.195,-.191)], .004,VECTOR_CASE,-.052)
    side_profile(lower,[(-.255,-.029),(-.096,-.031),(-.044,-.163),(-.019,-.187),
                        (-.195,-.191)], .004,VECTOR_CASE,.052)
    grip(lower,.071,-.011)
    side_profile(lower,[(-.012,-.064),(.091,-.064),(.098,-.054),(.092,-.046),
                        (.061,-.051),(-.003,-.052)], .035,GRIP)
    side_profile(lower,[(.017,-.017),(.028,-.016),(.035,-.036),(.030,-.057),(.019,-.057)], .012,STEEL)
    side_profile(lower,[(-.008,-.201),(.099,-.167),(.113,-.163),(.115,-.176),
                        (.003,-.219),(-.034,-.221)], .042,POLYMER)
    for side in (-1,1):
        for y,z in ((.025,.088),(.021,-.070),(.024,-.185),(.023,-.325),(-.106,-.143),(-.186,-.083),(-.197,-.172)):
            radius=.010 if y>0 else .009
            x=(.046 if y>0 else .052)*side
            lower.cylinder((x,y,z),radius,.006,'x',STEEL,16)
            lower.box((x+side*.0035,y,z),(.001,.002,.009),RECESS,0)
        for z in (.045,-.102):
            upper.cylinder((side*.048,.021,z),.009,.009,'x',STEEL,16)
            upper.box((side*.054,.017,z+.012),(.005,.010,.027),EDGE,.002)
            upper.box((side*.047,.006,z-.007),(.0016,.0025,.010),RED,0)
        lower.box((side*.053,-.058,-.234),(.004,.031,.052),STEEL,.002)
        side_profile(lower,[(-.222,-.065),(-.210,-.067),(-.168,-.152),(-.171,-.165),
                            (-.185,-.163),(-.232,-.081)],.003,RECESS,side*.055)
        side_profile(lower,[(-.119,-.118),(-.109,-.121),(-.091,-.166),(-.094,-.179),
                            (-.104,-.176),(-.124,-.133)],.003,STEEL,side*.055)
        for i in range(3):
            upper.box((side*.047,-.007,-.124+i*.011),(.0016,.0018,.007),INSCRIPTION,0)
    upper.box((.046,.000,-.208),(.006,.024,.106),RECESS,.003)
    bolt.box((.048,.001,-.200),(.009,.016,.073),STEEL,.002)
    bolt.box((-.057,-.010,-.298),(.023,.016,.030),EDGE,.003)
    guard.box((0,-.030,-.410),(.077,.055,.199),STEEL,.006)
    for side in (-1,1):
        guard.box((side*.041,-.028,-.417),(.013,.037,.176),VECTOR_CASE,.003)
        for z in (-.477,-.421,-.365):
            guard.box((side*.048,-.028,z),(.003,.010,.028),RECESS,.002)
    guard.box((0,-.064,-.418),(.046,.015,.171),STEEL,.002)
    barrel.cylinder((0,.001,-.466),.016,.167,'z',STEEL,20)
    surface_mark(upper,'VK-45',-.0467,.027,-.394,.004,INSCRIPTION)
    rows=[(-.073,-.235,.024,.021),(-.149,-.217,.025,.022),(-.222,-.194,.025,.022),
          (-.257,-.185,.025,.022),(-.295,-.176,.024,.021),(-.318,-.170,.024,.021)]
    parts=[('Upper',upper),('Lower',lower),('Handguard',guard),('Barrel',barrel),('Stock',stock(True)),
           ('IronSights',sights(-.399,.100,.075,.127)),('MuzzleDevice',muzzle(.001,-.551)),
           ('Magazine',magazine(rows,True)),('Bolt',bolt)]
    return parts, mounts(.001,-.552,.071,-.418,-.072,.149)


def mpx_model():
    upper, lower, guard, barrel, bolt = [Assembly() for _ in range(5)]
    side_profile(upper,[(-.274,.077),(.140,.077),(.149,.048),(.142,-.013),
                       (.109,-.031),(-.270,-.021)], .090,ANODIZED)
    for side in (-1,1):
        upper.box((side*.044,.038,-.083),(.005,.028,.288),STEEL,.003)
        upper.box((side*.047,.030,-.083),(.004,.006,.247),EDGE,.001)
    upper.box((.049,.039,-.142),(.006,.025,.118),RECESS,.002)
    bolt.box((.052,.039,-.141),(.007,.015,.088),EDGE,.002)
    bolt.box((0,.076,.139),(.111,.015,.023),STEEL,.004)
    top_rail(upper,.128,23,.086,STEEL)
    side_profile(lower,[(.136,-.016),(.119,-.058),(.065,-.079),(.018,-.069),
                        (-.058,-.072),(-.067,-.119),(-.185,-.122),(-.213,-.077),
                        (-.206,-.033),(-.185,-.019)], .080,ANODIZED)
    side_profile(lower,[(-.188,-.104),(-.183,-.126),(-.071,-.128),(-.060,-.107)], .093,STEEL)
    grip(lower,.085,-.058)
    side_profile(lower,[(.058,-.078),(.067,-.089),(.042,-.116),(-.008,-.121),(-.052,-.111),
                        (-.069,-.084),(-.059,-.074),(-.043,-.101),(-.010,-.110),
                        (.033,-.105),(.051,-.083)], .033,STEEL)
    side_profile(lower,[(.021,-.071),(.031,-.072),(.022,-.096),(.010,-.107),
                        (.004,-.102),(.017,-.086)], .013,EDGE)
    for side in (-1,1):
        for y,z in ((-.034,.093),(-.041,-.028),(-.047,-.172)):
            lower.cylinder((side*.040,y,z),.006,.004,'x',EDGE,14)
        lower.cylinder((side*.046,-.048,.023),.011,.008,'x',STEEL,16)
        lower.box((side*.050,-.052,.039),(.007,.006,.024),EDGE,.001)
        lower.box((side*.041,-.061,-.096),(.008,.010,.046),STEEL,.002)
    surface_mark(lower,'MCX-9',-.0407,-.066,-.170,.0045,INSCRIPTION)
    barrel.cylinder((0,.016,-.444),.017,.308,'z',STEEL,20)
    guard.box((0,.058,-.427),(.077,.030,.302),ANODIZED,.006)
    guard.box((0,-.043,-.429),(.069,.023,.295),ANODIZED,.006)
    for side in (-1,1):
        guard.box((side*.041,.034,-.427),(.014,.034,.293),ANODIZED,.004)
        guard.box((side*.041,-.017,-.427),(.014,.020,.293),ANODIZED,.003)
        for z in (-.565,-.515,-.449,-.385,-.322,-.284):
            guard.box((side*.042,.008,z),(.016,.030,.020),ANODIZED,.003)
        for z in (-.531,-.472,-.413,-.354):
            side_profile(guard,[(z-.017,-.020),(z+.017,-.020),(z+.007,-.040),(z-.027,-.040)],
                         .010,STEEL,side*.037)
        guard.box((side*.049,.025,-.425),(.002,.004,.274),EDGE,.0004)
        guard.cylinder((side*.049,.007,-.286),.008,.004,'x',STEEL,16)
    top_rail(guard,-.286,16,.086,STEEL)
    rows=[(-.075,-.127,.037,.027),(-.140,-.140,.035,.027),(-.177,-.151,.034,.026),
          (-.214,-.165,.033,.026),(-.252,-.182,.033,.025),(-.288,-.200,.032,.025),
          (-.315,-.216,.032,.024)]
    parts=[('Upper',upper),('Lower',lower),('Handguard',guard),('Barrel',barrel),('Stock',stock(False)),
           ('IronSights',sights(-.542,.091,.097,.142)),('MuzzleDevice',muzzle(.016,-.630)),
           ('Magazine',magazine(rows,False)),('Bolt',bolt)]
    return parts, mounts(.016,-.631,.093,-.440,-.054,.149)


def mounts(bore, nose, rail, accessory_z, foregrip_y, stock_z):
    return {
        'Mount_Optic': (0,rail,-.083), 'Mount_Muzzle': (0,bore,nose+.036),
        'Muzzle_Exit': (0,bore,nose),
        'Mount_Foregrip': (0,foregrip_y,accessory_z), 'Mount_Left': (-.050,.015,accessory_z),
        'Mount_Right': (.050,.015,accessory_z), 'Mount_Stock': (0,.045,stock_z),
    }


if __name__ == '__main__':
    name, glb, blend = sys.argv[sys.argv.index('--')+1:]
    parts, anchors = {'mcx9': mpx_model, 'vk45': vector_model}[name]()
    finishes = {POLYMER:1,VECTOR_CASE:1,GRIP:1,PAD:1,RECESS:1,
                INSCRIPTION:1,RED:1,STEEL:2}
    export_weapon(parts,Path(glb),Path(blend),mounts=anchors,view_distance=1.65,finish_rows=finishes)
