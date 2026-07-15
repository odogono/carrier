import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "zeewolf" / "zeewolf-helicopter-lowpoly.glb"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def material(name, color, roughness=0.72, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def flat(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def box(name, location, dimensions, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return flat(assign(obj, mat))


def cylinder(name, location, radius, depth, mat, vertices=8, axis="Z", rotation=(0, 0, 0)):
    rot = list(rotation)
    if axis == "X":
        rot[1] += math.radians(90)
    elif axis == "Y":
        rot[0] += math.radians(90)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return flat(assign(obj, mat))


def cone(name, location, r1, r2, depth, mat, vertices=8, axis="Z", rotation=(0, 0, 0)):
    rot = list(rotation)
    if axis == "X":
        rot[1] += math.radians(90)
    elif axis == "Y":
        rot[0] += math.radians(90)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=r1,
        radius2=r2,
        depth=depth,
        location=location,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return flat(assign(obj, mat))


def fuselage_mesh(name, sections, mat):
    verts = []
    faces = []

    for x, width, height, zc, top_scale, bottom_scale in sections:
        hw = width * 0.5
        hh = height * 0.5
        top = hw * top_scale
        bottom = hw * bottom_scale
        ring = [
            (-top, zc + hh),
            (top, zc + hh),
            (hw, zc + hh * 0.32),
            (hw, zc - hh * 0.28),
            (bottom, zc - hh),
            (-bottom, zc - hh),
            (-hw, zc - hh * 0.28),
            (-hw, zc + hh * 0.32),
        ]
        verts.extend([(x, y, z) for y, z in ring])

    ring_count = 8
    for i in range(len(sections) - 1):
        a = i * ring_count
        b = (i + 1) * ring_count
        for j in range(ring_count):
            faces.append((a + j, a + (j + 1) % ring_count, b + (j + 1) % ring_count, b + j))

    faces.append(tuple(reversed(range(ring_count))))
    last = (len(sections) - 1) * ring_count
    faces.append(tuple(last + j for j in range(ring_count)))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return flat(assign(obj, mat))


def quad_panel(name, points, mat):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(points, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return flat(assign(obj, mat))


def rotor_blade(name, center, length, width, thickness, angle, mat):
    # The blade root starts near the hub and extends outward in the XY plane.
    root = 0.38
    half_w = width * 0.5
    x0 = root
    x1 = length
    pts = [
        (x0, -half_w, -thickness * 0.5),
        (x1, -half_w * 0.78, -thickness * 0.5),
        (x1, half_w * 0.78, -thickness * 0.5),
        (x0, half_w, -thickness * 0.5),
        (x0, -half_w, thickness * 0.5),
        (x1, -half_w * 0.78, thickness * 0.5),
        (x1, half_w * 0.78, thickness * 0.5),
        (x0, half_w, thickness * 0.5),
    ]
    ca = math.cos(angle)
    sa = math.sin(angle)
    verts = []
    for x, y, z in pts:
        verts.append((center[0] + x * ca - y * sa, center[1] + x * sa + y * ca, center[2] + z))
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return flat(assign(obj, mat))


def tail_rotor_blade(name, center, length, width, thickness, angle, mat):
    # Tail rotor lies in the YZ plane at the right side of the tail.
    root = 0.18
    half_w = width * 0.5
    y0 = root
    y1 = length
    pts = [
        (-thickness * 0.5, y0, -half_w),
        (-thickness * 0.5, y1, -half_w * 0.75),
        (-thickness * 0.5, y1, half_w * 0.75),
        (-thickness * 0.5, y0, half_w),
        (thickness * 0.5, y0, -half_w),
        (thickness * 0.5, y1, -half_w * 0.75),
        (thickness * 0.5, y1, half_w * 0.75),
        (thickness * 0.5, y0, half_w),
    ]
    ca = math.cos(angle)
    sa = math.sin(angle)
    verts = []
    for x, y, z in pts:
        yr = y * ca - z * sa
        zr = y * sa + z * ca
        verts.append((center[0] + x, center[1] + yr, center[2] + zr))
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return flat(assign(obj, mat))


def build():
    clear_scene()

    body = material("warm light grey", (0.70, 0.70, 0.67, 1))
    body_dark = material("shadow grey", (0.45, 0.45, 0.43, 1))
    panel = material("slightly darker armor panels", (0.60, 0.60, 0.57, 1))
    glass = material("flat smoked cockpit glass", (0.33, 0.34, 0.33, 1), roughness=0.35)
    metal = material("dark gunmetal", (0.23, 0.23, 0.22, 1), roughness=0.55, metallic=0.15)
    tire = material("charcoal tires", (0.08, 0.08, 0.075, 1), roughness=0.82)

    fuselage_mesh(
        "faceted angular fuselage",
        [
            (-3.85, 0.18, 0.26, -0.10, 0.45, 0.80),
            (-3.35, 0.95, 0.85, 0.05, 0.70, 0.86),
            (-2.65, 1.55, 1.15, 0.18, 0.72, 0.72),
            (-1.55, 2.00, 1.35, 0.18, 0.66, 0.82),
            (-0.20, 2.18, 1.36, 0.26, 0.80, 0.86),
            (1.12, 1.75, 1.16, 0.20, 0.86, 0.72),
            (1.70, 0.92, 0.72, 0.10, 0.80, 0.66),
        ],
        body,
    )

    # Upper armored cockpit/engine mass and mast base.
    box("raised faceted upper cabin", (-0.55, 0, 1.06), (1.65, 1.62, 0.58), panel, rotation=(0, 0, math.radians(2)))
    box("rear engine fairing", (0.72, 0, 0.96), (1.22, 1.82, 0.72), panel)
    box("rotor mast block", (-0.40, 0, 1.55), (0.56, 0.56, 0.36), body_dark)
    cylinder("rotor mast", (-0.40, 0, 1.86), 0.18, 0.45, metal, vertices=10)

    # Tail boom, fins, and stabilizers.
    fuselage_mesh(
        "long tapered tail boom",
        [
            (1.30, 0.92, 0.56, 0.13, 0.82, 0.70),
            (2.65, 0.70, 0.44, 0.13, 0.82, 0.70),
            (4.15, 0.47, 0.33, 0.12, 0.82, 0.70),
            (5.70, 0.30, 0.24, 0.10, 0.80, 0.70),
        ],
        body,
    )
    box("swept vertical tail fin", (5.25, 0, 0.82), (0.35, 0.20, 1.38), body, rotation=(0, math.radians(-7), 0))
    box("tailplane cross fin", (5.18, 0, 0.00), (0.58, 1.68, 0.12), body)
    box("tail tip cap", (5.88, 0, 0.12), (0.26, 0.42, 0.22), panel)

    # Cockpit glass panels follow the tapered side surfaces; a tiny outward offset
    # keeps them visible without making them hover off the hull.
    for side in (-1, 1):
        s = side
        quad_panel(
            f"{'left' if side < 0 else 'right'} forward side canopy",
            [(-3.12, s * 0.50, 0.34), (-2.48, s * 0.74, 0.57), (-2.22, s * 0.78, 0.99), (-2.92, s * 0.56, 0.90)],
            glass,
        )
        quad_panel(
            f"{'left' if side < 0 else 'right'} rear side canopy",
            [(-2.12, s * 0.82, 0.47), (-1.55, s * 0.94, 0.55), (-1.50, s * 0.90, 0.94), (-2.02, s * 0.78, 1.03)],
            glass,
        )
    quad_panel("front windshield", [(-3.52, -0.25, 0.20), (-3.52, 0.25, 0.20), (-3.08, 0.47, 0.77), (-3.08, -0.47, 0.77)], glass)
    box("nose lower sensor block", (-3.66, 0, -0.26), (0.34, 0.52, 0.22), body_dark)
    cylinder("nose gun barrel", (-4.10, 0, -0.28), 0.045, 0.95, metal, vertices=6, axis="X")
    cylinder("nose gun sleeve", (-3.62, 0, -0.28), 0.12, 0.28, metal, vertices=8, axis="X")

    # Stub wings and weapon pylons.
    for side in (-1, 1):
        y = side * 1.32
        box(f"{'left' if side < 0 else 'right'} stub wing", (-0.78, y, -0.22), (1.22, 1.34, 0.13), body, rotation=(math.radians(0), math.radians(-3), 0))
        box(f"{'left' if side < 0 else 'right'} outer pylon", (-0.92, y + side * 0.40, -0.46), (0.20, 0.18, 0.42), metal)
        box(f"{'left' if side < 0 else 'right'} inner pylon", (-0.42, y + side * 0.14, -0.44), (0.18, 0.18, 0.36), metal)
        cylinder(f"{'left' if side < 0 else 'right'} rocket pod", (-0.86, y + side * 0.53, -0.55), 0.20, 0.72, metal, vertices=8, axis="X")
        for dz in (-0.15, 0.15):
            cone(f"{'left' if side < 0 else 'right'} missile {dz:+.2f}", (-0.20, y + side * 0.16, -0.58 + dz), 0.10, 0.035, 0.86, body, vertices=6, axis="X")
            cone(f"{'left' if side < 0 else 'right'} missile nose {dz:+.2f}", (-0.66, y + side * 0.16, -0.58 + dz), 0.035, 0.0, 0.16, body, vertices=6, axis="X")

    # Low-poly landing gear: two main wheels and a forward wheel, matching the chunky reference stance.
    for side in (-1, 1):
        y = side * 0.72
        box(f"{'left' if side < 0 else 'right'} gear strut", (-1.08, y, -0.72), (0.12, 0.12, 0.74), metal, rotation=(0, math.radians(8 * side), 0))
        cylinder(f"{'left' if side < 0 else 'right'} main wheel", (-1.02, y, -1.10), 0.22, 0.18, tire, vertices=10, axis="Y")
        box(f"{'left' if side < 0 else 'right'} skid brace", (-1.18, y * 0.76, -0.92), (0.78, 0.08, 0.08), metal, rotation=(0, math.radians(-18), 0))
    box("nose gear strut", (-3.22, 0, -0.72), (0.10, 0.10, 0.62), metal)
    cylinder("nose wheel", (-3.22, 0, -1.03), 0.17, 0.16, tire, vertices=10, axis="Y")

    # Main rotor assembly.
    cylinder("main rotor hub", (-0.40, 0, 2.10), 0.30, 0.22, metal, vertices=12)
    cylinder("main rotor cap", (-0.40, 0, 2.25), 0.20, 0.16, body_dark, vertices=10)
    for i in range(4):
        rotor_blade(f"main rotor blade {i + 1}", (-0.40, 0, 2.23), 3.92, 0.22, 0.045, math.radians(45 + i * 90), body)

    # Small blocky details above the mast visible from top/front.
    box("top rotor swash plate", (-0.40, 0, 1.98), (0.82, 0.18, 0.10), metal)
    box("top rotor cross plate", (-0.40, 0, 1.98), (0.18, 0.82, 0.10), metal)

    # Tail rotor and hub on starboard side.
    cylinder("tail rotor hub", (5.94, 0.25, 0.28), 0.10, 0.20, metal, vertices=8, axis="X")
    for i in range(4):
        tail_rotor_blade(f"tail rotor blade {i + 1}", (6.05, 0.25, 0.28), 0.58, 0.12, 0.035, math.radians(20 + i * 90), body)

    # Add a few low-poly armor facets to keep the silhouette intentionally angular.
    box("left cheek armor", (-2.10, -0.86, -0.12), (0.72, 0.16, 0.34), panel, rotation=(0, 0, math.radians(-12)))
    box("right cheek armor", (-2.10, 0.86, -0.12), (0.72, 0.16, 0.34), panel, rotation=(0, 0, math.radians(12)))
    box("belly fairing", (-0.30, 0, -0.56), (1.18, 0.78, 0.24), panel)

    # Camera and lighting are not exported as part of the model, but make manual previews useful.
    bpy.ops.object.light_add(type="AREA", location=(-2.5, -4.0, 6.0))
    light = bpy.context.object
    light.name = "preview softbox"
    light.data.energy = 450
    light.data.size = 5

    bpy.ops.object.camera_add(location=(-6.2, -6.6, 3.2), rotation=(math.radians(62), 0, math.radians(-42)))
    bpy.context.scene.camera = bpy.context.object

    # Store dimensions in meters-like units but keep transforms baked for reliable import.
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.context.view_layer.objects.active = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
