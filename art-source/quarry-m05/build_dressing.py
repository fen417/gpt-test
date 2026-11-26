"""Build the editable M05 prop layout and the spatially batched game GLB.

Run with Blender --background --python build_dressing.py. Pass -- preview
after the script to render a few review views alongside the export.
"""
from collections import defaultdict
from math import atan2, cos, pi, sin, tau
from pathlib import Path
import json
import random
import subprocess
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/quarry-m05/dressing.blend'
EXPORT = ROOT / 'src/assets/quarry-m05/dressing.glb'
REVIEW = ROOT / '.perf-local/m05-dressing'
LAYOUT_COMMAND = """
import {M05_DRESSING,QUARRY_M05,quarryPoint} from './shared/campaign/quarry-m05.js';
const preview=process.argv.includes('preview');
const terrain=preview?[-480,480,4].map(Number):null;
const heights=terrain?Array.from({length:241},(_,z)=>
  Array.from({length:241},(_,x)=>quarryPoint(x*4-480,z*4-480).y)):null;
console.log(JSON.stringify({props:M05_DRESSING,
  boxes:preview?QUARRY_M05.boxes.filter(b=>!b.visualModel):[],heights}));
"""
is_preview = 'preview' in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else False
layout = json.loads(subprocess.check_output(
    ['node', '--input-type=module', '-e', LAYOUT_COMMAND, '--', *(['preview'] if is_preview else [])],
    cwd=ROOT, text=True))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0

metal_palette = ['#657471', '#52666b', '#a37845', '#92583e', '#73785b', '#8d784a', '#72665b']
cloth_palette = ['#a69a74', '#8d8f66', '#b19c6b', '#8e8979', '#a59880', '#89836b', '#9a8a6e']
rust = '#754c37'
steel = '#474c48'
black = '#363b37'
rubber = '#302f2b'
zinc = '#858d83'
yellow = '#ba973e'
white = '#d2c1a1'
red = '#9a4332'
dark_wood = '#645641'
wood = ('#855942', '#916e48', '#aa875c', '#8b7352', '#967355')
rock = ('#80664d', '#977b5a', '#b39572', '#9a8164', '#c0a57e', '#746454')
leaf = ('#7a7958', '#656b45', '#b09d6c', '#91865b')
glass = '#35484b'


def to_blender(x, y, z):
    return (x, -z, y)


