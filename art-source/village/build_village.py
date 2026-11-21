"""Bake the Dry Wind scene. See README.md for the source and export workflow."""
import base64
import json
import math
import random
import shutil
import sys
from array import array
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / "tank"))
from build_rubezh import Assembly


def color(value):
    return tuple(((c / 255 + .055) / 1.055) ** 2.4 if c > 10 else c / 3294.6
                 for c in bytes.fromhex(value.lstrip("#")))


def shade(value, factor):
    return tuple(min(1, c * factor) for c in value)


CREAM = color("cbb895")
STUCCO = color("b29a7d")
STONE = color("a39178")
TIMBER = color("795a42")
CHAR = color("554436")
TEAL = color("648582")
RED = color("a56b50")
OCHRE = color("bd945d")
IRON = color("59615f")
RUST = color("875843")
PALM = color("667b45")
DRY_LEAF = color("939457")
ACCENTS = (TEAL, RED, OCHRE, CREAM)
TILE = {"wood": 2.0, "concrete": 4.0, "cloth": .65, "metal": 2.4,
        "village-stucco": 3.4, "plain": 3.0, "leaf": 3.0}


def unpack(encoded, kind):
    values = array(kind)
    values.frombytes(base64.b64decode(encoded))
    return values


def material(surface):
    existing = bpy.data.materials.get(surface)
    if existing:
        return existing
    mat = bpy.data.materials.new(surface)
    mat.use_backface_culling = surface != "leaf"
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .67 if surface == "metal" else .92
    shader.inputs["Metallic"].default_value = .35 if surface == "metal" else 0
    paint = nodes.new("ShaderNodeVertexColor")
    paint.layer_name = "Paint"
    mat.node_tree.links.new(paint.outputs["Color"], shader.inputs["Base Color"])
    return mat


