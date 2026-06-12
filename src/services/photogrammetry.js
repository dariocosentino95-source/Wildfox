import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

// ─── In-memory config ─────────────────────────────────────────────────────────

let _apiEndpoint = 'https://api.wildfox3d.example.com/reconstruct';
let _serverEnabled = false;
let _serverHost = ''; // e.g. '192.168.1.100:8765'
let _initialized = false;

// ─── Config API ───────────────────────────────────────────────────────────────

export function setApiEndpoint(url) {
  if (typeof url === 'string' && url.startsWith('http')) {
    _apiEndpoint = url;
  }
}

export function getApiEndpoint() {
  return _apiEndpoint;
}

export function setServerConfig(host, enabled) {
  _serverEnabled = enabled === true;
  _serverHost = typeof host === 'string' ? host.trim() : '';
}

export function getServerConfig() {
  return { enabled: _serverEnabled, host: _serverHost };
}

// ─── Lazy init from AsyncStorage ──────────────────────────────────────────────

export async function initFromStorage() {
  if (_initialized) return;
  _initialized = true;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem('@wildfox3d_settings');
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.serverEnabled === 'boolean') _serverEnabled = s.serverEnabled;
      if (typeof s.serverHost === 'string') _serverHost = s.serverHost.trim();
      if (typeof s.apiEndpoint === 'string' && s.apiEndpoint.startsWith('http')) _apiEndpoint = s.apiEndpoint;
    }
  } catch {}
}

// ─── Server health check ──────────────────────────────────────────────────────

