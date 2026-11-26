"""Build the detailed, stock VK-45 with the original game prop's mounts."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_smg as base
from weapon_detail import DetailedAssembly, engraved_mark, molded_grip, round_aperture
from weapon_finish import grip_finish_uv, shader_finish
from weapon_mesh import export_weapon


ANODIZED = (.059,.069,.074)
EDGE = (.094,.105,.110)
STEEL = (.046,.055,.061)
POLISHED = (.116,.130,.141)
POLYMER = (.034,.040,.042)
VECTOR_CASE = (.052,.059,.059)
GRIP = (.039,.043,.041)
STIPPLE = (.029,.032,.031)
PAD = (.024,.026,.025)
RECESS = (.013,.017,.020)
INSCRIPTION = (.205,.224,.220)
RED = (.33,.037,.024)


class VK45Assembly(DetailedAssembly):
    varied_finishes = (ANODIZED, EDGE, STEEL)


def soft_profile(mesh, points, width, color, x=0):
    z0 = sum(z for z,_ in points)/len(points)
    y0 = sum(y for _,y in points)/len(points)
    sections = [(-.5,.935),(-.49,.964),(-.46,.990),(-.40,1),
                 (.40,1),(.46,.990),(.49,.964),(.5,.935)]
    mesh.rings([[(x+width*s,y0+(y-y0)*scale,z0+(z-z0)*scale)
                 for z,y in points] for s,scale in sections],color)


def grip(mesh, back, top):
    outlines = [(0,.012,-.052,.026),(-.016,.020,-.048,.029),
                (-.037,.027,-.043,.030),(-.050,.031,-.041,.030),
                (-.078,.038,-.036,.0298),(-.119,.049,-.025,.029),
                (-.146,.055,-.017,.029),(-.160,.055,-.008,.028),
                (-.172,.044,-.005,.026),(-.177,.034,.001,.024)]
    molded_grip(mesh,[(top+y,back+rear,back+fore,width) for y,rear,fore,width in outlines],
                GRIP,STIPPLE,panel=(top-.162,top-.051))
    # Curved front ribs read as molded detail when the support hand is off the grip.
    for i in range(12):
        t = i/11
        mesh.box((0,top-.064-t*.085,back-.038+t*.026),(.034,.002,.0024),GRIP,.0006)
    mesh.box((0,top-.176,back+.016),(.044,.004,.026),POLYMER,.0015)


def stock(_vector):
    stock = VK45Assembly()
    # Separate collar, matte arm and soft rubber pad in the legacy envelope.
    stock.tube((0,.045,0),[(.152,.019),(.158,.023),(.173,.023),(.178,.020),
                          (.188,.020),(.192,.024),(.242,.024),(.254,.021)],'z',ANODIZED,64)
    stock.box((0,.041,.151),(.069,.072,.023),ANODIZED,.005)
    stock.box((0,.025,.209),(.037,.018,.098),RECESS,.003)
    soft_profile(stock,[(.202,.051),(.217,.072),(.365,.073),(.399,.067),(.418,.046),
                        (.417,-.059),(.403,-.069),(.386,-.067),(.387,-.008),
                        (.350,.017),(.207,.020)],.064,VECTOR_CASE)
    soft_profile(stock,[(.403,.050),(.423,.051),(.429,.036),(.424,-.073),
                        (.415,-.080),(.397,-.075),(.403,-.032)],.065,PAD)
    for side in (-1,1):
        soft_profile(stock,[(.221,.037),(.232,.051),(.353,.054),(.380,.046),
                            (.369,.034),(.237,.032)],.0025,POLYMER,side*.031)
        stock.cylinder((side*.033,.044,.381),.0105,.004,'x',STEEL,24)
        stock.cylinder((side*.0358,.044,.381),.0054,.002,'x',RECESS,20)
        for y in (-.053,-.038,-.023,-.008,.007,.022,.037):
            stock.box((side*.027,y,.424),(.008,.004,.008),PAD,.0016)
    return stock


def magazine(rows,_vector):
    mag = VK45Assembly()
    angles = [math.tau*i/40 for i in range(40)]
    mag.rings([[(math.copysign(abs(math.cos(a))**.47,math.cos(a))*w,y,
                 z+math.copysign(abs(math.sin(a))**.47,math.sin(a))*d)
                for a in angles] for y,z,d,w in rows],POLYMER)
    y,z,d,w = rows[-1]
    mag.box((0,y-.003,z),(2*w+.004,.012,2*d+.004),VECTOR_CASE,.0022)
    mag.box((0,y-.010,z),(2*w+.009,.008,2*d+.008),GRIP,.0019)
    for side in (-1,1):
        for (top_y,top_z,_,top_w),(bottom_y,bottom_z,_,bottom_w) in zip(rows[1:],rows[2:]):
            for shift in (-.014,.009):
                mesh = [(side*(top_w+.001),top_y,top_z+shift),
                        (side*(top_w+.001),top_y,top_z+shift+.004),
                        (side*(bottom_w+.001),bottom_y,bottom_z+shift+.004),
                        (side*(bottom_w+.001),bottom_y,bottom_z+shift)]
                mag.add(mesh,[(0,1,2,3) if side>0 else (3,2,1,0)],VECTOR_CASE)
        for y,z,_,w in rows[2:-1]:
            mag.cylinder((side*w,y,z),.0032,.0016,'x',RECESS,16)
            mag.cylinder((side*(w+.001),y,z),.0016,.00065,'x',ANODIZED,16)
    return mag


def vent(mesh, side, z):
    """A chamfered shell around a visible recessed channel."""
    angles = [math.tau*i/48 for i in range(48)]
    offset = len(mesh.vertices)
    for row,x in enumerate((.040,.046,.049,.049)):
        for a in angles:
            u,v = math.cos(a),math.sin(a)
            if row == 3:
                scale = max(abs(u),abs(v))
                along, up = .027*u/scale,.020*v/scale
            else:
                radius = (.004,.006,.008)[row]
                along,up = radius*u+math.copysign(.008,u),radius*v
            mesh.vertices.append((side*x,-.028+up,z+along))
    n = len(angles)
    for band,color in enumerate((RECESS,STEEL,ANODIZED)):
        for i in range(n):
            j = (i+1)%n
            indices = (i,j,n+j,n+i)
            mesh.faces.append(tuple(offset+n*band+k for k in (indices if side>0 else indices[::-1])))
            mesh.colors.append(color)


def handguard():
    guard = VK45Assembly()
    guard.box((0,-.030,-.410),(.079,.054,.200),STEEL,.006)
    guard.box((0,-.064,-.418),(.046,.015,.171),STEEL,.0028)
    for side in (-1,1):
        guard.box((side*.041,-.004,-.418),(.016,.013,.176),ANODIZED,.0023)
        guard.box((side*.041,-.051,-.418),(.014,.010,.175),ANODIZED,.002)
        for z in (-.473,-.419,-.365):
            vent(guard,side,z)
        for z in (-.507,-.331):
            guard.cylinder((side*.046,-.028,z),.0051,.004,'x',STEEL,22)
            guard.box((side*.048,-.028,z),(.0011,.0015,.0065),RECESS,.0004)
        for i in range(9):
            guard.box((side*.029,-.063,-.342-i*.018),(.010,.007,.009),EDGE,.0013)
    return guard


def finish(material, shader, rows):
    material.name = 'VK-45 · treated alloy / coated steel / molded polymer'
    shader_finish(material,shader,rows,finishes=((.47,.56,.036),(.72,.02,.056),
                                                 (.35,.84,.034),(.86,0,.066),(.73,.01,.88)),
                  fabric_rows=(),stipple_rows=(4,),size=384,roughness_variation=.44)


def project_finishes(mesh,colors,rows,row_count):
    grip_finish_uv(mesh,colors,rows,row_count,STIPPLE,depth=(.022,.128),height=(-.178,-.057))


def main():
    glb, blend = map(Path,sys.argv[sys.argv.index('--')+1:])
    base.Assembly = VK45Assembly
    base.side_profile = soft_profile
    base.surface_mark = engraved_mark
    base.sight_ring = round_aperture
    base.grip, base.stock, base.magazine = grip, stock, magazine
    for name in ('ANODIZED','EDGE','STEEL','POLYMER','VECTOR_CASE','GRIP','PAD','RECESS','INSCRIPTION','RED'):
        setattr(base,name,globals()[name])
    parts, anchors = base.vector_model()
    pieces = dict(parts)
    upper, lower, bolt = pieces['Upper'],pieces['Lower'],pieces['Bolt']
    for side in (-1,1):
        upper.box((side*.046,.047,-.152),(.003,.006,.505),ANODIZED,.0012)
        upper.box((side*.046,-.013,-.274),(.003,.005,.201),RECESS,.0011)
        for z in (-.395,-.258):
            upper.cylinder((side*.046,.032,z),.0048,.003,'x',STEEL,24)
            upper.cylinder((side*.048,.032,z),.0021,.0015,'x',POLISHED,18)
        soft_profile(lower,[(-.236,-.042),(-.142,-.043),(-.126,-.058),(-.188,-.167),
                            (-.211,-.168),(-.229,-.139),(-.249,-.079)],.0028,ANODIZED,side*.052)
        for i in range(5):
            y = -.087-i*.014
            z = -.220+i*.008
            lower.box((side*.054,y,z),(.004,.004,.025),VECTOR_CASE,.0012)
    engraved_mark(upper,'045 / 117',.048,.039,.028,.0020,INSCRIPTION)
    bolt.box((.052,.001,-.203),(.003,.010,.059),POLISHED,.0008)
    for i in range(4):
        bolt.box((-.067,-.009,-.309+i*.007),(.004,.016,.0031),STEEL,.0008)
    pieces['Handguard'] = handguard()
    export_weapon(list(pieces.items()),glb,blend,mounts=anchors,modular=True,view_distance=1.65,
                  finish_shader=finish,finish_projection=project_finishes,
                  finish_rows={POLYMER:1,VECTOR_CASE:1,GRIP:1,RECESS:1,INSCRIPTION:1,RED:1,
                               STEEL:2,POLISHED:2,PAD:3,STIPPLE:4})


if __name__ == '__main__':
    main()
