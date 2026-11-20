"""Build the stock DMR-12 and SV-98M game props with separate optics."""
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weapon_mesh import Assembly, export_weapon, side_profile, sight_ring, surface_mark


FDE = (.175,.125,.070)
FDE_EDGE = (.210,.157,.093)
CHASSIS = (.057,.072,.066)
STEEL = (.050,.061,.075)
EDGE = (.122,.148,.156)
POLYMER = (.044,.049,.046)
PAD = (.019,.021,.020)
RECESS = (.010,.014,.017)
GLASS = (.029,.101,.110)
ENGRAVING = (.33,.34,.28)
RED = (.37,.049,.031)


def screw(mesh,x,y,z, radius=.006):
    mesh.cylinder((x,y,z),radius,.004,'x',EDGE,16)
    mesh.box((x+math.copysign(.0022,x),y,z),(.001,.0014,radius),RECESS,0)


def rail(mesh, z, count, height, finish):
    length=count*.020
    mesh.box((0,height-.009,z-length/2+.01),(.049,.016,length),finish,.0015)
    for index in range(count):
        mesh.box((0,height,z-index*.020),(.067,.010,.011),finish,.0012)


def action_controls(mesh, dmr):
    base=POLYMER if dmr else CHASSIS
    side_profile(mesh,[(.037,-.068),(.103,-.068),(.103,-.108),(.143,-.226),
                       (.131,-.246),(.064,-.236),(.023,-.105)],.057,POLYMER)
    side_profile(mesh,[(.050,-.082),(.040,-.126),(-.020,-.133),(-.066,-.123),(-.086,-.089),
                       (-.073,-.075),(-.059,-.106),(-.019,-.118),(.030,-.116),
                        (.040,-.080)],.035,base)
    side_profile(mesh,[(.023,-.069),(.037,-.068),(.025,-.102),(.010,-.117),
                       (.003,-.108),(.015,-.089)],.011,EDGE)
    for side in (-1,1):
        for index in range(10):
            mesh.box((side*.028,-.139-index*.008,.071+index*.003),(.0025,.0026,.047),PAD,.0005)
        screw(mesh,side*.049,-.046,.058,.011)
        mesh.box((side*.053,-.048,.071),(.008,.009,.025),STEEL,.0015)
        mesh.box((side*.049,-.057,.041),(.0014,.0024,.008),RED,0)


def dmr_receiver():
    mesh=Assembly()
    side_profile(mesh,[(-.312,.070),(.139,.070),(.154,.045),(.144,-.037),(.102,-.070),
                       (.032,-.081),(-.061,-.075),(-.089,-.123),(-.225,-.118),
                       (-.257,-.068),(-.316,-.037)],.100,FDE,.0)
    side_profile(mesh,[(.135,-.026),(.111,-.070),(.033,-.081),(-.061,-.075),(-.089,-.123),
                       (-.225,-.118),(-.253,-.063),(-.251,-.026)],.091,POLYMER)
    for side in (-1,1):
        mesh.box((side*.049,.045,-.128),(.006,.016,.252),FDE_EDGE,.002)
        for y,z in ((.029,.109),(-.025,.079),(-.044,-.206),(.032,-.284)):
            screw(mesh,side*.051,y,z)
        mesh.box((side*.053,-.046,-.114),(.012,.013,.055),STEEL,.003)
    mesh.box((.053,.022,-.135),(.009,.024,.153),RECESS,.003)
    mesh.box((.058,-.003,-.136),(.010,.006,.147),STEEL,.0015)
    mesh.box((-.054,.029,-.165),(.008,.013,.165),RECESS,.002)
    mesh.box((0,-.106,-.161),(.104,.021,.136),STEEL,.003)
    action_controls(mesh,True)
    surface_mark(mesh,'DMR-12',-.0508,-.014,-.147,.0036,ENGRAVING)
    rail(mesh,.128,23,.080,STEEL)
    return mesh


def sv_receiver():
    mesh=Assembly()
    side_profile(mesh,[(-.298,.033),(.140,.033),(.161,.005),(.147,-.051),(.109,-.073),
                       (.036,-.079),(-.061,-.074),(-.089,-.118),(-.221,-.119),
                       (-.255,-.076),(-.303,-.048)],.094,CHASSIS)
    mesh.cylinder((0,.034,-.124),.042,.315,'z',STEEL,24)
    mesh.box((.033,.045,-.092),(.033,.038,.144),RECESS,.004)
    mesh.box((.052,.021,-.091),(.007,.006,.140),EDGE,.0018)
    mesh.box((0,-.120,-.153),(.093,.012,.129),STEEL,.002)
    for side in (-1,1):
        mesh.box((side*.046,-.034,-.135),(.004,.011,.221),POLYMER,.0018)
        for y,z in ((-.024,.104),(-.044,.028),(-.047,-.216),(-.023,-.272)):
            screw(mesh,side*.047,y,z)
    action_controls(mesh,False)
    surface_mark(mesh,'SV-98M',-.0478,-.027,-.156,.0035,ENGRAVING)
    rail(mesh,.081,19,.084,STEEL)
    return mesh