def rgb(hex_value):
    values = [int(hex_value[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(v/12.92 if v < .04045 else ((v+.055)/1.055)**2.4 for v in values)


def surface(name, rough, metalness=0, base='#a69377'):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb(base), 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metalness
    color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Paint'
    mat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


materials = [
    surface('Paint, oxidised steel and galvanised parts', .72, .32),
    surface('Wood, canvas, labels and polymer', .86),
    surface('Limestone, aggregate and arid scrub', .98),
]


class Geometry:
    def __init__(self):
        self.vertices, self.faces, self.colors, self.surfaces = [], [], [], []

    def polyhedra(self, verts, faces, colors, material):
        start = len(self.vertices)
        self.vertices.extend(verts)
        self.faces.extend(tuple(start+i for i in f) for f in faces)
        self.colors.extend([colors]*len(faces) if isinstance(colors, str) else colors)
        self.surfaces.extend([material]*len(faces))

    def box(self, x,y,z,w,h,d,color, material=0, bevel=.024):
        # Four corners on each face, with a narrow planar chamfer.
        u,v,t = w/2,h/2,d/2
        k = min(bevel,u*.4,v*.4,t*.4)
        if min(u,v,t)<.037 or k<.008:
            verts=[(x+dx*u,y+dy*v,z+dz*t) for dy in (-1,1)
                   for dx,dz in ((-1,-1),(1,-1),(1,1),(-1,1))]
            self.polyhedra(verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),
                                  (2,6,7,3),(3,7,4,0)],color,material)
            return
        outline = [(-u+k,-t),(u-k,-t),(u,-t+k),(u,t-k),(u-k,t),(-u+k,t),(-u,t-k),(-u,-t+k)]
        levels = [(-v,k),(-v+k,0),(v-k,0),(v,k)]
        verts = [(x+px*(1-inset/u),y+py,z+pz*(1-inset/t)) for py,inset in levels for px,pz in outline]
        faces = [tuple(range(8))]
        for layer in range(len(levels)-1):
            a=layer*8
            faces.extend((a+i,a+8+i,a+8+(i+1)%8,a+(i+1)%8) for i in range(8))
        faces.append(tuple(range(len(verts)-1,len(verts)-9,-1)))
        self.polyhedra(verts,faces,color,material)

    def beam(self,a,b,w,d,color,material=0):
        a,b=Vector(a),Vector(b)
        axis=(b-a).normalized()
        cross=axis.cross(Vector((0,1,0)))
        if cross.length<.01:
            cross=axis.cross(Vector((1,0,0)))
        x=cross.normalized()*w/2
        z=axis.cross(x).normalized()*d/2
        verts=[tuple(p+u*x+v*z) for p in (a,b) for u,v in ((-1,-1),(1,-1),(1,1),(-1,1))]
        self.polyhedra(verts,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],color,material)

    def cylinder(self,a,b,r,color,material=0,sides=12,inner=0):
        a,b=Vector(a),Vector(b)
        axis=(b-a).normalized()
        cross=axis.cross(Vector((0,1,0)))
        if cross.length<.01:
            cross=axis.cross(Vector((1,0,0)))
        x=cross.normalized()
        z=axis.cross(x)
        levels=[(a,r),(b,r)]
        if inner:
            levels.extend([(b,inner),(a,inner)])
        verts=[tuple(p+(x*cos(i*tau/sides)+z*sin(i*tau/sides))*rad)
               for p,rad in levels for i in range(sides)]
        faces=[]
        for layer in range(len(levels) if inner else 1):
            a,b=layer*sides,((layer+1)%len(levels))*sides
            faces.extend((a+i,a+(i+1)%sides,b+(i+1)%sides,b+i) for i in range(sides))
        if not inner:
            faces.extend([tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))])
        self.polyhedra(verts,faces,color,material)

    def solid_loft(self, levels, centers, sides, colors, rng):
        verts=[]
        for layer,(y,rx,rz) in enumerate(levels):
            cx,cz=centers[layer]
            for i in range(sides):
                phase=i*tau/sides+.07*layer
                t=rng.uniform(.83,1.14)
                verts.append((cx+cos(phase)*rx*t,y+(0 if layer==0 else rng.uniform(-.1,.12)*max(.22,y)),
                              cz+sin(phase)*rz*t))
        faces=[tuple(range(sides))]
        paint=[colors[0]]
        for layer in range(len(levels)-1):
            q=layer*sides
            for i in range(sides):
                j=(i+1)%sides
                faces.extend(((q+i,q+sides+i,q+j),(q+j,q+sides+i,q+sides+j)))
                color=colors[(layer+rng.randrange(2))%len(colors)]
                paint.extend((color,color))
        faces.append(tuple(range(len(verts)-1,len(verts)-sides-1,-1)))
        paint.append(colors[-1])
        self.polyhedra(verts,faces,paint,2)

    def append(self,other,position,yaw,scale):
        ox,oy,oz=position
        c,s=cos(yaw),sin(yaw)
        start=len(self.vertices)
        self.vertices.extend((ox+scale*(x*c+z*s),oy+y*scale,oz+scale*(-x*s+z*c))
                             for x,y,z in other.vertices)
        self.faces.extend(tuple(start+i for i in f) for f in other.faces)
        self.colors.extend(other.colors)
        self.surfaces.extend(other.surfaces)

    def mesh(self,name):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata([to_blender(*v) for v in self.vertices],[],self.faces)
        mesh.update()
        for material in materials:
            mesh.materials.append(material)
        for polygon,material in zip(mesh.polygons,self.surfaces):
            polygon.material_index=material
        attr=mesh.color_attributes.new(name='Paint',type='BYTE_COLOR',domain='CORNER')
        color_cache={color:(*rgb(color),1) for color in set(self.colors)}
        values=[channel for i,color in enumerate(self.colors)
                for _ in self.faces[i] for channel in color_cache[color]]
        attr.data.foreach_set('color',values)
        mesh.color_attributes.active_color=attr
        return mesh


def pallet(g,x=0,y=0,z=0,w=1.42,d=1.14):
    for dx in (-.38,0,.38):
        for dz in (-.37,.37):
            g.box(x+dx*w,y+.065,z+dz*d,.13*w,.13,d*.25,dark_wood,1,.012)
    for i in range(6):
        g.box(x,y+.126,z+(i-2.5)*d/6,w,.045,d/6-.019,wood[i%5],1,.012)


def case(g,x,y,z,w,h,d,color,ammo=False):
    g.box(x,y+h*.49,z,w,h*.91,d,color,1,.032)
    g.box(x,y+h*.86,z,w+.015,h*.12,d+.022,steel,0,.013)
    g.box(x,y+h*.96,z,w*.985,h*.088,d*.96,color,1,.025)
    for side in (-1,1):
        dx=x+side*w*.28
        g.box(dx,y+h*.59,z+d*.506,w*.12,h*.33,.032,black,0,.01)
        for dz in (-1,1):
            g.box(dx,y+h*.97,z+dz*d*.27,.14*w,h*.11,.095,steel,0,.008)
        g.box(x+side*w*.49,y+h*.13,z,.065,h*.28,d+.028,steel,0,.009)
    g.box(x,y+h*.33,z+d*.514,w*.27,.067,.011,white if ammo else yellow,1,.002)
    if ammo:
        for i in range(3):
            g.box(x+w*.14+i*.054,y+h*.34,z+d*.517,.022,.089,.013,white,1,0)


def crate(g,x,y,z,w,h,d,kind):
    g.box(x,y+h*.49,z,w*.98,h*.94,d*.98,dark_wood,1,.016)
    for f in range(5):
        dy=y+(f+.5)*h/5
        c=wood[(f+kind)%len(wood)]
        for side in (-1,1):
            g.box(x,dy,z+side*d*.495,w*.95,h/5-.018,.035,c,1,.008)
            g.box(x+side*w*.495,dy,z,.032,h/5-.016,d*.95,c,1,.008)
    for side in (-1,1):
        for dx in (-.385,.385):
            g.box(x+dx*w,y+h*.5,z+side*d*.514,.143*w,h,.067,wood[(kind+3)%5],1,.011)
            for dy in (.09,.87):
                g.box(x+dx*w,y+h*dy,z+side*(d*.515+.036),.022,.025,.014,zinc,0,.001)
        g.box(x,y+h*.955,z+side*d*.354,w,.09,.16*d,wood[(kind+1)%5],1,.013)
    g.box(x-w*.08,y+h*.64,z+d*.525,w*.19,.063,.013,white,1,0)


