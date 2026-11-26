"""Author the close exterior of the T-72 Rubezh; keep the original rig pivots."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(SOURCE/'tank'),str(SOURCE)]
import build_rubezh as base
from weapon_detail import DetailedAssembly, engraved_mark
from weapon_finish import finish_image, shader_finish
from mathutils.noise import noise_vector


PAINT = (.211,.242,.153)
PANEL = (.176,.204,.134)
EDGE = (.256,.279,.177)
TRIM = (.134,.158,.105)
METAL = (.065,.073,.068)
SCOUR = (.096,.104,.092)
RUBBER = (.028,.031,.029)
GLASS = (.025,.076,.090)
LENS = (.28,.293,.220)
RED = (.255,.035,.016)
DUST = (.139,.103,.067)
FABRIC = (.118,.126,.077)
MARK = (.389,.391,.302)
GAP = (.040,.046,.039)
PAINTS = {PAINT,PANEL,EDGE,TRIM}
FINISH_ROWS = {METAL:1,SCOUR:1,RUBBER:2,GLASS:3,LENS:3,RED:3,
               GAP:4,DUST:4,MARK:4,FABRIC:5}


class TankAssembly(DetailedAssembly):
    varied_finishes = PAINTS

    def box(self, center, size, color, bevel=.022):
        super().box(center,size,color,bevel)


def bar(mesh,start,end,radius,color,sides=10):
    line = Vector(end)-Vector(start)
    rotation = Vector((0,0,1)).rotation_difference(line.normalized())
    center = (Vector(end)+Vector(start))/2
    offset = len(mesh.vertices)
    # A short shoulder on each end catches light without extra objects.
    base.Assembly.cylinder(mesh,(0,0,0),radius,line.length,'z',color,sides)
    mesh.vertices[offset:] = [tuple(rotation@Vector(v)+center) for v in mesh.vertices[offset:]]


def cable(mesh, points, radius, color):
    points = [Vector(point) for point in points]
    rings = []
    for i, point in enumerate(points):
        tangent = points[min(i+1,len(points)-1)]-points[max(i-1,0)]
        rotation = Vector((0,0,1)).rotation_difference(tangent.normalized())
        rings.append([tuple(point+rotation@Vector((radius*math.cos(a),radius*math.sin(a),0)))
                      for a in (j*math.tau/10 for j in range(10))])
    mesh.rings(rings,color)


def rotated_box(mesh,center,size,color,angle):
    offset = len(mesh.vertices)
    mesh.box((0,0,0),size,color)
    rotation = Euler((angle,0,0)).to_quaternion()
    mesh.vertices[offset:] = [tuple(rotation@Vector(v)+Vector(center)) for v in mesh.vertices[offset:]]


def loop(mesh, x, y, z, color, *, width=.09, height=.048):
    cable(mesh,[(x-width,y,z),(x-width,y+height*.75,z),(x-width*.72,y+height,z),
                (x+width*.72,y+height,z),(x+width,y+height*.75,z),(x+width,y,z)],.014,color)


def hull_details(hull,hatch):
    slope = .57/1.29
    # Sloped armour tiles sit on the same glacis plane as the old hull.
    for row in range(3):
        for i in range(6):
            x = (i-2.5)*.335
            z = -3.136+row*.335
            y = .92+(z+3.40)*slope
            rotated_box(hull,(x,y+.053,z),(.314,.074,.337),
                        (PAINT,PANEL,TRIM)[(i*7+row)%3],-math.atan(slope))
            for side in (-1,1):
                base.Assembly.cylinder(hull,(x+side*.121,y+.099,z-.034),.018,.014,'y',EDGE,6)
    # Fine seams, hinged side skirts, securing pins and their wear faces.
    for side in (-1,1):
        for i in range(6):
            z = -3.11+(i+.5)*6.22/6
            hull.box((side*1.789,1.125,z),(.017,.410,.925),PANEL if i%2 else PAINT,.012)
            hull.box((side*1.791,.903,z),(.018,.035,.922),DUST,.006)
            for at in (-.34,.34):
                hull.box((side*1.785,1.39,z+at),(.032,.119,.153),TRIM,.008)
                base.Assembly.cylinder(hull,(side*1.805,1.341,z+at),.023,.020,'x',METAL,8)
                base.Assembly.cylinder(hull,(side*1.804,.970,z+at),.016,.014,'x',EDGE,6)
        # Protective headlight cage, running boards and external tie-downs.
        for x in (side*1.127,side*1.353):
            bar(hull,(x,1.002,-3.42),(x,1.235,-3.42),.017,TRIM)
        bar(hull,(side*1.127,1.22,-3.435),(side*1.353,1.22,-3.435),.017,TRIM)
        for x in (side*1.20,side*1.28):
            bar(hull,(x,1.065,-3.447),(x,1.18,-3.447),.009,METAL,6)
        for z in (-2.79,-2.48,1.29,2.45,2.93):
            loop(hull,side*1.53,1.506,z,TRIM,width=.101)
        # Side tool and brackets stay below the riders' deck.
        bar(hull,(side*1.46,1.54,-.40),(side*1.46,1.54,1.02),.019,TRIM)
        for z in (-.265,.37,.86):
            hull.box((side*1.46,1.52,z),(.072,.046,.063),METAL,.009)
        hull.box((side*1.303,1.482,2.24),(.26,.073,.71),TRIM)
        for z in (2.02,2.48):
            loop(hull,side*1.303,1.522,z,METAL)
        # Rear grill slots, hinge caps and rub marks on the towing pin.
        for i in range(8):
            hull.box((side*.918,.59+i*.046,3.432),(.462,.024,.028),PANEL,.004)
        base.Assembly.cylinder(hull,(side*.44,.73,3.449),.056,.068,'z',SCOUR,14)
        for x in (side*.44,side*1.08):
            hull.box((x,1.2,3.405),(.16,.057,.038),PAINT,.009)
        path = [(side*1.45,1.516,-2.42),(side*1.59,1.531,-2.08),
                (side*1.62,1.534,-1.61),(side*1.60,1.536,-.91),
                (side*1.57,1.543,-.31),(side*1.51,1.547,.20)]
        cable(hull,path,.019,METAL)
        for x,y,z in (path[1],path[3],path[-1]):
            hull.box((x,y+.005,z),(.078,.035,.078),TRIM,.008)
        # Compact marking on a solid plate, independent of the camouflage.
        engraved_mark(hull,'047',side*1.800,1.244,.81 if side>0 else .325,.015,MARK)
    for x in (-.50,.50):
        hull.box((x,1.522,2.11),(.911,.064,1.394),TRIM,.013)
        hull.box((x,1.558,2.11),(.802,.012,1.248),GAP,.006)
        for i in range(18):
            z = 1.53+i*.068
            hull.box((x,1.569,z),(.786,.025,.035),PANEL,.005)
        for dx in (-.440,.440):
            for z in (1.49,1.93,2.36,2.73):
                base.Assembly.cylinder(hull,(x+dx,1.561,z),.017,.016,'y',METAL,6)
    for x in (-.36,.36):
        hull.box((x,1.37,-2.20),(.285,.050,.101),TRIM)
    loop(hatch,-.62,1.622,-1.774,TRIM,width=.104,height=.063)
    for side in (-1,1):
        hatch.cylinder((-.62+side*.178,1.621,-1.72),.041,.132,'x',TRIM,16)
        hatch.box((-.62+side*.140,1.651,-2.011),(.017,.082,.103),TRIM,.006)
    hatch.box((-.62,1.675,-1.970),(.312,.031,.178),PANEL,.008)


def turret_details(turret):
    for side in (-1,1):
        # Faceted applique cheeks follow the curved casting and leave the gun clear.
        rings = [[(side*x,y,z) for x,y,z in ring] for ring in [
            [(.36,.17,-1.11),(.78,.17,-1.06),(1.12,.17,-.69),
             (1.31,.17,-.12),(1.24,.17,.21),(.95,.17,-.11),(.64,.17,-.68)],
            [(.37,.22,-1.14),(.81,.22,-1.09),(1.18,.22,-.72),
             (1.36,.22,-.14),(1.27,.22,.23),(.96,.22,-.10),(.64,.22,-.68)],
            [(.36,.39,-1.01),(.78,.39,-.98),(1.10,.39,-.60),
             (1.28,.39,-.105),(1.21,.39,.22),(.90,.39,-.13),(.62,.39,-.64)],
            [(.34,.44,-.96),(.75,.44,-.925),(1.07,.44,-.54),
             (1.24,.44,-.143),(1.17,.44,.20),(.89,.44,-.13),(.60,.44,-.63)] ]]
        turret.rings(rings,PANEL)
        for x,y,z in ((.54,.401,-.980),(.96,.393,-.766),(1.225,.360,-.425)):
            base.Assembly.cylinder(turret,(side*x,y+.025,z),.026,.022,'y',EDGE,8)
        # Hatch hardware on the casting, directly below the deck seating height.
        loop(turret,side*.45,.772,.323,TRIM,width=.105,height=.056)
        turret.box((side*.451,.785,.500),(.215,.047,.077),PANEL,.010)
        for x in (side*.45-.071,side*.45+.071):
            turret.cylinder((x,.799,.50),.029,.083,'x',METAL,12)
        turret.box((side*.46,.767,.068),(.197,.066,.101),TRIM,.013)
        turret.box((side*.46,.768,.012),(.137,.033,.017),GLASS,.004)
        turret.box((side*.80,.625,-.470),(.268,.031,.237),PANEL,.009)
        for x in (.707,.893):
            turret.box((side*x,.556,-.548),(.020,.089,.036),TRIM,.006)
        # External baskets and cloth-covered stowage on the bustle.
        for x in (.58,1.16):
            for z in (.965,1.41):
                bar(turret,(side*x,.29,z),(side*x,.645,z),.020,TRIM)
        for y in (.365,.516,.632):
            bar(turret,(side*1.16,y,.966),(side*1.16,y,1.419),.017,TRIM)
            bar(turret,(side*.577,y,1.416),(side*1.16,y,1.416),.017,TRIM)
        for i in range(5):
            x=side*(.65+i*.11)
            bar(turret,(x,.373,1.414),(x,.628,1.414),.009,METAL,6)
        turret.box((side*.859,.479,1.191),(.393,.263,.298),FABRIC if side<0 else PANEL,.025)
        for x in (.728,.975):
            turret.box((side*x,.616,1.185),(.044,.028,.326),TRIM,.008)
        for z in (.583,.767):
            turret.box((side*1.10,.437,z),(.21,.081,.088),PAINT,.009)
    turret.cylinder((-.78,.748,.72),.073,.145,'y',RUBBER,20)
    turret.box((0,.625,-.113),(.274,.074,.262),TRIM)
    for x in (-.095,.095):
        base.Assembly.cylinder(turret,(x,.669,-.111),.023,.021,'y',EDGE,8)


def running_gear(parts):
    wheel, belt, shoe = TankAssembly(),TankAssembly(),base.Assembly()
    wheel.tube((0,0,0),[(-.079,.305),(-.076,.331),(-.061,.34),
                        (.058,.34),(.072,.332),(.079,.308)],'x',RUBBER,48)
    wheel.tube((0,0,0),[(-.103,.081),(-.100,.208),(-.091,.268),(-.077,.287),
                        (.077,.287),(.091,.268),(.100,.208),(.103,.081)],'x',PAINT,48)
    wheel.cylinder((0,0,0),.101,.252,'x',METAL,21)
    for direction in (-1,1):
        for i in range(8):
            angle = i*math.tau/8
            y,z = .207*math.cos(angle),.207*math.sin(angle)
            base.Assembly.cylinder(wheel,(direction*.106,y,z),.021,.024,'x',PANEL,8)
        wheel.cylinder((direction*.127,0,0),.065,.021,'x',PANEL,20)
    for side in (-1,1):
        center=side*1.49
        for z in (-3.05,3.05):
            belt.cylinder((center,.46,z),.315,.375,'x',METAL,26)
            belt.cylinder((center,.46,z),.254,.435,'x',PANEL,24)
            belt.cylinder((center+side*.221,.46,z),.108,.030,'x',METAL,20)
        for x in (center-.204,center+.204):
            for y in (.085,.878):
                belt.box((x,y,.0),(.087,.046,6.12),METAL,.011)
        for i in range(6):
            z=-2.65+i*1.06
            bar(belt,(side*1.21,.64,z+.158),(side*1.60,.487,z),.043,TRIM)
    shoe.box((0,0,0),(.57,.057,.212),METAL,.009)
    shoe.box((0,.030,0),(.420,.032,.152),RUBBER,.008)
    for side in (-1,1):
        shoe.box((side*.249,.001,.069),(.079,.066,.085),SCOUR,.005)
        shoe.box((side*.249,.001,-.066),(.072,.055,.081),METAL,.005)
    shoe.box((0,-.032,0),(.078,.044,.098),METAL,.006)
    parts.update(wheel=wheel,belt=belt,shoe=shoe)


def cannon_details(cannon,mg,mount):
    for z,r in ((-3.98,.096),(-3.26,.098),(-2.47,.114),(-1.48,.140),(-.97,.145)):
        cannon.cylinder((0,0,z),r,.049,'z',PANEL,28)
    for x in (-.207,.207):
        cannon.box((x,.156,-.14),(.089,.068,.225),TRIM,.009)
        for z in (-.218,-.068):
            base.Assembly.cylinder(cannon,(x,.198,z),.024,.021,'y',METAL,8)
    cannon.box((0,.180,.009),(.346,.063,.278),PANEL,.018)
    for z in (-1.213,-1.108,-.584):
        mg.cylinder((0,.12,z),.044,.041,'z',METAL,18)
    for z in (-.294,-.253,-.212):
        mg.box((.12,.181,z),(.123,.018,.016),PANEL,.004)
    mount.box((.106,.092,.037),(.114,.083,.186),TRIM,.012)


def material():
    material = bpy.data.materials.new('Rubezh · matte armour paint / steel / rubber / optics')
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    shader = next(node for node in tree.nodes if node.type=='BSDF_PRINCIPLED')
    paint = tree.nodes.new('ShaderNodeVertexColor')
    paint.layer_name = 'Paint'
    pigment = tree.nodes.new('ShaderNodeTexImage')
    pigment.image = surface_pigment()
    multiply = tree.nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    tree.links.new(pigment.outputs['Color'],multiply.inputs[1])
    tree.links.new(paint.outputs['Color'],multiply.inputs[2])
    tree.links.new(multiply.outputs['Color'],shader.inputs['Base Color'])
    shader_finish(material,shader,6,finishes=((.875,0,.036),(.57,.72,.044),
                  (.955,0,.055),(.28,0,.019),(.945,0,.059),(.94,0,.063)),
                  fabric_rows=(5,),size=288,roughness_variation=.43)
    return material


def surface_pigment():
    size = 288
    pixels = []
    for row in range(6):
        for j in range(size):
            y = j/size
            for i in range(size):
                x = i/size
                field, fine, salt = noise_vector((x*9,y*7,row*2.9))
                streak = noise_vector((x*63,y*7,row+18))[0]
                pore = noise_vector((x*110,y*110,row+29))[1]
                if row==0:
                    dust = max(0,field-.07)
                    wear = max(0,streak-.28)*max(0,fine+.2)
                    shade = .82+.14*field+.07*pore+.15*wear
                    rgb = (shade+.10*dust,shade+.027*dust,shade-.12*dust)
                else:
                    shade = .88+.075*field+.045*streak+.046*pore+.028*salt
                    rgb = (shade,shade,shade)
                pixels.append((*(max(0,min(1,c))**(1/2.2) for c in rgb),1))
    image = finish_image('Paint pigment, scuffs and dust',pixels,size)
    image.colorspace_settings.name = 'sRGB'
    return image


def author_surface(obj, colors, material):
    mesh = obj.data
    # UV0 is the surface atlas and UV1 keeps the camouflage projection.
    camo = mesh.uv_layers.active
    old_uv = [loop.vector.copy() for loop in camo.uv]
    camo.name = 'Surface finishes'
    camouflage = mesh.uv_layers.new(name='Camouflage')
    for i, value in enumerate(old_uv):
        camouflage.uv[i].vector = value
    mesh.uv_layers.active = camo
    paint = mesh.color_attributes['Paint'].data
    for face, color in zip(mesh.polygons,colors):
        nx,nz,ny = face.normal
        row = FINISH_ROWS.get(color,0)
        for loop in face.loop_indices:
            x,z,y = mesh.vertices[mesh.loops[loop].vertex_index].co
            u,v = (x,z) if abs(ny)>.65 else ((z,y) if abs(nx)>abs(nz) else (x,y))
            camo.uv[loop].vector = (.5+u*.123,(row+.47+v*.12)/6)
            shade = paint[loop].color[:3]
            # The alpha channel carries the camouflage coverage in the game.
            paint[loop].color = (*shade,1 if color in PAINTS else 0)
    obj.data.materials.append(material)


def arrange_source(collection, settings):
    parts = {name:bpy.data.objects[f'HD_{name}'] for name in settings}
    parts['turret'].location = (0,.4,1.53)
    parts['cannon'].parent = parts['turret']
    parts['cannon'].location = (0,.9,.34)
    parts['mg_mount'].location = (.45,.4,2.66)
    parts['mg_barrel'].parent = parts['mg_mount']
    for name in ('turret','mg_mount','hatch','belt'):
        parts[name].parent = parts['hull']
    wheel = parts['wheel']
    for i in range(12):
        copy = wheel.copy()
        copy.parent = parts['hull']
        copy.location = (-1.67 if i<6 else 1.67,2.65-(i%6)*1.06,.414)
        collection.objects.link(copy)
    bpy.data.objects.remove(wheel,do_unlink=True)
    path = json.loads((SOURCE.parent/'src/assets/tank/track-path.json').read_text())
    points = path['points']
    segments = [(a,b,math.dist(a,b)) for a,b in zip(points,points[1:]+points[:1])]
    total = sum(length for _,_,length in segments)
    source = parts['shoe']
    for side in (-1,1):
        for i in range(path['links']):
            distance = i*total/path['links']
            for a,b,length in segments:
                if distance <= length:
                    t = distance/length
                    z,y = (a[j]+(b[j]-a[j])*t for j in range(2))
                    copy = source.copy()
                    copy.parent = parts['hull']
                    copy.location = (side*path['x'],-z,y)
                    copy.rotation_euler.x = math.atan2(b[1]-a[1],a[0]-b[0])
                    collection.objects.link(copy)
                    break
                distance -= length
    bpy.data.objects.remove(source,do_unlink=True)


def main():
    glb, blend = map(Path,sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name in ('PAINT','PANEL','EDGE','METAL','RUBBER','GLASS','LENS'):
        setattr(base,name,globals()[name])
    base.TAIL = RED
    collection = bpy.data.collections.new('Rubezh · remastered exterior')
    bpy.context.scene.collection.children.link(collection)
    parts = base.assemble_level(0,TankAssembly,detailed=True)
    hull_details(parts['hull'],parts['hatch'])
    turret_details(parts['turret'])
    cannon_details(parts['cannon'],parts['mg_barrel'],parts['mg_mount'])
    running_gear(parts)
    shared = material()
    for name, part in parts.items():
        obj = part.object('HD_'+name,collection)
        author_surface(obj,part.colors,shared)
    bpy.ops.export_scene.gltf(filepath=str(glb.resolve()),export_format='GLB',export_vertex_color='ACTIVE',
                              export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
    arrange_source(collection,parts)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.shading.color_type='VERTEX'
                space.region_3d.view_location=(0,0,1)
                space.region_3d.view_distance=13
                space.region_3d.view_rotation=Euler((math.radians(68),0,math.radians(142))).to_quaternion()
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()),compress=True)


if __name__=='__main__':
    main()
