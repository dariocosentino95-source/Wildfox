import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PHOTOS = 6;

const DIRECTIONS = [
  { key: 'front',      label: 'Fronte',    icon: 'arrow-up',        angle: null },
  { key: 'back',       label: 'Retro',     icon: 'arrow-down',      angle: null },
  { key: 'left',       label: 'Sinistra',  icon: 'arrow-back',      angle: null },
  { key: 'right',      label: 'Destra',    icon: 'arrow-forward',   angle: null },
  { key: 'top',        label: 'Alto',      icon: 'arrow-up-circle', angle: null },
  { key: 'diagonal1',  label: '+45°',      icon: 'camera',          angle: null },
];

/**
 * Determine which directions have been covered based on photo count.
 * As more photos are taken, directions are progressively checked off.
 */
function getCoveredDirections(photoCount) {
  if (photoCount === 0) return new Set();
  const covered = new Set();
  // Each photo covers one direction in sequence
  DIRECTIONS.forEach((dir, idx) => {
    if (photoCount > idx) covered.add(dir.key);
  });
  return covered;
}

// ─── Circular progress ────────────────────────────────────────────────────────

function CircularProgress({ percent, size = 80, strokeWidth = 6 }) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: percent,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  // We draw the arc using a View-based approach (SVG not available without library)
  // Use a simpler numeric display
  return (
    <View style={[styles.circleContainer, { width: size, height: size }]}>
      <View style={[styles.circleOuter, { width: size, height: size, borderRadius: size / 2 }]}>
        {/* Background ring */}
        <View
          style={[
            styles.circleBackground,
            { width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth },
          ]}
        />
        {/* Percentage text */}
        <View style={styles.circleCenter}>
          <Text style={styles.circlePercent}>{Math.round(percent)}%</Text>
        </View>
        {/* Arc fill indicator using border segments */}
        <View
          style={[
            styles.circleArc,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: percent > 0 ? colors.accent : colors.transparent,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction, covered }) {
  return (
    <View style={[styles.dirBadge, covered && styles.dirBadgeCovered]}>
      <Ionicons
        name={covered ? 'checkmark-circle' : direction.icon}
        size={16}
        color={covered ? colors.success : colors.textMuted}
      />
      <Text style={[styles.dirLabel, covered && styles.dirLabelCovered]}>
        {direction.label}
      </Text>
    </View>
  );
}

// ─── CaptureGuide ─────────────────────────────────────────────────────────────

/**
 * Overlay showing capture progress with direction indicators.
 *
 * Props:
 *   photoCount   {number}   - Number of photos taken so far
 *   totalNeeded  {number}   - Minimum photos required (default 6)
 *   visible      {boolean}
 */
export default function CaptureGuide({ photoCount = 0, totalNeeded = MIN_PHOTOS, visible = true }) {
  if (!visible) return null;

  const percent = Math.min(100, Math.round((photoCount / totalNeeded) * 100));
  const covered = getCoveredDirections(photoCount);
  const remaining = Math.max(0, totalNeeded - photoCount);
  const isComplete = photoCount >= totalNeeded;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Top info bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Ionicons
            name={isComplete ? 'checkmark-circle' : 'camera'}
            size={16}
            color={isComplete ? colors.success : colors.accent}
          />
          <Text style={[styles.photoCount, isComplete && { color: colors.success }]}>
            {photoCount} foto
          </Text>
        </View>

        {isComplete ? (
          <View style={styles.readyBadge}>
            <Ionicons name="checkmark-circle-outline" size={13} color={colors.success} />
            <Text style={styles.readyText}>Pronto per elaborare</Text>
          </View>
        ) : (
          <Text style={styles.remainingText}>
            Ancora {remaining} {remaining === 1 ? 'scatto' : 'scatti'}
          </Text>
        )}
      </View>

      {/* Progress + directions */}
      <View style={styles.body}>
        {/* Circular progress */}
        <View style={styles.progressWrap}>
          <CircularProgress percent={percent} size={72} strokeWidth={5} />
        </View>

        {/* Direction grid */}
        <View style={styles.directionsGrid}>
          {DIRECTIONS.map((dir) => (
            <DirectionBadge
              key={dir.key}
              direction={dir}
              covered={covered.has(dir.key)}
            />
          ))}
        </View>
      </View>

      {/* Hint */}
      {!isComplete && (
        <View style={styles.hintBar}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
          <Text style={styles.hintText}>
            Fotografa l'oggetto da angolazioni diverse per una migliore ricostruzione
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 80,
    left: 12,
    right: 12,
    gap: 6,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoCount: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  remainingText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  readyText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderRadius: 14,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  progressWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleBackground: {
    position: 'absolute',
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  circleArc: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  circleCenter: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePercent: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  directionsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dirBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dirBadgeCovered: {
    backgroundColor: colors.success + '18',
    borderColor: colors.success + '55',
  },
  dirLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  dirLabelCovered: {
    color: colors.success,
    fontWeight: '600',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    backgroundColor: colors.overlay,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  hintText: {
    color: colors.textMuted,
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
});
