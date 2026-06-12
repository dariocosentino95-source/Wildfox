import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// ─── Mode button ──────────────────────────────────────────────────────────────

function ModeButton({ iconName, label, active, onPress, activeColor }) {
  const color = active ? (activeColor || colors.accent) : colors.textMuted;
  const bg = active ? `${activeColor || colors.accent}22` : colors.surfaceElevated;
  const border = active ? (activeColor || colors.accent) : colors.border;

  return (
    <TouchableOpacity
      style={[styles.modeBtn, { backgroundColor: bg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={iconName} size={20} color={color} />
      <Text style={[styles.modeBtnLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── AreaSelector ─────────────────────────────────────────────────────────────

/**
 * Floating toolbar overlay for switching between viewer modes.
 *
 * Props:
 *   mode             {'view'|'select'|'annotate'}
 *   onModeChange     (mode: string) => void
 *   selectedArea     {point, faceIndex, meshName} | null
 *   onClearSelection () => void
 */
export default function AreaSelector({
  mode,
  onModeChange,
  selectedArea,
  onClearSelection,
}) {
  const hasSelection = mode === 'select' && selectedArea != null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Mode toolbar */}
      <View style={styles.toolbar}>
        <ModeButton
          iconName="eye-outline"
          label="Vista"
          active={mode === 'view'}
          onPress={() => onModeChange('view')}
          activeColor={colors.accent}
        />
        <View style={styles.toolbarDivider} />
        <ModeButton
          iconName="hand-right-outline"
          label="Seleziona"
          active={mode === 'select'}
          onPress={() => onModeChange('select')}
          activeColor={colors.warning}
        />
        <View style={styles.toolbarDivider} />
        <ModeButton
          iconName="pin-outline"
          label="Annota"
          active={mode === 'annotate'}
          onPress={() => onModeChange('annotate')}
          activeColor={colors.error}
        />
      </View>

      {/* Mode hint */}
      {mode !== 'view' && (
        <View style={styles.hintContainer}>
          <Ionicons
            name={mode === 'select' ? 'information-circle-outline' : 'pin-outline'}
            size={13}
            color={mode === 'select' ? colors.warning : colors.error}
            style={styles.hintIcon}
          />
          <Text style={[
            styles.hintText,
            { color: mode === 'select' ? colors.warning : colors.error }
          ]}>
            {mode === 'select'
              ? 'Tocca un\'area del modello per selezionarla'
              : 'Tocca il modello per aggiungere un\'annotazione'}
          </Text>
        </View>
      )}

      {/* Selection info panel */}
      {hasSelection && (
        <View style={styles.selectionPanel}>
          <View style={styles.selectionHeader}>
            <View style={styles.selectionIconWrap}>
              <Ionicons name="layers-outline" size={16} color={colors.warning} />
            </View>
            <View style={styles.selectionInfo}>
              <Text style={styles.selectionTitle}>Area Selezionata</Text>
              <Text style={styles.selectionMeshName} numberOfLines={1}>
                {selectedArea.meshName || 'Mesh'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={onClearSelection}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {selectedArea.point && (
            <View style={styles.pointRow}>
              <Text style={styles.pointLabel}>Posizione:</Text>
              <Text style={styles.pointValue}>
                {`X: ${selectedArea.point.x.toFixed(3)}  Y: ${selectedArea.point.y.toFixed(3)}  Z: ${selectedArea.point.z.toFixed(3)}`}
              </Text>
            </View>
          )}

          {selectedArea.faceIndex !== undefined && (
            <View style={styles.pointRow}>
              <Text style={styles.pointLabel}>Faccia #:</Text>
              <Text style={styles.pointValue}>{selectedArea.faceIndex}</Text>
            </View>
          )}

          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={onClearSelection}>
              <Ionicons name="close-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.actionBtnLabel}>Deseleziona</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  modeBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 6,
  },
  hintIcon: {},
  hintText: {
    fontSize: 12,
    flex: 1,
  },
  selectionPanel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.warning + '55',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  selectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.warning + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionInfo: {
    flex: 1,
  },
  selectionTitle: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectionMeshName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 1,
  },
  clearBtn: {
    padding: 2,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  pointLabel: {
    color: colors.textMuted,
    fontSize: 11,
    width: 70,
  },
  pointValue: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  selectionActions: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
