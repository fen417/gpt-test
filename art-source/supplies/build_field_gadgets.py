"""Build the game's engineer repair torch and recon deployment beacon."""
import math
import sys
from pathlib import Path

from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon


OLIVE = (.112, .151, .084)
EDGE = (.189, .220, .128)
SAND = (.300, .238, .151)
RUBBER = (.022, .032, .030)
DARK = (.047, .059, .062)
STEEL = (.235, .276, .283)
BRASS = (.488, .289, .105)
COPPER = (.306, .125, .057)
HEAT = (.151, .136, .174)
ORANGE = (.585, .195, .052)
IVORY = (.725, .707, .544)
GLASS = (.019, .072, .076)
SIGNAL = (.113, .630, .570)
MUTED = (.075, .256, .247)


def tube_path(mesh, points, radius, color, sides=12):
    points = [Vector(p) for p in points]
    rings = []
    for i, point in enumerate(points):
        direction = (points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]).normalized()
        normal = direction.cross(Vector((1, 0, 0))).normalized()
        tangent = direction.cross(normal)
        rings.append([tuple(point + radius * (normal * math.cos(a) + tangent * math.sin(a)))
                      for a in (j * math.tau / sides for j in range(sides))])
    mesh.rings(rings, color)


def sleeve(mesh, x, y, profile, color, sides=32):
    points = [(x + r * math.cos(i * math.tau / sides), y + r * math.sin(i * math.tau / sides), z)
              for z, r in profile for i in range(sides)]
    faces = [(a * sides + i, a * sides + (i + 1) % sides,
              ((a + 1) % len(profile)) * sides + (i + 1) % sides, ((a + 1) % len(profile)) * sides + i)
             for a in range(len(profile)) for i in range(sides)]
    mesh.add(points, faces, color)


def stencil(mesh, text, x, y, z, unit, color, reverse=False):
    symbols = {
        "0": ("111", "101", "101", "101", "111"), "1": ("010", "110", "010", "010", "111"),
        "2": ("111", "001", "111", "100", "111"), "7": ("111", "001", "010", "010", "010"),
        "B": ("110", "101", "110", "101", "110"), "R": ("110", "101", "110", "101", "101"),
        "-": ("000", "000", "111", "000", "000"),
    }
    for col, character in enumerate(text):
        for row, bits in enumerate(symbols[character]):
            for pixel, bit in enumerate(bits):
                if bit == "1":
                    cx, cy = x + (4 * col + pixel) * unit, y - row * unit
                    if reverse:
                        cx = -cx
                    half = unit * .41
                    mesh.add([(cx-half, cy-half, z), (cx+half, cy-half, z),
                              (cx+half, cy+half, z), (cx-half, cy+half, z)],
                             [(3, 2, 1, 0) if reverse else (0, 1, 2, 3)], color)


