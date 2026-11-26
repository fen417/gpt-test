"""Build the near-view Black Hawk using the original game rig and axes."""

import math
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.noise import noise_vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE),str(HERE.parent)]
import build_black_hawk as base
from weapon_finish import finish_image

PAINT, DARK, PANEL = base.PAINT, base.DARK, base.PANEL
LINER, METAL, STEEL, RUBBER = base.LINER, base.METAL, base.STEEL, base.RUBBER
CLOTH, TAPE, YELLOW = base.CLOTH, base.TAPE, base.YELLOW
GLASS, HEAT, PRIMER = "Glazing", "Heat-stained alloy", "Weathered primer"


def finish_maps(name, roughness, strength, woven=False):
    size = 256
    normal, rough = [], []
    for j in range(size):
        y = j/size
        for i in range(size):
            x = i/size
            n, m, r = noise_vector((x*110,y*110,strength*42))
            if woven:
                n += .52*math.sin(i*math.pi/2)*math.cos(j*math.pi/3)
                m += .52*math.sin(j*math.pi/2)*math.cos(i*math.pi/3)
            depth = math.hypot(n*strength,m*strength,1)
            normal.append((.5+.5*n*strength/depth,.5+.5*m*strength/depth,.5+.5/depth,1))
            shade = max(0,min(1,roughness+.085*r))
            rough.append((1,shade,0,1))
    return finish_image(name+" grain",normal,size),finish_image(name+" roughness",rough,size)


def surface_pigment(name,color,strength,fabric,_directory):
    size=192
    channels=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    pixels=[]
    for j in range(size):
        y=j/size
        for i in range(size):
            x=i/size
            coarse,_,fine=noise_vector((x*9,y*7,1.6))
            fine+=noise_vector((x*88,y*88,4.9))[1]*.6
            if fabric:
                fine+=.30*math.sin(i*math.pi/2)*math.sin(j*math.pi/2)
            dust=max(0,coarse-.13) if name in (PAINT,DARK,PANEL,PRIMER) else 0
            shade=(coarse*.29+fine*.49)*strength/255
            pixels.append((*(max(0,min(1,c+shade+dust*tint)) for c,tint in
                             zip(channels,(.043,.034,.019))),1))
    image=finish_image(name+" pigment",pixels,size)
    image.colorspace_settings.name='sRGB'
    return image