def drum(g,x,y,z,color,scale=1,horizontal=False):
    def point(v,u=0,w=0):
        return (x+scale*v,y+scale*(u+.305),z+w*scale) if horizontal else (x+u*scale,y+v*scale,z+w*scale)
    g.cylinder(point(.028),point(.904),.279*scale,color,0,16)
    for height,width in [(0,.035),(.27,.029),(.638,.029),(.902,.034)]:
        g.cylinder(point(height),point(height+width),.301*scale,steel if height in (0,.902) else color,0,16,.269*scale)
    for i in range(2):
        g.cylinder(point(.935,(i-.5)*.24,.073),point(.947,(i-.5)*.24,.073),(.045+i*.011)*scale,zinc,0,8)
    if not horizontal:
        for d in (-1,1):
            g.box(x,y+.52*scale,z+d*.277*scale,.19*scale,.22*scale,.016*scale,white,1,.004)
        for i in range(3):
            g.box(x+(i-1)*.038*scale,y+.51*scale,z+.289*scale,.016*scale,.13*scale,.007*scale,red,1,.001)


def can(g,x,y,z,color):
    g.box(x,y+.18,z,.333,.363,.204,color,0,.034)
    g.box(x,y+.326,z,.258,.065,.187,color,0,.018)
    for x0 in (-.105,.105):
        g.box(x+x0,y+.394,z,.039,.102,.047,color,0,.007)
    g.box(x,y+.447,z,.242,.036,.062,steel,0,.008)
    g.cylinder((x+.105,y+.352,z),(x+.105,y+.388,z),.047,zinc)
    for d in (-1,1):
        g.beam((x-.11,y+.096,z+d*.105),(x+.11,y+.273,z+d*.105),.024,.018,steel)
        g.beam((x-.11,y+.273,z+d*.105),(x+.11,y+.096,z+d*.105),.024,.018,steel)


def roll(g,x,y,z,w,h,d,color,mat=1):
    g.box(x,y+h/2,z,w,h,d,color,mat,min(h*.25,.07))
    for dx in (-.23,.23):
        g.box(x+dx*w,y+h+.002,z,.051*w,.014,d*.87,dark_wood,1,.001)


def spool(g,x,y,z,color):
    axis_y=y+.65
    g.cylinder((x,axis_y,z-.46),(x,axis_y,z+.46),.42,rubber,1,18)
    for i in range(9):
        p=z+(i-4)*.096
        g.cylinder((x,axis_y,p-.025),(x,axis_y,p+.023),.435,steel,0,18,.413)
    for side in (-1,1):
        p=z+side*.49
        g.cylinder((x,axis_y,p-.045),(x,axis_y,p+.045),.64,color,1,18,.106)
        g.cylinder((x,axis_y,p-.064),(x,axis_y,p+.065),.17,steel,0,12,.113)
        for i in range(8):
            a=i*tau/8
            p0=(x+.275*cos(a),axis_y+.275*sin(a),p+side*.047)
            p1=(x+.565*cos(a),axis_y+.565*sin(a),p+side*.047)
            g.beam(p0,p1,.033,.036,dark_wood,1)


def frame(g,x,y,z,w,d,h,color=steel,post=.082):
    for dx in (-.5,.5):
        for dz in (-.5,.5):
            g.box(x+dx*w,y+h*.5,z+dz*d,post,h,post,color,0,.008)
    for dy in (.08,h):
        for side in (-1,1):
            g.box(x+side*w/2,y+dy,z,post,.082,d,color,0,.008)
            g.box(x,y+dy,z+side*d/2,w+post,.082,post,color,0,.008)


def beacon(g,x,y,z,h,big=False):
    g.box(x,y+.08,z,.88,.16,.66,rock[0],2,.045)
    g.box(x,y+h*.48,z,.12,h*.98,.12,steel,0,.018)
    g.box(x,y+h*.95,z,.94,.105,.14,zinc)
    for dx in (-.34,.34):
        g.box(x+dx,y+h,z-.08,.265,.22,.19,steel,0,.026)
        g.box(x+dx,y+h,z-.181,.193,.134,.022,'#e5cc94',1,.009)
    if big:
        g.beam((x-.65,y+.17,z),(x,y+1.25,z),.066,.061,steel)
        g.beam((x+.65,y+.17,z),(x,y+1.25,z),.066,.061,steel)


