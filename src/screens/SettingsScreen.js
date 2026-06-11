import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { getSettings, saveSettings, clearAllData } from '../services/storage';
import { setApiEndpoint } from '../services/photogrammetry';

// ─── SettingRow ───────────────────────────────────────────────────────────────

function SettingRow({ icon, label, description, children }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingRowLeft}>
        <View style={styles.settingIconWrap}>
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingTextWrap}>
          <Text style={styles.settingLabel}>{label}</Text>
          {description ? <Text style={styles.settingDescription}>{description}</Text> : null}
        </View>
      </View>
      <View style={styles.settingRowRight}>{children}</View>
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState({
    apiEndpoint: 'https://api.wildfox3d.example.com/reconstruct',
    defaultExportFormat: 'gltf',
    captureQuality: 'high',
    autoSave: true,
    language: 'it',
  });
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await getSettings();
    setSettings(s);
    setEndpointDraft(s.apiEndpoint || '');
  };

  const handleToggleAutoSave = async (val) => {
    const updated = { ...settings, autoSave: val };
    setSettings(updated);
    await saveSettings({ autoSave: val });
  };

  const handleSaveEndpoint = async () => {
    const url = endpointDraft.trim();
    if (!url.startsWith('http')) {
      Alert.alert('URL non valido', 'L\'endpoint deve iniziare con http:// o https://');
      return;
    }
    setIsSaving(true);
    try {
      setApiEndpoint(url);
      await saveSettings({ apiEndpoint: url });
      setSettings((s) => ({ ...s, apiEndpoint: url }));
      setEditingEndpoint(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetQuality = async (quality) => {
    const updated = { ...settings, captureQuality: quality };
    setSettings(updated);
    await saveSettings({ captureQuality: quality });
  };

  const handleSetExportFormat = async (format) => {
    const updated = { ...settings, defaultExportFormat: format };
    setSettings(updated);
    await saveSettings({ defaultExportFormat: format });
  };

  const handleClearData = () => {
    Alert.alert(
      'Cancella tutti i dati',
      'Questa azione eliminerà tutti i tuoi progetti e impostazioni. Non può essere annullata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina tutto',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            await loadSettings();
            Alert.alert('Dati eliminati', 'Tutti i dati dell\'app sono stati cancellati.');
          },
        },
      ],
    );
  };

  const qualities = [
    { key: 'low', label: 'Bassa' },
    { key: 'medium', label: 'Media' },
    { key: 'high', label: 'Alta' },
  ];

  const formats = ['gltf', 'glb', 'obj', 'stl', 'fbx', 'ply'];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Impostazioni</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* App info */}
        <View style={styles.appInfoCard}>
          <View style={styles.appInfoIcon}>
            <Ionicons name="cube" size={28} color={colors.accent} />
          </View>
          <View>
            <Text style={styles.appInfoName}>Wildfox 3D</Text>
            <Text style={styles.appInfoVersion}>Versione 1.0.0</Text>
          </View>
        </View>

        {/* Capture settings */}
        <SectionHeader title="Cattura" />
        <View style={styles.card}>
          <SettingRow icon="star" label="Qualità cattura" description="Imposta la qualità delle immagini">
            <View style={styles.segmentedControl}>
              {qualities.map((q) => (
                <TouchableOpacity
                  key={q.key}
                  style={[
                    styles.segmentBtn,
                    settings.captureQuality === q.key && styles.segmentBtnActive,
                  ]}
                  onPress={() => handleSetQuality(q.key)}
                >
                  <Text
                    style={[
                      styles.segmentBtnLabel,
                      settings.captureQuality === q.key && styles.segmentBtnLabelActive,
                    ]}
                  >
                    {q.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingRow>

          <View style={styles.rowDivider} />

          <SettingRow icon="save" label="Salvataggio automatico" description="Salva automaticamente i progetti completati">
            <Switch
              value={settings.autoSave}
              onValueChange={handleToggleAutoSave}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.white}
              ios_backgroundColor={colors.border}
            />
          </SettingRow>
        </View>

        {/* Export settings */}
        <SectionHeader title="Esportazione" />
        <View style={styles.card}>
          <Text style={styles.inCardLabel}>Formato predefinito:</Text>
          <View style={styles.formatsGrid}>
            {formats.map((fmt) => (
              <TouchableOpacity
                key={fmt}
                style={[
                  styles.formatChip,
                  settings.defaultExportFormat === fmt && styles.formatChipActive,
                ]}
                onPress={() => handleSetExportFormat(fmt)}
              >
                <Text
                  style={[
                    styles.formatChipLabel,
                    settings.defaultExportFormat === fmt && styles.formatChipLabelActive,
                  ]}
                >
                  {fmt.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* API settings */}
        <SectionHeader title="API & Ricostruzione" />
        <View style={styles.card}>
          <SettingRow icon="server" label="Endpoint API" description="URL del server di ricostruzione">
            <TouchableOpacity
              onPress={() => {
                setEndpointDraft(settings.apiEndpoint);
                setEditingEndpoint(true);
              }}
            >
              <Ionicons name="pencil" size={18} color={colors.accent} />
            </TouchableOpacity>
          </SettingRow>

          {!editingEndpoint ? (
            <Text style={styles.endpointDisplay} numberOfLines={2}>
              {settings.apiEndpoint}
            </Text>
          ) : (
            <View style={styles.endpointEditRow}>
              <TextInput
                style={styles.endpointInput}
                value={endpointDraft}
                onChangeText={setEndpointDraft}
                placeholder="https://api.example.com/reconstruct"
                placeholderTextColor={colors.textDisabled}
                autoCapitalize="none"
                keyboardType="url"
                autoCorrect={false}
              />
              <View style={styles.endpointActions}>
                <TouchableOpacity
                  style={styles.endpointCancelBtn}
                  onPress={() => setEditingEndpoint(false)}
                >
                  <Text style={styles.endpointCancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.endpointSaveBtn}
                  onPress={handleSaveEndpoint}
                  disabled={isSaving}
                >
                  <Text style={styles.endpointSaveText}>
                    {isSaving ? 'Salvo...' : 'Salva'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.rowDivider} />

          <View style={styles.apiNote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.apiNoteText}>
              In modalità offline, viene usata la ricostruzione simulata con modello di prova.
            </Text>
          </View>
        </View>

        {/* Data management */}
        <SectionHeader title="Gestione dati" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.dangerRow} onPress={handleClearData}>
            <View style={styles.dangerRowLeft}>
              <View style={styles.dangerIconWrap}>
                <Ionicons name="trash" size={18} color={colors.error} />
              </View>
              <View>
                <Text style={styles.dangerLabel}>Cancella tutti i dati</Text>
                <Text style={styles.dangerDescription}>Elimina progetti, note e impostazioni</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>

        {/* About */}
        <SectionHeader title="Informazioni" />
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Versione app</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Piattaforma</Text>
            <Text style={styles.aboutValue}>Expo / React Native</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Rendering 3D</Text>
            <Text style={styles.aboutValue}>Three.js r128</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Lingua</Text>
            <Text style={styles.aboutValue}>Italiano</Text>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  appInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 8,
  },
  appInfoIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appInfoName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  appInfoVersion: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  settingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextWrap: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  settingDescription: {
    color: colors.textMuted,
    fontSize: 11,
  },
  settingRowRight: {
    alignItems: 'flex-end',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.accent,
  },
  segmentBtnLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  segmentBtnLabelActive: {
    color: colors.white,
  },
  inCardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  formatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  formatChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formatChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  formatChipLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  formatChipLabelActive: {
    color: colors.accentLight,
  },
  endpointDisplay: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  endpointEditRow: {
    gap: 8,
  },
  endpointInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  endpointActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  endpointCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  endpointCancelText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  endpointSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  endpointSaveText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  apiNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 2,
  },
  apiNoteText: {
    color: colors.textMuted,
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  dangerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  dangerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.error + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerLabel: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  dangerDescription: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  aboutLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  aboutValue: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
