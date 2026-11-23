"""Build the open ram-air parachute and export its game mesh."""

import math
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
EXPORT = HERE.parents[1] / "src/assets/parachute/parachute.glb"
WEBBING_HEIGHT = 1.42
OLIVE = "Olive ripstop"
TIPS = "Sand ripstop"
SEAMS = "Reinforced seams"
MOUTHS = "Cell interiors"
CORD = "Suspension lines"
HARDWARE = "Riser hardware"


def material(name, rgb, roughness, metal=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb,1)
    mat.use_nodes = True
    surface = mat.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = mat.diffuse_color
    surface.inputs["Roughness"].default_value = roughness
    surface.inputs["Metallic"].default_value = metal
    mat.use_backface_culling = False
    return mat


def to_blender(p):
    x,y,z = p
    return (x,-z,y-WEBBING_HEIGHT)


def mesh(name, vertices, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([to_blender(p) for p in vertices],[],faces)
    data.update()
    obj = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(bpy.data.materials[mat])
    for face in data.polygons:
        face.use_smooth = smooth
    return obj


class Tubes:
    def __init__(self):
        self.vertices = []
        self.faces = []

    def add(self, points, width, sides=5):
        points = [Vector(p) for p in points]
        start = len(self.vertices)
        for i,p in enumerate(points):
            direction = (points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
            a = direction.cross(Vector((1,0,0) if abs(direction.x)<.88 else (0,0,1))).normalized()
            b = direction.cross(a)
            for j in range(sides):
                angle = j*math.tau/sides
                self.vertices.append(p+width*(a*math.cos(angle)+b*math.sin(angle)))
        for i in range(len(points)-1):
            k = start+i*sides
            for j in range(sides):
                a,b = k+j,k+(j+1)%sides
                self.faces.append((b,a,a+sides,b+sides))

    def mesh(self,name,mat):
        return mesh(name,self.vertices,self.faces,mat,True)


# One inflated airfoil section, from the top lip around to the lower lip.
PROFILE = [
    (-1.09,.18),(-.89,.35),(-.53,.41),(.0,.35),(.54,.22),
    (.98,.09),(1.23,.0),(.98,-.047),(.53,-.12),
    (.0,-.21),(-.54,-.25),(-.86,-.22),(-1.08,-.15),
]


def surface(x,z,y):
    edge = abs(x)/3.15
    chord = 1-.28*edge**2
    return (x,5.68-.83*edge**2+y,z*chord+.23*edge**2)


def canopy():
    width = 6.30
    count = 9
    seams = Tubes()
    suspension = Tubes()
    hardware = Tubes()
    for cell in range(count):
        left = -width/2+cell*width/count
        right = left+width/count
        bands = [0,.23,.5,.77,1]
        vertices = []
        for t in bands:
            x = left+(right-left)*t
            inflation = .57+.43*math.sin(t*math.pi)
            vertices.extend(surface(x,z,y*inflation) for z,y in PROFILE)
        cuts = len(PROFILE)
        faces = [(i*cuts+j,(i+1)*cuts+j,(i+1)*cuts+j+1,i*cuts+j+1)
                 for i in range(len(bands)-1) for j in range(cuts-1)]
        mesh(f"Canopy cell {cell+1}",vertices,faces,TIPS if cell in (0,count-1) else OLIVE,True)
        if cell in (0,count-1):
            side_profile=[surface(left if cell==0 else right,z,y*.57) for z,y in PROFILE]
            mesh(f"Sealed tip {cell+1}",side_profile,[tuple(range(cuts))],TIPS)
        mouth = [surface(x,-.86,y) for x,y in [(left,-.11),(right,-.11),(right,.14),(left,.14)]]
        mesh(f"Ram-air inlet {cell+1}",mouth,[(0,1,2,3)],MOUTHS)
        seams.add([surface(right,-1.08,-.086),surface(right,-1.09,.103)],.012)
        for lip in (0,-1):
            z,y = PROFILE[lip]
            seams.add([surface(left+(right-left)*t,z,y*(.57+.43*math.sin(t*math.pi))) for t in bands],.012)
        if cell==0:
            seams.add([surface(left,z,y*.57) for z,y in PROFILE],.018)
        seams.add([surface(right,z,y*.57) for z,y in PROFILE],.015)
        seams.add([surface(left+(right-left)*t,1.23,0) for t in bands],.010)

    for side in (-1,1):
        shoulder=(side*.225,WEBBING_HEIGHT,.045)
        split=(side*.465,2.41,.013)
        suspension.add([shoulder,split],.027,6)
        hardware.add([(side*.234,1.54,.043),(side*.272,1.73,.034)],.032,6)
        for x in (.42,1.04,1.68,2.35,2.94):
            for z,y in [(-.80,-.205),(.34,-.13),(.87,-.052)]:
                attach=surface(side*x,z,y)
                suspension.add([split,attach],.008)
        a=side*.40
        seams.add([(a,2.24,-.17),(a,2.27,.20)],.018)
    seams.mesh("Canopy seam tape",SEAMS)
    suspension.mesh("Suspension and risers",CORD)
    hardware.mesh("Riser buckles",HARDWARE)


def main():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.filepaths.save_version = 0
    material(OLIVE,(.126,.143,.077),.91)
    material(TIPS,(.34,.29,.17),.89)
    material(SEAMS,(.052,.061,.032),.92)
    material(MOUTHS,(.021,.027,.015),.97)
    material(CORD,(.18,.173,.136),.84)
    material(HARDWARE,(.09,.10,.10),.49,.58)
    canopy()
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=11
            area.spaces.active.region_3d.view_location=(0,0,2.8)
            area.spaces.active.shading.color_type='MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"parachute.blend"),compress=True)
    for mat in bpy.data.materials:
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
        if not objects:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        bpy.context.object.name=mat.name
    EXPORT.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',export_animations=False)


if __name__ == "__main__":
    main()
