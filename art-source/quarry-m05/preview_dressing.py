"""Preview the authored dressing with the quarry terrain and industrial kit."""
from math import hypot

REVIEW.mkdir(parents=True,exist_ok=True)
scene.collection.children.unlink(root)
reference=collection('Quarry context for review',scene.collection)
with bpy.data.libraries.load(str(SOURCE.parent/'industrial.blend'),link=False) as (original,copy):
    copy.objects=list(original.objects)
dynamic={'gun_base','gun_top','fuel_cab_door','fuel_truck','repair_tool','coffee_cup'}
for obj in copy.objects:
    if obj is None:
        continue
    prefix=obj.name.split(' | ')[0]
    if prefix in dynamic:
        continue
    reference.objects.link(obj)
    if obj.type=='MESH' and not obj.data.color_attributes:
        color=obj.data.color_attributes.new(name='Preview color',type='BYTE_COLOR',domain='CORNER')
        for face in obj.data.polygons:
            mat=obj.data.materials[face.material_index]
            for j in face.loop_indices:
                color.data[j].color=mat.diffuse_color

geometry=Geometry()
for item in layout['boxes']:
    x,z,w,d,h,y,c=(item[k] for k in ('x','z','w','d','h','baseY','color'))
    geometry.box(x,y+h/2,z,w,h,d,c,2,0)
object_for(geometry.mesh('Original quarry buildings'), 'Original quarry buildings',reference)

height=layout['heights']
n=len(height)
ground=Geometry()
ground.vertices=[(x*4-480,yy,z*4-480) for z,row in enumerate(height) for x,yy in enumerate(row)]
ground_colors=['#bbaa8c','#bdab8c','#c1ae8d','#c4af8f','#c0ae91','#c0aa87']
for z in range(n-1):
    for x in range(n-1):
        i=z*n+x
        ground.faces.extend(((i,i+n,i+1),(i+1,i+n,i+n+1)))
        grade=hypot(height[z][x]-height[z][x+1],height[z][x]-height[z+1][x])
        color=rock[1] if grade>3.7 else rock[2] if grade>2.5 else ground_colors[(x*13+z*37+x*z)%len(ground_colors)]
        ground.colors.extend((color,color))
        ground.surfaces.extend((2,2))
obj=object_for(ground.mesh('Quarry heightfield'), 'Quarry heightfield',reference)
for face in obj.data.polygons:
    face.use_smooth=True

camera_obj=object_for(bpy.data.cameras.new('Review camera'),'Review camera',reference)
scene.camera=camera_obj
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=1060
scene.render.resolution_y=630
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
shading=scene.display.shading
shading.light='STUDIO'
shading.color_type='VERTEX'
shading.show_shadows=False
shading.show_cavity=True
shading.cavity_type='BOTH'
shading.curvature_ridge_factor=1.07
shading.curvature_valley_factor=.84
shading.cavity_ridge_factor=1.12
shading.cavity_valley_factor=.75
scene.world=bpy.data.worlds.new('Neutral review sky')
scene.world.color=(.39,.47,.53)
shading.background_type='WORLD'
scene.view_settings.view_transform='Standard'
views=[
    ('repair-camp',(-270,34.8,-233.4),(-261,33,-228.1),35),
    ('crusher-hall',(-63,14.4,-7),(-39,13.7,-1),33),
    ('industrial-yard',(111,19,-2),(72,6,48),38),
    ('fuel-yard',(-120,7.1,189),(-123,3.3,163),37),
]
for name,position,focus,lens in views:
    camera_obj.location=to_blender(*position)
    direction=Vector(to_blender(*focus))-camera_obj.location
    camera_obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    camera_obj.data.lens=lens
    scene.render.filepath=str(REVIEW/(name+'.png'))
    bpy.ops.render.render(write_still=True)
