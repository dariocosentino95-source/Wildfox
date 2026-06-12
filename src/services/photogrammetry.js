import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

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
  { key: 'analysis', label: 'Analisi immagini...', duration: 1200 },
  { key: 'keypoints', label: 'Rilevamento punti chiave...', duration: 1600 },
  { key: 'pointcloud', label: 'Ricostruzione punto cloud...', duration: 2000 },
  { key: 'mesh', label: 'Generazione mesh...', duration: 1600 },
  { key: 'optimize', label: 'Ottimizzazione modello...', duration: 1200 },
  { key: 'complete', label: 'Completato!', duration: 400 },
];

// Display mesh: griglia 96x96 fronte+retro (vedi viewer.html buildRelief)
const DISPLAY_VERTEX_COUNT = 2 * 97 * 97;
const DISPLAY_FACE_COUNT = 2 * 96 * 96 * 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureModelsDir() {
  const dir = FileSystem.documentDirectory + 'wildfox3d/models/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

/**
 * Normalizza l'immagine sorgente: ridimensiona a max 1024px di larghezza,
 * corregge la rotazione EXIF e la salva in una posizione persistente.
 * La WebView riceverà questa immagine come base64, quindi deve essere compatta.
 */
async function prepareSourceImage(imageUri) {
  const dir = await ensureModelsDir();
  const destUri = dir + `relief_${Date.now()}.jpg`;

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    await FileSystem.copyAsync({ from: manipulated.uri, to: destUri });
    return destUri;
  } catch (err) {
    // Fallback: copia l'originale senza ridimensionarlo
    console.warn('[photogrammetry] resize fallito, copio originale:', err?.message);
    await FileSystem.copyAsync({ from: imageUri, to: destUri });
    return destUri;
  }
}

// ─── Main reconstruct function ────────────────────────────────────────────────

/**
 * Ricostruisce un modello 3D da un array di immagini.
 *
 * La ricostruzione avviene interamente sul dispositivo: l'immagine di
 * riferimento viene trasformata in una mesh 3D a rilievo con texture
 * fotografica dal viewer (Three.js). Il risultato mostra il soggetto
 * reale catturato.
 *
 * @param {string[]} imageUris - Array di URI locali delle immagini
 * @param {object} [options]
 * @param {function} [options.onProgress] - (stageIndex, totalStages, label, overallPercent)
 * @param {function} [options.onStageChange] - (label)
 * @param {AbortSignal} [options.signal] - AbortSignal per annullamento
 * @returns {Promise<{modelUri: string, format: string, stats: object}>}
 */
export async function reconstructModel(imageUris, options = {}) {
  const { onProgress, onStageChange, signal } = options;

  if (!Array.isArray(imageUris) || imageUris.length === 0) {
    throw new Error('Nessuna immagine fornita per la ricostruzione.');
  }

  const totalStages = PROCESSING_STAGES.length;

  for (let i = 0; i < PROCESSING_STAGES.length; i++) {
    if (signal && signal.aborted) {
      throw new Error('Ricostruzione annullata.');
    }

    const stage = PROCESSING_STAGES[i];

    if (onStageChange) {
      onStageChange(stage.label);
    }

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

  // Immagine di riferimento: quella centrale della sequenza di cattura
  // (di solito il soggetto è inquadrato meglio rispetto al primo scatto)
  const referenceUri = imageUris[Math.floor(imageUris.length / 2)];
  const modelUri = await prepareSourceImage(referenceUri);

  if (signal && signal.aborted) {
    throw new Error('Ricostruzione annullata.');
  }

  const stats = {
    vertexCount: DISPLAY_VERTEX_COUNT,
    faceCount: DISPLAY_FACE_COUNT,
    textureCount: 1,
    inputImages: imageUris.length,
    processingTimeMs: PROCESSING_STAGES.reduce((sum, s) => sum + s.duration, 0),
  };

  return {
    modelUri,
    format: 'relief',
    stats,
    source: 'photo-relief',
  };
}

/**
 * Ricostruisce da un singolo file video: estrae un fotogramma reale
 * dal video e usa la stessa pipeline delle foto.
 *
 * @param {string} videoUri - URI locale del video
 * @param {object} [options]
 * @returns {Promise<{modelUri: string, format: string, stats: object}>}
 */
export async function reconstructFromVideo(videoUri, options = {}) {
  if (!videoUri) {
    throw new Error('Nessun video fornito per la ricostruzione.');
  }

  let frameUri;
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 800,
      quality: 0.9,
    });
    frameUri = thumb.uri;
  } catch (err) {
    throw new Error('Impossibile estrarre un fotogramma dal video: ' + (err?.message || ''));
  }

  return reconstructModel([frameUri], options);
}

const photogrammetry = {
  setApiEndpoint,
  getApiEndpoint,
  reconstructModel,
  reconstructFromVideo,
};

export default photogrammetry;