def machine(g,color,compressor=False):
    d,w=(1.15,2.29) if compressor else (1.50,3.16)
    g.box(0,.29,0,w,.23,d,steel,0,.043)
    for x in (-w*.33,w*.32):
        for z in (-d*.47,d*.47):
            sz=z+(.07 if z>0 else -.07)
            g.cylinder((x,.268,z),(x,.268,sz),.252,rubber,1,14)
            g.cylinder((x,.268,sz),(x,.268,sz+(.018 if z>0 else -.018)),.124,zinc,0,12)
    if compressor:
        g.cylinder((-.91,.82,0),(.79,.82,0),.371,color,0,18)
        for x in (-.69,.47):
            g.cylinder((x,.82,0),(x+.064,.82,0),.382,steel,0,14,.369)
        g.box(-.12,1.227,0,1.03,.185,.61,steel)
        for i in range(8):
            g.box(-.52+i*.112,1.326,0,.042,.025,.58,zinc,0,.005)
        g.cylinder((.74,1.08,-.11),(.74,1.34,-.11),.035,yellow)
        g.cylinder((.74,1.29,-.13),(.74,1.29,-.23),.089,zinc)
        g.box(-.3,1.243,.357,.43,.10,.085,white,1,.008)
    else:
        g.box(0,.995,0,w-.3,1.33,d-.15,color,0,.09)
        g.box(w*.445,1.135,0,.096,.95,d-.25,black,0,.012)
        for x in (-w*.25,w*.20):
            for sign in (-1,1):
                g.box(x,1.03,sign*d*.461,w*.31,.9,.057,color,0,.021)
                g.box(x+w*.121,1.09,sign*d*.5,.082,.23,.035,black)
                for i in range(7):
                    g.box(x,1.34-i*.067,sign*d*.502,w*.24,.024,.031,black,0,.001)
            g.box(x,1.684,-.365,.17,.061,.29,steel)
        g.box(-w*.443,1.34,.19,.118,.37,.65,steel,0,.021)
        for z in (-.03,.17,.34):
            g.cylinder((-w*.464,1.34,z),(-w*.50,1.34,z),.066,white if z<0 else yellow,1,10)
        g.cylinder((-.8,1.39,-.37),(-.8,1.73,-.37),.059,rust,0,10)


stencils = {
    'H':["10001","10001","10001","11111","10001","10001","10001"],
    'A':["01110","10001","10001","11111","10001","10001","10001"],
    'B':["11110","10001","10001","11110","10001","10001","11110"],
    'C':["01111","10000","10000","10000","10000","10000","01111"],
    'M':["10001","11011","10101","10101","10001","10001","10001"],
    'O':["01110","10001","10001","10001","10001","10001","01110"],
    'P':["11110","10001","10001","11110","10000","10000","10000"],
    'T':["11111","00100","00100","00100","00100","00100","00100"],
    '0':["01110","10001","10011","10101","11001","10001","01110"],
    '1':["00100","01100","00100","00100","00100","00100","01110"],
    '2':["01110","10001","00001","00110","01000","10000","11111"],
    '3':["11110","00001","00001","01110","00001","00001","11110"],
    '4':["00010","00110","01010","10010","11111","00010","00010"],
    '6':["01110","10000","10000","11110","10001","10001","01110"],
    '→':["00000","00100","00010","11111","00010","00100","00000"],
    '↑':["00100","01110","10101","00100","00100","00100","00100"],
    '×':["00000","10001","01010","00100","01010","10001","00000"],
}


def stencil(g,x,y,z,text,pitch,color):
    width=len(text)*6-1
    for i,char in enumerate(text):
        if char==' ':
            continue
        for row,line in enumerate(stencils[char]):
            # One quad per contiguous run keeps the plate from adding dozens of boxes.
            start=0
            while start < len(line):
                if line[start]!='1':
                    start+=1
                    continue
                end=start+1
                while end<len(line) and line[end]=='1':
                    end+=1
                a=x+pitch*(i*6+start-width/2)
                b=x+pitch*(i*6+end-width/2)-.002
                low=y+pitch*(3-row)-pitch*.5
                top=low+pitch-.001
                g.polyhedra([(a,low,z),(b,low,z),(b,top,z),(a,top,z)],[(0,1,2,3)],color,1)
                start=end


def sign(g,tag,color):
    g.box(0,.78,0,.093,1.56,.089,steel,0)
    g.box(0,1.58,0,1.22,.61,.063,steel,0,.018)
    g.box(0,1.58,.034,1.166,.553,.020,color,0,.013)
    label={
        'water':'H2O','repair':'P 01','works':'T 02','noentry':'×',
        'check':'C 03','fuel':'04 ↑','exit':'→',
    }.get(tag,'→')
    g.box(0,1.773,.048,1.095,.062,.012,yellow,0,.005)
    stencil(g,0,1.554,.061,label,.037,white)
    for dx in (-.51,.51):
        g.cylinder((dx,1.38,.041),(dx,1.38,.063),.025,zinc,0,6)
    g.box(0,.075,0,.45,.15,.36,rock[0],2,.043)


