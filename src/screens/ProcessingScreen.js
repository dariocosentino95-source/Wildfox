import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import colors from '../theme/colors';
import { reconstructModel, reconstructFromVideo, initFromStorage, getServerConfig, DEVICE_STAGES, SERVER_STAGES } from '../services/photogrammetry';
import { saveProject } from '../services/storage';
import { generateId, formatModelStats } from '../utils/modelUtils';

// ─── Processing stages for display ───────────────────────────────────────────

const DEVICE_STAGE_ICONS = {
  'Analisi immagini...':          'search',
  'Rilevamento punti chiave...':  'git-network',
  'Ricostruzione punto cloud...': 'stats-chart',
  'Generazione mesh...':          'cube',
  'Ottimizzazione modello...':    'sparkles',
  'Completato!':                  'checkmark-circle',
};

const SERVER_STAGE_ICONS = {
  'Connessione al server...': 'wifi',
  'Caricamento foto...':      'cloud-upload',
  'Elaborazione GPU...':      'hardware-chip',
  'Download modello 3D...':   'cloud-download',
  'Completato!':              'checkmark-circle',
};

// ─── Stage item ───────────────────────────────────────────────────────────────

function StageItem({ label, status, iconMap }) {
  // status: 'waiting' | 'active' | 'done'
  const icon = (iconMap || DEVICE_STAGE_ICONS)[label] || 'ellipse-outline';

  return (
    <View style={[styles.stageItem, status === 'active' && styles.stageItemActive]}>
      <View
        style={[
          styles.stageIconWrap,
          status === 'done' && styles.stageIconDone,
          status === 'active' && styles.stageIconActive,
        ]}
      >
        {status === 'done' ? (
          <Ionicons name="checkmark" size={14} color={colors.white} />
        ) : status === 'active' ? (
          <Ionicons name={icon} size={14} color={colors.accent} />
        ) : (
          <View style={styles.stageIconWaiting} />
        )}
      </View>
      <Text
        style={[
          styles.stageLabel,
          status === 'done' && styles.stageLabelDone,
          status === 'active' && styles.stageLabelActive,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── ProcessingScreen ─────────────────────────────────────────────────────────

export default function ProcessingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { imageUris, videoUri, projectName = 'Modello 3D', source } = route.params || {};

  const [isServerMode, setIsServerMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [currentLabel, setCurrentLabel] = useState('Inizializzazione...');
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState(null);
  const [isCancelled, setIsCancelled] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const abortControllerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for active state
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Handle Android back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Start reconstruction (after lazy-loading server config from storage)
  useEffect(() => {
    let active = true;
    const run = async () => {
      await initFromStorage();
      if (!active) return;
      const cfg = getServerConfig();
      const serverMode = cfg.enabled && !!cfg.host;
      setIsServerMode(serverMode);
      const stages = serverMode ? SERVER_STAGES : DEVICE_STAGES;
      setCurrentLabel(stages[0]);
      startReconstruction();
    };
    run();
    return () => {
      active = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const startReconstruction = useCallback(async () => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const onProgress = (stageIdx, totalStages, label, pct) => {
      setProgress(pct);
      setCurrentStageIndex(stageIdx);
      setCurrentLabel(label);
    };

    const onStageChange = (label) => {
      setCurrentLabel(label);
      const cfg = getServerConfig();
      const stages = cfg.enabled && cfg.host ? SERVER_STAGES : DEVICE_STAGES;
      const idx = stages.indexOf(label);
      if (idx >= 0) setCurrentStageIndex(idx);
    };

    try {
      let result;
      if (source === 'video' && videoUri) {
        result = await reconstructFromVideo(videoUri, { onProgress, onStageChange, signal });
      } else {
        result = await reconstructModel(imageUris || [], { onProgress, onStageChange, signal });
      }

      if (signal.aborted) return;

      // Save project
      const project = {
        id: generateId(),
        name: projectName,
        modelUri: result.modelUri,
        format: result.format || 'gltf',
        stats: result.stats || {},
        source: result.source,
        capturedImages: imageUris || [],
        videoUri: videoUri || null,
        notes: [],
        thumbnailUri: imageUris?.[0] || null,
      };

      await saveProject(project);

      const cfg = getServerConfig();
      const stages = cfg.enabled && cfg.host ? SERVER_STAGES : DEVICE_STAGES;
      setIsDone(true);
      setProgress(100);
      setCurrentStageIndex(stages.length - 1);
      setCurrentLabel('Completato!');

      // Navigate to viewer after short delay
      setTimeout(() => {
        if (!signal.aborted) {
          navigation.replace('Viewer', { project });
        }
      }, 1200);
    } catch (err) {
      if (err.message?.includes('annullata') || err.name === 'AbortError') {
        return; // Cancelled
      }
      setError(err.message || 'Errore durante la ricostruzione');
    }
  }, [imageUris, videoUri, source, projectName, navigation]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Annulla elaborazione',
      'Sei sicuro di voler annullare la ricostruzione 3D?',
      [
        { text: 'Continua', style: 'cancel' },
        {
          text: 'Annulla',
          style: 'destructive',
          onPress: () => {
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
            setIsCancelled(true);
            navigation.goBack();
          },
        },
      ],
    );
  }, [navigation]);

  const handleRetry = useCallback(() => {
    const cfg = getServerConfig();
    const stages = cfg.enabled && cfg.host ? SERVER_STAGES : DEVICE_STAGES;
    setError(null);
    setProgress(0);
    setCurrentStageIndex(0);
    setCurrentLabel(stages[0]);
    setIsDone(false);
    startReconstruction();
  }, [startReconstruction]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Progress bar color transitions
  const progressColor = isDone ? colors.success : colors.accent;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Elaborazione 3D</Text>
          {isServerMode && (
            <View style={styles.serverBadge}>
              <Ionicons name="hardware-chip" size={10} color={colors.success} />
              <Text style={styles.serverBadgeText}>GPU Server</Text>
            </View>
          )}
        </View>
        {!isDone && !error && (
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Annulla</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Icon */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: isDone ? 1 : pulseAnim }] }]}>
          {error ? (
            <Ionicons name="alert-circle" size={52} color={colors.error} />
          ) : isDone ? (
            <Ionicons name="checkmark-circle" size={52} color={colors.success} />
          ) : (
            <Ionicons name="cube" size={52} color={colors.accent} />
          )}
        </Animated.View>

        {/* Title */}
        <Text style={[styles.statusTitle, isDone && { color: colors.success }, error && { color: colors.error }]}>
          {error ? 'Elaborazione fallita' : isDone ? 'Ricostruzione completata!' : 'Ricostruzione in corso...'}
        </Text>
        <Text style={styles.currentLabel}>{error || currentLabel}</Text>

        {/* Progress bar */}
        {!error && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: progressBarWidth, backgroundColor: progressColor },
                ]}
              />
            </View>
            <Text style={[styles.progressPct, isDone && { color: colors.success }]}>
              {Math.round(progress)}%
            </Text>
          </View>
        )}

        {/* Stages list */}
        {(() => {
          const stages = isServerMode ? SERVER_STAGES : DEVICE_STAGES;
          const iconMap = isServerMode ? SERVER_STAGE_ICONS : DEVICE_STAGE_ICONS;
          return (
            <View style={styles.stagesList}>
              {stages.map((stage, idx) => {
                let status = 'waiting';
                if (idx < currentStageIndex) status = 'done';
                else if (idx === currentStageIndex) status = isDone ? 'done' : 'active';
                return <StageItem key={stage} label={stage} status={status} iconMap={iconMap} />;
              })}
            </View>
          );
        })()}

        {/* Source info */}
        <View style={styles.sourceInfo}>
          <Ionicons name={source === 'video' ? 'videocam-outline' : 'images-outline'} size={14} color={colors.textMuted} />
          <Text style={styles.sourceInfoText}>
            {source === 'video'
              ? 'Fonte: video'
              : source === 'gallery'
              ? `Fonte: galleria (${imageUris?.length || 0} foto)`
              : `Fonte: fotocamera (${imageUris?.length || 0} foto)`}
          </Text>
        </View>
      </View>

      {/* Error actions */}
      {error && (
        <View style={styles.errorActions}>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Ionicons name="refresh" size={18} color={colors.white} />
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Processing tip */}
      {!error && !isDone && (
        <View style={styles.tipBox}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.tipText}>
            La ricostruzione può richiedere da qualche secondo a qualche minuto in base alla qualità e al numero di immagini.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.success + '22',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.success + '55',
  },
  serverBadgeText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  statusTitle: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  currentLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    gap: 6,
    alignItems: 'flex-end',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPct: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  stagesList: {
    width: '100%',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  stageItemActive: {
    backgroundColor: colors.accentMuted + '33',
  },
  stageIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stageIconDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stageIconActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  stageIconWaiting: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textDisabled,
  },
  stageLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  stageLabelDone: {
    color: colors.success,
    fontWeight: '600',
  },
  stageLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  sourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceInfoText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  errorActions: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  retryBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipText: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
});
