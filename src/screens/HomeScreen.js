import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import colors from '../theme/colors';
import { getAllProjects } from '../services/storage';
import { getModelThumbnail, formatDate, getFormatBadgeColor } from '../utils/modelUtils';
import { generateId } from '../utils/modelUtils';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_W - 48) / 2;

// ─── Logo Component ───────────────────────────────────────────────────────────

function WildfoxLogo() {
  return (
    <View style={styles.logoContainer}>
      <View style={styles.logoIconWrap}>
        <Ionicons name="cube" size={32} color={colors.accent} />
        <View style={styles.logoDot} />
      </View>
      <View>
        <Text style={styles.logoTitle}>WILDFOX</Text>
        <Text style={styles.logoSubtitle}>3D CAPTURE</Text>
      </View>
    </View>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onPress }) {
  const thumb = getModelThumbnail(project);
  const badgeColor = getFormatBadgeColor(project.format);

  return (
    <TouchableOpacity style={styles.projectCard} onPress={() => onPress(project)} activeOpacity={0.8}>
      <View style={styles.projectThumb}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.projectThumbImage} resizeMode="cover" />
        ) : (
          <View style={styles.projectThumbPlaceholder}>
            <Ionicons name="cube-outline" size={28} color={colors.accent} />
          </View>
        )}
        {/* Format badge */}
        <View style={[styles.formatBadge, { backgroundColor: badgeColor + '22', borderColor: badgeColor + '66' }]}>
          <Text style={[styles.formatBadgeText, { color: badgeColor }]}>
            {(project.format || 'GLTF').toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.projectInfo}>
        <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
        <Text style={styles.projectDate}>{formatDate(project.updatedAt || project.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [recentProjects, setRecentProjects] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
    }, []),
  );

  const loadRecent = async () => {
    try {
      const all = await getAllProjects();
      setRecentProjects(all.slice(0, 4));
    } catch {
      setRecentProjects([]);
    }
  };

  const handleNewCapture = () => {
    navigation.navigate('Capture');
  };

  const handleImportFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
        selectionLimit: 30,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUris = result.assets.map((a) => a.uri);
        navigation.navigate('Processing', {
          imageUris,
          projectName: `Importazione ${new Date().toLocaleDateString('it-IT')}`,
          source: 'gallery',
        });
      }
    } catch (err) {
      console.error('[HomeScreen] import error:', err);
    }
  };

  const handleOpenProject = (project) => {
    navigation.navigate('Viewer', { project });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <WildfoxLogo />
          <Text style={styles.tagline}>Cattura. Ricostruisci. Esplora in 3D.</Text>
        </View>

        {/* Main actions */}
        <View style={styles.mainActionsSection}>
          {/* New capture - primary */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleNewCapture}
            activeOpacity={0.85}
          >
            <View style={styles.primaryBtnIcon}>
              <Ionicons name="camera" size={28} color={colors.white} />
            </View>
            <View style={styles.primaryBtnText}>
              <Text style={styles.primaryBtnTitle}>Nuova Cattura</Text>
              <Text style={styles.primaryBtnSubtitle}>Foto o video con la fotocamera</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.accentLight} />
          </TouchableOpacity>

          {/* Import from gallery - secondary */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleImportFromGallery}
            activeOpacity={0.85}
          >
            <View style={styles.secondaryBtnIcon}>
              <Ionicons name="images" size={22} color={colors.accent} />
            </View>
            <View style={styles.secondaryBtnText}>
              <Text style={styles.secondaryBtnTitle}>Importa da Galleria</Text>
              <Text style={styles.secondaryBtnSubtitle}>Seleziona foto esistenti</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tips */}
        <View style={styles.tipsSection}>
          <View style={styles.tipCard}>
            <Ionicons name="bulb-outline" size={16} color={colors.warning} style={{ marginTop: 1 }} />
            <Text style={styles.tipText}>
              Per una ricostruzione ottimale, scatta almeno 20 foto dell'oggetto da angolazioni diverse con buona illuminazione.
            </Text>
          </View>
        </View>

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recenti</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
                <Text style={styles.sectionSeeAll}>Vedi tutti</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.projectGrid}>
              {recentProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onPress={handleOpenProject}
                />
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {recentProjects.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cube-outline" size={48} color={colors.accentMuted} />
            </View>
            <Text style={styles.emptyTitle}>Nessun progetto ancora</Text>
            <Text style={styles.emptySubtitle}>
              Inizia catturando un oggetto o una persona con la fotocamera.
            </Text>
          </View>
        )}

        {/* Feature highlights */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>Cosa puoi fare</Text>
          <View style={styles.featuresList}>
            {[
              { icon: 'camera', label: 'Cattura foto e video' },
              { icon: 'cube', label: 'Ricostruzione 3D automatica' },
              { icon: 'hand-right', label: 'Seleziona aree del modello' },
              { icon: 'document-text', label: 'Aggiungi note e annotazioni' },
              { icon: 'share-social', label: 'Esporta in 6 formati' },
            ].map((f) => (
              <View key={f.label} style={styles.featureItem}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={f.icon} size={16} color={colors.accent} />
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 8,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '44',
    position: 'relative',
  },
  logoDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentLight,
  },
  logoTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 3,
  },
  logoSubtitle: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 4,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  mainActionsSection: {
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentDark,
    borderRadius: 18,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    flex: 1,
  },
  primaryBtnTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  primaryBtnSubtitle: {
    color: colors.accentLight,
    fontSize: 12,
    marginTop: 2,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    flex: 1,
  },
  secondaryBtnTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtnSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  tipsSection: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warning + '12',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.warning + '33',
  },
  tipText: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  recentSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSeeAll: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  projectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  projectCard: {
    width: CARD_SIZE,
    backgroundColor: colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectThumb: {
    height: CARD_SIZE * 0.75,
    backgroundColor: colors.backgroundTertiary,
    position: 'relative',
  },
  projectThumbImage: {
    width: '100%',
    height: '100%',
  },
  projectThumbPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
  },
  formatBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  formatBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  projectInfo: {
    padding: 10,
    gap: 3,
  },
  projectName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  projectDate: {
    color: colors.textMuted,
    fontSize: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  featuresSection: {
    marginTop: 32,
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuresTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  featuresList: {
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
});
