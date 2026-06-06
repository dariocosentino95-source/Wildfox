import AsyncStorage from '@react-native-async-storage/async-storage';

const PROJECTS_KEY = '@wildfox3d_projects';
const SETTINGS_KEY = '@wildfox3d_settings';

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getAllProjects() {
  try {
    const raw = await AsyncStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[storage] getAllProjects error:', err);
    return [];
  }
}

export async function getProjectById(id) {
  try {
    const projects = await getAllProjects();
    return projects.find((p) => p.id === id) || null;
  } catch (err) {
    console.error('[storage] getProjectById error:', err);
    return null;
  }
}

export async function saveProject(project) {
  try {
    const projects = await getAllProjects();
    const existingIndex = projects.findIndex((p) => p.id === project.id);
    if (existingIndex >= 0) {
      projects[existingIndex] = { ...projects[existingIndex], ...project, updatedAt: new Date().toISOString() };
    } else {
      projects.unshift({ ...project, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (err) {
    console.error('[storage] saveProject error:', err);
    return false;
  }
}

export async function updateProject(id, updates) {
  try {
    const projects = await getAllProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    projects[idx] = { ...projects[idx], ...updates, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (err) {
    console.error('[storage] updateProject error:', err);
    return false;
  }
}

export async function deleteProject(id) {
  try {
    const projects = await getAllProjects();
    const filtered = projects.filter((p) => p.id !== id);
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error('[storage] deleteProject error:', err);
    return false;
  }
}

export async function renameProject(id, newName) {
  return updateProject(id, { name: newName });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export async function getNotesForProject(projectId) {
  try {
    const project = await getProjectById(projectId);
    if (!project) return [];
    return Array.isArray(project.notes) ? project.notes : [];
  } catch (err) {
    console.error('[storage] getNotesForProject error:', err);
    return [];
  }
}

export async function addNoteToProject(projectId, note) {
  try {
    const project = await getProjectById(projectId);
    if (!project) return false;
    const notes = Array.isArray(project.notes) ? project.notes : [];
    const newNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: note.text || '',
      areaRef: note.areaRef || null,
      createdAt: new Date().toISOString(),
    };
    notes.unshift(newNote);
    return updateProject(projectId, { notes });
  } catch (err) {
    console.error('[storage] addNoteToProject error:', err);
    return false;
  }
}

export async function deleteNoteFromProject(projectId, noteId) {
  try {
    const project = await getProjectById(projectId);
    if (!project) return false;
    const notes = (Array.isArray(project.notes) ? project.notes : []).filter((n) => n.id !== noteId);
    return updateProject(projectId, { notes });
  } catch (err) {
    console.error('[storage] deleteNoteFromProject error:', err);
    return false;
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://api.wildfox3d.example.com/reconstruct',
  defaultExportFormat: 'gltf',
  captureQuality: 'high',
  autoSave: true,
  language: 'it',
};

export async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.error('[storage] getSettings error:', err);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  try {
    const current = await getSettings();
    const merged = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return true;
  } catch (err) {
    console.error('[storage] saveSettings error:', err);
    return false;
  }
}

export async function clearAllData() {
  try {
    await AsyncStorage.multiRemove([PROJECTS_KEY, SETTINGS_KEY]);
    return true;
  } catch (err) {
    console.error('[storage] clearAllData error:', err);
    return false;
  }
}

const storage = {
  getAllProjects,
  getProjectById,
  saveProject,
  updateProject,
  deleteProject,
  renameProject,
  getNotesForProject,
  addNoteToProject,
  deleteNoteFromProject,
  getSettings,
  saveSettings,
  clearAllData,
};

export default storage;