def repair_torch():
    torch = Assembly()
    torch.tube((0, -.05, .056), [
        (-.099, .033), (-.095, .042), (-.084, .046), (.082, .046),
        (.099, .038), (.113, .022),
    ], 'y', OLIVE, 32)
    torch.tube((0, -.05, .056), [
        (-.102, .034), (-.099, .044), (-.093, .048), (-.084, .048), (-.081, .045),
    ], 'y', RUBBER, 32)
    for y in (-.124, -.110, .025):
        torch.cylinder((0, y, .056), .0465, .004, 'y', EDGE, 32)
    torch.cylinder((0, .058, .056), .034, .020, 'y', DARK, 20)
    torch.cylinder((0, .075, .056), .027, .024, 'y', BRASS, 8)
    # Contoured grip behind the cartridge, with an inset rubber pad.
    torch.rings([[(-w, y, z0), (w, y, z0), (w, y, z1), (-w, y, z1)] for y, w, z0, z1 in
                 [(-.093, .018, .094, .105), (-.080, .026, .093, .121),
                  (-.030, .027, .092, .130), (.021, .027, .094, .130), (.061, .023, .080, .115)]], DARK)
    for y in (-.069, -.054, -.039, -.024, -.009, .006, .021):
        torch.box((0, y, .128), (.045, .0065, .006), RUBBER, .001)
    torch.box((0, .052, .098), (.040, .040, .059), ORANGE, .007)
    torch.box((0, .070, .117), (.019, .021, .023), DARK, .003)
    torch.box((0, .075, .127), (.018, .016, .006), RUBBER, .002)
    torch.box((0, .095, .041), (.066, .042, .069), DARK, .006)
    for x in (-.032, .032):
        torch.cylinder((x, .094, .028), .008, .007, 'x', STEEL, 12)
    torch.cylinder((.036, .106, .064), .018, .019, 'x', BRASS, 12)
    torch.cylinder((.053, .106, .064), .025, .020, 'x', ORANGE, 20)
    for i in range(16):
        a = i * math.tau / 16
        torch.cylinder((.054, .106 + math.cos(a)*.023, .064 + math.sin(a)*.023), .003, .016, 'x', ORANGE, 6)
    torch.cylinder((.064, .106, .064), .013, .004, 'x', DARK, 16)
    # Solder-colored neck and vented heat shield with an open nozzle face.
    tube_path(torch, [(0,.105,.020),(0,.125,-.022),(0,.128,-.053),
                      (0,.118,-.090),(0,.110,-.123),(0,.110,-.169)], .011, BRASS)
    for z, radius, length, color in [
        (-.133,.016,.016,BRASS), (-.151,.019,.021,DARK), (-.168,.020,.014,STEEL),
        (-.188,.020,.020,COPPER), (-.223,.020,.021,HEAT),
    ]:
        torch.cylinder((0,.110,z), radius, length, 'z', color, 24)
    sleeve(torch,0,.110,[(-.202,.015),(-.245,.015),(-.250,.019),(-.250,.023),
                         (-.244,.026),(-.211,.026),(-.206,.023),(-.206,.017)],STEEL)
    sleeve(torch,0,.110,[(-.243,.016),(-.241,.021),(-.232,.0255),(-.226,.0255),
                         (-.228,.020)],HEAT)
    for i in range(8):
        a = i * math.tau / 8
        y, x = .110 + math.sin(a)*.026, math.cos(a)*.026
        torch.box((x, y, -.220), (.004, .004, .015), DARK, .0005)
    # The label follows the cylinder instead of reading as a flat block.
    points = [(.0468 * math.sin(i * .10), y, .056 - .0468 * math.cos(i * .10))
              for y in (-.107, -.030) for i in range(-6, 7)]
    torch.add(points, [(i+13, i+14, i+1, i) for i in range(12)], SAND)
    torch.box((0, -.083, .0077), (.029, .015, .003), ORANGE, .001)
    stencil(torch, "R-12", -.015, -.052, .008, .0022, IVORY, reverse=True)
    return [('Torch', torch)], {'FlameSocket': (0,.110,-.251)}, {}