def fence(g,chain=False):
    w=3.80 if chain else 3.25
    for side in (-1,1):
        x=side*(w/2-.045)
        g.box(x,.085,0,.21,.17,.30,rock[1],2,.025)
        g.box(x,.94 if chain else .56,0,.085,1.87 if chain else 1.02,.085,steel,0,.009)
        g.box(x,1.861 if chain else 1.074,0,.096,.047,.095,yellow,0,.009)
    for y in ([.27,1.70] if chain else [.50,.91]):
        g.box(0,y,0,w-.12,.061,.060,zinc if chain else yellow,0,.009)
    if chain:
        h=1.43
        lo,hi=-w/2+.10,w/2-.10
        # The two diagonal directions share the same post frame and tint.
        for direction in (-1,1):
            for i in range(22):
                x=lo-.98+i*.264
                start=max(0,(lo-x)/h)
                end=min(1,(hi-x)/h)
                if end-start<.04:
                    continue
                g.beam((x+start*h,.27+(start if direction>0 else 1-start)*1.43,direction*.009),
                       (x+end*h,.27+(end if direction>0 else 1-end)*1.43,direction*.009),
                       .013,.013,zinc)


def shade(g,color):
    w,d,h=4.75,3.52,2.52
    for sx in (-1,1):
        for sz in (-1,1):
            x,z=sx*w*.45,sz*d*.45
            g.box(x,.05,z,.28,.1,.27,rock[1],2,.038)
            g.beam((x,0,z),(x,2.48,z),.072,.072,steel)
            g.beam((x,1.92,z),(x+sx*.72,.052,z+sz*.43),.011,.011,cloth_palette[2],1)
    verts=[(-w/2,h,-d/2),(w/2,h,-d/2),(w/2,h,d/2),(-w/2,h,d/2),
           (0,h+.46,-d/2),(0,h+.46,d/2),(-w/2,h-.124,-d/2),
           (w/2,h-.124,-d/2),(w/2,h-.124,d/2),(-w/2,h-.124,d/2)]
    faces=[(0,3,5,4),(1,4,5,2),(0,4,1),(3,2,5),(0,6,9,3),(2,8,7,1)]
    g.polyhedra(verts,faces,color,1)
    g.polyhedra(verts,[tuple(reversed(f)) for f in faces],color,1)
    for dz in (-d*.40,-d*.2,0,d*.2,d*.4):
        g.beam((-w/2,h,dz),(0,h+.46,dz),.018,.023,dark_wood,1)
        g.beam((w/2,h,dz),(0,h+.46,dz),.018,.023,dark_wood,1)


def office(g,color):
    w,d=6.82,3.17
    g.box(0,.216,0,w,.31,d,steel,0,.052)
    for x in (-2.62,2.62):
        for z in (-1.19,1.19):
            g.box(x,.084,z,.61,.168,.52,rock[1],2,.032)
    g.box(0,1.72,0,w,2.78,d,color,0,.047)
    g.box(0,3.135,0,w+.07,.114,d+.099,steel,0,.031)
    g.box(0,3.246,0,w+.18,.123,d+.176,zinc,0,.024)
    for x in [-3.22+i*.19 for i in range(35)]:
        for z in (-d*.501,d*.501):
            g.box(x,1.72,z,.046,2.71,.037,color,0,.005)
    for z in (-d*.531,d*.531):
        for x in (-1.91,1.83):
            g.box(x,2.04,z,1.52,.85,.106,steel,0,.014)
            g.box(x,2.04,z+(0.066 if z>0 else -.066),1.40,.71,.049,glass,0,.021)
            g.box(x+.09,2.04,z+(.096 if z>0 else -.096),.052,.74,.039,zinc)
    g.box(-.121,1.46,d*.525,1.12,2.26,.13,steel,0,.036)
    g.box(-.121,1.45,d*.556,.95,2.12,.061,color,0,.021)
    g.box(.20,1.36,d*.585,.14,.044,.050,zinc)
    g.box(0,.138,d*.60,1.32,.26,.35,steel,0,.032)
    for sign in (-1,1):
        for i in range(9):
            g.box(sign*w*.505,1.29,-1.24+i*.29,.039,1.74,.059,color,0,.009)
    g.box(-2.1,.722,-d*.551,.98,.64,.29,steel,0,.047)
    for i in range(5):
        g.box(-2.1,.535+i*.064,-d*.603,.844,.028,.036,zinc,0,.002)
    g.box(2.22,2.85,d*.521,.45,.15,.083,yellow,0,.014)


def hopper(g,color):
    frame(g,0,.08,0,5.70,3.86,3.59,steel,.238)
    for side in (-1,1):
        for z in (-1.92,1.92):
            g.beam((side*2.84,.15,z),(-side*2.84,3.54,z),.104,.107,rust)
        g.beam((side*2.85,.15,1.92),(side*2.85,3.63,-1.92),.116,.105,steel)
    levels=[(2.84,1.29,.91),(3.46,1.52,1.03),(5.74,2.99,2.13),(6.18,2.99,2.13)]
    verts=[(dx*rx,y,dz*rz) for y,rx,rz in levels for dx,dz in ((-1,-1),(1,-1),(1,1),(-1,1))]
    faces=[]
    for layer in range(3):
        q=layer*4
        faces.extend((q+i,q+4+i,q+4+(i+1)%4,q+(i+1)%4) for i in range(4))
    g.polyhedra(verts,faces,[rust,steel,rust,steel]+[color]*8,0)
    g.box(0,5.88,0,5.73,.065,4.04,black,0,.015)
    for z in (-2.09,2.09):
        g.box(0,6.27,z,6.11,.183,.132,steel,0,.027)
    for x in (-3.016,3.016):
        g.box(x,6.27,0,.159,.183,4.25,steel,0,.027)
    for x in (-.3,.26):
        for y in range(1,12):
            g.box(x,y*.29,2.085,.054,.056,.071,yellow,0,.007)
        g.box(x,1.90,2.10,.061,3.8,.063,yellow,0)
    for y in range(1,12):
        g.box(-.019,y*.29,2.119,.58,.053,.045,yellow,0,.004)
    g.box(1.09,4.40,1.49,1.04,.53,.057,yellow,0,.021)
    stencil(g,1.09,4.40,1.527,'06',.055,black)


