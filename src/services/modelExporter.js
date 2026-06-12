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

// ─── Fallback geometry (cubo) ─────────────────────────────────────────────────
// Usata solo se il progetto non ha una mesh ricostruita salvata.

const CUBE_MESH = {
  positions: [
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  ],
  indices: [
    0, 1, 2, 0, 2, 3, // front
    5, 4, 7, 5, 7, 6, // back
    1, 5, 6, 1, 6, 2, // right
    4, 0, 3, 4, 3, 7, // left
    3, 2, 6, 3, 6, 7, // top
    4, 5, 1, 4, 1, 0, // bottom
  ],
  uvs: null,
  colors: null,
};

/**
 * Valida e normalizza i dati mesh provenienti dal viewer.
 * @returns {{positions:number[], indices:number[], uvs:number[]|null, colors:number[]|null}}
 */
function normalizeMesh(meshData) {
  if (
    !meshData ||
    !Array.isArray(meshData.positions) ||
    meshData.positions.length < 9 ||
    !Array.isArray(meshData.indices) ||
    meshData.indices.length < 3
  ) {
    return CUBE_MESH;
  }
  const vertexCount = Math.floor(meshData.positions.length / 3);
  const uvsOk = Array.isArray(meshData.uvs) && meshData.uvs.length === vertexCount * 2;
  const colorsOk = Array.isArray(meshData.colors) && meshData.colors.length === vertexCount * 3;
  return {
    positions: meshData.positions,
    indices: meshData.indices,
    uvs: uvsOk ? meshData.uvs : null,
    colors: colorsOk ? meshData.colors : null,
  };
}

/** Normali per vertice (media delle normali delle facce adiacenti). */
function computeVertexNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const idx of [ia, ib, ic]) {
      normals[idx] += nx;
      normals[idx + 1] += ny;
      normals[idx + 2] += nz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const len = Math.sqrt(normals[v] ** 2 + normals[v + 1] ** 2 + normals[v + 2] ** 2);
    if (len > 1e-8) {
      normals[v] /= len;
      normals[v + 1] /= len;
      normals[v + 2] /= len;
    } else {
      normals[v + 2] = 1;
    }
  }
  return normals;
}

function faceNormal(positions, ia, ib, ic) {
  const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
  const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
  const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-8) {
    nx /= len; ny /= len; nz /= len;
  } else {
    nz = 1;
  }
  return [nx, ny, nz];
}

const fmtNum = (v) => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};

// ─── Base64 (per dati binari, Hermes non ha Buffer/btoa) ─────────────────────

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

function f32leBytes(arr) {
  const buf = new ArrayBuffer(arr.length * 4);
  const dv = new DataView(buf);
  for (let i = 0; i < arr.length; i++) dv.setFloat32(i * 4, arr[i], true);
  return new Uint8Array(buf);
}

function u16leBytes(arr) {
  const buf = new ArrayBuffer(arr.length * 2);
  const dv = new DataView(buf);
  for (let i = 0; i < arr.length; i++) dv.setUint16(i * 2, arr[i], true);
  return new Uint8Array(buf);
}

function u32leBytes(arr) {
  const buf = new ArrayBuffer(arr.length * 4);
  const dv = new DataView(buf);
  for (let i = 0; i < arr.length; i++) dv.setUint32(i * 4, arr[i], true);
  return new Uint8Array(buf);
}

