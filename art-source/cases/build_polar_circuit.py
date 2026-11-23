"""Apply the Polar Circuit finish to the editable Field Reserve case."""

import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source" / "cases"
EXPORT = ROOT / "src" / "assets" / "cases"
NAME = "polar-circuit"

bpy.ops.wm.open_mainfile(filepath=str(SOURCE / "field-reserve.blend"))
scene = bpy.context.scene


def retint(name, color, metal, roughness):
    mat = bpy.data.materials[name]
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = roughness
    return mat


retint("Molded olive composite", (.33, .49, .61), .27, .44)
retint("Raised shell rails", (.041, .108, .163), .44, .42)
retint("Graphite impact guards", (.022, .027, .054), .09, .62)
retint("Dark hardware", (.135, .209, .257), .71, .34)
retint("Amber latch releases", (.078, .66, .57), .44, .38)
retint("Studio slate", (.033, .044, .064), .13, .55)
plate_color = (.024, .055, .094)
plate_mat = retint("Identification panel", plate_color, .22, .44)


def emission(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    light = tree.nodes.new("ShaderNodeEmission")
    light.inputs["Color"].default_value = (*color, 1)
    tree.links.new(light.outputs[0], tree.nodes.get("Material Output").inputs["Surface"])
    return mat


def rectangle(objects, name, position, dimensions, mat, rotation=0):
    w, h = dimensions[0] / 2, dimensions[1] / 2
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(-w, -h, 0), (w, -h, 0), (w, h, 0), (-w, h, 0)], [], [(0, 1, 2, 3)])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    objects.link(obj)
    obj.location = position
    obj.rotation_euler.z = rotation


def print_label(width, height):
    bake = bpy.data.scenes.new("Polar case label")
    objects = bake.collection.objects
    dark = emission("Label background", plate_color)
    cream = emission("Label ice-white ink", (.73, .87, .93))
    teal = emission("Label teal ink", (.17, .74, .64))
    rule = emission("Label printed guides", (.058, .18, .24))
    rectangle(objects, "Background", (0, 0, 0), (width + .02, height + .02), dark)
    for i in range(3):
        rectangle(objects, "Handling stripe", (-.167 + .018*i, .001, .002),
                  (.008, .075), teal, -.22)
    rectangle(objects, "Underline", (.030, -.018, .001), (.257, .002), rule)
    for content, y, size, mat in (
        ("SECTOR 09", .037, .024, teal),
        ("POLAR CIRCUIT", -.007, .038, cream),
        ("S09 / PC-037", -.052, .018, teal),
    ):
        data = bpy.data.curves.new(content, "FONT")
        data.body = content
        data.size = size
        data.space_character = 1.12
        data.materials.append(mat)
        label = bpy.data.objects.new(content, data)
        label.location = (-.101, y, .003)
        objects.link(label)
    camera = bpy.data.objects.new("Label camera", bpy.data.cameras.new("Label projection"))
    objects.link(camera)
    camera.location.z = 1
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = width
    bake.camera = camera
    bake.view_settings.view_transform = "Standard"
    bake.render.engine = "CYCLES"
    bake.cycles.samples = 2
    bake.render.resolution_x = 960
    bake.render.resolution_y = round(960 * height / width)
    bake.render.resolution_percentage = 100
    bake.render.image_settings.file_format = "PNG"
    with TemporaryDirectory() as directory:
        bake.render.filepath = str(Path(directory) / "polar-label.png")
        bpy.ops.render.render(scene=bake.name, write_still=True)
        texture = bpy.data.images.load(bake.render.filepath)
        texture.name = "Polar Circuit lid print"
        texture.pack()
    for obj in list(objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(bake)
    return texture


plate = bpy.data.objects["Back identification panel"]
width, height = plate.dimensions.x, plate.dimensions.y
texture = print_label(width, height)
uv = plate.data.uv_layers.new(name="Lid print")
uv.active_render = True
for polygon in plate.data.polygons:
    for index in polygon.loop_indices:
        co = plate.data.vertices[plate.data.loops[index].vertex_index].co
        uv.uv[index].vector = (co.x / width + .5, co.y / height + .5) if polygon.normal.z > .9 else (.01, .01)
graph = plate_mat.node_tree
coordinates = graph.nodes.new("ShaderNodeUVMap")
coordinates.uv_map = uv.name
print_node = graph.nodes.new("ShaderNodeTexImage")
print_node.image = texture
print_node.extension = "EXTEND"
graph.links.new(coordinates.outputs["UV"], print_node.inputs["Vector"])
graph.links.new(print_node.outputs["Color"], graph.nodes.get("Principled BSDF").inputs["Base Color"])

# The original lettering is a flat decal. Its replacement lives in the lid texture.
for name in ("Unit marking", "Case marking", "Asset number"):
    bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

for name, color in (("Warm key", (.84, .93, 1)), ("Cool fill", (.74, .83, 1)), ("Top rim", (.8, .74, 1))):
    bpy.data.objects[name].data.color = color
scene.cycles.samples = 32
case_objects = [obj for obj in scene.objects if obj.type == "MESH" and obj.name != "Studio floor"]
bpy.ops.object.select_all(action="DESELECT")
for obj in case_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = plate
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f"{NAME}.blend"))
bpy.ops.export_scene.gltf(filepath=str(EXPORT / f"{NAME}.glb"), use_selection=True, export_apply=True)

if "--" in sys.argv:
    scene.render.filepath = str(Path(sys.argv[sys.argv.index("--") + 1]).resolve())
    bpy.ops.render.render(write_still=True)
