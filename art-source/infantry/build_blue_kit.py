"""Build the blue team's class equipment in the normalized soldier bind pose."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / "tank"))
from build_rubezh import Assembly


def paint(rgb):
    return tuple(((channel / 255 + .055) / 1.055) ** 2.4 if channel > 10
                 else channel / (255 * 12.92) for channel in rgb)


OLIVE = paint((80, 88, 60))
SAGE = paint((110, 118, 83))
EARTH = paint((118, 101, 67))
COAL = paint((49, 58, 44))
SEAM = paint((59, 67, 49))
RUBBER = paint((40, 46, 41))
STEEL = paint((105, 115, 108))
AMBER = paint((172, 121, 51))
RED = paint((158, 44, 35))
IVORY = paint((221, 216, 188))
BINDING = paint((159, 154, 131))


def cloth(theta, course):
    field = (math.sin(theta * 3 + course * .8) + .69 * math.cos(theta * 7 - course * .63)
             + .28 * math.sin(theta * 13 + course * 1.4))
    shades = (COAL, OLIVE, SAGE, EARTH)
    return shades[sum(field > edge for edge in (-.66, .20, .89))]


def boonie():
    mesh = Assembly()
    sides = 64
    # Continuous brim and crown with sewn edge, sloped brim and irregular folds.
    profile = [
        (.156, .173, 1.715), (.159, .176, 1.719), (.155, .172, 1.721),
        (.147, .163, 1.724), (.135, .151, 1.729), (.122, .135, 1.737),
        (.110, .120, 1.740), (.099, .110, 1.744), (.095, .107, 1.750),
        (.093, .102, 1.754), (.088, .097, 1.764), (.084, .093, 1.775),
        (.081, .089, 1.786), (.076, .084, 1.800), (.063, .069, 1.808),
        (.040, .044, 1.813), (.016, .018, 1.814), (0, 0, 1.814),
    ]
    points = []
    for a, b, y in profile:
        for i in range(sides):
            t = i * math.tau / sides
            brim = max(0, (a - .090) / .068)
            fold = .004 * math.cos(5 * t) + .002 * math.sin(9 * t)
            points.append((.008 + (a + fold * brim) * math.cos(t),
                           y + brim * (.012 * math.sin(t) + fold) + a * .024 * math.sin(3 * t),
                           -.034 + (b + fold * brim) * math.sin(t)))
    for row in range(len(profile) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            points_on_face = (points[row * sides + i], points[row * sides + j],
                              points[(row + 1) * sides + j], points[(row + 1) * sides + i])
            if row == len(profile) - 2:
                points_on_face = points_on_face[:3]
            color = SEAM if row in (0, 8) else cloth(i * math.tau / sides, row * .58)
            mesh.add(points_on_face, [tuple(range(len(points_on_face)))], color)
    # Underside closes against the crown instead of filling the inside of the hat.
    for i in range(sides):
        j = (i + 1) % sides
        mesh.add([points[j], points[i], points[7 * sides + i], points[7 * sides + j]],
                 [(0, 1, 2, 3)], COAL)
    for t in (.10, .39, 2.75, 3.04):
        x, z = .008 + math.cos(t) * .091, -.034 + math.sin(t) * .102
        mesh.box((x, 1.762, z), (.007, .012, .008), SEAM, .001)
    return mesh


def medical_mark(mesh, surface, half_width, half_height, with_border=True):
    # Tessellate the cross and its backing on the same curved surface.
    xs = [-1, -.88, -.61, -.20, .20, .61, .88, 1]
    for i, a in enumerate(xs[:-1]):
        b = xs[i + 1]
        for j, c in enumerate(xs[:-1]):
            d = xs[j + 1]
            cross = (i == 3 and 2 <= j <= 4) or (j == 3 and 2 <= i <= 4)
            edge = i in (0, 6) or j in (0, 6)
            if not with_border and not cross:
                continue
            quad = [surface(u * half_width, v * half_height) for u, v in ((a,c),(b,c),(b,d),(a,d))]
            mesh.add(quad, [(0, 1, 2, 3)], RED if cross else BINDING if edge else IVORY)


def medic_helmet():
    mesh = Assembly()

    def surface(x, y):
        return (.008 + x, 1.750 + y, -.151 + 3.0 * x * x + .78 * y + 7.5 * y * y)

    medical_mark(mesh, surface, .038, .027)
    return mesh


def medic_sleeve():
    mesh = Assembly()
    elbow = Vector((-.2386, 1.1579, -.0772))
    wrist = Vector((-.1672, 1.0366, -.2002))
    axis = (wrist - elbow).normalized()
    outward = Vector((-1, 0, 0))
    outward = (outward - axis * outward.dot(axis)).normalized()
    across = outward.cross(axis).normalized()
    center = elbow.lerp(wrist, .36) - outward * .005

    def surface(theta, t, raised=0):
        radius = 1 - t * 1.52
        p = center + t * axis + outward * (radius * .053 + raised) * math.cos(theta)
        return tuple(p + across * (radius * .055 + raised) * math.sin(theta))

    seams = [(-.044, -.040, BINDING), (-.040, .038, IVORY), (.038, .042, BINDING)]
    for start, end, color in seams:
        for i in range(40):
            a, b = i * math.tau / 40, (i + 1) * math.tau / 40
            mesh.add([surface(a,start), surface(b,start), surface(b,end), surface(a,end)], [(0,1,2,3)], color)
    for theta in (-.03, -1.59):
        medical_mark(mesh, lambda u, v: surface(theta + u, v, .0012), .92, .043, False)
    return mesh


def engineer_head():
    mesh = Assembly()
    for side in (-1, 1):
        x = .008 + side * .11
        mesh.box((x, 1.674, .008), (.033, .093, .072), RUBBER, .012)
        mesh.box((x + side * .020, 1.673, .010), (.028, .077, .059), OLIVE, .009)
        mesh.box((x + side * .033, 1.688, .018), (.003, .007, .026), AMBER, .001)
        mesh.box((x, 1.723, .008), (.029, .037, .023), COAL, .004)
        mesh.box((.008 + side * .078, 1.675, -.080), (.014, .010, .073), RUBBER, .002)
    for x in (-.035, .051):
        # Wide, amber safety lenses with a swept outside edge.
        contour = [(-.039, -.009), (-.025, -.021), (.024, -.019), (.036, -.008),
                   (.041, .017), (.018, .022), (-.022, .022), (-.041, .014)]
        def lens_ring(scale, depth):
            return [(x + u * scale, 1.677 + v * scale,
                     -.143 + 4.3 * (x + u * scale - .008) ** 2 + depth) for u,v in contour]
        mesh.rings([lens_ring(.92, .012), lens_ring(1, 0), lens_ring(.86, -.003)], RUBBER)
        mesh.add(lens_ring(.82, -.004), [tuple(range(8))], paint((134, 104, 58)))
    mesh.box((.008, 1.683, -.143), (.020, .009, .011), RUBBER, .002)
    return mesh


def engineer_pack():
    mesh = Assembly()
    mesh.box((0, 1.340, .206), (.259, .278, .081), COAL, .016)
    mesh.box((0, 1.335, .252), (.241, .236, .043), OLIVE, .011)
    mesh.box((0, 1.458, .241), (.240, .075, .061), SAGE, .011)
    for x in (-.085, .085):
        mesh.box((x, 1.370, .275), (.025, .196, .008), SEAM, .001)
        mesh.box((x, 1.396, .281), (.033, .023, .011), RUBBER, .003)
        mesh.box((x, 1.396, .287), (.023, .004, .002), STEEL, .0005)
        mesh.box((x, 1.484, .222), (.023, .027, .029), SEAM, .003)
    for side in (-1, 1):
        points = [(.085, 1.456, .229), (.099, 1.500, .168), (.108, 1.535, .120),
                  (.106, 1.551, .075), (.108, 1.549, .027), (.107, 1.525, -.025),
                  (.103, 1.489, -.078), (.095, 1.441, -.116)]
        strap = []
        for x, y, z in points:
            strap.append([(side * x + dx, y + dy, z) for dx, dy in
                          [(-.016,-.005), (.016,-.005), (.016,.005), (-.016,.005)]])
        mesh.rings(strap, EARTH)
    mesh.box((0, 1.500, .222), (.170, .017, .020), SEAM, .004)
    mesh.box((-.038, 1.301, .273), (.099, .093, .020), SAGE, .007)
    mesh.box((-.038, 1.327, .285), (.111, .023, .008), SEAM, .002)
    mesh.box((.119, 1.364, .252), (.043, .172, .054), EARTH, .008)
    mesh.box((.134, 1.402, .287), (.026, .074, .012), STEEL, .004)
    mesh.box((.133, 1.361, .288), (.035, .026, .019), RUBBER, .004)
    mesh.box((.135, 1.435, .285), (.033, .031, .019), STEEL, .004)
    mesh.box((.135, 1.460, .276), (.030, .013, .046), STEEL, .002)
    mesh.box((.135, 1.448, .308), (.030, .013, .023), STEEL, .002)
    mesh.box((-.019, 1.439, .276), (.050, .015, .004), AMBER, .001)
    return mesh


def export():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.context.scene.collection
    cloth_material = bpy.data.materials.new("Field kit")
    cloth_material.use_nodes = True
    shader = cloth_material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .86
    colors = cloth_material.node_tree.nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Paint"
    cloth_material.node_tree.links.new(colors.outputs["Color"], shader.inputs["Base Color"])
    for name, build in [
        ("ScoutBoonie", boonie), ("MedicHelmetBadge", medic_helmet), ("MedicArmband", medic_sleeve),
        ("EngineerProtection", engineer_head), ("EngineerPack", engineer_pack),
    ]:
        obj = build().object(name, collection)
        obj.data.materials.append(cloth_material)
        obj.data.uv_layers.remove(obj.data.uv_layers.active)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                view = area.spaces.active
                view.shading.color_type = "VERTEX"
                view.region_3d.view_location = (0, 0, 1.48)
                view.region_3d.view_distance = 1.04
    output = HERE.parent.parent / "src" / "assets" / "infantry" / "blue-kit.glb"
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_vertex_color="ACTIVE",
                             export_meshopt_compression_enable=True, export_meshopt_extension="EXT_meshopt_compression")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "blue-kit.blend"), compress=True)


if __name__ == "__main__":
    export()
