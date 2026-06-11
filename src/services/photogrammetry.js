import * as FileSystem from 'expo-file-system';

// ─── Configuration ────────────────────────────────────────────────────────────

let _apiEndpoint = 'https://api.wildfox3d.example.com/reconstruct';

export function setApiEndpoint(url) {
  if (typeof url === 'string' && url.startsWith('http')) {
    _apiEndpoint = url;
  } else {
    console.warn('[photogrammetry] Invalid API endpoint URL:', url);
  }
}

export function getApiEndpoint() {
  return _apiEndpoint;
}

// ─── Processing stages ────────────────────────────────────────────────────────

const PROCESSING_STAGES = [
  { key: 'analysis', label: 'Analisi immagini...', duration: 1500 },
  { key: 'keypoints', label: 'Rilevamento punti chiave...', duration: 2000 },
  { key: 'pointcloud', label: 'Ricostruzione punto cloud...', duration: 2500 },
  { key: 'mesh', label: 'Generazione mesh...', duration: 2000 },
  { key: 'optimize', label: 'Ottimizzazione modello...', duration: 1500 },
  { key: 'complete', label: 'Completato!', duration: 500 },
];

// ─── Mock GLTF content ────────────────────────────────────────────────────────

const MOCK_GLTF_CONTENT = JSON.stringify({
  asset: { version: '2.0', generator: 'Wildfox3D Mock Generator' },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [0] }],
  nodes: [{ mesh: 0, name: 'ReconstructedObject' }],
  meshes: [
    {
      name: 'ReconstructedMesh',
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2,
          material: 0,
        },
      ],
    },
  ],
  materials: [
    {
      name: 'ReconstructedMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [0.54, 0.36, 0.96, 1.0],
        metallicFactor: 0.2,
        roughnessFactor: 0.7,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
      max: [0.5, 0.5, 0.5],
      min: [-0.5, -0.5, -0.5],
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
    },
    {
      bufferView: 2,
      componentType: 5123,
      count: 36,
      type: 'SCALAR',
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 288 },
    { buffer: 0, byteOffset: 288, byteLength: 288 },
    { buffer: 0, byteOffset: 576, byteLength: 72 },
  ],
  buffers: [{
    byteLength: 648,
    uri: 'data:application/octet-stream;base64,AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAPwAAAD8AAAA/AAAAvwAAAD8AAAA/AAAAPwAAAL8AAAC/AAAAvwAAAL8AAAC/AAAAvwAAAD8AAAC/AAAAPwAAAD8AAAC/AAAAvwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAvwAAAD8AAAA/AAAAvwAAAD8AAAC/AAAAPwAAAL8AAAA/AAAAPwAAAL8AAAC/AAAAPwAAAD8AAAC/AAAAPwAAAD8AAAA/AAAAvwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAC/AAAAvwAAAD8AAAC/AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAC/AAAAPwAAAL8AAAA/AAAAvwAAAL8AAAA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAABAAIAAAACAAMABAAFAAYABAAGAAcACAAJAAoACAAKAAsADAANAA4ADAAOAA8AEAARABIAEAASABMAFAAVABYAFAAWABcA',
  }],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeMockGltfFile() {
  const dir = FileSystem.cacheDirectory + 'wildfox3d/models/';
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const filename = `mock_model_${Date.now()}.gltf`;
  const fileUri = dir + filename;
  await FileSystem.writeAsStringAsync(fileUri, MOCK_GLTF_CONTENT, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return fileUri;
}

// ─── Main reconstruct function ────────────────────────────────────────────────

/**
 * Reconstruct a 3D model from an array of image URIs.
 *
 * @param {string[]} imageUris - Array of local image URI strings
 * @param {object} [options]
 * @param {function} [options.onProgress] - Called with (stageIndex, totalStages, label, overallPercent)
 * @param {function} [options.onStageChange] - Called with (label)
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
 * @returns {Promise<{modelUri: string, format: string, stats: object}>}
 */
export async function reconstructModel(imageUris, options = {}) {
  const { onProgress, onStageChange, signal } = options;

  if (!Array.isArray(imageUris) || imageUris.length === 0) {
    throw new Error('Nessuna immagine fornita per la ricostruzione.');
  }

  // ─── Mock processing pipeline ──────────────────────────────────────────────
  const totalStages = PROCESSING_STAGES.length;

  for (let i = 0; i < PROCESSING_STAGES.length; i++) {
    if (signal && signal.aborted) {
      throw new Error('Ricostruzione annullata.');
    }

    const stage = PROCESSING_STAGES[i];

    if (onStageChange) {
      onStageChange(stage.label);
    }

    // Simulate sub-steps within each stage
    const subSteps = 10;
    for (let s = 0; s < subSteps; s++) {
      if (signal && signal.aborted) {
        throw new Error('Ricostruzione annullata.');
      }
      await delay(stage.duration / subSteps);

      const stageProgress = (s + 1) / subSteps;
      const overallPercent = Math.round(((i + stageProgress) / totalStages) * 100);

      if (onProgress) {
        onProgress(i, totalStages, stage.label, overallPercent);
      }
    }
  }

  // Write mock GLTF file to cache
  const modelUri = await writeMockGltfFile();

  const stats = {
    vertexCount: Math.floor(Math.random() * 50000) + 10000,
    faceCount: Math.floor(Math.random() * 25000) + 5000,
    textureCount: Math.floor(Math.random() * 3) + 1,
    inputImages: imageUris.length,
    processingTimeMs: PROCESSING_STAGES.reduce((sum, s) => sum + s.duration, 0),
  };

  return {
    modelUri,
    format: 'gltf',
    stats,
    source: 'mock',
  };
}

/**
 * Reconstruct from a single video file.
 * Extracts virtual frames and runs the same pipeline.
 *
 * @param {string} videoUri - Local video URI
 * @param {object} [options]
 * @returns {Promise<{modelUri: string, format: string, stats: object}>}
 */
export async function reconstructFromVideo(videoUri, options = {}) {
  if (!videoUri) {
    throw new Error('Nessun video fornito per la ricostruzione.');
  }

  // Simulate extracting frames from video
  const simulatedFrameCount = 24;
  const fakeImageUris = Array.from({ length: simulatedFrameCount }, (_, i) => `${videoUri}#frame_${i}`);

  return reconstructModel(fakeImageUris, options);
}

const photogrammetry = {
  setApiEndpoint,
  getApiEndpoint,
  reconstructModel,
  reconstructFromVideo,
};

export default photogrammetry;
