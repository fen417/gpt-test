"""Build the batched game scene and editable city source from the shared map."""

import json
from collections import defaultdict
from math import ceil, cos, exp, floor, hypot, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def linear(component):
    value = component / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(value):
    return tuple(linear(int(value[i:i + 2], 16)) for i in (1, 3, 5))


def tunnel_tint(tunnel, point, tone):
    x, y, z = point
    across = z - tunnel['z']
    if not (tunnel['start'] <= x <= tunnel['end'] and abs(across) <= 4.67 and y < 4.9):
        return tone
    light = sum(exp(-(((x - lamp) * .46) ** 2 + ((y - 2.5) * .43) ** 2 + ((across + 3.65) * .24) ** 2))
                for lamp in tunnel['lampX'])
    ambient = .57 + .26 * max(0, 1-(x-tunnel['start'])/8)
    return tuple(base*ambient + light*warm for base,warm in zip(tone,(.22,.145,.077)))


def cut_at_x(points, boundary, left):
    result = []
    for a,b in zip(points,points[1:]+points[:1]):
        inside = a[0] <= boundary if left else a[0] >= boundary
        if inside:
            result.append(a)
        if (a[0]<boundary<b[0]) or (b[0]<boundary<a[0]):
            f=(boundary-a[0])/(b[0]-a[0])
            result.append((boundary,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f))
    return result


