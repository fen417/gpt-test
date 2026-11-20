"""Build the stylized AK-12M game prop and its editable Blender scene."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring


FRAME = (.116, .123, .135)
COVER = (.065, .074, .088)
POLYMER = (.043, .047, .052)
MOLDING = (.071, .076, .081)
STEEL = (.142, .150, .164)
RUBBER = (.023, .025, .029)
RECESS = (.012, .014, .017)


def receiver():
    body = Assembly()
    side_profile(body, [(.135, -.076), (-.280, -.075), (-.291, .031), (.081, .033), (.135, .003)], .094, FRAME)
    body.box((0, .040, -.081), (.095, .046, .384), COVER, .012)
    body.box((0, .062, -.095), (.062, .015, .372), COVER, .002)
    body.box((0, -.065, -.224), (.102, .024, .108), STEEL, .004)
    for side in (-1, 1):
        for y, z in ((-.057, .102), (.006, .098), (-.054, -.242), (.006, -.249), (-.047, -.183), (-.047, .014)):
            body.cylinder((side * .047, y, z), .008, .005, 'x', COVER, 14)
        body.box((side * .047, -.043, -.171), (.006, .022, .058), COVER, .004)
        body.box((side * .050, -.042, -.171), (.001, .009, .035), RECESS, .002)
    body.box((.047, .024, -.165), (.007, .024, .192), RECESS, .003)
    side_profile(body, [(.058, -.025), (.015, -.047), (-.152, -.018), (-.179, .011),
                        (-.142, .012), (-.055, .000), (.047, -.009)], .011, STEEL, .050)
    body.cylinder((.055, -.026, .043), .015, .008, 'x', COVER, 18)
    body.cylinder((.059, -.026, .043), .007, .004, 'x', FRAME, 14)
    return body


def furniture():
    mesh = Assembly()
    side_profile(mesh, [(.061, -.070), (-.037, -.070), (-.031, -.125), (.008, -.142),
                        (.043, -.195), (.060, -.229), (.133, -.215), (.089, -.123)], .061, POLYMER)
    for side in (-1, 1):
        for step in range(10):
            mesh.box((side * .030, -.137 - step * .007, .040 + step * .005), (.003, .003, .041), MOLDING, .001)
    side_profile(mesh, [(-.030, -.117), (-.058, -.127), (-.104, -.127), (-.151, -.107),
                        (-.165, -.078), (-.150, -.078), (-.140, -.097), (-.101, -.116), (-.052, -.115)],
                 .037, POLYMER)
    side_profile(mesh, [(-.066, -.075), (-.084, -.075), (-.080, -.105), (-.064, -.112), (-.056, -.107)],
                 .013, STEEL)
    mesh.box((0, -.027, .239), (.049, .062, .223), COVER, .005)
    side_profile(mesh, [(.151, .012), (.441, .012), (.460, -.010), (.453, -.045),
                        (.360, -.064), (.315, -.051), (.156, -.059)], .073, POLYMER)
    side_profile(mesh, [(.392, -.031), (.455, -.027), (.436, -.074), (.395, -.189),
                        (.377, -.191), (.401, -.084)], .055, MOLDING)
    side_profile(mesh, [(.465, .011), (.493, .006), (.484, -.187), (.471, -.199), (.436, -.192), (.452, -.046)],
                 .068, RUBBER)
    side_profile(mesh, [(.465, -.173), (.465, -.194), (.383, -.197), (.380, -.180)], .056, POLYMER)
    side_profile(mesh, [(.456, -.089), (.450, -.109), (.400, -.106), (.405, -.090)], .053, MOLDING)
    for step in range(11):
        mesh.box((0, -.014 - step * .015, .491 - step * .0016), (.070, .006, .009), MOLDING, .001)
    for side in (-1, 1):
        mesh.cylinder((side * .036, -.024, .183), .012, .006, 'x', MOLDING, 16)
    return mesh


def front():
    mesh = Assembly()
    mesh.box((0, -.013, -.402), (.082, .100, .255), POLYMER, .014)
    mesh.box((0, .059, -.403), (.070, .017, .254), COVER, .003)
    for side in (-1, 1):
        mesh.box((side * .039, .006, -.405), (.010, .045, .246), MOLDING, .004)
        for step in range(7):
            mesh.box((side * .044, .014, -.354 - step * .020), (.004, .011, .010), RECESS, .002)
        mesh.box((side * .043, -.015, -.451), (.013, .006, .105), COVER, .002)
        mesh.box((side * .043, -.026, -.395), (.011, .005, .178), MOLDING, .002)
    for step in range(31):
        mesh.box((0, .070, .083 - .0197 * step), (.081, .012, .011), COVER, .0015)
    for step in range(10):
        mesh.box((0, -.065, -.352 - .017 * step), (.060, .008, .009), MOLDING, .001)
    mesh.cylinder((0, .015, -.650), .020, .254, 'z', COVER, 24)
    mesh.cylinder((0, .043, -.587), .014, .143, 'z', STEEL, 20)
    mesh.cylinder((0, .015, -.683), .025, .052, 'z', COVER, 24)
    mesh.tube((0, .015, -.800), [(-.053,.022), (-.044,.026), (.026,.026), (.039,.020), (.052,.020)],
              'z', COVER, 24)
    sight_ring(mesh, .015, -.855, .010, .023, .014, STEEL)
    mesh.cylinder((0, .015, -.860), .010, .001, 'z', RECESS, 20)
    for side in (-1, 1):
        mesh.box((side * .023, .016, -.826), (.007, .012, .025), RECESS, .002)
    mesh.box((0, .075, .059), (.069, .018, .047), STEEL, .003)
    sight_ring(mesh, .100, .059, .008, .016, .014, COVER)
    mesh.cylinder((.032, .085, .060), .011, .014, 'x', COVER, 18)
    side_profile(mesh, [(-.651, .023), (-.676, .023), (-.683, .085), (-.667, .097), (-.655, .073)], .038, COVER)
    sight_ring(mesh, .100, -.670, .016, .022, .013, COVER)
    mesh.box((0, .089, -.670), (.005, .022, .009), STEEL, .001)
    return mesh


def magazine():
    mesh = Assembly()
    rows = [(-.067, -.190, -.292, .035), (-.122, -.184, -.276, .039),
            (-.190, -.188, -.280, .040), (-.254, -.210, -.302, .040),
            (-.310, -.239, -.336, .038), (-.343, -.265, -.363, .036)]
    rows += [(-.351, -.271, -.372, .041), (-.362, -.275, -.370, .039)]
    rings = []
    for y, rear, fore, edge in rows:
        inset = .009
        rings.append([(x, y + tilt, z) for x, tilt, z in [
            (-edge + inset, .009, rear), (edge - inset, .009, rear),
            (edge, .006, rear - inset), (edge, -.006, fore + inset),
            (edge - inset, -.009, fore), (-edge + inset, -.009, fore),
            (-edge, -.006, fore + inset), (-edge, .006, rear - inset)]])
    mesh.rings(rings, POLYMER)
    for y, rear in [(-.152, -.185), (-.193, -.189), (-.234, -.201), (-.275, -.219), (-.316, -.245)]:
        for column in range(3):
            for side in (-1, 1):
                z = rear - .022 - column * .023
                tile_y = y - column * .003
                mesh.box((side * .038, tile_y, z), (.005, .026, .017), MOLDING, .002)
                mesh.box((side * .040, tile_y, z), (.002, .019, .011), POLYMER, .002)
    return mesh


def main():
    glb, blend = map(Path, sys.argv[sys.argv.index('--') + 1:])
    moving = Assembly()
    moving.box((.044, .027, -.167), (.017, .015, .144), STEEL, .003)
    moving.box((.062, .026, -.110), (.028, .018, .020), COVER, .004)
    moving.cylinder((.080, .027, -.110), .012, .017, 'x', FRAME, 16)
    parts = [('Receiver', receiver()), ('Furniture', furniture()), ('Front', front()),
             ('Magazine', magazine()), ('Bolt', moving)]
    export_weapon(parts, glb, blend)



if __name__ == '__main__':
    main()
