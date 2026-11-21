"""Field Forces class equipment fitted to the militia model's bind pose."""
import math
import sys
from pathlib import Path

from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_blue_kit import Assembly, boonie, export, medical_mark, paint
from build_blue_kit import COAL, OLIVE, SAGE, EARTH, SEAM, RUBBER, STEEL, IVORY, BINDING, RED


SAND = paint((153, 132, 94))
BROWN = paint((107, 83, 57))
KHAKI = paint((123, 111, 78))
CANVAS = paint((145, 116, 76))
RUST = paint((144, 81, 47))
CHARCOAL = paint((60, 54, 43))
DUST = paint((190, 151, 76))


def sniper_hat():
    mesh = boonie()
    finishes = {COAL: BROWN, OLIVE: KHAKI, SAGE: SAND, EARTH: CANVAS, SEAM: CHARCOAL}
    mesh.colors = [finishes[color] for color in mesh.colors]
    for index, (x, y, z) in enumerate(mesh.vertices):
        x, z = x - .008, z + .034
        brim = max(0, (math.hypot(x, z * .92) - .10) / .065)
        fold = .052 * brim * max(0, .95 * x / .16) ** 2
        mesh.vertices[index] = (-.184 + x * .99, y + .022 + fold, .071 + z * .94)
    # Leather chin cord following the outside of the balaclava.
    for side in (-1, 1):
        points = [(-.184 + side * a, y, z) for a, y, z in
                  [(.109, 1.763, .078), (.096, 1.692, .079), (.087, 1.632, .067),
                   (.072, 1.592, .048), (.045, 1.571, .036), (.012, 1.573, .029)]]
        panels = [[(x + .0023 * math.cos(i * math.tau / 6), y, z + .0023 * math.sin(i * math.tau / 6))
                   for i in range(6)] for x, y, z in points]
        mesh.rings(panels, CHARCOAL)
    mesh.box((-.184, 1.571, .029), (.027, .010, .009), CHARCOAL, .002)
    return mesh


def medic_cap():
    mesh = Assembly()

    def surface(x, y):
        # Split the patch across the sloping face of the cap above its bill.
        return (-.186 + x, 1.779 + y, -.0205 + 9.0 * x * x + 1.29 * y + 8.0 * y * y)

    medical_mark(mesh, surface, .035, .019)
    return mesh


def medic_sleeve():
    mesh = Assembly()
    elbow = Vector((-.4935, 1.2406, -.0505))
    wrist = Vector((-.3261, 1.3324, -.1161))
    axis = (wrist - elbow).normalized()
    outward = Vector((-1, 0, 0))
    outward = (outward - axis * outward.dot(axis)).normalized()
    across = outward.cross(axis)
    stations = [.28, .46, .67]
    # Measured radial clearances over the sleeve folds and elbow pad, in meters.
    profiles = [
        [.055, .050, .051, .049, .058, .076, .079, .068, .055, .051, .051, .058],
        [.056, .047, .049, .048, .065, .077, .077, .071, .060, .052, .053, .060],
        [.049, .044, .046, .053, .070, .070, .070, .065, .063, .066, .054, .057],
    ]

    def surface(theta, station):
        angle = theta * 12 / math.tau
        segment = math.floor(angle)
        u = angle - segment
        row = int(station > stations[1])
        v = (station - stations[row]) / (stations[row + 1] - stations[row])
        a, b = segment % 12, (segment + 1) % 12
        r0 = profiles[row][a] * (1 - u) + profiles[row][b] * u
        r1 = profiles[row + 1][a] * (1 - u) + profiles[row + 1][b] * u
        radius = r0 + (r1 - r0) * v + .0035
        direction = outward * math.cos(theta) + across * math.sin(theta)
        return tuple(elbow.lerp(wrist, station) + direction * radius)

    center, half_height, stem_height = .477, .129, .042
    half_width, stem_width = .605, .202
    marks = [-.66, math.pi - .66]
    cuts = [i * math.tau / 48 for i in range(49)]
    cuts += [(mark + edge) % math.tau for mark in marks
             for edge in (-half_width, -stem_width, stem_width, half_width)]
    rows = [.28, .304, center - half_height, center - stem_height, .46,
            center + stem_height, center + half_height, .646, .67]
    cuts.sort()
    for start, end in zip(rows, rows[1:]):
        v = abs((start + end) / 2 - center)
        for a, b in zip(cuts, cuts[1:]):
            theta = (a + b) / 2
            u = min(abs((theta - mark + math.pi) % math.tau - math.pi) for mark in marks)
            cross = (u < stem_width and v < half_height) or (u < half_width and v < stem_height)
            color = RED if cross else BINDING if start == .28 or end == .67 else IVORY
            mesh.add([surface(a, start), surface(b, start), surface(b, end), surface(a, end)], [(0, 1, 2, 3)], color)
    return mesh