def props_geometry(kind,variant,tag):
    g=Geometry()
    paint=metal_palette[variant]
    cloth=cloth_palette[variant]
    rng=random.Random(701+variant*13)
    mat_wood=wood[variant%5]
    if kind in ('case','caseStack','ammo'):
        if kind=='caseStack':
            pallet(g,w=1.22,d=.82)
            case(g,0,.150,0,1.19,.58,.76,paint)
            case(g,-.098,.724,.034,.963,.51,.63,cloth,True)
            case(g,.128,1.223,-.10,.66,.15,.43,paint)
        elif kind=='ammo':
            case(g,0,0,0,.978,.427,.489,paint,True)
        else:
            case(g,0,0,0,1.15,.533,.72,paint)
    elif kind in ('crate','crateStack'):
        if kind=='crateStack':
            pallet(g,w=1.47,d=1.14)
            crate(g,0,.145,0,1.43,1.03,1.10,variant)
            crate(g,-.24,1.17,.06,.85,.827,.87,variant+2)
        else:
            crate(g,0,0,0,1.30,1.035,1.02,variant)
    elif kind=='pallet':
        pallet(g)
    elif kind in ('oil','oilRack','barrelSide'):
        if kind=='oilRack':
            pallet(g,w=1.36,d=1.25)
            for x,z,i in [(-.338,-.306,0),(.338,-.306,1),(-.338,.306,2),(.338,.306,3)]:
                drum(g,x,.148,z,metal_palette[(variant+(i%3==0))%7],.93)
            g.box(0,.465,0,1.365,.046,1.267,steel,0,.009)
        else:
            drum(g,-.465 if kind=='barrelSide' else 0,0,0,paint,horizontal=kind=='barrelSide')
    elif kind=='can':
        can(g,0,0,0,paint)
    elif kind=='hose':
        for layer in range(3):
            prev=None
            for i in range(36):
                angle=tau*i/34
                r=.75-layer*.10+sin(angle*2)*.027
                at=(cos(angle)*r,.035+layer*.023,sin(angle)*r*.91)
                if prev:
                    g.cylinder(prev,at,.036,rubber,1,6)
                prev=at
        g.cylinder((.7,.042,.04),(.864,.042,.12),.053,zinc,0,8)
    elif kind=='water':
        pallet(g,w=1.22,d=1.045)
        g.box(0,.655,0,1.12,1.003,.956,'#a79e80',1,.078)
        frame(g,0,.144,0,1.18,1.012,1.135,zinc,.036)
        for y in (.443,.735,1.024):
            for side in (-1,1):
                g.box(side*.597,y,0,.036,.030,1.045,zinc)
                g.box(0,y,side*.514,1.19,.030,.034,zinc)
        for x in (-.301,0,.301):
            for z in (-.513,.513):
                g.box(x,.73,z,.033,1.055,.033,zinc,0,.003)
        g.cylinder((0,1.148,.13),(0,1.205,.13),.153,steel,0,12)
        g.cylinder((.25,.35,.469),(.25,.35,.571),.061,red,0,10)
    elif kind=='sackPile':
        for layer in range(3):
            for j in range(3-layer//2):
                roll(g,(j-(2-layer//2)*.5)*.713+layer*.051,.025+layer*.203,
                     (j%2-.5)*.29+layer*.14,.73,.227,1.09,cloth_palette[(variant+j+layer)%7])
    elif kind=='spool':
        spool(g,0,0,0,mat_wood)
    elif kind=='pipeRack':
        for x in (-1.41,1.41):
            g.box(x,.115,0,.21,.23,1.89,mat_wood,1,.025)
        for y,offset,count in [(.476,0,3),(.947,.27,2)]:
            for i in range(count):
                z=(i-1)*.57+offset
                g.cylinder((-1.92,y,z),(1.92,y,z),.276,paint,0,14,.222)
                for x in (-1.92,1.82):
                    g.cylinder((x,y,z),(x+.094,y,z),.305,rust,0,14,.223)
        for x in (-1.45,1.45):
            for z in (-.923,.923):
                g.box(x,.509,z,.125,1.018,.09,steel)
    elif kind=='skip':
        g.box(0,.2,0,2.21,.182,1.36,steel,0,.041)
        verts=[(x*w,y,z*d) for y,w,d in [(.26,1.03,.59),(1.013,1.265,.817)]
               for x,z in ((-1,-1),(1,-1),(1,1),(-1,1))]
        faces=[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
        g.polyhedra(verts,faces,paint,0)
        g.polyhedra(verts,[tuple(reversed(f)) for f in faces],rust,0)
        for z in (-.82,.82):
            g.box(0,1.033,z,2.61,.10,.071,steel)
            for x in (-.78,0,.78):
                g.beam((x,.28,z*.74),(x,1.02,z),.084,.103,paint)
        for x in (-1.25,1.25):
            g.box(x,1.033,0,.069,.095,1.62,steel)
        g.box(-.23,.89,.735,.55,.076,.025,yellow)
    elif kind in ('screenRack','shelf'):
        rack=kind=='screenRack'
        w,d,h=(2.47,1.43,1.83) if rack else (2.18,.55,2.08)
        frame(g,0,0,0,w,d,h,steel,.063)
        if rack:
            for i in range(4):
                g.beam((-1.22,.23+i*.13,-.49),(-1.22,1.54+i*.04,.35),.043,.058,zinc)
                g.beam((1.22,.23+i*.13,-.49),(1.22,1.54+i*.04,.35),.043,.058,zinc)
                for j in range(9):
                    g.beam((-1.22,.27+j*.138+i*.09,-.49+j*.093),(1.22,.27+j*.138+i*.09,-.49+j*.093),
                           .035,.025,paint if i%2 else rust)
        else:
            for i in range(4):
                g.box(0,.16+i*.565,0,w,.075,d,mat_wood,1,.014)
            for i in range(3):
                case(g,-.53,.209+i*.56,0,.81,.287,.44,cloth)
                can(g,.51,.21+i*.56,0,metal_palette[(variant+i)%7])
            g.box(.61,1.91,0,.74,.14,.34,steel)
    elif kind in ('scrap','rubble','stone','aggregate','blockStack'):
        if kind=='blockStack':
            for layer in range(2):
                for j in range(2):
                    g.box((-1 if j==0 else 1)*(.96-layer*.13),.47+layer*.94,(j-.5)*.21,
                          1.75 if layer else 1.9,.9,1.84-layer*.27,rock[(j+variant+layer)%len(rock)],2,.087)
        elif kind=='aggregate':
            colors=tuple(rock[(variant+i)%len(rock)] for i in range(len(rock)))
            g.solid_loft([(-.22,4.78,3.43),(.41,4.52,3.31),(1.03,3.57,2.61),(1.73,2.41,1.93),
                         (2.42,1.14,.86),(2.75,.45,.39)],[(.1,0),(.1,0),(.09,-.12),(.4,.12),(.35,.31),(.4,.5)],
                        12,colors,rng)
        elif kind=='scrap':
            for i in range(11):
                dx=rng.uniform(-1.13,1.13); dz=rng.uniform(-.55,.55)
                g.beam((dx-.25,.13+i*.032,dz-.11),(dx+.42,.21+i*.04,dz+.15),
                       .147,.058,metal_palette[(variant+i)%7])
            g.cylinder((.26,.55,-.45),(.4,.62,.43),.172,rust,0,10,.125)
            g.box(-.46,.334,-.05,1.07,.06,.74,steel,0,.021)
        else:
            for _ in range(7 if kind=='rubble' else 1):
                rx=rng.uniform(.13,.30) if kind=='stone' else rng.uniform(.14,.48)
                rz=rx*rng.uniform(.64,.98)
                h=rx*rng.uniform(.43,.86)
                x,z=(0,0) if kind=='stone' else (rng.uniform(-1.03,1.03),rng.uniform(-.74,.74))
                g.solid_loft([(-.025,rx*.75,rz*.73),(h*.53,rx,rz),(h,rx*.51,rz*.63)],
                             [(x,z),(x,z),(x+.1*rx,z)],6,rock,rng)
    elif kind=='scrub':
        for i in range(18):
            a=rng.random()*tau
            r=rng.uniform(.055,.335)
            h=rng.uniform(.073,.352)
            cx,cz=cos(a)*r,sin(a)*r
            width=rng.uniform(.028,.077)
            vertices=[(0,-.013,0),(cx*.62-sin(a)*width,h*.53,cz*.62+cos(a)*width),(cx,h,cz),
                      (cx*.62+sin(a)*width,h*.53,cz*.62-cos(a)*width)]
            g.polyhedra(vertices,[(0,1,2,3),(3,2,1,0)],leaf[i%len(leaf)],2)
    elif kind=='bench':
        frame(g,0,0,0,2.29,.72,.92,steel,.074)
        g.box(0,.95,0,2.53,.135,.89,mat_wood,1,.037)
        g.box(-.48,.413,.1,1.24,.619,.62,paint,0,.031)
        for i in range(3):
            g.box(-.48,.27+i*.178,.433,1.17,.158,.035,paint,0,.009)
            g.box(-.48,.27+i*.178,.465,.19,.027,.044,zinc,0,.002)
        g.box(.91,1.083,-.258,.324,.159,.211,steel,0,.023)
        g.box(.92,1.207,-.258,.227,.093,.15,steel)
        g.box(.93,1.274,-.25,.108,.057,.211,red)
        g.box(-.91,1.059,.19,.37,.083,.25,paint)
        g.beam((-.30,1.028,.21),(.17,1.056,.26),.037,.022,zinc)
    elif kind=='locker':
        g.box(0,.946,0,1.54,1.87,.558,paint,0,.039)
        for x in (-.514,0,.514):
            g.box(x,.955,.28,.495,1.764,.045,paint,0,.011)
            for i in range(5):
                g.box(x,1.594+i*.035,.305,.315,.014,.014,steel,0,.001)
            g.box(x+.139,.985,.321,.052,.197,.028,steel,0,.008)
            g.box(x+.061,1.41,.308,.098,.065,.013,white,1,.002)
    elif kind in ('compressor','generator'):
        machine(g,paint,compressor=kind=='compressor')
    elif kind in ('mast','flood'):
        beacon(g,0,0,0,5.62 if kind=='mast' else 4.39,kind=='mast')
    elif kind in ('bollard','stakes','curb','barrier'):
        if kind=='bollard':
            g.box(0,.041,0,.265,.082,.265,rock[1],2,.019)
            g.cylinder((0,.042,0),(0,.98,0),.092,yellow,0,10)
            g.cylinder((0,.605,0),(0,.693,0),.095,black,0,10)
            g.cylinder((0,.937,0),(0,1.006,0),.096,black,0,10)
        elif kind=='stakes':
            for x in (-.66,.64):
                g.box(x,.381,0,.072,.761,.079,zinc)
                g.box(x,.640,.014,.082,.163,.086,red)
            g.box(0,.472,0,1.42,.067,.077,yellow,0,.014)
        else:
            w,d,h=(2.34,.65,.845) if kind=='barrier' else (2.95,.5,.17)
            g.box(0,h*.29,0,w,h*.58,d,rock[1],2,.048)
            g.box(0,h*.72,0,w*.96,h*.56,d*.73,rock[2],2,.068)
            for x in (-.81,.81):
                for z in (-d*.376,d*.376):
                    g.box(x,h*.71,z,.32,h*.29,.024,yellow,1,.005)
    elif kind in ('rail','chain'):
        fence(g,kind=='chain')
    elif kind=='board':
        sign(g,tag,paint)
    elif kind=='survey':
        top=(0,1.35,0)
        for i in range(3):
            a=i*tau/3-.16
            x,z=cos(a)*.585,sin(a)*.585
            g.beam((x,.04,z),top,.068,.059,zinc)
            g.box(x,.042,z,.11,.083,.13,steel)
        g.box(0,1.372,0,.393,.154,.231,paint,0,.022)
        g.cylinder((0,1.401,-.141),(0,1.401,.13),.085,black,0,10)
        g.cylinder((0,1.401,-.153),(0,1.401,-.134),.057,glass,0,10)
    elif kind=='shade':
        shade(g,cloth)
    elif kind=='office':
        office(g,paint)
    elif kind=='hopper':
        hopper(g,paint)
    else:
        raise ValueError(kind)
    return g


def chunk(items,meshes):
    batches=defaultdict(Geometry)
    for item in items:
        cx,cz=round(item['x']/48),round(item['z']/48)
        key=variant_key(item)
        batch=batches[(cx,cz,item['detail'])]
        batch.append(meshes[key],(item['x']-cx*48,item['y'],item['z']-cz*48),item['yaw'],item['scale'])
    return batches


def variant_key(item):
    return (item['type'],item['variant'],item['tag'])


def collection(name,parent):
    out=bpy.data.collections.new(name)
    parent.children.link(out)
    return out


def object_for(mesh,name,receiver):
    obj=bpy.data.objects.new(name,mesh)
    receiver.objects.link(obj)
    return obj


items=layout['props']
kit={}
for item in items:
    key=variant_key(item)
    if key not in kit:
        kit[key]=props_geometry(*key)

# Linked source instances stay editable in Blender. Only the spatially
# batched copies go into the game bundle.
source_root=collection('Editable quarry set dressing',scene.collection)
zones={zone:collection(zone,source_root) for zone in sorted({item['zone'] for item in items})}
source_meshes={key:geom.mesh('-'.join(str(part) for part in key if part!='')) for key,geom in kit.items()}
for item in items:
    obj=object_for(source_meshes[variant_key(item)],item['id'],zones[item['zone']])
    obj.location=to_blender(item['x'],item['y'],item['z'])
    obj.rotation_euler.z=item['yaw']
    obj.scale=(item['scale'],)*3

for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_location=Vector((-38,-23,10))
            area.spaces.active.region_3d.view_distance=192
            area.spaces.active.shading.color_type='VERTEX'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

root=collection('Game export',scene.collection)
batches=chunk(items,kit)
exported_triangles=0
for (cx,cz,detail),geom in sorted(batches.items()):
    name=f"m05_{'detail' if detail else 'set'}_{cx}_{cz}"
    obj=object_for(geom.mesh(name),name,root)
    obj.location=to_blender(cx*48,0,cz*48)
    obj.select_set(True)
    exported_triangles+=sum(len(face)-2 for face in geom.faces)
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                          export_yup=True,export_materials='EXPORT')
subprocess.run(['node','scripts/pack-map.mjs',str(EXPORT.parent),str(EXPORT.parent),EXPORT.stem],
               cwd=ROOT, check=True)
print(f'M05 dressing: {len(items)} props, {len(batches)} batches, {exported_triangles} triangles before glTF')

if is_preview:
    exec((SOURCE.parent/'preview_dressing.py').read_text(encoding='utf-8'))
