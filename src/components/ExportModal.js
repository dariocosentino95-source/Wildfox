import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// ─── Format definitions ───────────────────────────────────────────────────────

const FORMATS = [
  {
    key: 'obj',
    label: 'OBJ',
    icon: 'cube-outline',
    color: '#3B82F6',
    description: 'Wavefront Object',
    detail: 'Compatibile con Blender, Maya, 3ds Max e la maggior parte dei software 3D.',
  },
  {
    key: 'stl',
    label: 'STL',
    icon: 'print-outline',
    color: '#F59E0B',
    description: 'Stereolithography',
    detail: 'Standard per la stampa 3D. Ideale per stampanti FDM e SLA.',
  },
  {
    key: 'fbx',
    label: 'FBX',
    icon: 'film-outline',
    color: '#8B5CF6',
    description: 'Filmbox (Autodesk)',
    detail: 'Standard per animazione, giochi e motori come Unity e Unreal Engine.',
  },
  {
    key: 'gltf',
    label: 'GLTF',
    icon: 'globe-outline',
    color: '#10B981',
    description: 'GL Transmission Format',
    detail: 'Standard aperto per il web 3D. Supportato da Three.js, Babylon.js e WebGL.',
  },
  {
    key: 'glb',
    label: 'GLB',
    icon: 'cloud-download-outline',
    color: '#059669',
    description: 'GLTF Binary',
    detail: 'Versione binaria compatta del GLTF. File singolo ottimizzato per il trasferimento.',
  },
  {
    key: 'ply',
    label: 'PLY',
    icon: 'analytics-outline',
    color: '#EF4444',
    description: 'Polygon File Format',
    detail: 'Ideale per nuvole di punti colorati e mesh con attributi personalizzati.',
  },
];

// ─── FormatCard ───────────────────────────────────────────────────────────────

function FormatCard({ format, onSelect, disabled, selected }) {
  return (
    <TouchableOpacity
      style={[
        styles.formatCard,
        selected && { borderColor: format.color, backgroundColor: format.color + '18' },
        disabled && styles.formatCardDisabled,
      ]}
      onPress={() => onSelect(format.key)}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.formatIconWrap, { backgroundColor: format.color + '22' }]}>
        <Ionicons name={format.icon} size={22} color={format.color} />
      </View>
      <View style={styles.formatInfo}>
        <View style={styles.formatLabelRow}>
          <Text style={[styles.formatLabel, { color: format.color }]}>{format.label}</Text>
          <Text style={styles.formatDescription}>{format.description}</Text>
        </View>
        <Text style={styles.formatDetail}>{format.detail}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={styles.formatChevron}
      />
    </TouchableOpacity>
  );
}

// ─── ExportModal ─────────────────────────────────────────────────────────────

/**
 * Modal for selecting export format and triggering export.
 *
 * Props:
 *   visible    {boolean}
 *   onExport   (format: string) => void | Promise<void>
 *   onClose    () => void
 *   modelName  {string}
 */
export default function ExportModal({ visible, onExport, onClose, modelName }) {
  const [exporting, setExporting] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [exportResult, setExportResult] = useState(null); // {success, format, uri}

  const handleSelectFormat = async (formatKey) => {
    if (exporting) return;
    setSelectedFormat(formatKey);
    setExporting(true);
    setExportResult(null);

    try {
      await onExport(formatKey);
      setExportResult({ success: true, format: formatKey });
    } catch (err) {
      setExportResult({ success: false, format: formatKey, error: err.message });
    } finally {
      setExporting(false);
    }
  };

  const handleClose = () => {
    if (exporting) return;
    setSelectedFormat(null);
    setExportResult(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="share-social" size={20} color={colors.accent} />
              <View>
                <Text style={styles.headerTitle}>Esporta Modello</Text>
                {modelName && (
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {modelName}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              disabled={exporting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Seleziona formato:</Text>

          {/* Export result banner */}
          {exportResult && (
            <View
              style={[
                styles.resultBanner,
                exportResult.success ? styles.resultSuccess : styles.resultError,
              ]}
            >
              <Ionicons
                name={exportResult.success ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={exportResult.success ? colors.success : colors.error}
              />
              <Text
                style={[
                  styles.resultText,
                  { color: exportResult.success ? colors.success : colors.error },
                ]}
              >
                {exportResult.success
                  ? `Esportato come ${exportResult.format.toUpperCase()} con successo!`
                  : `Errore: ${exportResult.error || 'Esportazione fallita'}`}
              </Text>
            </View>
          )}

          {/* Loading overlay */}
          {exporting && (
            <View style={styles.exportingOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.exportingText}>
                Esportazione {selectedFormat?.toUpperCase()}...
              </Text>
              <Text style={styles.exportingSubtext}>
                Generazione file in corso, attendere...
              </Text>
            </View>
          )}

          {/* Format list */}
          <ScrollView
            style={styles.formatList}
            contentContainerStyle={styles.formatListContent}
            showsVerticalScrollIndicator={false}
          >
            {FORMATS.map((fmt) => (
              <FormatCard
                key={fmt.key}
                format={fmt}
                onSelect={handleSelectFormat}
                disabled={exporting}
                selected={selectedFormat === fmt.key && exportResult?.success}
              />
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerNote}>
              <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
              {' I file vengono salvati nella cartella cache del dispositivo.'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultSuccess: {
    backgroundColor: colors.success + '18',
    borderColor: colors.success + '55',
  },
  resultError: {
    backgroundColor: colors.error + '18',
    borderColor: colors.error + '55',
  },
  resultText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  exportingOverlay: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  exportingText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  exportingSubtext: {
    color: colors.textMuted,
    fontSize: 12,
  },
  formatList: {
    flexShrink: 1,
  },
  formatListContent: {
    padding: 12,
    gap: 8,
  },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  formatCardDisabled: {
    opacity: 0.5,
  },
  formatIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatInfo: {
    flex: 1,
    gap: 2,
  },
  formatLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formatLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  formatDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  formatDetail: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  formatChevron: {
    marginLeft: 4,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  footerNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
