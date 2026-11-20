"""Build the stock P-19 and M-50 display meshes and editable scenes."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring


POLYMER = (.050, .056, .064)
RUBBER = (.035, .041, .048)
BLUED = (.091, .103, .118)
SATIN = (.390, .424, .451)
EDGE = (.169, .188, .204)
RECESS = (.018, .022, .029)
IVORY = (.77, .78, .70)
RED = (.47, .060, .042)


def upper_section(mesh, start, end, half, bottom, top, chamfer, color):
    contour = [(-half + chamfer, bottom), (half - chamfer, bottom),
               (half, bottom + chamfer), (half, top - chamfer),
               (half - chamfer, top), (-half + chamfer, top),
               (-half, top - chamfer), (-half, bottom + chamfer)]
    sections = [(start, .90), (start + .004, 1), (end - .004, 1), (end, .94)]
    mid = (bottom + top) / 2
    mesh.rings([[(x * scale, mid + (y - mid) * scale, z) for x, y in contour] for z, scale in sections], color)


def grip(mesh, heavy):
    rows = [(-.240, .027, .142, .036), (-.226, .030, .140, .037), (-.190, .032, .132, .039),
            (-.145, .031, .120, .038), (-.095, .028, .106, .034), (-.051, .026, .101, .030)]
    if heavy:
        rows = [(y, w + .002, z - .014, d + .001) for y, w, z, d in rows]
    contours = []
    for y, width, center, depth in rows:
        contour = []
        for i in range(24):
            a = math.tau * i / 24
            sx, sz = math.cos(a), math.sin(a)
            x = math.copysign(abs(sx) ** .57, sx) * width
            z = center + math.copysign(abs(sz) ** .65, sz) * depth
            contour.append((x, y, z))
        contours.append(contour)
    mesh.rings(contours, RECESS if heavy else POLYMER)
    for side in (-1, 1):
        if heavy:
            side_profile(mesh, [(.070,-.110),(.118,-.108),(.147,-.211),(.143,-.228),
                                (.102,-.229),(.093,-.214)], .009, RUBBER, side * .029)
            for z, y in [(.102,-.129),(.127,-.211)]:
                mesh.cylinder((side * .034,y,z),.006,.0025,'x',EDGE,12)
        for i in range(13):
            y = -.137 - i * .0064
            lower, upper = next((low, high) for low, high in zip(rows, rows[1:]) if low[0] <= y <= high[0])
            t = (y - lower[0]) / (upper[0] - lower[0])
            width, center, depth = (a+(b-a)*t for a,b in zip(lower[1:],upper[1:]))
            for j in range(-3, 4):
                z = center + j * .0058
                if heavy and (abs(j)>2 or (-.202 < y < -.166 and abs(j)<2)):
                    continue
                radial = (abs(z-center)/depth) ** (1/.65)
                x = max(width * (1-radial**2)**.285, .033 if heavy else 0)
                vertices = [(side*x,y-.0019,z-.0020),(side*x,y+.0019,z-.0020),
                            (side*x,y+.0019,z+.0020),(side*x,y-.0019,z+.0020),
                            (side*(x+.0017),y,z)]
                mesh.add(vertices,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],POLYMER if heavy else EDGE)


def make_frame(heavy, front):
    mesh = Assembly()
    finish = SATIN if heavy else POLYMER
    side_profile(mesh, [(front+.010,-.016),(.145,-.016),(.155,-.034),(.129,-.047),
                        (.117,-.063),(.070,-.066),(.047,-.052),(front+.031,-.057),
                        (front+.013,-.046)], .066 if heavy else .054, finish)
    for side in (-1,1):
        w = .030 if heavy else .026
        mesh.box((side*w,-.040,front+.067),(.003,.010,.068),RECESS,.001)
        for z, y in [(.041,-.033),(.082,-.052),(.121,-.049)]:
            mesh.cylinder((side*w,y,z),.0046,.004,'x',EDGE,12)
        mesh.box((side*(w+.002),-.032,.066),(.004,.009,.034),BLUED,.002)
        mesh.box((side*(w+.002),-.072,.073),(.003,.017,.013),RECESS,.002)
    side_profile(mesh, [(-.034,-.050),(-.048,-.062),(-.052,-.082),(-.046,-.116),
                        (-.029,-.127),(.048,-.127),(.073,-.113),(.077,-.097),
                        (.066,-.106),(.046,-.115),(-.025,-.115),(-.035,-.106),
                        (-.038,-.083),(-.029,-.065)], .044, finish)
    grip(mesh, heavy)
    return mesh


def sights(front_piece, slide, front, heavy):
    height = .054
    front_piece.box((0,.050,front+.024),(.008,.014,.016),RECESS,.001)
    front_piece.box((0,height,front+.032),(.0038,.004,.0015),IVORY,.0003)
    slide.box((0,.046,.111),(.038,.009,.026),RECESS,.0015)
    for side in (-1,1):
        slide.box((side*.0125,.052,.117),(.010,.015,.017),RECESS,.0013)
        if not heavy:
            slide.box((side*.0105,.054,.126),(.004,.004,.0015),IVORY,.0003)


def badge(mesh, heavy, z_start, width):
    glyphs = {'P':('110','101','110','100','100'), 'M':('101','111','111','101','101'),
              '-':('000','000','111','000','000'), '1':('010','110','010','010','111'),
              '9':('111','101','111','001','111'), '5':('111','100','111','001','111'),
              '0':('111','101','101','101','111')}
    for column, character in enumerate('M-50' if heavy else 'P-19'):
        for row, bits in enumerate(glyphs[character]):
            for pixel, bit in enumerate(bits):
                if bit == '1':
                    mesh.box((-width-.0004,.026-row*.0026,z_start+(column*4+pixel)*.0026),
                             (.0012,.0021,.0021),RECESS if heavy else EDGE,0)


def make_upper(heavy, front):
    slide, fixed = Assembly(), Assembly()
    half = .036 if heavy else .028
    finish = SATIN if heavy else BLUED
    nose = fixed if heavy else slide
    upper_section(nose, front, -.062, half, -.019, .044, .007, finish)
    upper_section(slide, .023, .134, half, -.018, .044, .007, finish)
    slide.box((0,-.012,-.019),(half*1.68,.015,.086),finish,.003)
    slide.box((-half+.005,.013,-.018),(.010,.043,.091),finish,.002)
    fixed.box((0,.019,-.022),(half*1.33,.041,.069),EDGE,.003)
    tip = front-(.009 if heavy else .002)
    fixed.cylinder((0,.012,tip+.005),.015 if heavy else .012,.009,'z',EDGE,20)
    sight_ring(fixed,.012,tip,.009 if heavy else .007,.014 if heavy else .011,.005,RECESS)
    fixed.cylinder((0,.012,tip-.001),.009 if heavy else .007,.002,'z',RECESS,18)
    for side in (-1,1):
        for i in range(8 if heavy else 9):
            slide.box((side*(half+.0001),.014,.045+i*.008),(.0015,.041,.0026),RECESS,0)
        if heavy:
            slide.cylinder((side*(half+.003),.018,.101),.011,.006,'x',RECESS,18)
            slide.box((side*(half+.006),.021,.111),(.005,.008,.018),BLUED,.002)
            slide.box((side*(half+.003),.002,.095),(.001,.0034,.0042),RED,0)
            fixed.box((side*(half+.0002),.008,(front-.066)/2),(.0018,.014,abs(front+.080)),EDGE,.0003)
        else:
            for i in range(8):
                slide.box((side*(half+.0001),.011,front+.016+i*.008),(.0015,.037,.0026),RECESS,0)
    if heavy:
        for i in range(8):
            fixed.box((0,.043,front+.039+i*.019),(.037,.007,.012),SATIN,.001)
    badge(nose,heavy,-.135 if heavy else -.104,half)
    sights(nose,slide,front,heavy)
    return slide,fixed


def build(heavy):
    front = -.248 if heavy else -.181
    slide, fixed = make_upper(heavy, front)
    trigger = Assembly()
    side_profile(trigger, [(.033,-.048),(.049,-.050),(.047,-.065),(.028,-.086),
                           (.025,-.104),(.013,-.105),(.013,-.091),(.027,-.061)], .013, EDGE)
    magazine = Assembly()
    heel = .128 if heavy else .145
    side_profile(magazine, [(heel-.027,-.244),(heel+.027,-.244),(.129,-.095),(.080,-.095)], .044, BLUED)
    magazine.box((0,-.246,heel),(.056,.010,.064),EDGE if heavy else POLYMER,.0025)
    for i in range(4):
        magazine.cylinder((.022,-.180+i*.015,.112),.003,.0007,'x',RECESS,10)
    parts = [('Frame',make_frame(heavy,front)),('Shroud' if heavy else 'Barrel',fixed),
             ('Slide',slide),('Trigger',trigger),('Magazine',magazine)]
    pivots = {'Magazine':(0,-.246,heel),'Trigger':(0,-.051,.038)}
    if heavy:
        hammer = Assembly()
        side_profile(hammer,[(.130,-.023),(.134,.016),(.163,.021),(.177,.009),
                             (.171,-.006),(.153,-.009),(.147,-.026)],.015,BLUED)
        for i in range(4):
            hammer.box((0,.016-i*.001,.152+i*.004),(.016,.002,.0022),EDGE,.0003)
        parts.append(('Hammer',hammer))
        pivots['Hammer'] = (0,-.016,.136)
    return parts,pivots


if __name__ == '__main__':
    name, glb, blend = sys.argv[sys.argv.index('--') + 1:]
    parts, pivots = build(name == 'm50')
    export_weapon(parts, Path(glb), Path(blend), pivots=pivots, view_distance=.70)