def engineer_protection():
    mesh = Assembly()
    center = -.183
    for side in (-1, 1):
        x = center + side * .094
        mesh.box((x, 1.682, .083), (.025, .078, .075), RUBBER, .014)
        mesh.box((x + side * .015, 1.685, .083), (.028, .064, .063), BROWN, .011)
        mesh.box((x + side * .027, 1.695, .079), (.005, .012, .036), CANVAS, .002)
        mesh.box((x, 1.721, .094), (.025, .025, .025), CHARCOAL, .005)
        mesh.box((x, 1.688, .017), (.011, .017, .074), CHARCOAL, .003)
    # A single wide dust lens over the eyes, kept below the cap bill.
    outline = [(-.077, .011), (-.072, -.015), (-.046, -.025), (-.021, -.022), (0, -.013),
               (.020, -.022), (.046, -.025), (.072, -.015), (.077, .011),
               (.053, .023), (.025, .023), (0, .019), (-.025, .023), (-.053, .023)]

    def rim(scale, z):
        return [(center + x * scale, 1.699 + y * scale, z + 6.3 * (x * scale) ** 2)
                for x, y in outline]

    mesh.rings([rim(.90, -.049), rim(1, -.080), rim(.89, -.087)], CHARCOAL)
    mesh.add(rim(.83, -.089), [tuple(range(len(outline)))], paint((144, 97, 50)))
    mesh.box((center - .064, 1.700, -.063), (.014, .014, .027), DUST, .002)
    mesh.box((center + .064, 1.700, -.063), (.014, .014, .027), DUST, .002)
    return mesh


def engineer_pack():
    mesh = Assembly()
    center = -.172
    # Canvas field bag with a rolled tool wallet and a slot for pliers.
    mesh.box((center, 1.349, .271), (.270, .276, .087), BROWN, .018)
    mesh.box((center, 1.323, .326), (.247, .195, .040), CANVAS, .013)
    mesh.box((center, 1.411, .318), (.259, .092, .050), SAND, .011)
    mesh.box((center, 1.396, .350), (.241, .012, .007), KHAKI, .002)
    mesh.cylinder((center, 1.470, .293), .039, .284, 'x', KHAKI, 16)
    for x in (center - .086, center + .086):
        mesh.cylinder((x, 1.470, .293), .041, .022, 'x', CHARCOAL, 12)
        mesh.box((x, 1.373, .350), (.025, .129, .008), CHARCOAL, .002)
        mesh.box((x, 1.379, .357), (.030, .021, .009), STEEL, .002)
        mesh.box((x, 1.379, .362), (.020, .008, .002), CHARCOAL, .001)
    for x in (center - .143, center + .143):
        mesh.cylinder((x, 1.470, .293), .027, .005, 'x', BROWN, 14)
        mesh.cylinder((x + math.copysign(.003, x - center), 1.470, .293), .015, .005, 'x', CHARCOAL, 12)
    for side in (-1, 1):
        points = [(center + side * a, y, z) for a, y, z in
                  [(.094, 1.433, .278), (.106, 1.496, .224), (.116, 1.556, .163),
                   (.113, 1.569, .112), (.115, 1.554, .060), (.112, 1.528, .015),
                   (.108, 1.484, -.033)]]
        mesh.rings([[(x + dx, y + dy, z) for dx, dy in [(-.015,-.004), (.015,-.004), (.015,.004), (-.015,.004)]]
                    for x, y, z in points], KHAKI)
    mesh.box((center + .125, 1.314, .316), (.057, .093, .046), KHAKI, .008)
    mesh.box((center + .128, 1.347, .343), (.045, .023, .010), CHARCOAL, .003)
    for x in (center + .113, center + .140):
        mesh.box((x, 1.385, .339), (.012, .051, .014), RUST, .003)
    mesh.box((center + .127, 1.356, .338), (.027, .015, .012), STEEL, .003)
    mesh.box((center - .028, 1.411, .347), (.048, .015, .006), RUST, .002)
    return mesh


if __name__ == "__main__":
    export("field-kit", [
        ("ScoutBoonie", sniper_hat), ("MedicHelmetBadge", medic_cap), ("MedicArmband", medic_sleeve),
        ("EngineerProtection", engineer_protection), ("EngineerPack", engineer_pack),
    ])
