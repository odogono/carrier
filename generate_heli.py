import trimesh
import numpy as np

def create_box(extents, translation=[0,0,0], euler=[0,0,0]):
    mesh = trimesh.creation.box(extents=extents)
    transform = trimesh.transformations.euler_matrix(euler[0], euler[1], euler[2])
    transform[:3, 3] = translation
    mesh.apply_transform(transform)
    return mesh

def create_cylinder(radius, height, sections=8, translation=[0,0,0], euler=[0,0,0]):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    transform = trimesh.transformations.euler_matrix(euler[0], euler[1], euler[2])
    transform[:3, 3] = translation
    mesh.apply_transform(transform)
    return mesh

def create_tapered_box(bottom_size, top_size, height, translation=[0,0,0], euler=[0,0,0]):
    # A box that tapers. 8 vertices.
    # bottom is at z = -height/2, top is at z = height/2
    bx, by = bottom_size[0]/2, bottom_size[1]/2
    tx, ty = top_size[0]/2, top_size[1]/2
    hz = height/2
    
    vertices = np.array([
        [-bx, -by, -hz],
        [ bx, -by, -hz],
        [ bx,  by, -hz],
        [-bx,  by, -hz],
        [-tx, -ty,  hz],
        [ tx, -ty,  hz],
        [ tx,  ty,  hz],
        [-tx,  ty,  hz]
    ])
    
    faces = np.array([
        [0,3,2,1], # bottom
        [4,5,6,7], # top
        [0,1,5,4], # front
        [1,2,6,5], # right
        [2,3,7,6], # back
        [3,0,4,7]  # left
    ])
    
    # triangulate faces
    tri_faces = []
    for f in faces:
        tri_faces.append([f[0], f[1], f[2]])
        tri_faces.append([f[0], f[2], f[3]])
        
    mesh = trimesh.Trimesh(vertices=vertices, faces=tri_faces)
    transform = trimesh.transformations.euler_matrix(euler[0], euler[1], euler[2])
    transform[:3, 3] = translation
    mesh.apply_transform(transform)
    return mesh

meshes = []

# Y is FORWARD, Z is UP, X is RIGHT

# --- FUSELAGE ---
# Main body (boxy)
meshes.append(create_box([1.8, 3.5, 1.5], translation=[0, -0.5, 0.0]))
# Front nose lower
meshes.append(create_tapered_box([1.8, 1.5], [1.0, 0.5], 1.5, translation=[0, 1.9, -0.3], euler=[np.pi/2, 0, 0]))
# Cockpit area
meshes.append(create_tapered_box([1.8, 2.5], [1.0, 1.5], 1.0, translation=[0, 1.2, 0.9], euler=[0, 0, 0]))

# Tail boom
meshes.append(create_tapered_box([1.2, 1.2], [0.4, 0.4], 6.0, translation=[0, -4.5, 0.2], euler=[np.pi/2, 0, 0]))

# Vertical tail fin (swept back)
# Let's make it using a box and rotating it
tail_fin = create_box([0.15, 1.5, 2.5], translation=[0, -7.5, 1.2], euler=[-0.3, 0, 0])
meshes.append(tail_fin)

# Horizontal stabilizer
meshes.append(create_box([2.8, 0.8, 0.1], translation=[0, -7.2, 0.5]))

# Engine pods (side of the upper main body)
meshes.append(create_box([0.8, 2.5, 0.8], translation=[-0.9, -0.5, 0.7]))
meshes.append(create_box([0.8, 2.5, 0.8], translation=[ 0.9, -0.5, 0.7]))


# --- WINGS & WEAPONS ---
# Stub wings
meshes.append(create_box([5.5, 1.0, 0.2], translation=[0, 0.5, -0.2]))

# Missiles & Racks
# 4 pylons
for x_pos in [-2.2, -1.6, 1.6, 2.2]:
    # Pylon
    meshes.append(create_box([0.1, 0.6, 0.4], translation=[x_pos, 0.5, -0.4]))
    # Missile
    meshes.append(create_cylinder(0.15, 1.6, sections=6, translation=[x_pos, 0.5, -0.6], euler=[np.pi/2, 0, 0]))
    # Another missile slightly below
    meshes.append(create_cylinder(0.15, 1.6, sections=6, translation=[x_pos, 0.5, -0.9], euler=[np.pi/2, 0, 0]))

# Front Gun
meshes.append(create_cylinder(0.2, 0.6, sections=8, translation=[0, 1.5, -1.0])) # Base
meshes.append(create_cylinder(0.05, 1.5, sections=6, translation=[0, 2.2, -1.2], euler=[np.pi/2, 0, 0])) # Barrel


# --- LANDING GEAR ---
# Side wheels
meshes.append(create_cylinder(0.1, 0.6, sections=6, translation=[-1.5, 0.5, -0.8], euler=[0, 0, 0])) # Strut
meshes.append(create_cylinder(0.25, 0.2, sections=8, translation=[-1.6, 0.5, -1.1], euler=[0, np.pi/2, 0])) # Wheel
meshes.append(create_cylinder(0.1, 0.6, sections=6, translation=[ 1.5, 0.5, -0.8], euler=[0, 0, 0])) # Strut
meshes.append(create_cylinder(0.25, 0.2, sections=8, translation=[ 1.6, 0.5, -1.1], euler=[0, np.pi/2, 0])) # Wheel

# Rear wheel
meshes.append(create_cylinder(0.08, 0.5, sections=6, translation=[0, -6.5, -0.2], euler=[0, 0, 0])) # Strut
meshes.append(create_cylinder(0.15, 0.15, sections=8, translation=[0, -6.5, -0.4], euler=[0, np.pi/2, 0])) # Wheel


# --- ROTORS ---
# Main Rotor Hub
meshes.append(create_cylinder(0.4, 0.8, sections=12, translation=[0, 0.2, 1.5]))
# Main Rotor Blades (4 blades)
for i in range(4):
    angle = i * np.pi / 2
    blade = create_box([0.3, 7.0, 0.05], translation=[0, 3.5, 0])
    mat = trimesh.transformations.euler_matrix(0, 0, angle)
    blade.apply_transform(mat)
    mat_trans = trimesh.transformations.translation_matrix([0, 0.2, 1.8])
    blade.apply_transform(mat_trans)
    meshes.append(blade)

# Tail Rotor Hub
meshes.append(create_cylinder(0.15, 0.4, sections=8, translation=[0.2, -7.6, 2.0], euler=[0, np.pi/2, 0]))
# Tail Rotor Blades (4 blades, X-shape)
for i in range(4):
    angle = i * np.pi / 2 + 0.3 # rotated a bit
    blade = create_box([0.15, 1.2, 0.03], translation=[0, 0.6, 0])
    # Rotate around X-axis for tail rotor
    mat = trimesh.transformations.euler_matrix(angle, 0, 0)
    blade.apply_transform(mat)
    mat_trans = trimesh.transformations.translation_matrix([0.4, -7.6, 2.0])
    blade.apply_transform(mat_trans)
    meshes.append(blade)

# Combine all meshes into a single scene
scene = trimesh.Scene(meshes)

# Export the scene to GLB
scene.export('helicopter.glb')
print("helicopter.glb created successfully.")
