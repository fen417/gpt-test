"""Build the game medic's portable defibrillator and separate hand paddles."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile


SHELL = (.087,.106,.105)
EDGE = (.164,.191,.188)
AMBER = (.552,.245,.051)
AMBER_DARK = (.285,.123,.031)
RUBBER = (.020,.025,.024)
STEEL = (.298,.360,.359)
GLASS = (.014,.057,.044)
GRID = (.035,.102,.078)
SIGNAL = (.218,.722,.494)
IVORY = (.746,.739,.657)
RED = (.531,.069,.041)
GREEN = (.122,.456,.270)


def screen_geometry():
    controls,display,signal,charge=Assembly(),Assembly(),Assembly(),Assembly()
    controls.box((-.037,.049,-.014),(.162,.018,.108),SHELL,.003)
    controls.box((-.037,.053,-.014),(.163,.012,.112),RUBBER,.003)
    display.box((-.037,.061,-.014),(.148,.006,.094),GLASS,.003)
    for x in [-.101,-.082,-.063,-.044,-.025,-.006,.013,.030]:
        display.box((x,.0642,-.013),(.0009,.0007,.072),GRID,0)
    for z in [-.046,-.032,-.018,-.004,.010,.024]:
        display.box((-.037,.0642,z),(.136,.0007,.0011),GRID,0)
    waveform=[(-.100,-.007),(-.083,-.007),(-.078,-.012),(-.067,-.012),(-.062,-.004),
              (-.056,-.006),(-.051,.013),(-.043,-.041),(-.034,.023),(-.027,-.008),
              (-.016,-.011),(-.006,-.009),(.004,-.016),(.012,-.015),(.017,-.007),(.028,-.007)]
    for a,b in zip(waveform,waveform[1:]):
        dx,dz=b[0]-a[0],b[1]-a[1]
        length=math.hypot(dx,dz)
        nx,nz=-dz*.0012/length,dx*.0012/length
        points=[(a[0]+nx,.065,a[1]+nz),(b[0]+nx,.065,b[1]+nz),
                (b[0]-nx,.065,b[1]-nz),(a[0]-nx,.065,a[1]-nz)]
        signal.add(points,[(0,1,2,3)],SIGNAL)
    for x in [-.102,-.095,-.088]:
        display.box((x,.065,.026),(.004,.001,.009),SIGNAL,.0002)
    for i in range(5):
        charge.box((-.006+i*.007,.065,.026),(.0048,.001,.010),AMBER,.0001)
    controls.box((.074,.054,-.012),(.040,.013,.103),SHELL,.003)
    controls.cylinder((.075,.064,-.036),.015,.018,'y',AMBER,20)
    controls.cylinder((.075,.074,-.036),.008,.003,'y',AMBER_DARK,18)
    for x in (.063,.083):
        controls.box((x,.065,.004),(.013,.009,.016),IVORY,.002)
    controls.cylinder((.075,.064,.033),.011,.011,'y',GREEN,18)
    # Tilt the control face toward the medic. Low side at the trailing edge.
    angle=.19
    for mesh in (controls,display,signal,charge):
        mesh.vertices=[(x,.051+(y-.051)*math.cos(angle)-z*math.sin(angle),
                        (y-.051)*math.sin(angle)+z*math.cos(angle)) for x,y,z in mesh.vertices]
    return [('Controls',controls),('Display',display),('Waveform',signal),('ChargeIndicator',charge)]


def monitor():
    body=Assembly()
    body.box((0,.000,0),(.253,.093,.180),SHELL,.012)
    body.box((0,-.040,0),(.244,.026,.168),RUBBER,.008)
    body.box((0,.044,-.008),(.220,.021,.143),EDGE,.004)
    for side in (-1,1):
        body.box((side*.123,-.004,0),(.025,.069,.165),RUBBER,.007)
        body.box((side*.124,.019,0),(.029,.019,.156),AMBER,.004)
        for z in (-.068,.068):
            body.box((side*.112,.015,z),(.031,.076,.039),AMBER,.006)
            body.box((side*.112,-.047,z),(.026,.015,.036),RUBBER,.004)
        for i in range(8):
            body.box((side*.137,-.009,-.047+i*.013),(.003,.014,.005),EDGE,.001)
    for x in (-.067,.067):
        body.cylinder((x,.015,-.089),.013,.020,'z',RUBBER,20)
        body.cylinder((x,.015,-.101),.010,.014,'z',STEEL,18)
        body.cylinder((x,.015,-.109),.008,.007,'z',AMBER_DARK if x<0 else RED,16)
    body.box((0,-.002,-.091),(.080,.032,.006),RUBBER,.002)
    for i in range(8):
        body.box((-.030+i*.008,-.002,-.095),(.004,.021,.003),EDGE,.0006)
    for x in (-.076,.076):
        body.box((x,.025,.085),(.026,.016,.023),EDGE,.002)
    body.box((0,.026,.101),(.154,.016,.015),RUBBER,.003)
    for i in range(9):
        body.box((-.059+i*.015,.035,.102),(.008,.004,.012),SHELL,.001)
    return [('MonitorHousing',body),*screen_geometry()]


def paddle(side):
    shell=Assembly()
    shell.box((0,-.005,-.005),(.105,.019,.129),STEEL,.009)
    shell.box((0,.006,-.005),(.112,.021,.141),RUBBER,.008)
    shell.box((0,.019,-.005),(.106,.022,.135),AMBER,.006)
    shell.box((0,.026,-.007),(.087,.012,.118),AMBER_DARK,.004)
    shell.box((0,-.015,-.005),(.085,.005,.105),STEEL,.004)
    for x in (-.032,.032):
        for z in (-.049,.040):
            shell.cylinder((x,-.016,z),.004,.002,'y',EDGE,12)
    side_profile(shell,[(-.058,.025),(-.049,.073),(-.033,.098),(.044,.096),(.058,.073),
                        (.067,.027),(.048,.030),(.039,.066),(-.038,.067),(-.043,.027)],
                 .041,RUBBER)
    shell.box((0,.085,.004),(.043,.022,.100),RUBBER,.006)
    for i in range(8):
        shell.box((0,.097,-.033+i*.010),(.034,.0038,.0045),SHELL,.001)
    shell.box((side*.025,.055,-.043),(.013,.018,.025),AMBER_DARK,.002)
    shell.box((side*.031,.059,-.043),(.006,.012,.016),GREEN if side<0 else RED,.002)
    shell.cylinder((0,.025,.074),.010,.030,'z',RUBBER,18)
    for z in (.071,.079,.087):
        shell.cylinder((0,.025,z),.011,.003,'z',SHELL,18)
    return shell


if __name__ == '__main__':
    glb,blend=map(Path,sys.argv[sys.argv.index('--')+1:])
    parts=monitor()
    groups={'Monitor':((0,-.092,.015),[name for name,_ in parts]+['MonitorCableLeft','MonitorCableRight'])}
    mounts={'MonitorCableLeft':(-.067,.015,-.113),'MonitorCableRight':(.067,.015,-.113)}
    for side,name in [(-1,'Left'),(1,'Right')]:
        part=f'{name}PaddleHousing'
        anchor=f'{name}Cable'
        parts.append((part,paddle(side)))
        groups[f'{name}Paddle']=((side*.17,0,-.22),[part,anchor])
        mounts[anchor]=(0,.025,.091)
    finishes={SHELL:1,EDGE:1,AMBER:1,AMBER_DARK:1,RUBBER:1,STEEL:2,
              GLASS:1,GRID:1,SIGNAL:1,IVORY:1,RED:1,GREEN:1}
    export_weapon(parts,glb,blend,mounts=mounts,groups=groups,finish_rows=finishes,view_distance=.78)