def materials(directory):
    base.MATERIALS.update({
        PAINT:("#42473b",.83,0), DARK:("#2f342d",.86,0), PANEL:("#505347",.79,0),
        PRIMER:("#766e53",.88,0), LINER:("#30362f",.87,0), METAL:("#292e2e",.57,.66),
        STEEL:("#525a58",.55,.71), HEAT:("#5d5145",.64,.69), RUBBER:("#171b1b",.93,0),
        CLOTH:("#585f50",.96,0), TAPE:("#8d8061",.89,0), GLASS:("#51666a",.24,0),
        "Lettering":("#9b9c86",.82,0), "Displays":("#112125",.57,0),
        "Display symbology":("#8ad0a9",.69,0), YELLOW:("#bd9a57",.73,0),
        "Display sky":("#284752",.54,0), "Display terrain":("#493d31",.57,0),
    })
    base.TEXTURED.update({PAINT:(8,False),DARK:(6,False),PANEL:(7,False),CLOTH:(10,True),
                          RUBBER:(3,False),PRIMER:(6,False),HEAT:(9,False),STEEL:(5,False)})
    base.surface_texture=surface_pigment
    base.make_materials(directory)
    variants = (
        ((PAINT,DARK,PANEL,PRIMER),.82,.12,False),
        ((CLOTH,TAPE,LINER),.93,.32,True),
        ((HEAT,STEEL),.59,.09,False),
    )
    for names,roughness,strength,woven in variants:
        normals,rough = finish_maps(names[0],roughness,strength,woven)
        for name in names:
            mat = bpy.data.materials[name]
            tree = mat.node_tree
            shader = tree.nodes.get("Principled BSDF")
            grain = tree.nodes.new("ShaderNodeTexImage")
            grain.image = normals
            normal = tree.nodes.new("ShaderNodeNormalMap")
            tree.links.new(grain.outputs["Color"],normal.inputs["Color"])
            tree.links.new(normal.outputs["Normal"],shader.inputs["Normal"])
            levels = tree.nodes.new("ShaderNodeTexImage")
            levels.image = rough
            separate = tree.nodes.new("ShaderNodeSeparateColor")
            tree.links.new(levels.outputs["Color"],separate.inputs["Color"])
            tree.links.new(separate.outputs["Green"],shader.inputs["Roughness"])
    for mat in bpy.data.materials:
        mat.use_backface_culling = mat.name not in (GLASS,"Display symbology")
    glass=bpy.data.materials[GLASS]
    glass.diffuse_color=(*base.srgb(base.MATERIALS[GLASS][0]),.21)
    glass.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value=.21
    bpy.data.materials["Display symbology"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value=.95


def body_section(z,w,bottom,sill,header,top):
    return [(x*w,y,z) for x,y in [
        (-.60,bottom),(.60,bottom),(.84,bottom+.047),(.967,bottom+.155),
        (1,bottom+.30),(1,sill),(.951,header),(.8466,.60*header+.40*top),
        (.69,top),(0,top+.015),(-.69,top),(-.8466,.60*header+.40*top),
        (-.951,header),(-1,sill),(-1,bottom+.30),(-.967,bottom+.155),(-.84,bottom+.047),
    ]]


class DetailedAircraft(base.Aircraft):
    def __init__(self, collection):
        super().__init__(0,collection)
        self.sides = 24

    def loft(self,name,material,rings,openings=(),caps=True):
        n=len(rings[0])
        faces=[]
        if caps:
            faces.append(tuple(reversed(range(n))))
        for i in range(len(rings)-1):
            for j in range(n):
                if (i,j) not in openings:
                    k=(j+1)%n
                    faces.append((i*n+j,i*n+k,(i+1)*n+k,(i+1)*n+j))
        if caps:
            offset=(len(rings)-1)*n
            faces.append(tuple(offset+j for j in range(n)))
        return self.mesh(name,material,[p for ring in rings for p in ring],faces,True)

    def turned(self,name,material,a,b,profile,sides=32,hollow=False):
        a,b=Vector(a),Vector(b)
        axis=(b-a).normalized()
        u=axis.cross(Vector((0,1,0) if abs(axis.y)<.9 else (0,0,1))).normalized()
        v=axis.cross(u)
        angles=[i*math.tau/sides for i in range(sides)]
        rings=[[a.lerp(b,t)+radius*(math.cos(phi)*u+math.sin(phi)*v) for phi in angles]
               for t,radius in profile]
        if hollow:
            rings.append(rings[0])
        return self.loft(name,material,rings,caps=not hollow)

    def rod(self,name,mat,a,b,radius,end=None,sides=None):
        tip=radius if end is None else end
        return self.turned(name,mat,a,b,((0,radius*.88),(.09,radius),(.91,tip),(1,tip*.88)),
                           sides or self.sides)

    def window(self,name,corners):
        # The two narrow surrounds fill the original panel boundary. The pane
        # is a single surface so opacity stays the same from both sides.
        corners=[Vector(p) for p in corners]
        centre=sum(corners,Vector())/len(corners)
        normal=(corners[1]-corners[0]).cross(corners[2]-corners[0])
        if normal.dot(centre-Vector((0,2,-2)))<0:
            corners.reverse()
        contour=[]
        for i,p in enumerate(corners):
            contour.extend([p.lerp(corners[i-1],.035),p,p.lerp(corners[(i+1)%len(corners)],.035)])
        n=len(contour)
        def outline(amount):
            return [p.lerp(centre,amount) for p in contour]
        faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        for label,mat,outer,inner in (
            (" painted surround",PANEL,0,.077),(" seal",RUBBER,.075,.121),
        ):
            frame=self.mesh(name+label,mat,outline(outer)+outline(inner),faces)
            thickness=frame.modifiers.new("Two-sided glazing frame",'SOLIDIFY')
            thickness.thickness,thickness.offset=.018,0
        inside=outline(.119)
        self.mesh(name,GLASS,inside,[tuple(range(n))])

    def airframe(self):
        rings=[body_section(*params) for params in [
            (-4.05,.54,1.24,1.48,1.57,1.70),(-3.985,.76,1.115,1.53,1.64,1.79),
            (-3.83,.91,1.035,1.60,1.76,1.94),(-3.56,1.055,.989,1.76,1.91,2.095),
            (-2.44,1.258,.922,1.86,2.80,3.061),(-1.28,1.31,.923,1.49,2.77,3.065),
            (1.47,1.31,.988,1.48,2.77,3.045),(2.51,1.11,1.165,1.67,2.66,2.942),
            (3.16,.835,1.355,1.78,2.59,2.811),(3.51,.66,1.48,1.87,2.54,2.742),
        ]]
        cockpit=[(3,edge) for edge in range(6,12)]+[(4,5),(4,12)]
        doors=[(5,5),(5,12)]
        hull=self.loft("Rounded fuselage skin",PAINT,rings,set(cockpit+doors))
        hull.data.materials.append(bpy.data.materials[LINER])
        lining=hull.modifiers.new("Internal skin and doorway returns",'SOLIDIFY')
        lining.thickness,lining.material_offset,lining.material_offset_rim=.039,1,1
        lining.use_even_offset=True
        # Keep the contours of the side windows and crew doors at the same
        # stations as the original collision and seating layout.
        for edges in ((6,8),(8,9),(9,10),(10,12)):
            l,r=edges
            self.window("Windshield",[rings[3][l],rings[3][r],rings[4][r],rings[4][l]])
        for edge in (5,12):
            self.window("Pilot side pane",[rings[4][edge],rings[4][edge+1],
                                             rings[5][edge+1],rings[5][edge]])
        for i,edge in doors:
            l,r=rings[i][edge:edge+2]
            end_l,end_r=rings[i+1][edge:edge+2]
            for a,b in ((l,end_l),(r,end_r),(l,r),(end_l,end_r)):
                self.rod("Door surround",DARK,a,b,.039,sides=12)
        self.rod("Windshield centre post",PAINT,(0,2.106,-3.56),(0,3.073,-2.44),.031,sides=12)
        for side in (-1,1):
            self.outer_side(side)
        self.tail_boom()
        self.engines()
        self.box("Nose light cradle",DARK,(0,1.115,-3.81),(.42,.085,.26),.032)
        self.box("Recessed nose light","Lamp lens",(0,1.076,-3.82),(.258,.021,.160),.010)

    def outer_side(self,side):
        x=side
        self.panel("Aft parked sliding door",PAINT,[(x*1.287,1.49,1.48),(x*1.306,2.73,1.48),
                   (x*1.177,2.72,3.08),(x*1.204,1.53,3.08)],.109)
        self.box("Sliding door pressed skin",PANEL,(x*1.319,2.078,2.12),(.048,.94,1.10),.039)
        self.box("Sliding door window gasket",DARK,(x*1.347,2.316,2.20),(.039,.43,.82),.027)
        self.window("Sliding door pane",[(x*1.372,2.129,1.83),(x*1.372,2.507,1.83),
                    (x*1.372,2.507,2.57),(x*1.372,2.129,2.57)])
        self.rod("Lower sliding rail",DARK,(x*1.323,1.52,-1.19),(x*1.248,1.55,3.06),.029,sides=12)
        self.rod("Upper sliding rail",DARK,(x*1.253,2.798,-1.20),(x*1.185,2.785,3.00),.026,sides=12)
        self.box("Door latch housing",DARK,(x*1.344,2.017,1.68),(.038,.097,.204),.017)
        self.rod("Latch pull",STEEL,(x*1.379,2.017,1.62),(x*1.379,2.017,1.749),.021)
        self.box("Boarding step",DARK,(x*1.17,1.051,-.66),(.52,.10,1.02),.038)
        for i in range(8):
            self.box("Step anti-slip tread",RUBBER,(x*1.19,1.108,-1.03+i*.102),(.38,.021,.038),.008)
        for z in (-1.032,-.285):
            self.rod("Step brace",STEEL,(x*.98,1.17,z),(x*1.387,1.046,z),.035,sides=12)
        for y,z in ((1.755,1.38),(1.86,-1.32)):
            points=[(x*1.317,y,z),(x*1.397,y+.028,z),(x*1.397,y+.212,z),(x*1.31,y+.248,z)]
            for a,b in zip(points,points[1:]):
                self.rod("Cabin grab handle",YELLOW,a,b,.023,sides=12)
        self.rod("Pitot",STEEL,(x*.887,1.545,-3.73),(x*.961,1.569,-4.20),.021,.011)
        self.rod("Wiper pivot",DARK,(x*.55,2.082,-3.545),(x*.55,2.153,-3.535),.028,sides=12)
        self.rod("Wiper arm",DARK,(x*.55,2.139,-3.535),(x*.548,2.376,-3.258),.016,sides=10)
        self.rod("Wiper blade",RUBBER,(x*.542,2.279,-3.369),(x*.532,2.559,-3.045),.018,sides=10)
        self.box("Position light frame",DARK,(x*1.347,1.644,1.431),(.115,.125,.219),.035)
        self.box("Position light",("Red" if side<0 else "Green")+" navigation lamp",
                 (x*1.401,1.649,1.431),(.047,.082,.145),.021)
        self.box("Service hatch",PANEL,(x*1.243,1.311,1.929),(.050,.264,.58),.036)
        self.box("Main gear fairing",PAINT,(x*1.127,1.202,-1.908),(.344,.319,.667),.099)
        self.rod("Main shock strut",DARK,(x*.94,1.57,-1.83),(x*1.268,.81,-1.92),.106)
        self.rod("Chrome landing strut",STEEL,(x*1.264,.865,-1.92),(x*1.37,.43,-1.91),.076)
        self.rod("Landing gear drag link",METAL,(x*.88,1.105,-2.44),(x*1.38,.443,-1.91),.054)
        self.landing_wheel(x*1.39,.43,-1.91,.431,.232)
        for i in range(21):
            z=-1.24+i*.132
            for y,offset in ((1.452,1.297),(2.81,1.24)):
                self.rod("Airframe flush fastener",PRIMER,(x*offset,y,z),(x*(offset+.013),y,z),.012,sides=6)
        self.label("SECTOR 09",side,1.972,2.276,.105,1.347)
        self.label("RESCUE",side,1.802,2.284,.070,1.347)

    def landing_wheel(self,x,y,z,r,width):
        p=(x-width/2,y,z)
        q=(x+width/2,y,z)
        self.turned("Tyre with rounded shoulder",RUBBER,p,q,
                    [(0,r*.65),(.02,r*.82),(.11,r*.945),(.23,r*.995),
                     (.37,r),(.63,r),(.77,r*.995),(.89,r*.945),(.98,r*.82),(1,r*.65)],40)
        for i in (-.26,0,.26):
            tread=x+i*width
            self.turned("Circumferential tread edge",RUBBER,(tread-.017,y,z),(tread+.017,y,z),
                        [(0,r*.996),(.24,r*1.009),(.76,r*1.009),(1,r*.996)],36)
        for side in (-1,1):
            a=x+side*width*.49
            self.rod("Recessed hub",METAL,(a,y,z),(a+side*.032,y,z),r*.59)
            self.rod("Axle cover",STEEL,(a+side*.018,y,z),(a+side*.047,y,z),r*.235)
            for i in range(8):
                t=i*math.tau/8
                yy,zz=y+math.cos(t)*r*.40,z+math.sin(t)*r*.40
                self.rod("Hub fastener",STEEL,(a+side*.023,yy,zz),(a+side*.044,yy,zz),.016,sides=6)

    def tail_boom(self):
        self.loft("Rounded tail boom",PAINT,[body_section(z,w,b,b+.28,t-.14,t)
                 for z,w,b,t in [(3.33,.675,1.49,2.75),(3.62,.623,1.56,2.70),(4.13,.532,1.66,2.646),
                                 (5.34,.407,1.889,2.64),(6.35,.312,2.064,2.70),(7.05,.253,2.18,2.793),
                                 (7.67,.205,2.24,2.881)]])
        pylon=[(-.10,2.40,6.42),(-.16,2.42,7.68),(-.398,4.47,7.34),(-.407,4.51,7.27),(-.364,4.56,6.97)]
        self.loft("Tail pylon",PAINT,[[Vector(p)+Vector((d,0,0)) for p in pylon] for d in (-.148,-.125,.125,.148)])
        self.panel("Horizontal stabilator",DARK,[(-2.06,2.44,7.28),(-1.90,2.43,6.56),
                   (1.88,2.43,6.56),(2.06,2.44,7.28)],.083)
        self.rod("Tail fork",STEEL,(0,2.30,6.79),(0,.34,6.15),.076)
        self.rod("Tail drag brace",METAL,(0,1.19,6.42),(0,2.16,5.92),.055)
        self.landing_wheel(0,.32,6.15,.318,.199)
        self.rod("Tail gearbox plate",DARK,(-.51,4.01,7.17),(-.22,4.01,7.17),.174)
        self.rod("Tail shaft",STEEL,(-.64,4.01,7.17),(-.11,4.01,7.17),.088)
        for side in (-1,1):
            self.rod("Tail service seam",DARK,(side*.537,2.285,4.12),(side*.311,2.41,6.36),.012,sides=8)
            self.rod("Communications antenna",METAL,(side*.495,1.03,2.07),(side*.565,.43,2.48),.019,.005)
        self.box("Tail position light","Lamp lens",(0,2.66,7.69),(.115,.104,.08),.015)

    def engines(self):
        geometry=[(-1.86,.49,3.33),(-1.62,.69,3.57),(-1.24,.83,3.79),(-.83,.86,3.89),
                  (.47,.83,3.87),(.96,.74,3.77),(1.38,.61,3.58),(1.62,.49,3.39)]
        self.loft("Radiused transmission fairing",DARK,[body_section(z,w,2.97,3.09,t-.15,t)
                  for z,w,t in geometry])
        self.rod("Rotor mast",STEEL,(0,3.59,.08),(0,4.42,.08),.134)
        self.rod("Lower mast fairing",DARK,(0,3.74,.08),(0,4.07,.08),.238,.172)
        for side in (-1,1):
            x=side
            self.turned("Engine nacelle",PAINT,(x*.80,3.327,-1.732),(x*.96,3.351,1.306),
                        [(0,.338),(.032,.402),(.095,.443),(.29,.452),(.72,.423),(.91,.368),(1,.315)],40)
            self.turned("Recessed intake lip",DARK,(x*.80,3.326,-1.80),(x*.805,3.332,-1.453),
                        [(0,.319),(.09,.355),(.38,.395),(.99,.319),(1,.243),(.20,.263),(0,.288)],
                        40,True)
            self.rod("Intake cavity",RUBBER,(x*.802,3.326,-1.781),(x*.806,3.327,-1.715),.266)
            for i in range(9):
                y=(i-4)*.052
                half=math.sqrt(.271**2-y**2)
                self.rod("Intake protective lattice",METAL,(x*.802-half,3.326+y,-1.785),
                         (x*.802+half,3.326+y,-1.785),.009,sides=6)
            self.turned("Turbine exhaust and inner throat",HEAT,(x*.952,3.349,1.10),(x*1.215,3.384,1.884),
                        [(0,.323),(.17,.341),(.65,.304),(.95,.274),(1,.259),
                         (1,.217),(.94,.207),(.67,.194),(.40,.198)],40,True)
            self.rod("Exhaust interior",RUBBER,(x*1.102,3.37,1.512),(x*1.132,3.37,1.60),.201)
            for i in range(8):
                self.box("Cowling vent slot",DARK,(x*1.272,3.473,-.991+i*.106),(.027,.078,.052),.008)
                self.box("Cowling vent lip",PANEL,(x*1.277,3.51,-.988+i*.106),(.026,.018,.067),.004)
            for z in (-1.21,.64,.97):
                self.box("Quarter-turn cowl latch",STEEL,(x*1.236,3.172,z),(.034,.072,.119),.014)

    def rotors(self):
        self.group="MainRotor"
        self.turned("Main hub and bearing cap",METAL,(0,-.111,0),(0,.247,0),
                    [(0,.202),(.18,.233),(.35,.259),(.71,.249),(.86,.198),(1,.184)],32)
        self.rod("Rotor retaining cap",STEEL,(0,.225,0),(0,.254,0),.103)
        self.rod("Swashplate",DARK,(0,-.244,0),(0,-.177,0),.281)
        for i in range(4):
            t=i*math.tau/4
            c,s=math.cos(t),math.sin(t)
            def blade(x,y,z):
                return (c*x+s*z,y,-s*x+c*z)
            stations=[
                (.67,.035,.134,.172,.038),(1.02,.002,.281,.147,.039),
                (1.54,-.050,.312,.138,.031),(5.71,-.107,.292,.082,.024),
                (7.62,-.13,.268,.059,.021),(7.93,-.217,.225,.052,.020),
                (8.15,-.276,.168,.042,.018),
            ]
            profile=[(-.96,0),(-.72,-.55),(-.27,-.60),(.55,-.38),(1,0),(.55,.49),
                     (-.27,.80),(-.72,.52)]
            self.loft("Swept main rotor airfoil",DARK,
                      [[blade(mid+u*width,y+height*v,z) for u,v in profile]
                       for z,mid,width,y,height in stations])
            self.rod("Blade cuff",PANEL,blade(0,.134,.29),blade(.018,.142,.97),.082,.104)
            self.rod("Elastomeric hinge",METAL,blade(0,.148,.15),blade(0,.142,.51),.108,.092)
            self.rod("Pitch rod",STEEL,blade(.21,-.205,.27),blade(.185,.076,.63),.024)
            self.rod("Pitch rod upper bearing",DARK,blade(.175,.063,.59),blade(.175,.133,.59),.044)
            self.rod("Blade retention bolt",STEEL,blade(.005,.064,.68),blade(.005,.227,.68),.042,sides=12)
            self.panel("Blade upper wear strip",PANEL,[blade(*p) for p in
                [(-.300,.085,7.72),(-.350,.071,7.96),(-.126,.067,7.96),(-.081,.085,7.72)]],.006)
        self.group="TailRotor"
        self.turned("Tail hub",STEEL,(.105,0,0),(-.154,0,0),
                    [(0,.094),(.19,.134),(.66,.147),(.85,.13),(1,.079)],24)
        for i in range(4):
            t=i*math.tau/4+.30
            c,s=math.cos(t),math.sin(t)
            def blade(x,y,z):
                return (x,y*c-z*s,y*s+z*c)
            self.loft("Rounded tail airfoil",DARK,[[blade(x,y,z+centre) for x,z in
                        ((-.071,-.083),(-.10,-.045),(-.108,.051),(-.082,.101),(-.063,.069),(-.057,-.045))]
                       for y,centre in ((.13,0),(.28,0),(.88,-.014),(1.073,-.014))])
            self.rod("Tail blade grip",METAL,blade(-.074,.073,0),blade(-.075,.279,0),.044,sides=12)

    def cabin(self):
        self.group="Cabin"
        self.box("Anti-slip cabin floor",LINER,(0,1.345,-.44),(2.355,.090,4.54),.033)
        self.box("Cabin rear bulkhead",LINER,(0,2.045,1.76),(2.16,1.36,.10),.05)
        self.panel("Cockpit footwell",LINER,[(-1.08,1.342,-2.63),(1.08,1.342,-2.63),
                   (.86,1.42,-3.79),(-.86,1.42,-3.79)],.052)
        for x,z,y,yaw,label in (
            (-.59,-2.06,1.64,0,"Pilot"),(.59,-2.06,1.64,0,"Copilot"),
            (-.68,-.64,1.61,math.pi/2,"Gunner"),(.69,.04,1.61,-math.pi/2,"Forward rifleman"),
            (.69,.99,1.61,-math.pi/2,"Aft rifleman"),
        ):
            self.seat(x,z,y,yaw,label)
        for x in (-.59,.59):
            # Match the existing seated arm contact on the pilot cyclic.
            self.rod("Cyclic pedestal",METAL,(x,1.37,-2.39),(x,1.757,-2.43),.037)
            self.rod("Cyclic grip",RUBBER,(x-.078,1.77,-2.45),(x+.075,1.77,-2.45),.035)
            self.box("Cyclic gaiter",RUBBER,(x,1.411,-2.375),(.16,.101,.181),.034)
            self.rod("Pedal link",METAL,(x-.22,1.396,-2.77),(x+.22,1.396,-2.77),.031)
            for p in (x-.143,x+.143):
                self.box("Rudder pedal",STEEL,(p,1.465,-2.784),(.158,.108,.109),.024)
                for i in range(4):
                    self.box("Pedal grip",RUBBER,(p,1.427+i*.024,-2.722),(.124,.011,.018),.005)
        self.box("Centre console base",DARK,(0,1.623,-2.347),(.375,.49,.97),.055)
        self.box("Centre console face",LINER,(0,1.884,-2.353),(.344,.042,.888),.022)
        for r in range(9):
            for c in range(4):
                self.box("Console selector",RUBBER,((c-1.5)*.066,1.912,-2.729+r*.074),
                         (.039,.031,.044),.011)
            if r%2==0:
                self.box("Console annunciator","Display symbology",(-.12,1.931,-2.729+r*.074),
                         (.016,.006,.020),.002)
        self.rod("Pilot collective",METAL,(-.91,1.43,-2.045),(-.925,1.66,-2.351),.026)
        self.rod("Collective grip",RUBBER,(-.925,1.66,-2.351),(-.921,1.728,-2.51),.039)
        self.flight_panel()
        self.cabin_trim()

    def seat(self,x,z,y,yaw,name):
        c,s=math.cos(yaw),math.sin(yaw)
        def p(a,b,d):
            return (x+a*c+d*s,y+b,z-a*s+d*c)
        # The bolt positions and top of the seat pans are shared with the
        # original model. Rounded cushions and webbing are separate pieces.
        def cushion(label,mat,bi,di,w,h,d):
            outline=[(-.82,-1),(.82,-1),(1,-.62),(1,.65),(.82,1),
                     (-.82,1),(-1,.65),(-1,-.62)]
            self.loft(name+" "+label,mat,
                      [[p(u*w*.5*k,bi+v*h*.5*k,di+dd*d) for u,v in outline]
                       for dd,k in ((-.5,.84),(-.39,.96),(-.24,1),(.26,1),(.41,.97),(.5,.88))])
        cushion("seat pan",CLOTH,0,-.04,.48,.14,.508)
        cushion("seat back",CLOTH,.309,.213,.451,.606,.112)
        cushion("headrest",RUBBER,.65,.211,.291,.163,.104)
        for side in (-1,1):
            a=side*.178
            self.rod("Seat frame",STEEL,p(a,-.242,-.175),p(a,-.059,.144),.022,sides=12)
            shoulder=[(.153,.514,.145),(.116,.373,.145),(.078,.213,.145),(.038,.087,.063)]
            self.loft("Woven shoulder strap",TAPE,
                      [[p(side*(a+u),b,d+v) for u,v in
                        ((-.017,-.004),(.017,-.004),(.017,.004),(-.017,.004))] for a,b,d in shoulder])
            self.panel("Woven lap strap",TAPE,[p(side*a,b,d) for a,b,d in
                       ((.226,.074,-.089),(.029,.097,-.100),(.026,.097,-.132),(.222,.073,-.128))],.013)
        cushion("harness buckle",STEEL,.096,-.115,.086,.037,.066)

    def flight_panel(self):
        def point(x,y,offset=0):
            return (x,2.102+y,-2.785-.60*y+offset)
        def tile(label,material,left,bottom,right,top,depth,thickness=.006):
            self.panel(label,material,[point(x,y,depth) for x,y in
                       ((left,bottom),(right,bottom),(right,top),(left,top))],thickness)
        def instrument_label(words,x,y,size,mat="Display symbology"):
            font=bpy.data.curves.new(words,'FONT')
            font.body,font.size=words,size
            font.align_x,font.align_y='CENTER','CENTER'
            obj=bpy.data.objects.new(words,font)
            self.collection.objects.link(obj)
            obj.location=base.xyz(point(x,y,.059))
            obj.rotation_euler.x=math.atan2(1,.60)
            obj.data.materials.append(bpy.data.materials[mat])
            self.parts[self.group].append(obj)
        outline=[(-1.03,-.254),(1.03,-.254),(1.05,.101),(.907,.193),
                 (-.907,.193),(-1.05,.101)]
        self.loft("Curved instrument coaming",DARK,[[point(x*sh,y*sh,depth) for x,y in outline]
                  for depth,sh in ((-.238,.88),(-.195,.97),(-.036,1),(.015,.97))])
        self.rod("Glare shield lip",LINER,point(-.904,.180,.006),point(.904,.180,.006),.034)
        for index,x in enumerate((-.755,-.329,.329,.755)):
            tile("Display inset",RUBBER,x-.192,-.159,x+.192,.129,.024,.031)
            tile("Digital display face","Displays",x-.149,-.121,x+.149,.091,.042)
            for side in (-1,1):
                k=x+side*.17
                for i in range(6):
                    y=-.124+i*.042
                    tile("Display bezel key",LINER,k-.012,y,k+.012,y+.016,.044,.009)
            for i in range(5):
                u=x+(i-2)*.054
                tile("Display softkey",LINER,u-.016,-.146,u+.016,-.132,.044,.008)
            if index in (0,3):
                tile("Attitude sky","Display sky",x-.089,-.016,x+.089,.057,.049,.002)
                tile("Attitude ground","Display terrain",x-.089,-.089,x+.089,-.018,.049,.002)
                instrument_label("PFD",x,.073,.020)
                for side in (-1,1):
                    u=x+side*.111
                    tile("Flight data ribbon","Display symbology",u-.0025,-.102,u+.0025,.066,.046)
                    for tick in range(7):
                        y=-.097+tick*.024
                        tile("Flight data tick","Display symbology",u-side*.009-.006,y,
                             u-side*.009+.006,y+.0028,.046)
                    instrument_label("SPD" if side<0 else "ALT",u,-.104,.012)
                tile("Horizon","Display symbology",x-.084,-.018,x+.084,-.013,.053)
                for i in (-2,-1,1,2):
                    width=.033 if abs(i)==2 else .022
                    y=-.017+i*.025
                    tile("Pitch bar","Display symbology",x-width,y,x+width,y+.0028,.053)
                tile("Reference bug",YELLOW,x-.018,-.029,x+.018,-.025,.054)
            else:
                instrument_label("NAV",x,.073,.020)
                for radius in (.045,.092):
                    for i in range(16):
                        a,b=i*math.tau/16,(i+1)*math.tau/16
                        self.rod("Navigation compass arc","Display symbology",
                                 point(x+radius*math.cos(a),-.018+radius*.74*math.sin(a),.046),
                                 point(x+radius*math.cos(b),-.018+radius*.74*math.sin(b),.046),
                                 .0014,sides=4)
                for i in range(12):
                    a=i*math.tau/12
                    c,s=math.cos(a),math.sin(a)
                    self.rod("Compass tick","Display symbology",
                             point(x+.097*c,-.018+.073*s,.046),
                             point(x+.108*c,-.018+.081*s,.046),.0013,sides=4)
                self.rod("Course line",YELLOW,point(x-.034,-.071,.047),point(x+.052,.043,.047),.0024,sides=6)
                for i in range(3):
                    tile("Navigation scale","Display symbology",x-.131+i*.042,-.104,
                         x-.109+i*.042,-.101,.046)
                instrument_label("MAP",x+.109,-.101,.014)
        tile("Standby indicator bezel",RUBBER,-.103,-.095,.103,.116,.027,.033)
        tile("Standby indicator","Displays",-.069,-.061,.069,.088,.047)
        instrument_label("STBY",0,.068,.018)
        tile("Standby horizon","Display symbology",-.053,.010,.053,.014,.052)
        for x in (-.076,.076):
            a=point(x,-.130,.031)
            self.rod("Panel rotary selector",RUBBER,a,point(x,-.124,.066),.027,sides=12)

    def cabin_trim(self):
        for x in (-.51,.51):
            self.box("Seat tie-down rail",METAL,(x,1.403,.09),(.124,.030,2.61),.010)
            for i in range(10):
                self.box("Recessed tie-down socket",STEEL,(x,1.422,-1.07+i*.255),(.064,.013,.068),.005)
        for z in (-1.14,-.41,.35,1.10):
            self.box("Ceiling acoustic blanket",CLOTH,(0,2.907,z),(1.76,.080,.682),.039)
            for side in (-1,1):
                self.rod("Cabin rib",DARK,(side*1.21,2.755,z-.371),(side*.901,2.88,z-.371),.040)
                self.rod("Cabin rib",DARK,(side*.91,2.887,z-.371),(0,2.889,z-.371),.033)
        for side in (-1,1):
            self.box("Padded rear lining",CLOTH,(side*.55,2.088,1.681),(.98,1.16,.118),.054)
            for z in (-1.14,.25,1.32):
                self.box("Dome light gasket",DARK,(side*.745,2.862,z),(.254,.046,.285),.025)
                self.box("Dome light diffuser","Lamp lens",(side*.745,2.831,z),(.185,.018,.220),.013)
            for x in (side*.53,side*.85):
                self.rod("Cabin lining seam",TAPE,(x,1.57,1.613),(x,2.596,1.613),.009,sides=8)
            for y in (1.76,2.04,2.26,2.51):
                self.rod("Cabin lining seam",TAPE,(side*.104,y,1.614),(side*.985,y,1.614),.007,sides=8)
            self.rod("Handrail mount",METAL,(side*.942,2.84,-1.061),(side*.942,2.698,-1.061),.027)
            self.rod("Overhead cabin handrail",DARK,(side*.942,2.70,-1.064),(side*.942,2.70,1.301),.037)
            self.rod("Handrail mount",METAL,(side*.942,2.70,1.301),(side*.942,2.84,1.301),.027)
        self.box("Stowage case",PANEL,(-.855,1.555,.33),(.49,.378,.38),.046)
        self.box("Stowage catch",STEEL,(-.855,1.663,.122),(.132,.063,.032),.009)
        self.rod("Cabin fire extinguisher","Red navigation lamp",(-.905,1.469,1.54),(-.905,1.839,1.54),.084,.077)
        self.rod("Extinguisher neck",DARK,(-.905,1.833,1.54),(-.905,1.92,1.54),.034)


def build(directory,glb,blend):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    materials(directory)
    source=bpy.data.collections.new("Black Hawk · editable remaster")
    scene.collection.children.link(source)
    model=DetailedAircraft(source)
    model.airframe()
    model.cabin()
    model.systems()
    export=bpy.data.collections.new("Game export")
    scene.collection.children.link(export)
    model.collection=export
    model.export_groups(base.empty("HD",export))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb.resolve()),export_format='GLB',use_selection=True,
                              export_animations=False,export_cameras=False,export_lights=False,
                              export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
    for obj in list(export.all_objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(export)
    anchors={}
    for part,objects in model.parts.items():
        parent=anchors["Minigun"] if part=="MinigunBarrels" else None
        anchor=base.empty(part+" source",source,parent,base.PART_PIVOTS.get(part,(0,0,0)))
        anchors[part]=anchor
        if part=="Minigun":
            anchor.rotation_euler.z=math.pi/2
        for obj in objects:
            obj.parent=anchor
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_distance=22
                area.spaces.active.region_3d.view_location=(0,0,2.15)
                area.spaces.active.shading.color_type='MATERIAL'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()),compress=True)


if __name__=="__main__":
    glb,blend=map(Path,sys.argv[sys.argv.index("--")+1:])
    with tempfile.TemporaryDirectory() as directory:
        build(Path(directory),glb,blend)
