import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Modal,
  ActionSheetIOS,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import colors from '../theme/colors';
import {
  getAllProjects,
  deleteProject,
  renameProject,
} from '../services/storage';
import { exportAs } from '../services/modelExporter';
import {
  getModelThumbnail,
  formatDate,
  formatFileSize,
  getFormatBadgeColor,
  formatModelStats,
} from '../utils/modelUtils';

// ─── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onPress, onLongPress }) {
  const thumb = getModelThumbnail(project);
  const badgeColor = getFormatBadgeColor(project.format);
  const stats = formatModelStats(project.stats);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(project)}
      onLongPress={() => onLongPress(project)}
      activeOpacity={0.8}
      delayLongPress={400}
    >
      {/* Thumbnail */}
      <View style={styles.cardThumb}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.cardThumbImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardThumbPlaceholder}>
            <Ionicons name="cube-outline" size={32} color={colors.accentMuted} />
          </View>
        )}
        {/* Format badge */}
        <View style={[styles.formatBadge, { backgroundColor: badgeColor + '22', borderColor: badgeColor + '66' }]}>
          <Text style={[styles.formatBadgeText, { color: badgeColor }]}>
            {(project.format || 'GLTF').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>{project.name}</Text>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </View>

        <Text style={styles.cardDate}>{formatDate(project.updatedAt || project.createdAt)}</Text>

        {stats ? (
          <Text style={styles.cardStats} numberOfLines={1}>{stats}</Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.cardFooterItem}>
            <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cardFooterText}>
              {(project.notes?.length || 0)} note
            </Text>
          </View>
          {project.capturedImages?.length > 0 && (
            <View style={styles.cardFooterItem}>
              <Ionicons name="images-outline" size={12} color={colors.textMuted} />
              <Text style={styles.cardFooterText}>
                {project.capturedImages.length} foto
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ isFiltered }) {
  const navigation = useNavigation();
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={isFiltered ? 'search-outline' : 'cube-outline'}
          size={52}
          color={colors.textDisabled}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {isFiltered ? 'Nessun risultato' : 'Nessun progetto'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isFiltered
          ? 'Prova a modificare la ricerca'
          : 'Crea il tuo primo modello 3D catturando un oggetto.'}
      </Text>
      {!isFiltered && (
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => navigation.navigate('Capture')}
        >
          <Ionicons name="camera" size={16} color={colors.white} />
          <Text style={styles.emptyBtnText}>Nuova Cattura</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── ProjectsScreen ───────────────────────────────────────────────────────────

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [renameModal, setRenameModal] = useState({ visible: false, project: null, value: '' });

  const searchRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, []),
  );

  const loadProjects = async () => {
    try {
      const all = await getAllProjects();
      setProjects(all);
    } catch {
      setProjects([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  };

  const filteredProjects = projects.filter((p) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()),
  );

  const handleOpen = (project) => {
    navigation.navigate('Viewer', { project });
  };

  const handleLongPress = (project) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annulla', 'Apri', 'Rinomina', 'Esporta', 'Condividi', 'Elimina'],
          destructiveButtonIndex: 5,
          cancelButtonIndex: 0,
          title: project.name,
        },
        (idx) => {
          if (idx === 1) handleOpen(project);
          if (idx === 2) handleRename(project);
          if (idx === 3) handleExport(project);
          if (idx === 4) handleShare(project);
          if (idx === 5) handleDelete(project);
        },
      );
    } else {
      // Android - use Alert with buttons
      Alert.alert(
        project.name,
        'Seleziona un\'azione:',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Apri', onPress: () => handleOpen(project) },
          { text: 'Rinomina', onPress: () => handleRename(project) },
          { text: 'Esporta', onPress: () => handleExport(project) },
          { text: 'Condividi', onPress: () => handleShare(project) },
          { text: 'Elimina', style: 'destructive', onPress: () => handleDelete(project) },
        ],
      );
    }
  };

  const handleDelete = (project) => {
    Alert.alert(
      'Elimina progetto',
      `Sei sicuro di voler eliminare "${project.name}"? Questa azione non può essere annullata.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            await deleteProject(project.id);
            await loadProjects();
          },
        },
      ],
    );
  };

  const handleRename = (project) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rinomina progetto',
        'Inserisci il nuovo nome:',
        async (newName) => {
          if (newName && newName.trim()) {
            await renameProject(project.id, newName.trim());
            await loadProjects();
          }
        },
        'plain-text',
        project.name,
      );
    } else {
      setRenameModal({ visible: true, project, value: project.name });
    }
  };

  const commitRename = async () => {
    const { project, value } = renameModal;
    setRenameModal({ visible: false, project: null, value: '' });
    if (value.trim() && project) {
      await renameProject(project.id, value.trim());
      await loadProjects();
    }
  };

  const handleExport = async (project) => {
    try {
      const result = await exportAs(project.modelUri, project.format || 'gltf');
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: result.mimeType,
          dialogTitle: `Esporta ${project.name}`,
        });
      }
    } catch (err) {
      Alert.alert('Errore esportazione', err.message || 'Impossibile esportare il modello.');
    }
  };

  const handleShare = async (project) => {
    if (!project.modelUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(project.modelUri, {
          mimeType: 'model/gltf+json',
          dialogTitle: `Condividi ${project.name}`,
        });
      }
    } catch (err) {
      Alert.alert('Errore', 'Impossibile condividere il modello.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Progetti</Text>
        <Text style={styles.headerCount}>
          {projects.length} {projects.length === 1 ? 'modello' : 'modelli'}
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca progetti..."
            placeholderTextColor={colors.textDisabled}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('Capture')}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredProjects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProjectCard
            project={item}
            onPress={handleOpen}
            onLongPress={handleLongPress}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          filteredProjects.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={<EmptyState isFiltered={search.length > 0} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Rename modal (Android) */}
      <Modal
        visible={renameModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModal({ visible: false, project: null, value: '' })}
      >
        <View style={styles.renameOverlay}>
          <View style={styles.renameDialog}>
            <Text style={styles.renameTitle}>Rinomina progetto</Text>
            <TextInput
              style={styles.renameInput}
              value={renameModal.value}
              onChangeText={(v) => setRenameModal((s) => ({ ...s, value: v }))}
              placeholder="Nome progetto"
              placeholderTextColor={colors.textDisabled}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={() => setRenameModal({ visible: false, project: null, value: '' })}
              >
                <Text style={styles.renameCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSaveBtn} onPress={commitRename}>
                <Text style={styles.renameSaveText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  headerCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  newBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 0,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardThumb: {
    width: 90,
    height: 90,
    backgroundColor: colors.backgroundTertiary,
    position: 'relative',
    flexShrink: 0,
  },
  cardThumbImage: {
    width: '100%',
    height: '100%',
  },
  cardThumbPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  formatBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardInfo: {
    flex: 1,
    padding: 12,
    gap: 3,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  cardDate: {
    color: colors.textMuted,
    fontSize: 11,
  },
  cardStats: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  cardFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardFooterText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
    paddingTop: 60,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  renameDialog: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  renameTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  renameInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  renameCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  renameCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  renameSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  renameSaveText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
