import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import colors from '../theme/colors';
import ModelViewer3D from '../components/ModelViewer3D';
import AreaSelector from '../components/AreaSelector';
import NotesPanel from '../components/NotesPanel';
import ExportModal from '../components/ExportModal';
import { addNoteToProject, deleteNoteFromProject, getProjectById } from '../services/storage';
import { exportAs } from '../services/modelExporter';

// ─── ViewerScreen ─────────────────────────────────────────────────────────────

export default function ViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { project: initialProject } = route.params || {};

  const [project, setProject] = useState(initialProject);
  const [viewMode, setViewMode] = useState('view');
  const [selectedArea, setSelectedArea] = useState(null);
  const [notesVisible, setNotesVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [brightness, setBrightness] = useState(1.0);
  const [opacity, setOpacity] = useState(1.0);
  const [showSliders, setShowSliders] = useState(false);

  const viewerRef = useRef(null);

  const notes = project?.notes || [];

  // ── Mode change ────────────────────────────────────────────────────────────
  const handleModeChange = useCallback((mode) => {
    setViewMode(mode);
    if (mode !== 'select') setSelectedArea(null);
    viewerRef.current?.setMode(mode);
  }, []);

  // ── Area selected ──────────────────────────────────────────────────────────
  const handleAreaSelected = useCallback((data) => {
    setSelectedArea(data);
    setShowSliders(true);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedArea(null);
    setShowSliders(false);
    viewerRef.current?.clearSelection();
  }, []);

  // ── Annotation placed ──────────────────────────────────────────────────────
  const handleAnnotationPlaced = useCallback(
    async (data) => {
      if (!project) return;
      // Add annotation as a note with area reference
      const noteData = {
        text: `Annotazione al punto (${data.point?.x?.toFixed(2)}, ${data.point?.y?.toFixed(2)}, ${data.point?.z?.toFixed(2)})`,
        areaRef: { meshName: data.meshName, point: data.point },
      };
      await addNoteToProject(project.id, noteData);
      const updated = await getProjectById(project.id);
      if (updated) setProject(updated);
    },
    [project],
  );

  // ── Notes ──────────────────────────────────────────────────────────────────
  const handleAddNote = useCallback(
    async (text) => {
      if (!project || !text.trim()) return;
      const noteData = {
        text,
        areaRef: selectedArea || null,
      };
      await addNoteToProject(project.id, noteData);
      const updated = await getProjectById(project.id);
      if (updated) setProject(updated);
    },
    [project, selectedArea],
  );

  const handleDeleteNote = useCallback(
    async (noteId) => {
      if (!project) return;
      await deleteNoteFromProject(project.id, noteId);
      const updated = await getProjectById(project.id);
      if (updated) setProject(updated);
    },
    [project],
  );

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(
    async (format) => {
      if (!project?.modelUri) throw new Error('Nessun modello da esportare');
      const result = await exportAs(project.modelUri, format);

      // Share the file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: result.mimeType,
          dialogTitle: `Esporta ${project.name}`,
        });
      }

      return result;
    },
    [project],
  );

  // ── Share model ────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!project?.modelUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(project.modelUri, {
          mimeType: 'model/gltf+json',
          dialogTitle: `Condividi ${project.name}`,
        });
      } else {
        Alert.alert('Condivisione non disponibile', 'La condivisione non è supportata su questo dispositivo.');
      }
    } catch (err) {
      Alert.alert('Errore', 'Impossibile condividere il modello.');
    }
  }, [project]);

  // ── Brightness slider ──────────────────────────────────────────────────────
  const handleBrightnessChange = useCallback((val) => {
    setBrightness(val);
    viewerRef.current?.setModelProperty('brightness', val);
  }, []);

  const handleOpacityChange = useCallback((val) => {
    setOpacity(val);
    viewerRef.current?.setModelProperty('opacity', val);
  }, []);

  if (!project) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>Progetto non trovato</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 3D Viewer */}
      <ModelViewer3D
        ref={viewerRef}
        modelUri={project.modelUri}
        format={project.format || 'gltf'}
        mode={viewMode}
        onAreaSelected={handleAreaSelected}
        onAnnotationPlaced={handleAnnotationPlaced}
        onModelLoaded={() => setIsModelLoaded(true)}
        style={StyleSheet.absoluteFill}
      />

      {/* Top toolbar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Text style={styles.modelName} numberOfLines={1}>{project.name}</Text>
          {project.stats?.vertexCount > 0 && (
            <Text style={styles.modelStats}>
              {`${(project.stats.vertexCount / 1000).toFixed(1)}K vertici`}
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.topBarBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Right-side floating action bar */}
      <View style={[styles.fabBar, { top: insets.top + 70 }]}>
        <TouchableOpacity
          style={[styles.fabBtn, viewMode === 'view' && styles.fabBtnActive]}
          onPress={() => handleModeChange('view')}
        >
          <Ionicons name="eye" size={20} color={viewMode === 'view' ? colors.accent : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabBtn, viewMode === 'select' && styles.fabBtnActiveWarning]}
          onPress={() => handleModeChange('select')}
        >
          <Ionicons name="hand-right" size={20} color={viewMode === 'select' ? colors.warning : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabBtn, viewMode === 'annotate' && styles.fabBtnActiveError]}
          onPress={() => handleModeChange('annotate')}
        >
          <Ionicons name="pin" size={20} color={viewMode === 'annotate' ? colors.error : colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.fabDivider} />

        <TouchableOpacity
          style={[styles.fabBtn, notesVisible && styles.fabBtnActive]}
          onPress={() => {
            setNotesVisible((v) => !v);
            if (exportVisible) setExportVisible(false);
          }}
        >
          <Ionicons name="document-text" size={20} color={notesVisible ? colors.accent : colors.textSecondary} />
          {notes.length > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{notes.length > 9 ? '9+' : notes.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => {
            setExportVisible(true);
            if (notesVisible) setNotesVisible(false);
          }}
        >
          <Ionicons name="share-social" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.fabDivider} />

        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => viewerRef.current?.resetCamera()}
        >
          <Ionicons name="locate" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Selection controls (shown when area selected) */}
      {showSliders && viewMode === 'select' && selectedArea && (
        <View style={[styles.sliderPanel, { top: insets.top + 70 }]}>
          <Text style={styles.sliderPanelTitle}>Proprietà area</Text>

          <View style={styles.sliderRow}>
            <Ionicons name="sunny-outline" size={14} color={colors.textMuted} />
            <Text style={styles.sliderLabel}>Luminosità</Text>
            <Text style={styles.sliderValue}>{brightness.toFixed(1)}x</Text>
          </View>
          <View style={styles.sliderTrack}>
            {[0.2, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((v) => (
              <TouchableOpacity
                key={v}
                style={[
                  styles.sliderStep,
                  brightness >= v && styles.sliderStepActive,
                ]}
                onPress={() => handleBrightnessChange(v)}
              />
            ))}
          </View>

          <View style={styles.sliderRow}>
            <Ionicons name="contrast-outline" size={14} color={colors.textMuted} />
            <Text style={styles.sliderLabel}>Opacità</Text>
            <Text style={styles.sliderValue}>{Math.round(opacity * 100)}%</Text>
          </View>
          <View style={styles.sliderTrack}>
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
              <TouchableOpacity
                key={v}
                style={[
                  styles.sliderStep,
                  opacity >= v && styles.sliderStepActive,
                ]}
                onPress={() => handleOpacityChange(v)}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.sliderCloseBtn}
            onPress={() => setShowSliders(false)}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Area selector overlay (bottom) */}
      {!notesVisible && !exportVisible && (
        <AreaSelector
          mode={viewMode}
          onModeChange={handleModeChange}
          selectedArea={selectedArea}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Notes panel */}
      <NotesPanel
        visible={notesVisible}
        notes={notes}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onClose={() => setNotesVisible(false)}
        selectedArea={selectedArea}
      />

      {/* Export modal */}
      <ExportModal
        visible={exportVisible}
        onExport={handleExport}
        onClose={() => setExportVisible(false)}
        modelName={project.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 10,
    backgroundColor: colors.overlay,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  modelName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  modelStats: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  fabBar: {
    position: 'absolute',
    right: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 10,
  },
  fabBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fabBtnActive: {
    backgroundColor: colors.accentMuted,
  },
  fabBtnActiveWarning: {
    backgroundColor: colors.warning + '22',
  },
  fabBtnActiveError: {
    backgroundColor: colors.error + '22',
  },
  fabDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  fabBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  fabBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
  sliderPanel: {
    position: 'absolute',
    left: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    width: 180,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
    gap: 4,
  },
  sliderPanelTitle: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sliderLabel: {
    color: colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  sliderValue: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sliderTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    marginTop: 2,
  },
  sliderStep: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  sliderStepActive: {
    backgroundColor: colors.accent,
  },
  sliderCloseBtn: {
    alignSelf: 'flex-end',
    padding: 2,
  },
});