def beacon():
    radio, display, lamp, mast, supports = [Assembly() for _ in range(5)]
    radio.box((0,.028,0), (.335,.053,.236), RUBBER, .012)
    radio.box((0,.174,0), (.327,.275,.220), OLIVE, .018)
    radio.box((0,.315,0), (.338,.035,.230), EDGE, .010)
    for x in (-.144, .144):
        for z in (-.098, .098):
            for y in (.042,.299):
                radio.box((x,y,z), (.058,.068,.052), RUBBER, .008)
    for side in (-1,1):
        radio.box((side*.163,.178,.011), (.027,.170,.149), DARK, .006)
        for y in (.102,.128,.154,.180,.206,.232,.258):
            radio.box((side*.179,y,.011), (.021,.010,.143), OLIVE, .002)
        radio.box((side*.113,.211,.108), (.038,.151,.034), DARK, .004)
        radio.box((side*.113,.211,.129), (.022,.040,.019), STEEL, .003)
        radio.box((side*.113,.214,.140), (.015,.006,.006), ORANGE, .001)
        radio.cylinder((side*.122,.302,-.111), .005,.005,'z', STEEL, 12)
    radio.box((0,.186,.111), (.186,.168,.022), EDGE, .006)
    radio.box((0,.168,.124), (.170,.107,.009), SAND, .003)
    stencil(radio, "B-07", -.062, .201, .130, .005, DARK)
    for x in (-.050,-.018,.014,.046):
        radio.box((x,.145,.130), (.019,.008,.003), OLIVE, .001)
    radio.box((0,.129,-.113), (.218,.116,.022), DARK, .006)
    for y in (.106,.121,.136,.151):
        radio.box((0,y,-.126), (.129,.007,.005), RUBBER, .001)
    for x in (-.082,.082):
        radio.cylinder((x,.128,-.126), .010,.008,'z', BRASS, 12)
    for x in (-.111,.111):
        radio.box((x,.338,.001), (.031,.030,.036), DARK, .004)
    tube_path(radio,[(-.111,.344,.001),(-.100,.384,.002),(-.080,.396,.003),
                     (.080,.396,.003),(.100,.384,.002),(.111,.344,.001)], .013, RUBBER)
    for x in (-.062,-.044,-.026,-.008,.010,.028,.046,.064):
        radio.cylinder((x,.396,.003), .014,.006,'x', DARK,12)
    radio.box((-.033,.334,.058), (.164,.016,.079), DARK, .004)
    radio.box((-.049,.344,.059), (.100,.006,.057), GLASS, .002)
    for i in range(5):
        size = .007 + i*.005
        display.box((-.079+i*.012,.348,.076-size*.5), (.007,.0015,size), SIGNAL if i<4 else MUTED, 0)
    for x,z in [(.018,.047),(.018,.074),(.045,.074)]:
        radio.cylinder((x,.344,z), .008,.009,'y', ORANGE if x>.03 else RUBBER, 12)
    radio.cylinder((.103,.334,.075), .030,.026,'y', DARK, 12)
    radio.cylinder((.103,.352,.075), .025,.014,'y', BRASS, 12)
    radio.cylinder((.103,.367,.075), .021,.021,'y', RUBBER, 16)
    radio.cylinder((-.110,.343,-.067), .022,.025,'y', DARK, 16)
    lamp.tube((-.110,.343,-.067), [(.006,.017),(.015,.016),(.024,.012),(.025,.009)],'y', SIGNAL, 20)
    mast.cylinder((.103,.399,.075), .015,.058,'y', DARK, 16)
    for y in (.383,.396,.410):
        mast.cylinder((.103,y,.075), .016,.005,'y', EDGE, 16)
    mast.cylinder((.103,.529,.075), .009,.235,'y', STEEL, 16)
    mast.cylinder((.103,.635,.075), .012,.044,'y', DARK, 16)
    mast.cylinder((.103,.727,.075), .0068,.167,'y', STEEL, 14)
    mast.cylinder((.103,.809,.075), .009,.025,'y', DARK, 14)
    tube_path(mast,[(.103,.807,.075),(.103,.878,.078),(.101,.952,.082),(.099,1.007,.087)],.004,DARK,8)
    mast.cylinder((.099,1.004,.087), .007,.019,'y', RUBBER, 12)
    for sx in (-1,1):
        for sz in (-1,1):
            tube_path(supports,[(sx*.120,.069,sz*.080),(sx*.164,.061,sz*.113),
                                (sx*.207,.037,sz*.146),(sx*.224,.022,sz*.172)],.013,STEEL)
            supports.box((sx*.225,.017,sz*.171), (.063,.034,.072), RUBBER,.008)
            supports.cylinder((sx*.179,.050,sz*.085), .015,.019,'x', DARK,12)
    parts = [('Radio',radio),('SignalDisplay',display),('StatusLamp',lamp),('Mast',mast),('Feet',supports)]
    # Keep these separate from the carried housing during view-model batching.
    deployment = {'Antenna': ((0,0,0), ['Mast']), 'Supports': ((0,0,0), ['Feet'])}
    return parts, {}, deployment


if __name__ == '__main__':
    kind, glb, blend = sys.argv[sys.argv.index('--')+1:]
    parts, mounts, groups = {'repair': repair_torch, 'beacon': beacon}[kind]()
    finishes = {RUBBER: 1, DARK: 1, STEEL: 2, BRASS: 2, COPPER: 2, HEAT: 2, GLASS: 1,
                SIGNAL: 1, MUTED: 1, SAND: 3, IVORY: 3}
    export_weapon(parts, Path(glb), Path(blend), mounts=mounts, groups=groups,
                  view_distance=.95 if kind == 'repair' else 1.5, finish_rows=finishes)