def stock(sv):
    mesh=Assembly()
    if sv:
        side_profile(mesh,[(.151,.019),(.247,.020),(.296,.044),(.470,.043),
                          (.467,.018),(.308,.015),(.253,-.009),(.148,-.017)],.063,CHASSIS)
        side_profile(mesh,[(.285,.008),(.313,.008),(.371,-.062),(.448,-.069),(.463,-.036),
                           (.479,-.040),(.474,-.099),(.365,-.103)],.046,CHASSIS)
        mesh.box((0,.061,.356),(.077,.025,.182),POLYMER,.006)
        for z in (.303,.411):
            mesh.cylinder((0,.049,z),.011,.020,'y',EDGE,18)
        mesh.box((0,-.030,.475),(.056,.125,.023),CHASSIS,.003)
        for x in (-.030,.030):
            mesh.cylinder((x,-.074,.451),.019,.012,'x',EDGE,20)
        mesh.cylinder((0,-.100,.432),.014,.055,'y',STEEL,18)
        rear=.494
    else:
        side_profile(mesh,[(.157,.055),(.293,.057),(.350,.041),(.346,.003),(.233,-.025),
                           (.152,-.018)],.082,POLYMER)
        mesh.box((0,.065,.249),(.078,.018,.188),POLYMER,.006)
        side_profile(mesh,[(.266,.031),(.477,.029),(.481,-.005),(.461,-.167),(.418,-.143),
                           (.394,-.062),(.267,-.055)],.069,POLYMER)
        mesh.box((0,-.029,.425),(.074,.035,.065),PAD,.003)
        for x in (-.037,.037):
            screw(mesh,x,-.020,.178,.012)
        rear=.488
    mesh.box((0,-.052,rear),(.070,.178,.026),PAD,.007)
    for index in range(10):
        mesh.box((0,.020-index*.015,rear+.013),(.065,.004,.004),POLYMER,.001)
    return mesh


def forend(sv):
    mesh=Assembly()
    finish=CHASSIS if sv else FDE
    start,end,rail_y=(-.279,-.727,.084) if sv else (-.306,-.705,.080)
    length=start-end
    center=(start+end)/2
    mesh.box((0,-.043,center),(.079,.023,length),finish,.005)
    mesh.box((0,.061,center),(.077,.023,length),finish,.003)
    for side in (-1,1):
        for y in (-.026,.044):
            mesh.box((side*.041,y,center),(.016,.016,length-.006),finish,.003)
        if sv:
            mesh.box((side*.043,.010,center),(.019,.016,length-.019),finish,.002)
        for i in range(8):
            z=start-.019-i*(length-.039)/7
            mesh.box((side*.042,.010,z),(.017,.059,.016 if sv else .027),finish,.003)
            if not sv:
                mesh.box((side*.051,-.022,z),(.005,.020,.029),STEEL,.001)
        if sv:
            mesh.box((side*.048,-.033,center),(.007,.012,length*.71),POLYMER,.003)
        screw(mesh,side*.052,-.003,end+.023,.007)
    for index in range(16):
        mesh.box((0,-.057,end+.027+index*.021),(.058,.009,.011),STEEL,.0013)
    rail(mesh,start-.018,round(length/.020),rail_y,STEEL)
    return mesh


def bolt_parts(sv):
    mesh=Assembly()
    mesh.box((.032,.036,-.089),(.036,.034,.108),EDGE,.004)
    if sv:
        side_profile(mesh,[(.037,.047),(.066,.049),(.090,.006),(.094,-.025),(.072,-.040),
                           (.064,-.013),(.048,.022)],.017,STEEL,.063)
        mesh.cylinder((.073,-.032,.083),.019,.024,'x',EDGE,20)
    else:
        mesh.cylinder((-.061,.030,-.154),.010,.035,'x',STEEL,18)
        mesh.cylinder((-.081,.030,-.154),.014,.014,'x',POLYMER,18)
    return mesh


def magazine(sv):
    mesh=Assembly()
    if sv:
        outline=[(-.212,-.098),(-.094,-.098),(-.090,-.208),(-.216,-.227),
                 (-.226,-.217),(-.220,-.144)]
        center,y=-.157,-.217
    else:
        outline=[(-.220,-.099),(-.097,-.099),(-.099,-.241),(-.221,-.255),(-.232,-.242)]
        center,y=-.161,-.246
    side_profile(mesh,outline,.070,STEEL if not sv else POLYMER)
    mesh.box((0,y-.004,center),(.078,.016,.125),PAD,.003)
    for side in (-1,1):
        for i in range(4):
            z=-.204+i*.029
            mesh.box((side*.035,(y-.112)/2,z),(.003,abs(y+.139),.009),EDGE if not sv else CHASSIS,.001)
        if sv:
            for h in (-.170,-.145):
                mesh.box((side*.037,h,center),(.002,.004,.104),CHASSIS,.0005)
    return mesh