function concatBytes(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function padBytes(bytes, align, fill) {
  const rem = bytes.length % align;
  if (rem === 0) return bytes;
  const pad = new Uint8Array(align - rem).fill(fill);
  return concatBytes([bytes, pad]);
}

// ─── OBJ ─────────────────────────────────────────────────────────────────────

function buildObjContent(mesh) {
  const { positions, indices, uvs, colors } = mesh;
  const normals = computeVertexNormals(positions, indices);
  const vertexCount = positions.length / 3;
  const lines = [
    '# Wildfox 3D - Exported OBJ Model',
    `# Generated: ${new Date().toISOString()}`,
    `# Vertices: ${vertexCount}, Faces: ${indices.length / 3}`,
    '',
    'mtllib model.mtl',
    '',
    'o ScannedObject',
    '',
  ];

  for (let v = 0; v < vertexCount; v++) {
    let line = `v ${fmtNum(positions[v * 3])} ${fmtNum(positions[v * 3 + 1])} ${fmtNum(positions[v * 3 + 2])}`;
    if (colors) {
      // Estensione vertex-color OBJ (supportata da Blender, MeshLab, ecc.)
      line += ` ${fmtNum(colors[v * 3] / 255)} ${fmtNum(colors[v * 3 + 1] / 255)} ${fmtNum(colors[v * 3 + 2] / 255)}`;
    }
    lines.push(line);
  }
  if (uvs) {
    for (let v = 0; v < vertexCount; v++) {
      lines.push(`vt ${fmtNum(uvs[v * 2])} ${fmtNum(uvs[v * 2 + 1])}`);
    }
  }
  for (let v = 0; v < vertexCount; v++) {
    lines.push(`vn ${fmtNum(normals[v * 3])} ${fmtNum(normals[v * 3 + 1])} ${fmtNum(normals[v * 3 + 2])}`);
  }

  lines.push('', 'usemtl Material_0', '');
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] + 1;
    const b = indices[f + 1] + 1;
    const c = indices[f + 2] + 1;
    if (uvs) {
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    } else {
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    }
  }
  return lines.join('\n');
}

function buildMtlContent() {
  return `# Wildfox 3D - Material Library
# Generated: ${new Date().toISOString()}

newmtl Material_0
Ka 0.1 0.1 0.1
Kd 0.8 0.8 0.8
Ks 0.2 0.2 0.2
Ns 32.0
d 1.0
illum 2
`;
}

// ─── STL (ASCII) ─────────────────────────────────────────────────────────────

function buildStlContent(mesh) {
  const { positions, indices } = mesh;
  const lines = ['solid WildfoxModel'];
  for (let f = 0; f < indices.length; f += 3) {
    const ia = indices[f], ib = indices[f + 1], ic = indices[f + 2];
    const [nx, ny, nz] = faceNormal(positions, ia, ib, ic);
    lines.push(`  facet normal ${fmtNum(nx)} ${fmtNum(ny)} ${fmtNum(nz)}`);
    lines.push('    outer loop');
    for (const vi of [ia, ib, ic]) {
      lines.push(`      vertex ${fmtNum(positions[vi * 3])} ${fmtNum(positions[vi * 3 + 1])} ${fmtNum(positions[vi * 3 + 2])}`);
    }
    lines.push('    endloop');
    lines.push('  endfacet');
  }
  lines.push('endsolid WildfoxModel');
  return lines.join('\n');
}

// ─── PLY ─────────────────────────────────────────────────────────────────────

