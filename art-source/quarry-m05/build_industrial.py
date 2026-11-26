"""Build the original M05 quarry props. Blender: run in background with --python."""
from pathlib import Path
import json
import math
import subprocess
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/quarry-m05'
EXPORT = ROOT / 'src/assets/quarry-m05/industrial.glb'
layout = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {QUARRY_M05,M05_SITES} from './shared/campaign/quarry-m05.js';"
    "console.log(JSON.stringify({boxes:QUARRY_M05.boxes,roads:QUARRY_M05.roads,sites:M05_SITES}));",
], cwd=ROOT, text=True))
sites = layout['sites']
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, hex_code, metal=0, roughness=.8, emission=0):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    rgb = [int(hex_code[i:i+2], 16)/255 for i in (0, 2, 4)]
    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    shader = value.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Emission Color'].default_value = (*rgb, 1)
    shader.inputs['Emission Strength'].default_value = emission
    value.diffuse_color = (*rgb, 1)
    return value

steel = material('Painted slate steel', '4f5656', .42)
rust = material('Oxide and primer', '84553b', .32)
sand = material('Dust and oxidized aluminium', 'a29479', .28)
canvas = material('Khaki canvas', '8c7c54')
rubber = material('Rubber and belt', '292724', .04)
glass = material('Armoured windscreen', '374e53', .55, .25)
tan = material('Cab sand enamel', '9a8a5c', .25)
white = material('Hazard stripe beige', 'e2b981', .12)
yellow = material('Safety yellow', 'c79139', .15)
lamp = material('Industrial lamp warm white', 'ffd897', .04, .42, .5)
red = material('Red warning paint', 'a14029', .22)
equipment = []

def coords(p):
    x, y, z = p
    return x, -z, y

def finish(obj, name, mat, group, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Rounded manufacturing edges', 'BEVEL')
        mod.width, mod.segments = bevel, 1
        mod = obj.modifiers.new('Panel normals', 'WEIGHTED_NORMAL')
    group.append(obj)
    return obj

def box(group, name, p, size, mat, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=coords(p))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    return finish(obj, name, mat, group, bevel)

def cylinder(group, name, start, end, radius, mat, sides=16):
    a, b = Vector(coords(start)), Vector(coords(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=(b-a).length, location=(a+b)/2)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (b-a).to_track_quat('Z','Y')
    return finish(obj, name, mat, group)

def beam(group, name, start, end, width, mat):
    a, b = Vector(coords(start)), Vector(coords(end))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a+b)/2)
    obj = bpy.context.object
    obj.dimensions = (width, width, (b-a).length)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (b-a).to_track_quat('Z','Y')
    return finish(obj, name, mat, group, min(width*.12,.02))

def parent_group(name, parts):
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    for obj in parts:
        obj.parent=parent
    by_material={}
    for obj in parts:
        bpy.context.view_layer.objects.active=obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        by_material.setdefault(obj.data.materials[0].name, []).append(obj)
    for surface, selected in by_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=selected[0]
        if len(selected)>1:
            bpy.ops.object.join()
        bpy.context.object.name=name + ' | ' + surface
    return parent

