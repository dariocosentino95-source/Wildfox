import { Platform } from 'react-native';

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generate a unique ID string combining timestamp and random hex.
 * @returns {string}
 */
export function generateId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substr(2, 9);
  return `${ts}_${rand}`;
}

// ─── File size formatting ─────────────────────────────────────────────────────

/**
 * Format bytes into a human-readable string (B, KB, MB, GB).
 * @param {number} bytes
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatFileSize(bytes, decimals = 1) {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

// ─── Thumbnails ───────────────────────────────────────────────────────────────

/**
 * Return a thumbnail URI for a given project.
 * If the project has an explicit thumbnailUri, return it.
 * If it has captured photos, return the first one.
 * Otherwise return null (caller should show placeholder).
 *
 * @param {object} project
 * @returns {string|null}
 */
export function getModelThumbnail(project) {
  if (!project) return null;
  if (project.thumbnailUri) return project.thumbnailUri;
  if (Array.isArray(project.capturedImages) && project.capturedImages.length > 0) {
    return project.capturedImages[0];
  }
  if (project.videoUri) return project.videoUri;
  return null;
}

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME_MAP = {
  obj: 'text/plain',
  mtl: 'text/plain',
  stl: 'model/stl',
  fbx: 'application/octet-stream',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  ply: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * Return the MIME type string for a given file format or extension.
 * @param {string} format
 * @returns {string}
 */
export function getFormatMimeType(format) {
  if (!format) return 'application/octet-stream';
  return MIME_MAP[format.toLowerCase()] || 'application/octet-stream';
}

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format an ISO date string into a localized Italian date string.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Adesso';
    if (mins < 60) return `${mins} min fa`;
    if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
    if (days < 7) return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`;

    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ─── Model format info ────────────────────────────────────────────────────────

export function getFormatBadgeColor(format) {
  const colors = {
    gltf: '#10B981',
    glb: '#059669',
    obj: '#3B82F6',
    stl: '#F59E0B',
    fbx: '#8B5CF6',
    ply: '#EF4444',
    relief: '#8B5CF6',
  };
  return colors[(format || '').toLowerCase()] || '#6B6B8A';
}

/**
 * Etichetta leggibile per il badge formato.
 * 'relief' è il formato interno della ricostruzione fotografica.
 */
export function getFormatLabel(format) {
  if ((format || '').toLowerCase() === 'relief') return '3D';
  return (format || 'GLTF').toUpperCase();
}

// ─── Stats formatting ─────────────────────────────────────────────────────────

/**
 * Format model stats into a summary string.
 * @param {object} stats
 * @returns {string}
 */
export function formatModelStats(stats) {
  if (!stats) return '';
  const parts = [];
  if (stats.vertexCount) parts.push(`${(stats.vertexCount / 1000).toFixed(1)}K vertici`);
  if (stats.faceCount) parts.push(`${(stats.faceCount / 1000).toFixed(1)}K facce`);
  if (stats.textureCount) parts.push(`${stats.textureCount} texture`);
  return parts.join(' · ');
}

const modelUtils = {
  generateId,
  formatFileSize,
  getModelThumbnail,
  getFormatMimeType,
  formatDate,
  getFormatBadgeColor,
  getFormatLabel,
  formatModelStats,
};

export default modelUtils;