function buildPlyContent(mesh) {
  const { positions, indices, colors } = mesh;
  const vertexCount = positions.length / 3;
  const faceCount = indices.length / 3;

  const lines = [
    'ply',
    'format ascii 1.0',
    `comment Wildfox 3D Export - ${new Date().toISOString()}`,
    `element vertex ${vertexCount}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${faceCount}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];

  for (let v = 0; v < vertexCount; v++) {
    const r = colors ? colors[v * 3] : 139;
    const g = colors ? colors[v * 3 + 1] : 92;
    const b = colors ? colors[v * 3 + 2] : 246;
    lines.push(`${fmtNum(positions[v * 3])} ${fmtNum(positions[v * 3 + 1])} ${fmtNum(positions[v * 3 + 2])} ${r} ${g} ${b}`);
  }
  for (let f = 0; f < indices.length; f += 3) {
    lines.push(`3 ${indices[f]} ${indices[f + 1]} ${indices[f + 2]}`);
  }
  return lines.join('\n');
}

// ─── GLTF / GLB ──────────────────────────────────────────────────────────────

/**
 * Costruisce il JSON GLTF e il buffer binario condivisi da .gltf e .glb.
 * @returns {{ json: object, bin: Uint8Array }}
 */
function buildGltfParts(mesh) {
  const { positions, indices, uvs, colors } = mesh;
  const normals = computeVertexNormals(positions, indices);
  const vertexCount = positions.length / 3;

  const useU32 = vertexCount > 65535;
  const posBytes = f32leBytes(positions);
  const normBytes = f32leBytes(normals);
  const uvBytes = uvs ? f32leBytes(uvs) : null;
  const colorBytes = colors ? padBytes(new Uint8Array(colors), 4, 0) : null;
  const idxBytes = padBytes(useU32 ? u32leBytes(indices) : u16leBytes(indices), 4, 0);

  const chunks = [posBytes, normBytes];
  if (uvBytes) chunks.push(uvBytes);
  if (colorBytes) chunks.push(colorBytes);
  chunks.push(idxBytes);
  const bin = concatBytes(chunks);

  // min/max POSITION richiesti dalla specifica
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v++) {
    for (let k = 0; k < 3; k++) {
      const val = positions[v * 3 + k];
      if (val < min[k]) min[k] = val;
      if (val > max[k]) max[k] = val;
    }
  }

  const bufferViews = [];
  const accessors = [];
  const attributes = {};
  let offset = 0;

  const addView = (byteLength, target) => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength, target });
    offset += byteLength;
    return bufferViews.length - 1;
  };

  attributes.POSITION = accessors.length;
  accessors.push({
    bufferView: addView(posBytes.length, 34962),
    componentType: 5126,
    count: vertexCount,
    type: 'VEC3',
    min,
    max,
  });

  attributes.NORMAL = accessors.length;
  accessors.push({
    bufferView: addView(normBytes.length, 34962),
    componentType: 5126,
    count: vertexCount,
    type: 'VEC3',
  });

  if (uvBytes) {
    attributes.TEXCOORD_0 = accessors.length;
    accessors.push({
      bufferView: addView(uvBytes.length, 34962),
      componentType: 5126,
      count: vertexCount,
      type: 'VEC2',
    });
  }

  if (colorBytes) {
    attributes.COLOR_0 = accessors.length;
    accessors.push({
      bufferView: addView(colorBytes.length, 34962),
      componentType: 5121,
      normalized: true,
      count: vertexCount,
      type: 'VEC3',
    });
  }

  const indicesAccessor = accessors.length;
  accessors.push({
    bufferView: addView(idxBytes.length, 34963),
    componentType: useU32 ? 5125 : 5123,
    count: indices.length,
    type: 'SCALAR',
  });

  const json = {
    asset: {
      version: '2.0',
      generator: 'Wildfox 3D App v1.0.0',
    },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ mesh: 0, name: 'ScannedObject' }],
    meshes: [
      {
        name: 'ScannedMesh',
        primitives: [
          {
            attributes,
            indices: indicesAccessor,
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
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0.0,
          roughnessFactor: 0.9,
        },
        doubleSided: true,
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  return { json, bin };
}

function buildGltfContent(mesh) {
  const { json, bin } = buildGltfParts(mesh);
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytesToBase64(bin)}`;
  return JSON.stringify(json, null, 2);
}

/** GLB binario conforme alla specifica (header + chunk JSON + chunk BIN). */
function buildGlbBytes(mesh) {
  const { json, bin } = buildGltfParts(mesh);

  // Chunk JSON (padding con spazi)
  const jsonStr = JSON.stringify(json);
  const jsonRaw = new Uint8Array(jsonStr.length);
  for (let i = 0; i < jsonStr.length; i++) jsonRaw[i] = jsonStr.charCodeAt(i) & 0xff;
  const jsonChunk = padBytes(jsonRaw, 4, 0x20);

  // Chunk BIN (padding con zeri)
  const binChunk = padBytes(bin, 4, 0x00);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = u32leBytes([0x46546c67, 2, totalLength]); // 'glTF', v2
  const jsonHeader = u32leBytes([jsonChunk.length, 0x4e4f534a]); // 'JSON'
  const binHeader = u32leBytes([binChunk.length, 0x004e4942]); // 'BIN'

  return concatBytes([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

// ─── FBX (ASCII) ─────────────────────────────────────────────────────────────

function buildFbxContent(mesh) {
  const { positions, indices } = mesh;
  const normals = computeVertexNormals(positions, indices);
  const now = new Date();

  // PolygonVertexIndex: ultimo indice di ogni poligono in complemento (^-1)
  const polyIndices = [];
  for (let f = 0; f < indices.length; f += 3) {
    polyIndices.push(indices[f], indices[f + 1], indices[f + 2] ^ -1);
  }

  // Normali ByPolygonVertex (una per ogni vertice di ogni faccia)
  const cornerNormals = [];
  for (let f = 0; f < indices.length; f++) {
    const vi = indices[f] * 3;
    cornerNormals.push(fmtNum(normals[vi]), fmtNum(normals[vi + 1]), fmtNum(normals[vi + 2]));
  }

  const vertStr = positions.map(fmtNum).join(',');

  return `; Wildfox 3D - Exported FBX Model (ASCII)
; Generated: ${now.toISOString()}
; FBX 7.4.0 project file

FBXHeaderExtension:  {
    FBXHeaderVersion: 1003
    FBXVersion: 7400
    Creator: "Wildfox 3D App"
    CreationTimeStamp:  {
        Version: 1000
        Year: ${now.getFullYear()}
        Month: ${now.getMonth() + 1}
        Day: ${now.getDate()}
        Hour: ${now.getHours()}
        Minute: ${now.getMinutes()}
        Second: ${now.getSeconds()}
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
    Geometry: 140763642, "Geometry::ScannedMesh", "Mesh" {
        Vertices: *${positions.length} {
            a: ${vertStr}
        }
        PolygonVertexIndex: *${polyIndices.length} {
            a: ${polyIndices.join(',')}
        }
        GeometryVersion: 124
        LayerElementNormal: 0 {
            Version: 101
            Name: ""
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
            Normals: *${cornerNormals.length} {
                a: ${cornerNormals.join(',')}
            }
        }
        Layer: 0 {
            Version: 100
            LayerElement:  {
                Type: "LayerElementNormal"
                TypedIndex: 0
            }
        }
    }
    Model: 140763643, "Model::ScannedObject", "Mesh" {
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

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME_MAP = {
  obj: 'text/plain',
  stl: 'model/stl',
  fbx: 'application/octet-stream',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  ply: 'text/plain',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Esporta il modello del progetto nel formato richiesto.
 *
 * @param {string} modelUri - URI sorgente del modello (per riferimento)
 * @param {'obj'|'stl'|'fbx'|'gltf'|'glb'|'ply'} format - Formato target
 * @param {object} [options]
 * @param {object} [options.meshData] - Geometria reale {positions, indices, uvs, colors}
 *                                      ricostruita dal viewer. Senza, usa il fallback.
 * @returns {Promise<{uri: string, format: string, mimeType: string, size: number}>}
 */
export async function exportAs(modelUri, format, options = {}) {
  const fmt = (format || 'gltf').toLowerCase();
  if (!MIME_MAP[fmt]) {
    throw new Error(`Formato di esportazione non supportato: ${format}`);
  }

  const mesh = normalizeMesh(options.meshData);
  const dir = await ensureExportDir();
  const ts = timestamp();

  if (fmt === 'obj') {
    // Export OBJ + MTL insieme
    const objContent = buildObjContent(mesh);
    const mtlContent = buildMtlContent();
    const objUri = dir + `wildfox_${ts}.obj`;
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

  const fileUri = dir + `wildfox_${ts}.${fmt}`;

  if (fmt === 'glb') {
    // GLB è binario: scritto come base64
    const glbBytes = buildGlbBytes(mesh);
    await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(glbBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const info = await FileSystem.getInfoAsync(fileUri);
    return {
      uri: fileUri,
      format: fmt,
      mimeType: MIME_MAP[fmt],
      size: info.size || glbBytes.length,
    };
  }

  let content;
  if (fmt === 'stl') content = buildStlContent(mesh);
  else if (fmt === 'fbx') content = buildFbxContent(mesh);
  else if (fmt === 'ply') content = buildPlyContent(mesh);
  else content = buildGltfContent(mesh);

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
    { key: 'ply', label: 'PLY', description: 'Polygon File Format - mesh con colori per vertice' },
  ];
}

const modelExporter = { exportAs, getSupportedFormats };
export default modelExporter;