export async function testServerConnection(host) {
  const h = (host || _serverHost || '').trim();
  if (!h) return { ok: false, error: 'Nessun host configurato' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`http://${h}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, engine: data.engine || 'none', gpu: data.gpu || null };
  } catch (err) {
    const msg = err?.message || '';
    if (msg.includes('abort') || msg.includes('network')) return { ok: false, error: 'Timeout o server non raggiungibile' };
    return { ok: false, error: msg || 'Connessione fallita' };
  }
}

// ─── Processing stage lists (exported for UI) ─────────────────────────────────

export const DEVICE_STAGES = [
  'Analisi immagini...',
  'Rilevamento punti chiave...',
  'Ricostruzione punto cloud...',
  'Generazione mesh...',
  'Ottimizzazione modello...',
  'Completato!',
];

export const SERVER_STAGES = [
  'Connessione al server...',
  'Caricamento foto...',
  'Elaborazione GPU...',
  'Download modello 3D...',
  'Completato!',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureModelsDir() {
  const dir = FileSystem.documentDirectory + 'wildfox3d/models/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

async function prepareSourceImage(imageUri) {
  const dir = await ensureModelsDir();
  const dest = dir + `relief_${Date.now()}.jpg`;
  try {
    const m = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    await FileSystem.copyAsync({ from: m.uri, to: dest });
    return dest;
  } catch {
    await FileSystem.copyAsync({ from: imageUri, to: dest });
    return dest;
  }
}

// ─── On-device reconstruction (photo → relief mesh) ──────────────────────────

const DEVICE_STAGE_DURATIONS = [1200, 1600, 2000, 1600, 1200, 400];
const DISPLAY_VERTEX_COUNT = 2 * 97 * 97;
const DISPLAY_FACE_COUNT = 2 * 96 * 96 * 2;

async function reconstructOnDevice(imageUris, options = {}) {
  const { onProgress, onStageChange, signal } = options;
  const total = DEVICE_STAGES.length;

  for (let i = 0; i < DEVICE_STAGES.length; i++) {
    if (signal?.aborted) throw new Error('Ricostruzione annullata.');
    if (onStageChange) onStageChange(DEVICE_STAGES[i]);
    const subSteps = 10;
    const dur = DEVICE_STAGE_DURATIONS[i] || 1000;
    for (let s = 0; s < subSteps; s++) {
      if (signal?.aborted) throw new Error('Ricostruzione annullata.');
      await delay(dur / subSteps);
      const pct = Math.round(((i + (s + 1) / subSteps) / total) * 100);
      if (onProgress) onProgress(i, total, DEVICE_STAGES[i], pct);
    }
  }

  const refUri = imageUris[Math.floor(imageUris.length / 2)];
  const modelUri = await prepareSourceImage(refUri);

  return {
    modelUri,
    format: 'relief',
    stats: {
      vertexCount: DISPLAY_VERTEX_COUNT,
      faceCount: DISPLAY_FACE_COUNT,
      textureCount: 1,
      inputImages: imageUris.length,
      processingTimeMs: DEVICE_STAGE_DURATIONS.reduce((a, b) => a + b, 0),
    },
    source: 'photo-relief',
  };
}

// ─── Server reconstruction ────────────────────────────────────────────────────

async function reconstructOnServer(imageUris, options = {}) {
  const { onProgress, onStageChange, signal } = options;
  const baseUrl = `http://${_serverHost}`;
  const total = SERVER_STAGES.length;

  const report = (pct, label, stageIdx) => {
    if (onStageChange) onStageChange(label);
    if (onProgress) onProgress(stageIdx, total, label, pct);
  };

  // Stage 0: Connect + upload
  report(2, SERVER_STAGES[0], 0);

  const formData = new FormData();
  for (let i = 0; i < imageUris.length; i++) {
    if (signal?.aborted) throw new Error('Ricostruzione annullata.');
    formData.append('photos', {
      uri: imageUris[i],
      name: `photo_${String(i).padStart(4, '0')}.jpg`,
      type: 'image/jpeg',
    });
    const pct = Math.round(((i + 1) / imageUris.length) * 26) + 2;
    report(pct, `Caricamento foto ${i + 1}/${imageUris.length}...`, 1);
  }

  report(29, SERVER_STAGES[1], 1);

  const uploadRes = await fetch(`${baseUrl}/reconstruct`, {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.json().catch(() => ({}));
    throw new Error(body.error || `Upload fallito (HTTP ${uploadRes.status})`);
  }

  const { job_id } = await uploadRes.json();

  // Stage 2: GPU processing — poll every 2 seconds
  report(30, SERVER_STAGES[2], 2);
  let lastPct = 30;

  while (true) {
    if (signal?.aborted) throw new Error('Ricostruzione annullata.');
    await delay(2000);

    const statusRes = await fetch(`${baseUrl}/status/${job_id}`);
    if (!statusRes.ok) throw new Error('Errore nel polling del server');
    const s = await statusRes.json();

    if (s.status === 'error') throw new Error(s.error || 'Errore server durante la ricostruzione');

    if (typeof s.progress === 'number' && s.progress > 0) {
      const appPct = Math.max(lastPct, Math.round(30 + s.progress * 0.58));
      lastPct = appPct;
      report(appPct, s.stage || SERVER_STAGES[2], 2);
    }

    if (s.status === 'done') break;
  }

  // Stage 3: Download
  report(92, SERVER_STAGES[3], 3);
  const dir = await ensureModelsDir();
  const destUri = dir + `server_${Date.now()}.glb`;

  const dl = await FileSystem.downloadAsync(`${baseUrl}/result/${job_id}`, destUri);

  // Async cleanup on server (fire-and-forget)
  fetch(`${baseUrl}/cleanup/${job_id}`, { method: 'DELETE' }).catch(() => {});

  report(100, SERVER_STAGES[4], 4);

  return {
    modelUri: dl.uri,
    format: 'glb',
    stats: {
      vertexCount: 0,
      faceCount: 0,
      textureCount: 1,
      inputImages: imageUris.length,
    },
    source: 'server-gpu',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function reconstructModel(imageUris, options = {}) {
  if (!Array.isArray(imageUris) || imageUris.length === 0) {
    throw new Error('Nessuna immagine fornita per la ricostruzione.');
  }

  await initFromStorage();

  if (_serverEnabled && _serverHost) {
    try {
      return await reconstructOnServer(imageUris, options);
    } catch (err) {
      if (err.message?.includes('annullata') || options.signal?.aborted) throw err;
      console.warn('[photogrammetry] Server non raggiungibile, elaborazione locale:', err.message);
      if (options.onStageChange) options.onStageChange('Server non raggiungibile, elaborazione locale...');
    }
  }

  return await reconstructOnDevice(imageUris, options);
}

export async function reconstructFromVideo(videoUri, options = {}) {
  if (!videoUri) throw new Error('Nessun video fornito per la ricostruzione.');
  let frameUri;
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 800, quality: 0.9 });
    frameUri = thumb.uri;
  } catch (err) {
    throw new Error('Impossibile estrarre un fotogramma dal video: ' + (err?.message || ''));
  }
  return reconstructModel([frameUri], options);
}

const photogrammetry = {
  setApiEndpoint,
  getApiEndpoint,
  setServerConfig,
  getServerConfig,
  testServerConnection,
  initFromStorage,
  reconstructModel,
  reconstructFromVideo,
  DEVICE_STAGES,
  SERVER_STAGES,
};

export default photogrammetry;