class Batch:
    def __init__(self):
        self.points, self.faces, self.colors, self.uv = [], [], [], []

    def polygon(self, points, tone, axis, uv_scale=4, tints=None):
        offset = len(self.points)
        self.points.extend((x, -z, y) for x, y, z in points)
        self.faces.append(tuple(range(offset, offset + len(points))))
        for i, p in enumerate(points):
            shade = 0.93 if axis != (0, 2) and i in (0, 1) else 1
            self.colors.extend((*[c * shade for c in (tints[i] if tints else tone)], 1))
            self.uv.extend((p[axis[0]] / uv_scale, p[axis[1]] / uv_scale))

    def block(self, part, tint, tunnel=None):
        def polygon(points,tone,axis,uv_scale=4):
            if tunnel and part['surface']!='unlit':
                x0,x1=min(p[0] for p in points),max(p[0] for p in points)
                cuts=range(floor(x0/2)*2+2,ceil(x1),2)
                for boundary in cuts:
                    if boundary>=x1:
                        break
                    slab=cut_at_x(points,boundary,True)
                    if len(slab)>=3:
                        self.polygon(slab,tone,axis,uv_scale,[tunnel_tint(tunnel,p,tone) for p in slab])
                    points=cut_at_x(points,boundary,False)
                if len(points)>=3:
                    self.polygon(points,tone,axis,uv_scale,[tunnel_tint(tunnel,p,tone) for p in points])
            else:
                self.polygon(points,tone,axis,uv_scale)

        x, z, y = (part[k] for k in ('x', 'z', 'baseY'))
        w, d, h = (part[k] for k in ('w', 'd', 'h'))
        shape = part.get('shape')
        if shape == 'beam':
            a,b=map(Vector,part['ends'])
            side=Vector((0,0,part['beamWidth']/2))
            up=(b-a).normalized().cross(side)
            rim=[-side-up,side-up,side+up,-side+up]
            near,far=[tuple(a+v) for v in rim],[tuple(b+v) for v in rim]
            polygon(near[::-1],tint,(2,1))
            polygon(far,tint,(2,1))
            for i in range(4):
                j=(i+1)%4
                polygon([near[i],near[j],far[j],far[i]],tint,(0,2) if i%2==0 else (0,1))
            return
        if shape == 'arrow':
            side = part['facing']
            face = [(x-w/2*side,y,z-d/2),(x+w/2*side,y+h/2,z-d/2),(x-w/2*side,y+h,z-d/2)]
            self.polygon(face if side < 0 else face[::-1],tint,(0,1))
            return
        if shape in ('profile-x', 'cylinder-x'):
            if shape == 'profile-x':
                profile = part['profile']
            else:
                profile = [(h * (.5 + .5 * sin(i * pi / 8)), -d * .5 * cos(i * pi / 8))
                           for i in range(16)]
            if sum(ay*bz - az*by for (ay,az),(by,bz) in zip(profile,profile[1:]+profile[:1])) < 0:
                profile = profile[::-1]
            near = [(x-w/2, y+py, z+pz) for py,pz in profile]
            far = [(x+w/2, y+py, z+pz) for py,pz in profile]
            polygon(near[::-1], tint, (2, 1))
            polygon(far, tint, (2, 1))
            for i in range(len(profile)):
                j = (i+1) % len(profile)
                axis = (0, 2) if abs(profile[i][1]-profile[j][1]) > abs(profile[i][0]-profile[j][0]) else (0, 1)
                polygon([near[i], near[j], far[j], far[i]], tint, axis)
            return
        if shape == 'beveled':
            a,b,c,e = x-w/2,x+w/2,z-d/2,z+d/2
            bevel = min(w*.18,d*.18,.22)
            outline = [(a+bevel,c),(b-bevel,c),(b,c+bevel),(b,e-bevel),
                       (b-bevel,e),(a+bevel,e),(a,e-bevel),(a,c+bevel)]
            low = [(px,y,pz) for px,pz in outline]
            high = [(px,y+h,pz) for px,pz in outline]
            polygon(low,tint,(0,2))
            polygon(high[::-1],tint,(0,2))
            for i in range(len(low)):
                j = (i+1) % len(low)
                axis = (0,1) if abs(low[i][0]-low[j][0]) > abs(low[i][2]-low[j][2]) else (2,1)
                polygon([low[j],low[i],high[i],high[j]],tint,axis)
            return
        if part.get('shape') == 'rail-strip':
            (ax, ay, az), (bx, by, bz) = part['ends']
            length = hypot(bx - ax, bz - az)
            dx, dz = (az - bz) * d / (2 * length), (bx - ax) * d / (2 * length)
            corners = [(ax+dx, ay, az+dz), (bx+dx, by, bz+dz), (bx-dx, by, bz-dz), (ax-dx, ay, az-dz)]
            top = [(px, py+h, pz) for px, py, pz in corners]
            self.polygon(top, tint, (0, 2))
            for k in (0, 2):
                j = (k + 1) % 4
                self.polygon([corners[k], corners[j], top[j], top[k]], tint, (0, 1))
            return
        if part.get('shape') == 'palm-crown':
            for leaf in range(10):
                a = leaf * pi / 5
                dx, dz = cos(a), sin(a)
                length = (w if leaf % 2 else d) * (.43 if leaf % 3 else .49)
                spine = [(x, y+h*.47, z), (x+dx*length*.38, y+h*.92, z+dz*length*.38),
                         (x+dx*length*.76, y+h*.67, z+dz*length*.76), (x+dx*length, y+h*.12, z+dz*length)]
                for i, width in enumerate((.12,.27,.18)):
                    sx,sy,sz=spine[i]
                    ex,ey,ez=spine[i+1]
                    bow=.18 if i<2 else 0
                    patch=[(sx-dz*width,sy-bow,sz+dx*width),(sx,sy,sz),
                           (ex,ey,ez),(ex-dz*width*.65,ey-bow,ez+dx*width*.65)]
                    dark=tuple(c*(.86+.035*(leaf%4)) for c in tint)
                    self.polygon(patch,dark,(0,2),8)
                    self.polygon(patch[::-1],dark,(0,2),8)
                    patch=[(sx,sy,sz),(sx+dz*width,sy-bow,sz-dx*width),
                           (ex+dz*width*.65,ey-bow,ez-dx*width*.65),(ex,ey,ez)]
                    self.polygon(patch,tint,(0,2),8)
                    self.polygon(patch[::-1],tint,(0,2),8)
            return
        if part.get('shape') == 'round-sign':
            profile=[(x+cos(i*pi/12)*w/2,y+h/2+sin(i*pi/12)*h/2,z-d/2) for i in range(24)]
            self.polygon(profile[::-1],tint,(0,1))
            return
        if part.get('shape') == 'cylinder':
            radial = [(x + cos(i * pi / 8) * w / 2, z + sin(i * pi / 8) * d / 2) for i in range(16)]
            self.polygon([(px, y + h, pz) for px, pz in reversed(radial)], tint, (0, 2))
            self.polygon([(px, y, pz) for px, pz in radial], tint, (0, 2))
            for (ax, az), (bx, bz) in zip(radial, radial[1:] + radial[:1]):
                self.polygon([(bx, y, bz), (ax, y, az), (ax, y + h, az), (bx, y + h, bz)], tint, (0, 1))
            return
        a, b, c, d0 = x - w / 2, x + w / 2, z - d / 2, z + d / 2
        pts = [(a, y, c), (b, y, c), (b, y, d0), (a, y, d0),
               (a, y+h, c), (b, y+h, c), (b, y+h, d0), (a, y+h, d0)]
        if part.get('shape') == 'wall-panel':
            positive = part['facing'] > 0
            if w > d:
                face,axis = ((3,2,6,7) if positive else (1,0,4,5)),(0,1)
            else:
                face,axis = ((2,1,5,6) if positive else (0,3,7,4)),(2,1)
            self.polygon([pts[i] for i in face],tint,axis)
            return
        for face, axis in [((0, 1, 2, 3), (0, 2)), ((7, 6, 5, 4), (0, 2)),
                           ((1, 0, 4, 5), (0, 1)), ((3, 2, 6, 7), (0, 1)),
                           ((0, 3, 7, 4), (2, 1)), ((2, 1, 5, 6), (2, 1))]:
            polygon([pts[i] for i in face], tint, axis)

    def make_mesh(self, name, surface, cast, collection, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        mesh.update()
        mesh.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='CORNER').data.foreach_set('color', self.colors)
        mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', self.uv)
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj['villageSurface'], obj['villageCaster'] = surface, cast
        return obj


