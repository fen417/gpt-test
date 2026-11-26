"""Blender geometry and shading helpers for detailed weapon viewmodels."""
import math

import bmesh
import bpy
from mathutils import Vector

from weapon_mesh import Assembly, optic_shell


class DetailedAssembly(Assembly):
    varied_finishes = ()

    def box(self, center, size, color, bevel=.002):
        if not bevel:
            return super().box(center, size, color, bevel)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vertex in bm.verts:
            vertex.co = Vector(c + extent * p for c, extent, p in zip(center, size, vertex.co))
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size)*.22),
                       segments=3, affect='EDGES')
        bm.verts.index_update()
        self.add([tuple(v.co) for v in bm.verts], [tuple(v.index for v in f.verts) for f in bm.faces], color)
        bm.free()

    def cylinder(self, center, radius, length, axis, color, sides):
        super().cylinder(center, radius, length, axis, color, max(32, sides * 2))

    def object(self, name, collection):
        obj = super().object(name, collection)
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        for face in bm.faces:
            face.smooth = True
        for edge in bm.edges:
            edge.smooth = edge.is_manifold and edge.calc_face_angle() < math.radians(48)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        # Large cast faces stay flat. Smooth bevels and circular flanks catch
        # their own highlights in both Blender and the GLB.
        normals = obj.modifiers.new('Face-weighted normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        normals.weight = 32
        paint = mesh.color_attributes['Paint'].data
        for face, finish in zip(mesh.polygons, self.colors):
            for loop in face.loop_indices:
                x, z, y = mesh.vertices[mesh.loops[loop].vertex_index].co
                mottling = math.sin(31*z + 17*y) * math.sin(47*y - 13*x)
                tint = 1 + mottling * (.026 if finish in self.varied_finishes else .014)
                paint[loop].color = (*(channel * tint for channel in finish), 1)
        return obj


def engraved_mark(mesh, text, x, y, z, spacing, color):
    font = bpy.data.curves.new('Engraved marking', 'FONT')
    font.body, font.size, font.resolution_u = text, spacing*5.7, 4
    label = bpy.data.objects.new('Engraved marking',font)
    bpy.context.scene.collection.objects.link(label)
    bpy.context.view_layer.update()
    surface = bpy.data.meshes.new_from_object(label.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    sign = math.copysign(1,x)
    mesh.add([(x,y+v.co.y-spacing*4,z-sign*v.co.x) for v in surface.vertices],
             [tuple(f.vertices) if x > 0 else tuple(reversed(f.vertices)) for f in surface.polygons],color)
    bpy.data.meshes.remove(surface)
    bpy.data.objects.remove(label,do_unlink=True)
    bpy.data.curves.remove(font)


def round_aperture(mesh, y, z, inner, outer, depth, color):
    front, rear = z-depth/2, z+depth/2
    bevel = min(.0014, depth/5)
    optic_shell(mesh,y,[(front,outer-bevel),(front+bevel,outer),
                        (rear-bevel,outer),(rear,outer-bevel)],
                [(front,inner+bevel),(front+bevel,inner),(rear-bevel,inner),
                 (rear,inner+bevel)],color,sides=64)


def molded_grip(mesh, outlines, shell, texture, *, panel):
    """Loft the grip and assign the rough flank in the same continuous surface."""
    angles = [math.tau*i/64 for i in range(64)]
    offset = len(mesh.vertices)
    for y,rear,front,half_width in outlines:
        for angle in angles:
            x,z = math.cos(angle),math.sin(angle)
            mesh.vertices.append((math.copysign(abs(x)**.66,x)*half_width,y,
                                  (rear+front)/2 + math.copysign(abs(z)**.66,z)*(rear-front)/2))
    count = len(angles)
    faces, colors = [tuple(reversed(range(count)))], [shell]
    for band, (upper, lower) in enumerate(zip(outlines,outlines[1:])):
        inside = panel[0] <= (upper[0]+lower[0])/2 <= panel[1]
        for i, angle in enumerate(angles):
            j = (i+1)%count
            faces.append((band*count+i,band*count+j,(band+1)*count+j,(band+1)*count+i))
            colors.append(texture if inside and abs(math.cos(angle+math.pi/count)) > .69 else shell)
    end = (len(outlines)-1)*count
    faces.append(tuple(end+i for i in range(count)))
    colors.append(shell)
    mesh.faces.extend(tuple(offset+i for i in face) for face in faces)
    mesh.colors.extend(colors)
