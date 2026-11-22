import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from weapon_mesh import Assembly, export_weapon, side_profile, surface_mark


BODY = (.071, .082, .084)
EDGE = (.19, .211, .213)
RECESS = (.029, .036, .038)
RUBBER = (.043, .048, .047)
STEEL = (.115, .128, .130)
MARK = (.38, .43, .39)

# The aperture and its armour use the same profile. Offsetting the outer
# rows creates an open, bevelled housing with separate inner light baffles.
WINDOW = [(-.78, -1), (.78, -1), (1, -.65), (1, .65),
          (.72, 1), (-.72, 1), (-1, .65), (-1, -.65)]
CENTER = .046


def housing(mesh, rows, color):
    vertices = [(x * width, CENTER + y * height, z)
                for z, width, height in rows for x, y in WINDOW]
    count = len(WINDOW)
    faces = [(r * count + i, r * count + (i + 1) % count,
              ((r + 1) % len(rows)) * count + (i + 1) % count,
              ((r + 1) % len(rows)) * count + i)
             for r in range(len(rows)) for i in range(count)]
    mesh.add(vertices, faces, color)


def lens(z, width, height):
    glass = Assembly()
    vertices = [(x * width, CENTER + y * height, z + y * .002) for x, y in WINDOW]
    glass.add(vertices, [tuple(range(len(vertices)))], (1, 1, 1))
    return glass


def optic():
    body, clamp, fittings = Assembly(), Assembly(), Assembly()
    housing(body, [
        (.048, .033, .029), (.041, .038, .034), (-.023, .038, .034),
        (-.050, .035, .031), (-.057, .030, .027), (-.057, .026, .023),
        (-.049, .024, .0215), (.041, .024, .0215), (.048, .026, .0235),
    ], BODY)
    housing(body, [(.044, .028, .025), (.039, .028, .025),
                   (.039, .0245, .022), (.044, .0245, .022)], RECESS)
    housing(body, [(-.048, .029, .024), (-.054, .028, .024),
                   (-.054, .025, .022), (-.048, .025, .022)], EDGE)

    clamp.box((0, .005, -.004), (.068, .010, .100), RECESS, .002)
    clamp.box((0, .014, -.004), (.060, .012, .083), BODY, .0035)
    for side in (-1, 1):
        side_profile(clamp, [(-.051, .004), (-.038, .016), (.032, .016),
                             (.049, .003)], .007, STEEL, side * .033)
        for z in (-.024, .021):
            fittings.cylinder((side * .037, .011, z), .0053, .009, 'x', STEEL, 16)
            fittings.cylinder((side * .042, .011, z), .0028, .001, 'x', RECESS, 6)
        for z in (-.038, .027):
            fittings.cylinder((side * .0364, .062, z), .0034, .004, 'x', EDGE, 10)
            fittings.box((side * .0388, .062, z), (.001, .001, .004), RECESS, .0002)

    for axis, center in [('x', (.040, .043, -.006)), ('y', (0, .082, -.008))]:
        fittings.cylinder(center, .010, .008, axis, RUBBER, 22)
        x, y, z = center
        for index in range(12):
            a = index * math.tau / 12
            u, v = math.cos(a) * .0097, math.sin(a) * .0097
            point = (x + u, y, z + v) if axis == 'y' else (x, y + u, z + v)
            fittings.box(point, (.0026, .0063, .0026) if axis == 'y' else
                         (.0063, .0026, .0026), STEEL, .00045)
    for z in (-.018, .010):
        fittings.box((-.039, .037, z), (.006, .012, .016), RUBBER, .0015)
        fittings.box((-.0424, .037, z), (.001, .0015, .007), MARK, .0002)
    surface_mark(fittings, 'R-15', .0385, .057, .024, .0018, MARK)
    return [('Housing',body),('Clamp',clamp),('Controls',fittings),
            ('FrontLens',lens(-.046,.025,.022)),('RearLens',lens(.037,.024,.0215))]


def handguard(rear, front, y0, y1, width, rail):
    guard = Assembly()
    length = rear - front
    middle = (rear + front) / 2
    guard.box((0,y0+.008,middle), (width*.78,.016,length), BODY, .004)
    for side in (-1,1):
        x = width * side * .45
        for y in (y0+.017,y1-.009):
            guard.box((x,y,middle), (width*.15,.012,length*.94), BODY, .003)
        for step in range(5):
            z = rear - (step+.6)*length/5.18
            guard.box((x,(y0+y1)/2,z), (width*.17,y1-y0-.013,length*.079), BODY, .0028)
            guard.box((x*1.15,y0+.012,z), (.004,.007,length*.075), EDGE, .001)
        for z in (rear-.015,front+.013):
            guard.cylinder((x*1.17,(y0+y1)/2,z),.0046,.004,'x',STEEL,12)
    if rail:
        guard.box((0,y1-.008,middle),(width*.56,.012,length*.98),BODY,.0025)
        for step in range(round(length/.020)):
            z = rear - .010 - step*.020
            guard.box((0,y1-.001,z),(width*.77,.007,.009),STEEL,.001)
    return guard


if __name__ == '__main__':
    glb, blend = map(Path, sys.argv[sys.argv.index('--') + 1:])
    components = optic()
    guards = {
        'ar416': (-.258,-.608,-.057,.088,.094,True),
        'ak12':  (-.278,-.530,-.063,.068,.087,False),
        'mcx9':  (-.269,-.571,-.052,.087,.094,True),
        'vk45':  (-.315,-.508,-.070,-.004,.090,False),
        'mg36':  (-.291,-.679,-.042,.058,.103,True),
    }
    parts = components + [('Guard_'+name,handguard(*fit)) for name,fit in guards.items()]
    export_weapon(parts,glb,blend,
                  groups={'Collimator':((0,0,0),[name for name,_ in components])},
                  mounts={'SightEye':(0,CENTER,0)},
                  glass={'FrontLens':(.29,.48,.40,.17),'RearLens':(.43,.55,.58,.09)},
                  finish_rows={RECESS:1,RUBBER:1,EDGE:2,STEEL:2},
                  view_distance=.35)
    root = bpy.context.scene.collection
    alternatives = bpy.data.collections.new('Handguard variants')
    root.children.link(alternatives)
    for name in guards:
        obj = root.objects['Guard_'+name]
        alternatives.objects.link(obj)
        root.objects.unlink(obj)
    alternatives.hide_viewport = alternatives.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()), compress=True)