def new_mesh(name, scope, surface, cast, vertices, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scope.objects.link(obj)
    obj.data.materials.append(material(surface))
    obj["villageSurface"] = surface
    obj["villageCaster"] = cast
    return mesh


def source_mesh(record, scope):
    p, n, tex, c, indices = (unpack(record[k], "I" if k == "indices" else "f")
                             for k in ("p", "n", "uv", "c", "indices"))
    vertices = [(x, -z, y) for x, y, z in zip(p[::3], p[1::3], p[2::3])]
    mesh = new_mesh(record["name"], scope, record["surface"], record["cast"], vertices,
                    list(zip(indices[::3], indices[1::3], indices[2::3])))
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.normals_split_custom_set_from_vertices([(x, -z, y) for x, y, z in zip(n[::3], n[1::3], n[2::3])])
    paint = mesh.color_attributes.new(name="Paint", type="FLOAT_COLOR", domain="POINT")
    mesh.color_attributes.active_color = paint
    paint.data.foreach_set("color", [v for r, g, b in zip(c[::3], c[1::3], c[2::3]) for v in (r, g, b, 1)])
    uv = mesh.uv_layers.new(name="Tile")
    uv.uv.foreach_set("vector", [tex[2 * loop.vertex_index + a] for loop in mesh.loops for a in (0, 1)])


class DetailMesh(Assembly):
    def box(self, center, size, color, bevel=.025):
        # Small trim, straps and road-level pieces are too thin for a visible bevel.
        super().box(center,size,color,bevel if min(size)>=.09 else 0)


class Street:
    def __init__(self):
        self.parts = {}

    def place(self, item, rotation, construct, cast=True, roll=0):
        local = {}
        construct(lambda surface: local.setdefault(surface, DetailMesh()))
        x, y, z = item["x"], item["baseY"], item["z"]
        cos_y, sin_y = math.cos(rotation), math.sin(rotation)
        cos_z, sin_z = math.cos(roll), math.sin(roll)
        for surface, part in local.items():
            if not part.faces:
                continue
            key = (math.floor(x / 62), math.floor(z / 62), surface, cast)
            out = self.parts.setdefault(key, Assembly())
            offset = len(out.vertices)
            for a,b,c in part.vertices:
                a,b=a*cos_z-b*sin_z,a*sin_z+b*cos_z
                out.vertices.append((x+a*cos_y+c*sin_y,y+b,z-a*sin_y+c*cos_y))
            out.faces.extend(tuple(offset + i for i in face) for face in part.faces)
            out.colors.extend(part.colors)

    def assemble(self, scope):
        for (x, z, surface, cast), part in self.parts.items():
            mesh = new_mesh(f"Detail {x:02d} {z:02d} {surface}", scope, surface, cast,
                            [(a,-c,b) for a,b,c in part.vertices], part.faces)
            paint = mesh.color_attributes.new(name="Paint", type="FLOAT_COLOR", domain="CORNER")
            mesh.color_attributes.active_color = paint
            uv = mesh.uv_layers.new(name="Tile")
            for face, rgb in zip(mesh.polygons, part.colors):
                axis = max(range(3), key=lambda i: abs(face.normal[i]))
                for i in face.loop_indices:
                    u, v, w = mesh.vertices[mesh.loops[i].vertex_index].co
                    tile = ((-v,w), (u,w), (u,-v))[axis]
                    uv.uv[i].vector = tuple(t / TILE[surface] for t in tile)
                    paint.data[i].color = (*rgb, 1)


def chip(mesh, x, y, z, width, height, side, rgb, rng):
    edge = [(-.50,-.27),(-.41,.36),(-.13,.50),(.26,.41),(.50,.11),(.35,-.41),(-.08,-.49)]
    points = [(x+a*width, y+(b+rng.uniform(-.065,.065))*height, z) for a,b in edge]
    order = tuple(range(len(points)))
    mesh.add(points, [order[::-1] if side > 0 else order], rgb)


def rug(mesh, x, y, z, w, d, rgb):
    mesh.box((x,y,z),(w,.016,d),rgb,.004)
    for side in (-1,1):
        mesh.box((x+side*w*.45,y+.010,z),(.037,.002,d*.94),CREAM,0)
        mesh.box((x,y+.011,z+side*d*.436),(w*.94,.002,.036),CREAM,0)
    for i in range(7):
        mesh.box((x+(i-3)*w*.109,y+.011,z),(w*.043,.002,d*.47),shade(rgb,1.4),0)


def house(street, s, number):
    rng = random.Random(9317 + number)
    rotated = s.get("doorAxis") == "x"
    w, d = (s["d"],s["w"]) if rotated else (s["w"],s["d"])
    h, floors = s["h"], s["floors"]
    accent, hue = ACCENTS[number % 4], color(s["color"])

    def kit(layer):
        stone, timber = layer("concrete"), layer("wood")
        steel, plaster = layer("metal"), layer("village-stucco")
        if s["plan"] == "ruin":
            for i in range(18):
                x,z = rng.uniform(-w*.35,w*.25),rng.uniform(-d*.36,d*.36)
                stone.box((x,.033,z),(rng.uniform(.13,.45),.068,rng.uniform(.10,.37)),
                          shade(STONE,rng.uniform(.60,1.18)),.016)
            for i in range(4):
                timber.box((-w/2+.76,h-.23,-d*.34+i*d*.17),(.98,.12,.12),CHAR,.017)
            return
        for side in (-1,1):
            z, x = side*(d/2+.296), side*(w/2+.298)
            for wing in (-1,1):
                width = (w-5.9)/2
                stone.box((wing*(w+5.9)/4,.43,z),(width,.47,.065),STUCCO,.019)
                stone.box((wing*2.94,1.34,z+side*.065),(.135,2.62,.096),accent,.014)
                timber.box((wing*3.04,1.34,z+side*.102),(.11,2.62,.075),TIMBER,.010)
                plaster.box((wing*(w+5.7)/4,.31,side*(d/2-.279)),
                            ((w-5.7)/2,.48,.012),shade(accent,.67),0)
                for y in (.34,1.21,2.16):
                    steel.box((wing*3.04,y,z+side*.144),(.114,.054,.018),IRON,.005)
                for course in range(floors*3):
                    y=.79+course*.96
                    if y<h-.26:
                        stone.box((wing*(w/2-.37),y,z),(.52,.27,.071),shade(CREAM,rng.uniform(.76,.99)),.014)
            stone.box((0,2.77,z+side*.052),(6.14,.18,.18),CREAM,.021)
            stone.box((0,2.889,z+side*.069),(6.37,.072,.22),STUCCO,.013)
            for level in range(floors):
                y=level*3.1
                for window in (-1,1):
                    center=window*d*.24
                    for edge in (-1,1):
                        timber.box((x+side*.072,y+1.701,center+edge*1.408),(.116,1.17,.14),accent,.017)
                        steel.box((x+side*.135,y+1.786,center+edge*1.477),(.020,.158,.045),IRON,.004)
                    stone.box((x+side*.077,y+1.102,center),(.23,.085,2.91),CREAM,.018)
                    stone.box((x+side*.062,y+2.316,center),(.15,.123,2.93),shade(CREAM,.89),.019)
                    timber.box((x+side*.095,y+2.416,center),(.107,.058,2.82),TIMBER,.009)
                if level:
                    stone.box((x,y+.110,0),(.068,.075,d+.07),shade(CREAM,.83),.012)
                    stone.box((0,y+.110,z),(w+.12,.075,.068),shade(CREAM,.83),.012)
            for i in range(12):
                a,y=rng.uniform(-w*.44,w*.44),rng.uniform(.67,h-.44)
                if abs(a)>3.28 or y>2.95:
                    chip(plaster,a,y,side*(d/2+.284),rng.uniform(.30,1.41),rng.uniform(.12,.45),side,
                         shade(hue,rng.uniform(.47,.73)),rng)
            stone.box((x,h-.112,0),(.127,.138,d+.48),CREAM,.020)
            stone.box((0,h-.112,z),(w+.52,.138,.127),CREAM,.020)
            stone.box((side*w/2,h+.762,0),(.51,.071,d+.52),shade(CREAM,.94),.013)
            stone.box((0,h+.762,side*d/2),(w-.51,.071,.51),shade(CREAM,.94),.013)
            for j in range(max(3,math.floor(w/2))):
                xx=(j+.5)*w/max(3,math.floor(w/2))-w/2
                timber.box((xx,h-.285,z+side*.105),(.162,.16,.30),shade(TIMBER,rng.uniform(.74,1.08)),.016)
        mount=-w/2+.75
        steel.box((mount,1.94,-d/2-.33),(.245,.35,.12),IRON,.022)
        steel.box((mount,2.53,-d/2-.34),(.037,1.1,.045),CHAR,.007)
        steel.box(((mount-3.22)/2,3.079,-d/2-.34),(-3.22-mount,.034,.034),CHAR,.006)
        if s["plan"]!="courtyard":
            rug(layer("cloth"),-w*.14,.041,d*.17,2.04,1.37,accent)
        # Flush roof surfacing. Contrasting strips follow the parapet and
        # split the expanse without adding new cover to the playable roof.
        roof_x,roof_w=(w*.18,w*.6) if s["plan"]=="courtyard" else (0,w)
        for side in (-1,1):
            stone.box((roof_x+side*(roof_w/2-.33),h+.257,0),
                      (.31,.014,d-.41),shade(STONE,.90+side*.09),0)
            stone.box((roof_x,h+.256,side*(d/2-.29)),(roof_w-.69,.013,.28),shade(CREAM,.89),0)
        for i in range(max(2,int(d/2.4))):
            z=(i+.5)*2.4-d/2
            stone.box((roof_x,h+.261,z),(roof_w-.83,.009,.029),shade(STONE,.74),0)

    street.place(s,math.pi/2 if rotated else 0,kit)


def stall(street, s, number):
    hue = ACCENTS[number % 4]
    def kit(layer):
        timber, fabric, stone = layer("wood"), layer("cloth"), layer("concrete")
        for x in (-2.98,2.98):
            for z in (-1.77,1.77):
                timber.box((x,.22,z),(.28,.41,.28),CHAR,.021)
                timber.box((x,2.84,z),(.36,.17,.36),TIMBER,.020)
                for y in (.47,2.56):
                    fabric.box((x,y,z),(.238,.062,.238),shade(CREAM,.77),.008)
            timber.box((x,2.928,0),(.13,.18,4.34),TIMBER,.020)
        for side in (-1,1):
            for i in range(12):
                x=-3.11+(i+.5)*.52
                length=.27+.073*math.sin(i*1.91+number)
                fabric.box((x,2.965-length/2,side*2.218),(.519,length,.053),hue if i%3 else CREAM,.012)
                fabric.box((x,2.972-length,side*2.221),(.519,.026,.054),shade(hue,.67),.005)
        for i in range(5):
            x=-2.02+i*.94
            timber.box((x,.951,1.16),(.66,.35,.10),shade(TIMBER,.82),.010)
            stone.cylinder((x,.97,1.256),.028,.012,"z",OCHRE,10)
            fabric.box(((i-2)*.81,3.030,0),(.22,.022,4.17),shade(hue,.71),.006)
        # Light canvas stretched over the existing canopy footprint.
        for i in range(13):
            left=-3.263+i*.502
            right=left+.502
            for j in range(5):
                za,zb=-2.20+j*.88,-2.20+(j+1)*.88
                def height(x,z):
                    return 3.048+.055*math.cos(z*.65)+.042*math.cos(x*.73)
                fabric.add([(left,height(left,za),za),(left,height(left,zb),zb),
                            (right,height(right,zb),zb),(right,height(right,za),za)],
                           [(0,1,2,3)],shade(hue if i%3 else CREAM,.94+(j%2)*.05))
    street.place(s,0,kit)


def well(street,s):
    def kit(layer):
        stone,timber,steel=layer("concrete"),layer("wood"),layer("metal")
        for side in (-1,1):
            stone.box((side*1.26,.95,0),(.57,.13,3.08),STONE,.023)
            stone.box((0,.95,side*1.26),(2.01,.13,.58),STONE,.023)
            timber.box((side*1.64,3.22,0),(.266,.21,.35),TIMBER,.021)
            steel.cylinder((side*1.752,2.30,0),.115,.045,"x",IRON,16)
        for i in range(7):
            timber.cylinder(((i-3)*.028,2.30,0),.144,.024,"x",shade(CREAM,.60+i*.035),14)
    street.place(s,0,kit)


def palm(street,p,seed):
    rng=random.Random(4813+seed)
    def kit(layer):
        leaves,wood=layer("leaf"),layer("wood")
        crown=p["h"]
        wood.cylinder((0,crown-.078,0),.218,.400,"y",TIMBER,14)
        for i in range(13):
            a=i*math.tau/13+rng.uniform(-.19,.19)
            cx,cz=math.cos(a),math.sin(a)
            length,sag=rng.uniform(2.8,4),rng.uniform(.92,2.18)
            def spine(t):
                return (cx*length*t,crown+math.sin(t*math.pi)*.79-sag*t*t,cz*length*t)
            for step in range(9):
                t=.09+step*.099
                x,y,z=spine(t)
                nx,ny,nz=spine(t+.105)
                leaves.add([(x-cz*.032,y,z+cx*.032),(x+cz*.032,y,z-cx*.032),(nx,ny,nz)],[(0,1,2)],DRY_LEAF)
                for side in (-1,1):
                    reach=.77*math.sin(t*math.pi)**.78
                    tip=(x+cx*.42-cz*side*reach,y-.141,z+cz*.42+cx*side*reach)
                    leaves.add([(x,y,z),tip,(nx-cx*.06,ny-.036,nz-cz*.06)],[(0,1,2)],
                               shade(PALM if i%4 else DRY_LEAF,rng.uniform(.71,1.25)))
    street.place(p,0,kit)


def props(street, boxes):
    for number,b in enumerate(boxes):
        kind=b["kind"]
        if kind=="village-palm":
            palm(street,b,number)
            continue
        if kind not in {"village-barricade","village-barrels","village-rubble","crate","village-pottery",
                        "village-bed","village-cabinet","village-table","village-shelf"}:
            continue
        w,d,h=b["w"],b["d"],b["h"]
        def kit(layer):
            if kind=="crate":
                wood,steel=layer("wood"),layer("metal")
                for x in (-w*.38,w*.38):
                    for side in (-1,1):
                        wood.box((x,h*.5,side*(d/2+.022)),(.105,h*.91,.055),TIMBER,.015)
                        for y in (.15,h-.14):
                            steel.box((x,y,side*(d/2+.053)),(.043,.045,.016),IRON,.005)
                for z in (-d*.32,d*.32):
                    wood.box((0,h+.022,z),(w*.91,.049,.109),shade(TIMBER,.86),.01)
            elif kind=="village-barricade":
                stone=layer("concrete")
                along_x=w>d
                length=w if along_x else d
                count=max(1,round(length/.78))
                for i in range(count):
                    mid=(i+.5)*length/count-length/2
                    point=(mid,h+.103,0) if along_x else (0,h+.103,mid)
                    size=(length/count-.017,.074,d+.11) if along_x else (w+.11,.074,length/count-.017)
                    stone.box(point,size,shade(CREAM,.86+.17*math.sin(i*4.5+number)),.015)
            elif kind=="village-barrels":
                steel=layer("metal")
                for x in (-.48,.48):
                    for y in (.24,.68):
                        steel.cylinder((x,h*y,0),.404,.024,"y",RUST,18)
                    steel.cylinder((x+.157,h+.007,-.076),.065,.038,"y",IRON,14)
            elif kind in {"village-rubble","village-pottery"}:
                stone=layer("concrete")
                for i in range(5):
                    a=i*math.tau/5
                    stone.box((math.cos(a)*w*.46,.032,math.sin(a)*d*.44),
                              (.108+.038*(i%3),.063,.19),STUCCO if kind=="village-pottery" else STONE,.017)
            elif kind=="village-bed":
                fabric=layer("cloth")
                accent=ACCENTS[number%4]
                fabric.box((0,h+.022,-d*.06),(w*.85,.059,d*.61),accent,.011)
                for x in (-w*.34,w*.34):
                    fabric.box((x,h+.053,-d*.06),(.027,.006,d*.60),CREAM,0)
                for x in (-w*.19,w*.19):
                    fabric.box((x,h+.042,d*.235),(w*.34,.091,d*.18),shade(CREAM,.92),.017)
            elif kind=="village-cabinet":
                timber,steel=layer("wood"),layer("metal")
                for side in (-1,1):
                    x=side*w*.229
                    timber.box((x,h*.52,-d/2-.009),(w*.425,h*.72,.024),shade(TIMBER,1.17),.007)
                    steel.box((side*w*.058,h*.51,-d/2-.026),(.024,.083,.020),IRON,.003)
            elif kind=="village-table":
                fabric=layer("cloth")
                rug(fabric,-w*.12,h+.006,-d*.13,w*.64,d*.47,ACCENTS[number%4])
                layer("concrete").cylinder((w*.24,h+.031,d*.19),.087,.059,"y",STUCCO,12)
            elif kind=="village-shelf":
                stone=layer("concrete")
                for side in (-1,1):
                    stone.cylinder((side*w*.24,h*.61,d*.12),.099,.152,"y",STUCCO,12)
        street.place(b,b.get("modelRotation",{}).get("y",0),kit)


def wreck(street,s):
    def kit(layer):
        steel=layer("metal")
        half_w=s["w"]/2
        for side in (-1,1):
            for i in range(16):
                z=(i-7.5)*5.15
                steel.box((side*(half_w+.018),3.31,z),(.043,.075,4.77),IRON,.007)
            for i in range(9):
                z=(i-4)*8.7
                y=2.94
                steel.box((side*(half_w+.024),y,z),(.056,.38,1.53),shade(RUST,.72+.17*(i%4)),.009)
                steel.cylinder((side*(half_w+.065),y+.24,z+.55),.088,.026,"x",IRON,14)
    street.place(s,0,kit,cast=False,roll=-.045 if s.get("beached") else 0)


def terrain_detail(street,items):
    rng=random.Random(15717)
    for sample in items:
        def chips(layer):
            mesh=layer("concrete")
            for i in range(3):
                scale=sample["scale"]*(1-i*.21)
                x,z=rng.uniform(-.34,.34),rng.uniform(-.35,.35)
                points=[(x-scale*.59,.012,z),(x-scale*.22,.009,z-scale*.43),
                        (x+scale*.51,.009,z-scale*.31),(x+scale*.54,.012,z+scale*.30),
                        (x-scale*.22,.013,z+scale*.42),(x,.022+scale*.08,z)]
                mesh.add(points,[((i+1)%5,i,5) for i in range(5)],shade(STONE,rng.uniform(.74,1.19)))
        street.place(sample,sample["turn"],chips,cast=False)


def export(collection,path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,export_extras=True,
                              export_vertex_color="ACTIVE",export_meshopt_compression_enable=True,
                              export_meshopt_extension="EXT_meshopt_compression")


def main(source):
    data=json.loads((source/"village.json").read_text(encoding="utf-8"))
    runtime=REPO/"src"/"assets"/"village"
    runtime.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system="METRIC"
    base=bpy.data.collections.new("Dry Wind · Base")
    detail=bpy.data.collections.new("Dry Wind · High detail")
    for scope in (base,detail):
        bpy.context.scene.collection.children.link(scope)
    for incoming in data["meshes"]:
        source_mesh(incoming,detail if incoming["detail"] else base)
    street=Street()
    for i,s in enumerate(data["structures"]):
        if s["kind"].startswith("village-house") or s["kind"]=="village-ruin":
            house(street,s,i)
        elif s["kind"]=="village-stall":
            stall(street,s,i)
        elif s["kind"]=="village-well":
            well(street,s)
    props(street,data["boxes"])
    wreck(street,data["ship"])
    terrain_detail(street,data["groundDetails"])
    street.assemble(detail)
    export(base,source/"base.glb")
    export(detail,source/"detail.glb")
    for name in ("roads.webp","rock.webp"):
        shutil.copyfile(source/name,runtime/name)
    manifest={"layout":data["layout"],"span":data["span"],
              "baseTriangles":sum(len(o.data.polygons) for o in base.objects),
              "baseDraws":len(base.objects),"detailDraws":len(detail.objects)}
    (runtime/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    for mat in bpy.data.materials:
        name="village-sand" if mat.name=="road-sand" else mat.name
        directory=runtime if name=="rock" else REPO/"src"/"assets"/"surfaces"
        picture=directory/(name+".webp")
        if not picture.is_file():
            continue
        nodes=mat.node_tree.nodes
        image=nodes.new("ShaderNodeTexImage")
        image.image=bpy.data.images.load(str(picture),check_existing=True)
        image.image.pack()
        paint=next(node for node in nodes if node.type=="VERTEX_COLOR")
        mix=nodes.new("ShaderNodeMixRGB")
        mix.blend_type="MULTIPLY"
        mix.inputs[0].default_value=1
        mat.node_tree.links.new(image.outputs["Color"],mix.inputs[1])
        mat.node_tree.links.new(paint.outputs["Color"],mix.inputs[2])
        finish=mix.outputs["Color"]
        if mat.name=="road-sand":
            links=mat.node_tree.links
            coords=nodes.new("ShaderNodeNewGeometry")
            scale=nodes.new("ShaderNodeVectorMath")
            scale.operation="SCALE"
            scale.inputs[3].default_value=1/data["span"]
            links.new(coords.outputs["Position"],scale.inputs[0])
            offset=nodes.new("ShaderNodeVectorMath")
            offset.operation="ADD"
            offset.inputs[1].default_value=(.5,.5,0)
            links.new(scale.outputs["Vector"],offset.inputs[0])
            roads=nodes.new("ShaderNodeTexImage")
            roads.image=bpy.data.images.load(str(runtime/"roads.webp"),check_existing=True)
            roads.image.colorspace_settings.name="Non-Color"
            roads.image.pack()
            links.new(offset.outputs["Vector"],roads.inputs["Vector"])
            tint=nodes.new("ShaderNodeMixRGB")
            tint.inputs[1].default_value=(1,1,1,1)
            tint.inputs[2].default_value=(*[a/b for a,b in zip(color("bda17a"),color("d6bd90"))],1)
            links.new(roads.outputs["Color"],tint.inputs[0])
            lay=nodes.new("ShaderNodeMixRGB")
            lay.blend_type="MULTIPLY"
            lay.inputs[0].default_value=1
            links.new(finish,lay.inputs[1])
            links.new(tint.outputs["Color"],lay.inputs[2])
            finish=lay.outputs["Color"]
        mat.node_tree.links.new(finish,nodes.get("Principled BSDF").inputs["Base Color"])
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.clip_end=4500
                space.shading.color_type="VERTEX"
                space.region_3d.view_distance=425
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"dry-wind.blend"),compress=True)
    print(json.dumps(manifest))


if __name__=="__main__":
    main(Path(sys.argv[sys.argv.index("--")+1]).resolve())
