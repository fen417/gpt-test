"""Build the stock AR-416 prop from the silhouette of the HK416 A5."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring, surface_mark


FRAME = (.219, .155, .079)
UPPER = (.258, .185, .100)
EDGE = (.315, .247, .153)
STEEL = (.048, .054, .055)
BOLT = (.145, .153, .157)
FURNITURE = (.146, .111, .063)
POLYMER = (.028, .032, .030)
RECESS = (.012, .015, .014)
MARK = (.394, .355, .276)
SELECTOR = (.373, .043, .022)


def rail(mesh, start, count):
    length = count * .019
    mesh.box((0, .077, start - length / 2 + .010), (.053, .017, length), STEEL, .003)
    for i in range(count):
        mesh.box((0, .089, start - i * .019), (.071, .012, .011), FRAME, .0016)


def receiver():
    mesh = Assembly()
    mesh.box((0, .060, -.088), (.084, .024, .356), UPPER, .005)
    mesh.box((0, -.018, -.091), (.081, .028, .363), FRAME, .004)
    mesh.box((-.028, .023, -.084), (.029, .068, .335), UPPER, .008)
    for z, length in [(.037, .134), (-.215, .108)]:
        mesh.box((.017, .022, z), (.061, .065, length), UPPER, .006)
    mesh.box((.036, .024, -.097), (.006, .056, .122), RECESS, .003)
    mesh.box((.051, -.009, -.094), (.008, .010, .123), EDGE, .002)
    mesh.box((.058, -.029, -.095), (.007, .030, .116), STEEL, .0025)
    mesh.cylinder((.052, .031, .041), .012, .025, 'x', STEEL, 16)
    side_profile(mesh, [( .111, -.027), (.114, -.076), (.035, -.089), (.008, -.075),
                        (-.050, -.071), (-.057, -.102), (-.184, -.110), (-.199, -.043),
                        (-.190, -.030)], .079, FRAME)
    side_profile(mesh, [(-.182, -.090), (-.180, -.108), (-.056, -.110), (-.048, -.097)], .091, STEEL)
    side_profile(mesh, [(.047, -.106), (.038, -.118), (.010, -.127),
                        (-.040, -.127), (-.062, -.106), (-.056, -.093),
                        (-.034, -.116), (.012, -.116), (.043, -.101)], .029, FRAME)
    side_profile(mesh, [(.015, -.072), (.031, -.076), (.021, -.091),
                        (.024, -.108), (.009, -.098), (.007, -.085)], .012, STEEL)
    for side in (-1, 1):
        for z, y in [(.085, -.041), (-.172, -.041), (-.018, -.048)]:
            mesh.cylinder((side * .040, y, z), .006, .004, 'x', EDGE, 12)
        mesh.cylinder((side * .045, -.056, .037), .011, .006, 'x', STEEL, 16)
        mesh.box((side * .048, -.052, .047), (.007, .010, .025), EDGE, .002)
        mesh.box((side * .041, -.067, -.078), (.010, .013, .022), STEEL, .002)
        mesh.box((side*.0402, -.057, .013), (.0014, .002, .010), MARK, 0)
        mesh.box((side*.0402, -.060, .069), (.0014, .002, .009), SELECTOR, 0)
    surface_mark(mesh, 'AR-416', -.0399, -.052, -.164, .0034, MARK)
    surface_mark(mesh, '0241', -.0399, -.077, -.144, .0025, MARK)
    rail(mesh, .073, 18)
    return mesh


def furniture():
    mesh = Assembly()
    side_profile(mesh, [(.045, -.084), (.031, -.126), (.061, -.235), (.117, -.238),
                        (.131, -.222), (.102, -.127), (.100, -.090)], .047, FURNITURE)
    for side in (-1, 1):
        for row in range(8):
            y = -.151 - .010 * row
            mesh.box((side * .023, y, .080 + row * .0025), (.002, .0026, .040), FURNITURE, .0005)
    mesh.cylinder((0, .015, .205), .033, .242, 'z', STEEL, 24)
    side_profile(mesh, [(.213, .043), (.443, .046), (.460, .026), (.443, -.026),
                        (.348, -.034), (.292, -.020), (.219, -.024)], .082, FURNITURE)
    side_profile(mesh, [(.247, -.023), (.273, -.018), (.410, -.137), (.442, -.143),
                        (.437, -.164), (.398, -.164)], .056, FURNITURE)
    side_profile(mesh, [(.459, .038), (.476, .032), (.466, -.145), (.450, -.167),
                        (.427, -.165), (.434, -.122), (.444, .020)], .073, RECESS)
    for step in range(10):
        mesh.box((0, .021 - step * .016, .473 - step * .0009), (.073, .005, .008), STEEL, .001)
    mesh.box((0, -.062, .308), (.045, .015, .060), STEEL, .005)
    for side in (-1, 1):
        mesh.cylinder((side * .041, .008, .389), .012, .005, 'x', STEEL, 18)
    return mesh


def front():
    mesh = Assembly()
    mesh.cylinder((0, .015, -.505), .017, .595, 'z', STEEL, 24)
    mesh.cylinder((0, .041, -.436), .016, .344, 'z', RECESS, 16)
    for y in [-.040, .060]:
        mesh.box((0, y, -.438), (.074, .023, .355), FRAME, .005)
    for side in [-1, 1]:
        for y in [-.023, .043]:
            mesh.box((side * .043, y, -.438), (.014, .014, .349), UPPER, .002)
        for step in range(8):
            z = -.282 - step * .045
            mesh.box((side * .042, .011, z), (.016, .059, .020), FRAME, .004)
            mesh.box((side * .049, -.027, z), (.006, .005, .020), EDGE, .001)
        mesh.cylinder((side * .049, -.004, -.284), .010, .007, 'x', STEEL, 16)
        mesh.box((side * .053, -.004, -.284), (.0015, .002, .010), BOLT, .0002)
    mesh.box((0, -.054, -.441), (.052, .013, .335), STEEL, .003)
    for step in range(16):
        mesh.box((0, -.063, -.289 - step * .020), (.066, .009, .011), FRAME, .0015)
    rail(mesh, -.272, 19)
    mesh.cylinder((0, .015, -.716), .019, .115, 'z', STEEL, 24)
    mesh.cylinder((0, .015, -.825), .021, .063, 'z', STEEL, 24)
    sight_ring(mesh, .015, -.857, .010, .019, .010, STEEL)
    mesh.cylinder((0, .015, -.861), .010, .001, 'z', RECESS, 20)
    for side in [-1, 1]:
        mesh.box((side * .019, .018, -.825), (.005, .009, .033), RECESS, .0008)
    return mesh


def sights():
    mesh = Assembly()
    mesh.box((0, .099, .037), (.061, .016, .036), STEEL, .002)
    sight_ring(mesh, .132, .037, .010, .017, .013, STEEL)
    mesh.box((0, .107, .037), (.019, .022, .014), FRAME, .002)
    mesh.cylinder((.028, .110, .037), .010, .016, 'x', FRAME, 18)
    mesh.box((0, .099, -.597), (.058, .014, .039), STEEL, .003)
    for side in [-1, 1]:
        mesh.box((side * .019, .127, -.597), (.007, .050, .015), STEEL, .002)
        mesh.box((side * .016, .151, -.597), (.009, .006, .015), STEEL, .001)
    mesh.box((0, .117, -.597), (.004, .030, .008), EDGE, .0006)
    return mesh


def magazine():
    mesh = Assembly()
    rows = [(-.072, -.060, -.178), (-.136, -.057, -.181), (-.225, -.070, -.193),
            (-.279, -.084, -.211), (-.292, -.089, -.215)]
    rings = []
    for y, rear, fore in rows:
        mid = (rear + fore) / 2
        rings.append([(.037 * math.cos(a), y + .006 * math.sin(a), mid + (rear - fore) / 2 * math.sin(a))
                      for a in [math.tau * i / 16 for i in range(16)]])
    mesh.rings(rings, POLYMER)
    side_profile(mesh, [(-.084, -.277), (-.213, -.288), (-.223, -.301), (-.090, -.296)], .080, STEEL)
    for side in [-1, 1]:
        for z in [-.100, -.122, -.151]:
            side_profile(mesh, [(z, -.151), (z-.010, -.151), (z-.030, -.275),
                                (z-.021, -.275)], .005, STEEL, side * .030)
        mesh.box((side * .035, -.202, -.140), (.008, .069, .019), RECESS, .003)
        for i in range(3):
            mesh.box((side * .039, -.187 - .014 * i, -.140), (.002, .005, .013), BOLT, .001)
    return mesh


def main():
    glb, blend = map(Path, sys.argv[sys.argv.index('--') + 1:])
    bolt = Assembly()
    bolt.box((.026, .023, -.089), (.034, .042, .108), BOLT, .005)
    bolt.box((.043, .022, -.057), (.006, .016, .039), STEEL, .003)
    bolt.box((0, .072, .113), (.095, .017, .024), STEEL, .004)
    for side in [-1, 1]:
        bolt.box((side * .046, .069, .101), (.016, .015, .031), FRAME, .003)
    parts = [('Receiver', receiver()), ('Handguard', front()), ('Furniture', furniture()),
             ('Sights', sights()), ('Magazine', magazine()), ('Bolt', bolt)]
    export_weapon(parts, glb, blend, finish_rows={FURNITURE:1, POLYMER:1, RECESS:1, MARK:1, SELECTOR:1, BOLT:2})


if __name__ == '__main__':
    main()