def bake_terrain(plan, batches):
    heights, spacing, limit = (plan[k] for k in ('heights', 'spacing', 'limit'))
    divisions = len(heights) - 1
    tiled_paving = defaultdict(list)
    for part in sorted((b for b in plan['parts'] if 'groundLayer' in b), key=lambda b: b['groundLayer']):
        x, z, w, d = (part[k] for k in ('x', 'z', 'w', 'd'))
        left, right, near, far = x-w/2, x+w/2, z-d/2, z+d/2
        entry = left,right,near,far,part['surface'],color(part['color']),part['id']=='tunnel-roadbed'
        for j in range(max(0,floor((near+limit)/spacing)),min(divisions,ceil((far+limit)/spacing))):
            for i in range(max(0,floor((left+limit)/spacing)),min(divisions,ceil((right+limit)/spacing))):
                tiled_paving[i,j].append(entry)

    tiled_roads = defaultdict(list)
    for road in plan['roads']:
        x,z,w,d = (road[k] for k in ('x','z','w','d'))
        edge = 2.6
        pad = edge+.5
        left,right,near,far = x-w/2-pad,x+w/2+pad,z-d/2-pad,z+d/2+pad
        lane = (x,z,w,d,edge)
        for j in range(max(0,floor((near+limit)/spacing)),min(divisions,ceil((far+limit)/spacing))):
            for i in range(max(0,floor((left+limit)/spacing)),min(divisions,ceil((right+limit)/spacing))):
                tiled_roads[i,j].append(lane)

    sand, silt, compacted = color('#cdb28e'), color('#9b886d'), color('#a8906e')
    low,high=(limit-896)//spacing,(limit+896)//spacing
    stride=4

    def smooth(a,b,value):
        t=max(0,min(1,(value-a)/(b-a)))
        return t*t*(3-2*t)

    def blend(a,b,amount):
        return tuple(v+(w-v)*amount for v,w in zip(a,b))

    def terrain_tint(point, roads):
        x,y,z=point
        tint=blend(silt,sand,smooth(-2.6,-.16,y))
        wear=0
        for cx,cz,w,d,edge in roads:
            across,along,width,length=(z-cz,x-cx,d,w) if w>d else (x-cx,z-cz,w,d)
            jitter=.30*sin(along*.24)+.17*sin(along*.79)
            center=abs(across+jitter)
            shoulder=1-smooth(width*.30,width*.5+edge,center)
            rut=1-smooth(width*.035,width*.145,abs(center-width*.22))
            end=1-smooth(length/2-1.7,length/2+edge,abs(along))
            mottling=.93+.07*sin(x*.93+z*.43)*cos(z*.89-x*.52)
            wear=max(wear,end*shoulder*(.42+.52*rut)*mottling)
        return blend(tint,compacted,wear)

    def road_cuts(lanes,axis,base):
        lo,hi=base,base+spacing
        cuts=set()
        for cx,cz,w,d,edge in lanes:
            center,span=(cx,w) if axis==0 else (cz,d)
            across=(d>w) if axis==0 else (w>d)
            if across:
                distances=(0,span*.08,span*.22,span*.34,span*.50,span*.50+edge)
            else:
                distances=(span*.5-1.7,span*.5,span*.5+edge)
            for offset in distances:
                cuts.update(value for value in (center-offset,center+offset) if lo<value<hi)
        return cuts

    def coarse_tile(i,j):
        end_i,end_j=i+stride,j+stride
        left=range(j+1,end_j) if i==high and low<=j<high else ()
        bottom=range(i+1,end_i) if end_j==low and low<=i<high else ()
        right=range(end_j-1,j,-1) if end_i==low and low<=j<high else ()
        top=range(end_i-1,i,-1) if j==high and low<=i<high else ()
        border=[(i,j),*((i,n) for n in left),(i,end_j),*((n,end_j) for n in bottom),
                (end_i,end_j),*((end_i,n) for n in right),(end_i,j),*((n,j) for n in top)]
        tile=batches['Base','village-sand',False,i//64+80,j//64+80]

        def vertex(point):
            a,b=point
            return a*spacing-limit,heights[b][a],b*spacing-limit

        tone=color('#ccb18a' if (i//stride+j//stride)%5 else '#caaf88')
        if len(border)==4:
            a,b,c,d=map(vertex,border)
            tile.polygon([a,b,d],tone,(0,2),22)
            tile.polygon([d,b,c],tone,(0,2),22)
            return
        center=vertex((i+stride//2,j+stride//2))
        for a,b in zip(border,border[1:]+border[:1]):
            tile.polygon([center,vertex(a),vertex(b)],tone,(0,2),22)

    for j in range(divisions):
        for i in range(divisions):
            if not (low<=i<high and low<=j<high):
                if not (i%stride or j%stride):
                    coarse_tile(i,j)
                continue
            x,z=i*spacing-limit,j*spacing-limit
            a,b,c,d=heights[j][i],heights[j][i+1],heights[j+1][i],heights[j+1][i+1]
            layers=tiled_paving.get((i,j),())
            lanes=tiled_roads.get((i,j),())
            tile_key=(i//32+50,j//32+50)
            if not layers and not lanes:
                tile=batches['Base','village-sand',False,*tile_key]
                corners=[(x,a,z),(x,c,z+spacing),(x+spacing,b,z),(x+spacing,d,z+spacing)]
                for indices in [(0,1,2),(2,1,3)]:
                    points=[corners[k] for k in indices]
                    tile.polygon(points,sand,(0,2),10,tints=[terrain_tint(p,()) for p in points])
                continue
            # A single triangulated surface under every road and marking avoids
            # coplanar asphalt overlays. Keep the same triangle seam as terrain.js.
            xs=sorted({x,x+spacing,*road_cuts(lanes,0,x),*(v for layer in layers for v in layer[:2] if x<v<x+spacing)})
            zs=sorted({z,z+spacing,*road_cuts(lanes,1,z),*(v for layer in layers for v in layer[2:4] if z<v<z+spacing)})
            if any(layer[-1] for layer in layers):
                xs=sorted(set(xs).union(range(x+2,x+spacing,2)))
                zs=sorted(set(zs).union(range(z+2,z+spacing,2)))
            seam=x+z+spacing

            def triangled(rect, below):
                points=[]
                for start,end in zip(rect,rect[1:]+rect[:1]):
                    v0,v1=sum(start)-seam,sum(end)-seam
                    inside0,inside1=(v0<=0,v1<=0) if below else (v0>=0,v1>=0)
                    if inside0:
                        points.append(start)
                    if inside0!=inside1 and v0!=0 and v1!=0:
                        f=v0/(v0-v1)
                        points.append(tuple(start[k]+(end[k]-start[k])*f for k in range(2)))
                return points

            def lifted(points):
                result=[]
                for px,pz in points:
                    u,w=(px-x)/spacing,(pz-z)/spacing
                    y=a+(b-a)*u+(c-a)*w if u+w<=1 else d+(c-d)*(1-u)+(b-d)*(1-w)
                    result.append((px,y,pz))
                return result

            for left,right in zip(xs,xs[1:]):
                for near,far in zip(zs,zs[1:]):
                    mx,mz=(left+right)/2,(near+far)/2
                    paint=next((t for t in reversed(layers) if t[0]<mx<t[1] and t[2]<mz<t[3]),None)
                    surface,tone,lit=paint[4:] if paint else ('village-sand',sand,False)
                    tile=batches['Base',surface,False,*tile_key]
                    rect=[(left,near),(left,far),(right,far),(right,near)]
                    scale=10 if surface=='village-sand' else 8
                    for below in (True,False):
                        points=triangled(rect,below)
                        if len(points)>=3:
                            points=lifted(points)
                            tints=None if paint else [terrain_tint(p,lanes) for p in points]
                            if lit:
                                tints=[tunnel_tint(plan['tunnel'],p,tone) for p in points]
                            tile.polygon(points,tone,(0,2),scale,tints=tints)


def main():
    plan_path, asset_path, stage_path, *options = sys.argv[sys.argv.index('--') + 1:]
    plan = json.loads(Path(plan_path).read_text(encoding='utf-8'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    groups = {}
    for key in ('Base', 'Detail'):
        groups[key] = bpy.data.collections.new('Nahar ' + key)
        scene.collection.children.link(groups[key])

    preview_mat = bpy.data.materials.new('Tint')
    preview_mat.use_nodes = True
    nodes = preview_mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .89
    vertex = nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Tint'
    preview_mat.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Base Color'])

    batches = defaultdict(Batch)
    for part in plan['parts']:
        if 'groundLayer' in part:
            continue
        detail = part['detailLevel'] > 0
        category = 'Detail' if detail else 'Base'
        x, z = part['x'], part['z']
        zone = 92 if abs(x) < 440 and abs(z) < 285 else 245
        cast = (not detail and part['h'] > .18 and abs(x) < 438 and abs(z) < 280)
        tunnel=plan['tunnel'] if part['id'].startswith(('tunnel-','vault-rib-','exit-')) else None
        batches[category, part['surface'], cast, int(x // zone), int(z // zone)].block(part,color(part['color']),tunnel)

    bake_terrain(plan,batches)

    for (category, surface, cast, x, z), batch in batches.items():
        batch.make_mesh(f'{category}-{surface}-{x}-{z}-{int(cast)}', surface, cast, groups[category], preview_mat)

    # GLB layers use the same voxel-free shapes as the map's collision plan.
    for category, collection in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in collection.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(Path(asset_path) / f'{category.lower()}.glb'), export_format='GLB',
                                  use_selection=True, export_extras=True, export_materials='NONE', export_vertex_color='ACTIVE')

    if '--preview' in options:
        preview_scene(scene, Path(stage_path))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).resolve().parent / 'nahar.blend'), compress=True)


def preview_scene(scene, stage):
    bpy.ops.object.camera_add(location=(-179, 174, 92))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((64, -27, 18)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens, camera.data.clip_end = 39, 3600
    scene.camera = camera
    for index, (x, z, y) in enumerate(((-111, -120, 68), (2, -77, 61))):
        asset = Path(__file__).resolve().parents[2] / 'src/assets/black-hawk/black-hawk.glb'
        existing = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(asset))
        imported = set(bpy.data.objects) - existing
        for obj in list(imported):
            node = obj
            while node is not None and not node.name.startswith(('LOD1', 'LOD2')):
                node = node.parent
            obj.hide_render = node is not None
            if obj.type=='MESH' and node is None and not obj.data.color_attributes:
                body=obj.data.color_attributes.new(name='Preview tint',type='FLOAT_COLOR',domain='POINT')
                materials=' '.join(m.name.lower() for m in obj.data.materials if m)
                shade='#667777' if 'glass' in materials else '#494f43'
                body.data.foreach_set('color',[*color(shade),1]*len(body.data))
        parents = [obj for obj in imported if obj.parent is None]
        bpy.ops.object.empty_add(location=(x,-z,y))
        anchor = bpy.context.object
        anchor.name = f'Preview Hawk {index + 1}'
        anchor.rotation_euler.z = -1.65
        for root in parents:
            root.parent = anchor

    scene.render.engine='BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light='STUDIO'
    shading.color_type='VERTEX'
    shading.show_shadows=True
    shading.show_cavity=True
    shading.cavity_type='BOTH'
    shading.curvature_ridge_factor=1.08
    shading.curvature_valley_factor=1.2
    shading.background_type='WORLD'
    if not scene.world:
        scene.world=bpy.data.worlds.new('Nahar Dawn')
    scene.world.color=(.41,.30,.22)
    scene.view_settings.exposure=.68
    scene.render.resolution_x, scene.render.resolution_y = 2560, 1440
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(stage / 'preview.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
