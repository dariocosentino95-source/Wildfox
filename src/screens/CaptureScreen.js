import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera/next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import colors from '../theme/colors';
import CaptureGuide from '../components/CaptureGuide';
import { generateId } from '../utils/modelUtils';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_PHOTOS = 6;

// ─── Timer display ────────────────────────────────────────────────────────────

function RecordingTimer({ seconds }) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return (
    <View style={styles.timerContainer}>
      <View style={styles.timerDot} />
      <Text style={styles.timerText}>{mins}:{secs}</Text>
    </View>
  );
}

// ─── CaptureScreen ────────────────────────────────────────────────────────────

export default function CaptureScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const cameraRef = useRef(null);

  const [captureMode, setCaptureMode] = useState('photo'); // 'photo' | 'video'
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState('off');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [videoUri, setVideoUri] = useState(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [mountError, setMountError] = useState(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const recordingTimerRef = useRef(null);
  const autoStopRef = useRef(null);

  // ── Readiness: si azzera a ogni cambio modalità / ritorno in focus / retry,
  // con fallback a 2s nel caso onCameraReady non scatti su alcuni dispositivi
  useEffect(() => {
    setIsReady(false);
    const t = setTimeout(() => setIsReady(true), 2000);
    return () => clearTimeout(t);
  }, [captureMode, isFocused, retryAttempt]);

  // ── Permissions ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!micPermission?.granted) await requestMicPermission();
      if (!mediaPermission?.granted) await requestMediaPermission();
    })();
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingSeconds(0);
    }
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  // ── Take photo ─────────────────────────────────────────────────────────────
  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || isTakingPhoto) return;
    setIsTakingPhoto(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: false,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) setCapturedPhotos((prev) => [...prev, photo.uri]);
    } catch (err) {
      console.error('[CaptureScreen] takePicture error:', err);
      Alert.alert('Errore', 'Impossibile scattare la foto. Riprova.');
    } finally {
      setIsTakingPhoto(false);
    }
  }, [isTakingPhoto]);

  // ── Start/stop recording ───────────────────────────────────────────────────
  const handleRecordToggle = useCallback(async () => {
    if (!cameraRef.current) return;
    if (isRecording) {
      clearTimeout(autoStopRef.current);
      cameraRef.current.stopRecording();
      // recordAsync risolverà e aggiornerà videoUri/isRecording
      return;
    }

    // Il modulo nativo rifiuta recordAsync se manca il permesso microfono
    if (!micPermission?.granted) {
      const res = await requestMicPermission();
      if (!res?.granted) {
        Alert.alert(
          'Microfono richiesto',
          'Per registrare video serve il permesso del microfono. Abilitalo nelle impostazioni di sistema.',
        );
        return;
      }
    }

    setIsRecording(true);
    setVideoUri(null);
    // Limite di 5 minuti gestito lato JS: l'opzione nativa maxDuration in
    // expo-camera 14 interpreta i secondi come millisecondi e fa fallire
    // la registrazione, quindi non va passata.
    autoStopRef.current = setTimeout(() => {
      cameraRef.current?.stopRecording();
    }, 300 * 1000);
    try {
      const video = await cameraRef.current.recordAsync();
      if (video?.uri) {
        setVideoUri(video.uri);
      }
    } catch (err) {
      console.error('[CaptureScreen] recordAsync error:', err);
      Alert.alert(
        'Errore registrazione',
        err?.message || 'Impossibile avviare la registrazione. Riprova tra qualche istante.',
      );
    } finally {
      clearTimeout(autoStopRef.current);
      setIsRecording(false);
    }
  }, [isRecording, micPermission, requestMicPermission]);

  // Pulisce il timer di auto-stop allo smontaggio
  useEffect(() => () => clearTimeout(autoStopRef.current), []);

  // ── Process ────────────────────────────────────────────────────────────────
  const handleProcess = useCallback(() => {
    const projectName = `Modello ${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;

    if (captureMode === 'video' && videoUri) {
      navigation.navigate('Processing', {
        videoUri,
        projectName,
        source: 'video',
      });
    } else if (captureMode === 'photo' && capturedPhotos.length >= MIN_PHOTOS) {
      navigation.navigate('Processing', {
        imageUris: capturedPhotos,
        projectName,
        source: 'photos',
      });
    }
  }, [captureMode, videoUri, capturedPhotos, navigation]);

  // ── Clear photos ───────────────────────────────────────────────────────────
  const handleClearPhotos = useCallback(() => {
    Alert.alert(
      'Cancella foto',
      `Sei sicuro di voler eliminare tutte le ${capturedPhotos.length} foto?`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: () => setCapturedPhotos([]) },
      ],
    );
  }, [capturedPhotos.length]);

  // ── Flash label ────────────────────────────────────────────────────────────
  const flashIcon = flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline';

  const cycleFlash = () => {
    setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));
  };

  // ── Permission check ───────────────────────────────────────────────────────
  if (!cameraPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Verifica permessi in corso...</Text>
      </View>
    );
  }

  if (mountError) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="alert-circle-outline" size={56} color={colors.error} />
        <Text style={styles.permissionTitle}>Fotocamera non disponibile</Text>
        <Text style={styles.permissionSubtext}>{mountError}</Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={() => {
            setMountError(null);
            setIsReady(false);
            setRetryAttempt((c) => c + 1);
          }}
        >
          <Text style={styles.permissionBtnText}>Riprova</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.permissionLinkText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={56} color={colors.textMuted} />
        <Text style={styles.permissionTitle}>Accesso fotocamera richiesto</Text>
        <Text style={styles.permissionSubtext}>
          Wildfox 3D ha bisogno dell'accesso alla fotocamera per catturare oggetti.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestCameraPermission}>
          <Text style={styles.permissionBtnText}>Consenti accesso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canProcess =
    (captureMode === 'photo' && capturedPhotos.length >= MIN_PHOTOS) ||
    (captureMode === 'video' && videoUri != null);

  return (
    <View style={styles.container}>
      {/* Camera — montata solo quando lo screen è in focus, così il nativo
           rilascia la fotocamera quando si naviga a Processing/Viewer.
           L'enum nativo CameraMode accetta solo 'picture' | 'video'
           ('photo' non è valido e il cast nativo fallirebbe in silenzio).
           Il wrapper JS di expo-camera 14 non rinomina flash→flashMode,
           quindi passiamo direttamente flashMode come si aspetta il nativo. */}
      {isFocused && (
        <CameraView
          key={`cam_${retryAttempt}`}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          flashMode={flash}
          mode={captureMode === 'video' ? 'video' : 'picture'}
          onCameraReady={() => setIsReady(true)}
          onMountError={(e) => setMountError(e?.message || 'Errore fotocamera')}
        />
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          {isRecording && <RecordingTimer seconds={recordingSeconds} />}
          {captureMode === 'photo' && capturedPhotos.length > 0 && !isRecording && (
            <TouchableOpacity onPress={handleClearPhotos}>
              <View style={styles.photoCountBadge}>
                <Ionicons name="images" size={14} color={colors.white} />
                <Text style={styles.photoCountText}>{capturedPhotos.length}</Text>
              </View>
            </TouchableOpacity>
          )}
          {captureMode === 'video' && videoUri && !isRecording && (
            <View style={styles.videoReadyBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.videoReadyText}>Video pronto</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.iconBtn} onPress={cycleFlash}>
          <Ionicons name={flashIcon} size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Capture guide */}
      {captureMode === 'photo' && showGuide && (
        <CaptureGuide
          photoCount={capturedPhotos.length}
          totalNeeded={MIN_PHOTOS}
          visible
        />
      )}

      {/* Mode selector */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, captureMode === 'photo' && styles.modeBtnActive]}
            onPress={() => { if (!isRecording) setCaptureMode('photo'); }}
            disabled={isRecording}
          >
            <Text style={[styles.modeBtnLabel, captureMode === 'photo' && styles.modeBtnLabelActive]}>
              Foto
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, captureMode === 'video' && styles.modeBtnActive]}
            onPress={() => { if (!isRecording) setCaptureMode('video'); }}
            disabled={isRecording}
          >
            <Text style={[styles.modeBtnLabel, captureMode === 'video' && styles.modeBtnLabelActive]}>
              Video
            </Text>
          </TouchableOpacity>
        </View>

        {/* Controls row */}
        <View style={styles.controlsRow}>
          {/* Flip camera */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            disabled={isRecording}
          >
            <Ionicons name="camera-reverse-outline" size={26} color={isRecording ? colors.textDisabled : colors.white} />
          </TouchableOpacity>

          {/* Shutter */}
          {captureMode === 'photo' ? (
            <TouchableOpacity
              style={[styles.shutterBtn, isTakingPhoto && styles.shutterBtnActive]}
              onPress={handleTakePhoto}
              disabled={isTakingPhoto}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.shutterBtn,
                isRecording && styles.shutterBtnRecording,
                (!isReady && !isRecording) && styles.shutterBtnDisabled,
              ]}
              onPress={handleRecordToggle}
              disabled={!isReady && !isRecording}
            >
              <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
            </TouchableOpacity>
          )}

          {/* Guide toggle / Process */}
          {captureMode === 'photo' && (
            <TouchableOpacity
              style={styles.sideBtn}
              onPress={() => setShowGuide((v) => !v)}
            >
              <Ionicons name={showGuide ? 'compass' : 'compass-outline'} size={26} color={colors.white} />
            </TouchableOpacity>
          )}
          {captureMode === 'video' && (
            <View style={styles.sideBtn} />
          )}
        </View>

        {/* Elaborate button */}
        <TouchableOpacity
          style={[styles.elaboraBtn, !canProcess && styles.elaboraBtnDisabled]}
          onPress={handleProcess}
          disabled={!canProcess}
        >
          <Ionicons
            name="sparkles"
            size={18}
            color={canProcess ? colors.white : colors.textDisabled}
          />
          <Text style={[styles.elaboraBtnText, !canProcess && styles.elaboraBtnTextDisabled]}>
            {captureMode === 'photo'
              ? `Elabora${capturedPhotos.length > 0 ? ` (${capturedPhotos.length} foto)` : ''}`
              : videoUri
              ? 'Elabora video'
              : 'Registra per elaborare'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  permissionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  permissionSubtext: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  permissionBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  permissionLinkText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    padding: 8,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  timerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  timerText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  photoCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  photoCountText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  videoReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  videoReadyText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10,10,15,0.75)',
    gap: 16,
  },
  modeToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  modeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 17,
  },
  modeBtnActive: {
    backgroundColor: colors.white,
  },
  modeBtnLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modeBtnLabelActive: {
    color: colors.background,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sideBtn: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterBtnActive: {
    borderColor: colors.accentLight,
  },
  shutterBtnRecording: {
    borderColor: colors.error,
  },
  shutterBtnDisabled: {
    borderColor: colors.textDisabled,
    opacity: 0.45,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.white,
  },
  shutterInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.error,
  },
  elaboraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  elaboraBtnDisabled: {
    backgroundColor: colors.surface,
    shadowOpacity: 0,
    elevation: 0,
  },
  elaboraBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  elaboraBtnTextDisabled: {
    color: colors.textDisabled,
  },
});
