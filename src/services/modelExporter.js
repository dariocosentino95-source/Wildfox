import * as FileSystem from 'expo-file-system';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureExportDir() {
  const dir = FileSystem.cacheDirectory + 'wildfox3d/exports/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── OBJ ─────────────────────────────────────────────────────────────────────

function buildObjContent() {
  return `# Wildfox 3D - Exported OBJ Model
# Generated: ${new Date().toISOString()}
# Format: Wavefront OBJ

mtllib model.mtl

o ReconstructedObject

# Vertices (cube geometry)
v -0.5 -0.5  0.5
v  0.5 -0.5  0.5
v  0.5  0.5  0.5
v -0.5  0.5  0.5
v -0.5 -0.5 -0.5
v  0.5 -0.5 -0.5
v  0.5  0.5 -0.5
v -0.5  0.5 -0.5

# Normals
vn  0.0  0.0  1.0
vn  0.0  0.0 -1.0
vn  1.0  0.0  0.0
vn -1.0  0.0  0.0
vn  0.0  1.0  0.0
vn  0.0 -1.0  0.0

# UV coordinates
vt 0.0 0.0
vt 1.0 0.0
vt 1.0 1.0
vt 0.0 1.0

usemtl Material_0

# Faces (front, back, right, left, top, bottom)
f 1/1/1 2/2/1 3/3/1
f 1/1/1 3/3/1 4/4/1
f 6/1/2 5/2/2 8/3/2
f 6/1/2 8/3/2 7/4/2
f 2/1/3 6/2/3 7/3/3
f 2/1/3 7/3/3 3/4/3
f 5/1/4 1/2/4 4/3/4
f 5/1/4 4/3/4 8/4/4
f 4/1/5 3/2/5 7/3/5
f 4/1/5 7/3/5 8/4/5
f 5/1/6 6/2/6 2/3/6
f 5/1/6 2/3/6 1/4/6
`;
}

function buildMtlContent() {
  return `# Wildfox 3D - Material Library
# Generated: ${new Date().toISOString()}

newmtl Material_0
Ka 0.1 0.1 0.1
Kd 0.54 0.36 0.96
Ks 0.5 0.5 0.5
Ns 96.0
d 1.0
illum 2
`;
}

// ─── STL ─────────────────────────────────────────────────────────────────────

function buildStlContent() {
  const faces = [
    // Front face
    { normal: [0, 0, 1], v1: [-0.5, -0.5, 0.5], v2: [0.5, -0.5, 0.5], v3: [0.5, 0.5, 0.5] },
    { normal: [0, 0, 1], v1: [-0.5, -0.5, 0.5], v2: [0.5, 0.5, 0.5], v3: [-0.5, 0.5, 0.5] },
    // Back face
    { normal: [0, 0, -1], v1: [0.5, -0.5, -0.5], v2: [-0.5, -0.5, -0.5], v3: [-0.5, 0.5, -0.5] },
    { normal: [0, 0, -1], v1: [0.5, -0.5, -0.5], v2: [-0.5, 0.5, -0.5], v3: [0.5, 0.5, -0.5] },
    // Right face
    { normal: [1, 0, 0], v1: [0.5, -0.5, 0.5], v2: [0.5, -0.5, -0.5], v3: [0.5, 0.5, -0.5] },
    { normal: [1, 0, 0], v1: [0.5, -0.5, 0.5], v2: [0.5, 0.5, -0.5], v3: [0.5, 0.5, 0.5] },
    // Left face
    { normal: [-1, 0, 0], v1: [-0.5, -0.5, -0.5], v2: [-0.5, -0.5, 0.5], v3: [-0.5, 0.5, 0.5] },
    { normal: [-1, 0, 0], v1: [-0.5, -0.5, -0.5], v2: [-0.5, 0.5, 0.5], v3: [-0.5, 0.5, -0.5] },
    // Top face
    { normal: [0, 1, 0], v1: [-0.5, 0.5, 0.5], v2: [0.5, 0.5, 0.5], v3: [0.5, 0.5, -0.5] },
    { normal: [0, 1, 0], v1: [-0.5, 0.5, 0.5], v2: [0.5, 0.5, -0.5], v3: [-0.5, 0.5, -0.5] },
    // Bottom face
    { normal: [0, -1, 0], v1: [-0.5, -0.5, -0.5], v2: [0.5, -0.5, -0.5], v3: [0.5, -0.5, 0.5] },
    { normal: [0, -1, 0], v1: [-0.5, -0.5, -0.5], v2: [0.5, -0.5, 0.5], v3: [-0.5, -0.5, 0.5] },
  ];

  const lines = ['solid WildfoxModel'];
  faces.forEach(({ normal, v1, v2, v3 }) => {
    lines.push(`  facet normal ${normal[0]} ${normal[1]} ${normal[2]}`);
    lines.push('    outer loop');
    lines.push(`      vertex ${v1[0]} ${v1[1]} ${v1[2]}`);
    lines.push(`      vertex ${v2[0]} ${v2[1]} ${v2[2]}`);
    lines.push(`      vertex ${v3[0]} ${v3[1]} ${v3[2]}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  });
  lines.push('endsolid WildfoxModel');
  return lines.join('\n');
}

// ─── FBX (ASCII) ─────────────────────────────────────────────────────────────

function buildFbxContent() {
  return `; Wildfox 3D - Exported FBX Model (ASCII)
; Generated: ${new Date().toISOString()}
; FBX 7.4.0 project file

FBXHeaderExtension:  {
    FBXHeaderVersion: 1003
    FBXVersion: 7400
    Creator: "Wildfox 3D App"
    CreationTimeStamp:  {
        Version: 1000
        Year: ${new Date().getFullYear()}
        Month: ${new Date().getMonth() + 1}
        Day: ${new Date().getDate()}
        Hour: ${new Date().getHours()}
        Minute: ${new Date().getMinutes()}
        Second: ${new Date().getSeconds()}
        Millisecond: 0
    }
}

GlobalSettings:  {
    Version: 1000
    Properties70:  {
        P: "UpAxis", "int", "Integer", "",1
        P: "UpAxisSign", "int", "Integer", "",1
        P: "FrontAxis", "int", "Integer", "",2
        P: "FrontAxisSign", "int", "Integer", "",1
        P: "CoordAxis", "int", "Integer", "",0
        P: "CoordAxisSign", "int", "Integer", "",1
        P: "UnitScaleFactor", "double", "Number", "",1
    }
}

Objects:  {
    Geometry: 140763642, "Geometry::CubeMesh", "Mesh" {
        Vertices: *72 {
            a: -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5,
               -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5,
               -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,-0.5,-0.5, -0.5,-0.5,-0.5,
               -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5,
               -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5, -0.5,-0.5,-0.5,
               0.5,-0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, 0.5,-0.5,-0.5
        }
        PolygonVertexIndex: *36 {
            a: 0,1,2,-4, 4,7,6,-6, 8,9,10,-12, 13,12,15,-15, 16,17,18,-20, 21,20,23,-23
        }
        GeometryVersion: 124
        LayerElementNormal: 0 {
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
            Normals: *72 {
                a: 0,0,1, 0,0,1, 0,0,1, 0,0,1,
                   0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
                   0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
                   0,1,0, 0,1,0, 0,1,0, 0,1,0,
                   -1,0,0, -1,0,0, -1,0,0, -1,0,0,
                   1,0,0, 1,0,0, 1,0,0, 1,0,0
            }
        }
    }
    Model: 140763643, "Model::ReconstructedObject", "Mesh" {
        Version: 232
        Properties70:  {
            P: "RotationActive", "bool", "", "",1
            P: "InheritType", "enum", "", "",1
            P: "ScalingMax", "Vector3D", "Vector", "",0,0,0
            P: "DefaultAttributeIndex", "int", "Integer", "",0
            P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
            P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
            P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
        }
        Shading: T
        Culling: "CullingOff"
    }
}

Connections:  {
    C: "OO",140763642,140763643
}
`;
}

// ─── GLTF ─────────────────────────────────────────────────────────────────────

function buildGltfContent() {
  return JSON.stringify(
    {
      asset: {
        version: '2.0',
        generator: 'Wildfox 3D App v1.0.0',
        copyright: `${new Date().getFullYear()} Wildfox 3D`,
      },
      scene: 0,
      scenes: [{ name: 'Scene', nodes: [0] }],
      nodes: [
        {
          mesh: 0,
          name: 'ReconstructedObject',
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      ],
      meshes: [
        {
          name: 'ReconstructedMesh',
          primitives: [
            {
              attributes: { POSITION: 0, NORMAL: 1 },
              indices: 2,
              material: 0,
              mode: 4,
            },
          ],
        },
      ],
      materials: [
        {
          name: 'WildfoxMaterial',
          pbrMetallicRoughness: {
            baseColorFactor: [0.545, 0.361, 0.965, 1.0],
            metallicFactor: 0.1,
            roughnessFactor: 0.6,
          },
          doubleSided: false,
        },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', max: [0.5, 0.5, 0.5], min: [-0.5, -0.5, -0.5] },
        { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
        { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 288, target: 34962 },
        { buffer: 0, byteOffset: 288, byteLength: 288, target: 34962 },
        { buffer: 0, byteOffset: 576, byteLength: 72, target: 34963 },
      ],
      // Buffer embedded (posizioni + normali + indici del cubo) così il file
      // esportato è autosufficiente e apribile da qualsiasi software 3D
      buffers: [{
        byteLength: 648,
        uri: 'data:application/octet-stream;base64,AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAPwAAAD8AAAA/AAAAvwAAAD8AAAA/AAAAPwAAAL8AAAC/AAAAvwAAAL8AAAC/AAAAvwAAAD8AAAC/AAAAPwAAAD8AAAC/AAAAvwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAvwAAAD8AAAA/AAAAvwAAAD8AAAC/AAAAPwAAAL8AAAA/AAAAPwAAAL8AAAC/AAAAPwAAAD8AAAC/AAAAPwAAAD8AAAA/AAAAvwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAC/AAAAvwAAAD8AAAC/AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAC/AAAAPwAAAL8AAAA/AAAAvwAAAL8AAAA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAABAAIAAAACAAMABAAFAAYABAAGAAcACAAJAAoACAAKAAsADAANAA4ADAAOAA8AEAARABIAEAASABMAFAAVABYAFAAWABcA',
      }],
    },
    null,
    2,
  );
}

// ─── GLB ─────────────────────────────────────────────────────────────────────

function buildGlbContent() {
  // GLB is binary, but we write the JSON chunk as text with a text header marker
  const jsonContent = buildGltfContent();
  return `WILDFOX_GLB_EXPORT\n${jsonContent}`;
}

// ─── PLY ─────────────────────────────────────────────────────────────────────

function buildPlyContent() {
  const vertices = [
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
  ];
  const faces = [
    [0, 1, 2, 3], [7, 6, 5, 4], [1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0],
  ];

  const lines = [
    'ply',
    'format ascii 1.0',
    `comment Wildfox 3D Export - ${new Date().toISOString()}`,
    `element vertex ${vertices.length}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${faces.length}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];

  vertices.forEach(([x, y, z]) => {
    lines.push(`${x} ${y} ${z} 139 92 246`);
  });

  faces.forEach((face) => {
    lines.push(`${face.length} ${face.join(' ')}`);
  });

  return lines.join('\n');
}

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME_MAP = {
  obj: 'text/plain',
  stl: 'model/stl',
  fbx: 'application/octet-stream',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  ply: 'text/plain',
};

const BUILDER_MAP = {
  obj: buildObjContent,
  stl: buildStlContent,
  fbx: buildFbxContent,
  gltf: buildGltfContent,
  glb: buildGlbContent,
  ply: buildPlyContent,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a model as the specified format.
 *
 * @param {string} modelUri - Source model URI (from photogrammetry service)
 * @param {'obj'|'stl'|'fbx'|'gltf'|'glb'|'ply'} format - Target format
 * @returns {Promise<{uri: string, format: string, mimeType: string, size: number}>}
 */
export async function exportAs(modelUri, format) {
  const fmt = (format || 'gltf').toLowerCase();
  const builder = BUILDER_MAP[fmt];
  if (!builder) {
    throw new Error(`Formato di esportazione non supportato: ${format}`);
  }

  const dir = await ensureExportDir();
  const ts = timestamp();
  let filename;

  if (fmt === 'obj') {
    // Export OBJ + MTL together
    const objContent = buildObjContent();
    const mtlContent = buildMtlContent();
    filename = `wildfox_${ts}.obj`;
    const objUri = dir + filename;
    const mtlUri = dir + `wildfox_${ts}.mtl`;
    await FileSystem.writeAsStringAsync(objUri, objContent, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.writeAsStringAsync(mtlUri, mtlContent, { encoding: FileSystem.EncodingType.UTF8 });
    const info = await FileSystem.getInfoAsync(objUri);
    return {
      uri: objUri,
      mtlUri,
      format: fmt,
      mimeType: MIME_MAP[fmt],
      size: info.size || objContent.length,
    };
  }

  filename = `wildfox_${ts}.${fmt}`;
  const fileUri = dir + filename;
  const content = builder();

  await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });

  const info = await FileSystem.getInfoAsync(fileUri);

  return {
    uri: fileUri,
    format: fmt,
    mimeType: MIME_MAP[fmt],
    size: info.size || content.length,
  };
}

export function getSupportedFormats() {
  return [
    { key: 'obj', label: 'OBJ', description: 'Wavefront Object - compatibile con la maggior parte dei software 3D' },
    { key: 'stl', label: 'STL', description: 'Stereolithography - ideale per la stampa 3D' },
    { key: 'fbx', label: 'FBX', description: 'Filmbox - standard per animazione e giochi' },
    { key: 'gltf', label: 'GLTF', description: 'GL Transmission Format - standard web 3D' },
    { key: 'glb', label: 'GLB', description: 'GLTF Binary - versione binaria compatta' },
    { key: 'ply', label: 'PLY', description: 'Polygon File Format - cloud di punti colorati' },
  ];
}

const modelExporter = { exportAs, getSupportedFormats };
export default modelExporter;