def scope(sv, eye_y):
    optic=Assembly()
    rear,front=(.061,-.437) if sv else (.066,-.300)
    housing=.024 if sv else .022
    lens=.036 if sv else .029
    optic.tube((0,eye_y,0),[(front,lens-.004),(front+.006,lens),(front+.056,lens),
                            (front+.103,housing),(rear-.101,housing),
                            (rear-.071,housing+.010),(rear-.012,housing+.010),(rear,housing+.007)],
               'z',POLYMER,32)
    for z,r in [(front-.002,lens-.005),(rear+.001,housing+.003)]:
        sight_ring(optic,eye_y,z,r-.005,r+.004,.008,EDGE)
        optic.cylinder((0,eye_y,z),r-.0055,.0015,'z',GLASS,28)
    for z in (-.221,-.034) if sv else (-.192,-.036):
        optic.box((0,.100,z),(.073,.022,.042),STEEL,.003)
        for side in (-1,1):
            optic.box((side*.024,.126,z),(.015,.051,.028),POLYMER,.003)
            screw(optic,side*.036,.106,z,.005)
        sight_ring(optic,eye_y,z,housing-.002,housing+.007,.022,STEEL)
    turret_z=-.133
    optic.cylinder((0,eye_y+.026,turret_z),.025,.043,'y',POLYMER,24)
    optic.cylinder((.032,eye_y,turret_z),.018,.035,'x',STEEL,20)
    for i in range(12):
        theta=math.tau*i/12
        optic.box((math.cos(theta)*.024,eye_y+.044,turret_z+math.sin(theta)*.024),
                  (.004,.010,.004),EDGE,.0007)
    if sv:
        sight_ring(optic,eye_y,rear-.066,.032,.037,.014,EDGE)
        optic.box((.031,eye_y+.019,rear-.066),(.021,.014,.020),POLYMER,.003)
    return optic


def barrel(sv,bore,nose):
    tube,brake=Assembly(),Assembly()
    tube.tube((0,bore,0),[(nose+.05,.019),(nose+.10,.022),(-.705,.025),(-.371,.030),
                          (-.257,.036)],'z',STEEL,28)
    width=.027 if sv else .025
    brake.tube((0,bore,0),[(nose,width-.003),(nose+.009,width),(nose+.055,width),
                           (nose+.068,.021)],'z',POLYMER,24)
    sight_ring(brake,bore,nose-.001,.011,width-.004,.005,EDGE)
    brake.cylinder((0,bore,nose-.001),.011,.001,'z',RECESS,18)
    for side in (-1,1):
        for z in (nose+.024,nose+.044):
            brake.box((side*(width-.002),bore,z),(.006,.009,.014),RECESS,.0019)
    return tube,brake


def build(sv):
    bore,nose,eye_y=(.026,-1.057,.179) if sv else (.016,-.920,.167)
    tube,brake=barrel(sv,bore,nose)
    receiver=sv_receiver() if sv else dmr_receiver()
    parts=[('Receiver',receiver),('ForeEnd',forend(sv)),('Stock',stock(sv)),('Optic',scope(sv,eye_y)),
           ('Barrel',tube),('MuzzleDevice',brake),('Magazine',magazine(sv)),('Bolt',bolt_parts(sv))]
    mounts={
        'Mount_Optic':(0,.089,-.128),'Scope_Eye':(0,eye_y,.065),
        'Muzzle_Exit':(0,bore,nose-.002),'Mount_Muzzle':(0,bore,nose+.061),
        'Mount_Bipod':(0,-.060,-.646),'Mount_Foregrip':(0,-.061,-.485),'Mount_Stock':(0,.024,.149),
        'Charge_Grip':(.087,.013,.059) if sv else (-.084,.041,-.155),
    }
    pivots={'Magazine':(0,-.110,-.154)}
    if sv:
        pivots['Bolt']=(0,.036,0)
    return parts,pivots,mounts


if __name__ == '__main__':
    name,glb,blend=sys.argv[sys.argv.index('--')+1:]
    parts,pivots,mounts=build(name=='sv98')
    finishes={POLYMER:1,PAD:1,RECESS:1,GLASS:1,ENGRAVING:1,RED:1,EDGE:2}
    export_weapon(parts,Path(glb),Path(blend),pivots=pivots,mounts=mounts,
                  view_distance=2.25,finish_rows=finishes)