camp=[]
for b in (box_info for box_info in layout['boxes'] if box_info['id'].startswith('camp-tent-')):
    x,y,z=b['x'],b['baseY'],b['z']
    vertices=[(x-3.75,y,z-3.15),(x+3.75,y,z-3.15),(x+3.75,y,z+3.15),(x-3.75,y,z+3.15),
              (x-3.75,y+2,z-3.15),(x+3.75,y+2,z-3.15),(x+3.75,y+2,z+3.15),(x-3.75,y+2,z+3.15),
              (x,y+3.1,z-3.15),(x,y+3.1,z+3.15)]
    mesh=bpy.data.meshes.new('Canvas shelter')
    mesh.from_pydata([coords(p) for p in vertices],[],[(0,4,7,3),(1,2,6,5),(4,8,9,7),(8,5,6,9),(4,5,8),(7,9,6),(0,1,5,4)])
    obj=bpy.data.objects.new('Canvas shelter',mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(canvas)
    camp.append(obj)
    for offset in (-3.75,3.75):
        for end in (-3.15,3.15):
            cylinder(camp,'Guy rope',(x+offset,y+2,z+end),(x+offset*1.34,y+.06,z+end*1.18),.021,sand,6)
for x,z in [(-250,-221),(-241,-220),(-224,-218),(-233,-204),(-255,-207)]:
    y=32
    for j in range(3):
        box(camp,'Supply can',(x+j*.36,y+.27,z),(.29,.53,.4),yellow if j==2 else steel)
        box(camp,'Supply can handle',(x+j*.36,y+.55,z),(.14,.055,.26),steel)
box(camp,'Folded field map',(-221,32.97,-217),(1.16,.025,.72),white,.005)
for i in range(5):
    box(camp,'Map route',(-221.45+i*.19,32.986,-217.22+i*.092),(.13,.012,.045),red,.002)
parent_group('camp_dressing',camp)

works=[]
for x in (-66,-55,-44,-33,-22):
    for z in (-11.55,11.55):
        box(works,'Steel column',(x,16.15,z),(.27,8.3,.42),steel)
    beam(works,'Roof tie',(x,19.96,-11.7),(x,19.96,11.7),.23,steel)
    for z in (-9,-5,-1,3,7):
        beam(works,'Lattice brace',(x,19.96,z),(x,20.26,z+2),.085,rust)
    box(works,'Pendant housing',(x,18.9,-2),(.76,.20,.25),steel)
    box(works,'Pendant lens',(x,18.78,-2),(.58,.045,.18),lamp)
for i in range(8):
    x=-58+i*4.6
    for z in (3.2,7.4):
        beam(works,'Conveyor leg',(x,12.1,z),(x,15.55,z),.25,steel)
        beam(works,'Conveyor brace',(x,12.55,z),(x+3.2,15.35,z),.11,rust)
box(works,'Conveyor trough',(-42,15.5,5.3),(36,.5,4.65),steel)
box(works,'Rubber belt',(-42,15.84,5.3),(35.9,.21,3.65),rubber)
for x in (-53,-43,-32):
    box(works,'Drive gearbox',(x,15.5,8.12),(1.3,.9,1.1),rust)
for i in range(11):
    box(works,'Switchboard hardware',(-46.8+i*.36,13.29,-8.72),(.17,.17,.09),lamp if i%3==0 else red)
for z in (-6.1,-7.8):
    cylinder(works,'Utility pipe',(-91,15.15,z),(-69,15.15,z),.09,rust,8)
parent_group('crusher_dressing',works)

fuel=[]
for b in (box_info for box_info in layout['boxes'] if box_info['id'].startswith('reservoir-')):
    x,y,z=b['x'],b['baseY'],b['z']
    cylinder(fuel,'Concrete ring',(x,y,z),(x,y+.34,z),4.5,sand,28)
    cylinder(fuel,'Welded fuel tank',(x,y+.32,z),(x,y+10.1,z),4.05,rust,32)
    cylinder(fuel,'Roof lip',(x,y+9.88,z),(x,y+10.25,z),4.18,steel,32)
    for j in range(1,6):
        cylinder(fuel,'Tank seam',(x,y+1.67*j,z),(x,y+1.67*j+.055,z),4.07,sand,32)
    for i in range(10):
        a=i*math.tau/10
        dx,dz=math.cos(a)*3.93,math.sin(a)*3.93
        cylinder(fuel,'Roof guard post',(x+dx,y+10.22,z+dz),(x+dx,y+11.07,z+dz),.04,yellow,8)
        b0=a+math.tau/10
        beam(fuel,'Guard handrail',(x+dx,y+11.07,z+dz),(x+math.cos(b0)*3.93,y+11.07,z+math.sin(b0)*3.93),.07,yellow)
    for dx in (-.22,.22):
        cylinder(fuel,'Ladder upright',(x+dx,y+.25,z+4.19),(x+dx,y+10.65,z+4.19),.052,yellow,8)
    for i in range(24):
        beam(fuel,'Ladder rung',(x-.25,y+.45+i*.415,z+4.19),(x+.25,y+.45+i*.415,z+4.19),.055,yellow)
for x,z in [(-84,150),(-73,155),(-108,169)]:
    for i in range(3):
        cylinder(fuel,'Service drum',(x+i*.82,2,z),(x+i*.82,2.91,z),.35,steel if i!=1 else yellow,12)
parent_group('fuel_dressing',fuel)

gun_base=[]
cylinder(gun_base,'Tripod column',(0,.1,0),(0,1.54,0),.082,steel,12)
for a in (0,math.tau/3,2*math.tau/3):
    beam(gun_base,'Tripod leg',(0,.95,0),(math.sin(a)*.64,.06,math.cos(a)*.64),.102,steel)
parent_group('gun_base',gun_base)
gun_top=[]
box(gun_top,'Receiver',(0,0,-.13),(.19,.19,.57),steel)
cylinder(gun_top,'Barrel',(0,.014,-.29),(0,.014,-1.06),.033,steel)
cylinder(gun_top,'Muzzle brake',(0,.014,-.99),(0,.014,-1.12),.047,rust)
box(gun_top,'Ammo box',(.25,-.07,-.05),(.26,.34,.36),tan)
for dx in (-.08,.08):
    cylinder(gun_top,'Grip',(dx,-.13,.17),(dx,.05,.17),.037,rubber,12)
box(gun_top,'Rear sight',(0,.12,.065),(.07,.1,.045),steel)
box(gun_top,'Front sight',(0,.084,-.78),(.045,.095,.045),steel)
parent_group('gun_top',gun_top)

truck=[]
box(truck,'Chassis',(0,.68,.1),(2.18,.31,4.84),steel)
box(truck,'Tanker cab',(0,1.42,-1.5),(2.16,1.58,1.44),tan,.08)
box(truck,'Cab windscreen',(0,1.91,-2.231),(1.82,.44,.028),glass,.01)
box(truck,'Bumper',(0,.68,-2.29),(2.28,.22,.24),steel)
box(truck,'Radiator grille',(0,1.23,-2.237),(1.03,.45,.035),rubber)
for x in (-.82,.82):
    box(truck,'Headlight',(x,1.19,-2.26),(.31,.24,.08),lamp)
for x in (-1.085,1.085):
    box(truck,'Door window',(x,1.88,-1.56),(.027,.49,.94),glass,.014)
    box(truck,'Door handle',(x,1.45,-1.24),(.065,.06,.22),steel)
for z in (-1.56,.85,1.68):
    for x in (-1,1):
        cylinder(truck,'Wheel',(x-.19,.49,z),(x+.19,.49,z),.49,rubber,16)
        outside=x+math.copysign(.194,x)
        cylinder(truck,'Rim',(outside,.49,z),(outside+math.copysign(.025,x),.49,z),.265,steel,12)
cylinder(truck,'Fuel cylinder',(0,1.56,-.71),(0,1.56,2.17),.94,tan,20)
for z in (-.52,.6,1.96):
    cylinder(truck,'Tank strap',(0,1.56,z),(0,1.56,z+.09),.949,steel,20)
cylinder(truck,'Fuel cap',(0,2.48,.44),(0,2.59,.44),.24,steel,12)
box(truck,'Rear plate',(0,1.12,2.365),(1.7,.31,.16),red)
parent_group('fuel_truck',truck)

bpy.ops.object.select_all(action='DESELECT')
# External conveyor, fuel pipes and service gallery.
gantry=[]
start=(-42,19.15,7.4)
end=(15,22.5,43)
dx,dz=end[0]-start[0],end[2]-start[2]
length=math.hypot(dx,dz)
side_x,side_z=-dz/length,dx/length
def gantry_point(t, side=0, lift=0):
    return (start[0]+dx*t+side_x*side,start[1]+(end[1]-start[1])*t+lift,
            start[2]+dz*t+side_z*side)
for side in (-1.15,1.15):
    beam(gantry,'Truss bottom chord',gantry_point(0,side),gantry_point(1,side),.27,steel)
    beam(gantry,'Truss top chord',gantry_point(0,side,1.45),gantry_point(1,side,1.45),.2,steel)
    for i in range(18):
        a,b=i/18,(i+1)/18
        beam(gantry,'Truss diagonal',gantry_point(a,side,1.45*(i%2)),
             gantry_point(b,side,1.45*(1-i%2)),.09,rust)
        beam(gantry,'Conveyor cross member',gantry_point(a,-1.18),gantry_point(a,1.18),.14,steel)
beam(gantry,'Enclosed belt',gantry_point(0,0,.24),gantry_point(1,0,.24),1.43,steel)
for t,ground in ((.26,12),(.59,8),(.88,6)):
    for side in (-1.5,1.5):
        x,y,z=gantry_point(t,side,-.25)
        beam(gantry,'H-frame upright',(x,ground,z),(x,y,z),.32,rust)
        box(gantry,'Foundation',(x,ground,z),(.92,.47,.96),sand)
    beam(gantry,'H-frame cross brace',gantry_point(t+.001,1.55,-.4),
         (gantry_point(t,-1.5)[0],ground+1,gantry_point(t,-1.5)[2]),.18,steel)
box(gantry,'Transfer hopper',(15,18.65,43),(5.2,5.8,5.5),rust,.12)
box(gantry,'Hopper cover',(15,22.05,43),(5.45,.78,5.7),steel,.09)
for x in (12.9,17.1):
    for z in (40.8,45.2):
        beam(gantry,'Hopper frame',(x,5,z),(x,18.4,z),.36,steel)
for x in (-19,-7,8,22):
    box(gantry,'Electrical cable tray',(x,12.3,16),(4,.22,.75),steel)
parent_group('conveyor_gantry',gantry)

cladding=[]
for wall in (b for b in layout['boxes'] if b['id'].startswith(('hall-north','hall-south','bay-')) and 'roof' not in b['id']):
    x,y,z,w,d,h=(wall[k] for k in ('x','baseY','z','w','d','h'))
    if w>d:
        for i in range(math.floor(w/.6)):
            xp=x-w/2+.3+i*.6
            box(cladding,'Cladding rib',(xp,y+h*.66,z+d/2+.05),(.09,h*.64,.11),steel,.014)
        box(cladding,'Skirting steel',(x,y+.38,z+d/2+.065),(w,.75,.12),rust,.018)
        box(cladding,'Eave drip',(x,y+h-.07,z+d/2+.13),(w,.16,.38),steel,.026)
    else:
        for i in range(math.floor(d/.64)):
            zp=z-d/2+.3+i*.64
            box(cladding,'Panel seam',(x+w/2+.058,y+h*.64,zp),(.11,h*.71,.09),steel,.012)
        box(cladding,'Skirting steel',(x+w/2+.05,y+.38,z),(.11,.73,d),rust,.017)
for x,z,h in [(-60,-11.65,18.1),(-32,-11.65,18.1),(-88,152,5.45),(-105,175,5.44)]:
    box(cladding,'Louver frame',(x,h,z),(2.6,1.04,.21),steel)
    for i in range(7):
        box(cladding,'Louver',(x,h-.39+i*.135,z+.12),(2.38,.059,.14),sand,.008)
for x,z,top in [(-68,-12,20.75),(-16,-12,20.75),(-85.6,164,6.25),(-98.5,175,6.25)]:
    bottom=12 if top>10 else 2
    cylinder(cladding,'Downpipe',(x,bottom+.45,z-.16),(x,top,z-.16),.12,rust,12)
    for y in range(math.ceil(bottom+1),math.floor(top),2):
        cylinder(cladding,'Pipe clamp',(x,y,z-.16),(x,y+.13,z-.16),.153,steel,12)
parent_group('sheet_cladding',cladding)

gallery=[]
for x in (-59.1,-55.4,-51.9,-48.4,-44.9,-43.4):
    for z in (8.92,10.51):
        beam(gallery,'Gallery handrail upright',(x,15.29,z),(x,16.29,z),.055,yellow)
for z in (8.92,10.51):
    for y in (15.81,16.29):
        beam(gallery,'Gallery handrail',(-59.1,y,z),(-43.32,y,z),.062,yellow)
    beam(gallery,'Stair handrail',(-65.73,13.21,z),(-59.1,16.29,z),.062,yellow)
    for i in (1,5,9,13):
        x=-65.85+(i+.5)*.46
        y=12+(i+1)*.235
        beam(gallery,'Stair upright',(x,y,z),(x,y+1.03,z),.052,yellow)
for x,z in [(-59,10),(-49,10),(-44,10)]:
    beam(gallery,'Gallery girder',(x,12,z),(x,15.1,z),.11,steel)
parent_group('service_gallery',gallery)

pipes=[]
for x in (-121,-112,-102):
    z={-121:130,-112:148,-102:124}[x]
    cylinder(pipes,'Tank feed branch',(x,2.52,z+3.9),(x,2.52,120),.21,steel)
    cylinder(pipes,'Sealed valve',(x,2.52,min(143,z+5.3)),(x,3.1,min(143,z+5.3)),.23,rust)
    cylinder(pipes,'Valve wheel',(x,3.03,min(143,z+5.3)),(x,3.13,min(143,z+5.3)),.30,red)
cylinder(pipes,'Main header',(-129,2.54,119.8),(-97,2.54,119.8),.38,steel)
for x in (-127,-122,-115,-108,-101):
    box(pipes,'Pipe shoe',(x,2.23,119.8),(.46,.48,1.0),sand,.035)
for x,z in [(-123,152),(-94,145),(-99,170)]:
    box(pipes,'Pumping skid',(x,2.21,z),(2.1,.39,1.4),steel)
    cylinder(pipes,'Pump motor',(x-.8,2.72,z),(x+.54,2.72,z),.39,rust)
    box(pipes,'Motor terminal',(x-.43,3.12,z),(.48,.26,.52),steel)
    cylinder(pipes,'Rising pipe',(x+.66,2.42,z),(x+.66,4.3,z),.14,yellow)
for x,z in [(-123,155),(-108,157),(-95,133),(-99,152)]:
    y=2
    for offset in (-1.2,1.2):
        box(pipes,'Safety frame post',(x+offset,y+.89,z),(.12,1.73,.12),yellow)
    for h in (.44,1.29):
        box(pipes,'Safety frame rail',(x,y+h,z),(2.4,.095,.095),yellow)
parent_group('fuel_pipework',pipes)

# The exposed cliffs receive layered fragments, independent of the driving surface.
import random
rng=random.Random(90527)
limestone=[material('Calcareous strata '+str(i),p) for i,p in
           enumerate(('77614c','9c7f61','bea485','8f755b','ad8d6b'))]
rocks=[]
for cx,cz,clusters,radius in [(-167,-126,9,21),(-105,-29,10,17),(-183,-49,12,30),
                               (100,-103,9,21),(176,-53,10,22),(202,48,15,34),
                               (83,119,12,32),(-130,176,10,26),(-210,78,12,32),
                               (-40,224,11,34),(108,172,11,31),(225,231,11,29)]:
    for _ in range(clusters):
        x,z=cx+rng.uniform(-radius,radius),cz+rng.uniform(-radius*.5,radius*.5)
        if any(abs((x-road['x'])*math.cos(road['yaw'])-(z-road['z'])*math.sin(road['yaw'])) < road['w']/2+7 and
               abs((x-road['x'])*math.sin(road['yaw'])+(z-road['z'])*math.cos(road['yaw'])) < road['d']/2+5
               for road in layout['roads']):
            continue
        y=0
        # The exported coordinates use the same heightfield as simulation.
        y_index=len(rocks)
        positions=[]
        rx,rz,height=rng.uniform(.55,4.7),rng.uniform(.6,4.0),rng.uniform(.43,3.35)
        azimuth=rng.uniform(0,math.tau)
        for layer,mult in enumerate((.90,1,.75,.23)):
            for j in range(7):
                a=j*math.tau/7+azimuth
                positions.append((math.cos(a)*rx*mult*rng.uniform(.76,1.18),height*layer/3+math.sin(a*2)*height*.12,
                                  math.sin(a)*rz*mult*rng.uniform(.76,1.14)))
        faces=[]
        for layer in range(3):
            for i in range(7):
                j=(i+1)%7;faces.append((layer*7+i,layer*7+j,(layer+1)*7+j,(layer+1)*7+i))
        faces.append(tuple(range(21,28)))
        mesh=bpy.data.meshes.new('Broken limestone');mesh.from_pydata([coords(pos) for pos in positions],[],faces)
        obj=bpy.data.objects.new('Limestone chunk',mesh);bpy.context.collection.objects.link(obj)
        obj.location=coords((x,y,z))
        obj['terrainX'],obj['terrainZ']=x,z
        for mat in limestone:mesh.materials.append(mat)
        for i,face in enumerate(mesh.polygons):face.material_index=(i//7+rng.randrange(2)+y_index)%len(limestone)
        rocks.append(obj)
rock_points = [(obj['terrainX'],obj['terrainZ']) for obj in rocks]
rock_heights = json.loads(subprocess.check_output(
    ['node','--input-type=module','-e',
     "import {readFileSync} from 'node:fs';"
     "import {quarryPoint} from './shared/campaign/quarry-m05.js';"
     "console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(([x,z])=>quarryPoint(x,z).y)));"],
    input=json.dumps(rock_points), text=True, cwd=ROOT))
for obj,height in zip(rocks,rock_heights):
    obj.location.z = height-.08
for i in range(0,len(rocks),12):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in rocks[i:i+12]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=rocks[i]
    bpy.ops.object.join()
    bpy.context.object.name='quarry_rocks_'+str(i//12)

wrench=[]
box(wrench,'Forged tool handle',(0,-.13,0),(.028,.29,.017),steel,.005)
for x in (-.028,.028):
    beam(wrench,'Open jaw',(x*.65,.015,0),(x,.066,0),.013,steel)
parent_group('repair_tool',wrench)

cup=[]
cylinder(cup,'Pressed cup base',(0,0,0),(0,.013,0),.037,sand,16)
cylinder(cup,'Outer cup wall',(0,.013,0),(0,.074,0),.041,sand,20)
cylinder(cup,'Rim bead',(0,.074,0),(0,.079,0),.043,steel,20)
cylinder(cup,'Dark interior',(0,.079,0),(0,.080,0),.037,rubber,20)
for a,b in [((.035,.062,0),(.067,.057,0)),((.067,.057,0),(.067,.022,0)),
            ((.067,.022,0),(.035,.018,0))]:
    beam(cup,'Pressed handle',a,b,.011,sand)
parent_group('coffee_cup',cup)

door=[]
box(door,'Pressed truck door',(0,.61,.46),(.055,1.12,.89),tan,.016)
box(door,'Truck door window',(-.035,.89,.46),(.026,.43,.65),glass,.009)
box(door,'Outside latch',(-.063,.61,.72),(.043,.045,.15),steel,.009)
parent_group('fuel_cab_door',door)

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'industrial.blend'))
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',export_yup=True,export_materials='EXPORT',export_extras=True)


subprocess.run(['node', 'scripts/pack-map.mjs', str(EXPORT.parent), str(EXPORT.parent), EXPORT.stem], cwd=ROOT, check=True)
