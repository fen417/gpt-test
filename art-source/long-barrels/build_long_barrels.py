"""Build the socket-local long barrels from the editable stock weapons."""
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ART = Path(__file__).resolve().parents[1]
EXPORT = ART.parent / "src/assets/infantry/long-barrels.glb"

# The rear of each assembly stays in place. Length is added ahead of the
# handguard, gas block or barrel shroud, preserving the stock muzzle detail.
VARIANTS = {
    "ar416": ("ar416/ar416.blend", .68, .77, .124, .863),
    "ak12": ("ak12m/ak12m.blend", .708, .747, .132, .865),
    "mcx9": ("smg/mcx9.blend", .575, .592, .112, None),
    "vk45": ("smg/vk45.blend", .511, .527, .101, None),
    "mg36": ("machine-guns/mg36.blend", .786, .878, .139, None),
    "pkp": ("machine-guns/pkp.blend", .955, 1.013, .154, None),
    "dmr12": ("marksman/dmr12.blend", .705, .818, .148, None),
    "sv98": ("marksman/sv98.blend", .705, .946, .171, None),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for weapon, (source, start, end, extra, front) in VARIANTS.items():
    with bpy.data.libraries.load(str(ART / source)) as (available, loaded):
        loaded.objects = [name for name in ("Barrel", "MuzzleDevice", "Mount_Barrel", "Muzzle_Exit")
                          if name in available.objects]
        names = loaded.objects.copy()
    stock = dict(zip(names, loaded.objects))
    socket = stock["Mount_Barrel"].location.copy()
    group = bpy.data.objects.new(weapon, None)
    scene.collection.objects.link(group)
    for name in ("Barrel", "MuzzleDevice"):
        if name not in stock:
            continue
        original = stock[name]
        replacement = bpy.data.objects.new(weapon + "_" + name, original.data.copy())
        scene.collection.objects.link(replacement)
        replacement.parent = group
        for vertex in replacement.data.vertices:
            pos = original.matrix_basis @ vertex.co
            weight = max(0, min(1, (pos.y - start) / (end - start))) if name == "Barrel" else 1
            pos.y += weight * extra
            vertex.co = pos - socket
        replacement.data.update()
    muzzle = stock["Muzzle_Exit"].location.copy() if front is None else Vector((0, front, socket.z))
    tip = bpy.data.objects.new(weapon + "_Muzzle", None)
    scene.collection.objects.link(tip)
    tip.parent = group
    tip.location = muzzle + Vector((0, extra, 0)) - socket
    for original in stock.values():
        bpy.data.objects.remove(original, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format="GLB", export_vertex_color="ACTIVE",
                          export_materials="PLACEHOLDER",
                          export_meshopt_compression_enable=True, export_meshopt_extension="EXT_meshopt_compression")

# Spread out the modules for editing after the socket-local export.
for index, weapon in enumerate(VARIANTS):
    group = scene.objects[weapon]
    group.location.x = index * .13
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            view = area.spaces.active
            view.shading.color_type = "VERTEX"
            view.region_3d.view_location = (.45, .32, 0)
            view.region_3d.view_distance = 1.7
            view.region_3d.view_rotation = Matrix.Identity(3).to_quaternion()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name("long-barrels.blend")), compress=True)
