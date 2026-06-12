import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_H * 0.6;

// ─── NoteItem ─────────────────────────────────────────────────────────────────

function NoteItem({ note, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeletePress = () => {
    if (confirmDelete) {
      onDelete(note.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  };

  const formattedDate = (() => {
    try {
      const d = new Date(note.createdAt);
      return d.toLocaleString('it-IT', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  return (
    <View style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <View style={styles.noteTimestampRow}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={styles.noteTimestamp}>{formattedDate}</Text>
        </View>
        {note.areaRef && (
          <View style={styles.noteAreaBadge}>
            <Ionicons name="layers-outline" size={10} color={colors.warning} />
            <Text style={styles.noteAreaText} numberOfLines={1}>
              {note.areaRef.meshName || 'Area'}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.noteText}>{note.text}</Text>

      {note.areaRef && note.areaRef.point && (
        <Text style={styles.notePointText}>
          {`X: ${note.areaRef.point.x?.toFixed(2)}  Y: ${note.areaRef.point.y?.toFixed(2)}  Z: ${note.areaRef.point.z?.toFixed(2)}`}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.deleteBtn, confirmDelete && styles.deleteBtnConfirm]}
        onPress={handleDeletePress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={confirmDelete ? 'trash' : 'trash-outline'}
          size={14}
          color={confirmDelete ? colors.error : colors.textMuted}
        />
        {confirmDelete && (
          <Text style={styles.deleteBtnConfirmText}>Conferma</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── NotesPanel ───────────────────────────────────────────────────────────────

/**
 * Slide-up panel displaying and managing notes for a 3D model.
 *
 * Props:
 *   visible        {boolean}
 *   notes          {Array}   - [{id, text, areaRef, createdAt}]
 *   onAddNote      (text: string) => void
 *   onDeleteNote   (id: string) => void
 *   onClose        () => void
 *   selectedArea   {object|null} - currently selected area to attach note to
 */
export default function NotesPanel({
  visible,
  notes = [],
  onAddNote,
  onDeleteNote,
  onClose,
  selectedArea = null,
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;
  const [inputText, setInputText] = useState('');
  const [attaching, setAttaching] = useState(false);
  const inputRef = useRef(null);

  // Animate panel in/out
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: PANEL_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setInputText('');
      Keyboard.dismiss();
    }
  }, [visible, translateY]);

  const handleAdd = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setInputText('');
    Keyboard.dismiss();
  }, [inputText, onAddNote]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  if (!visible && translateY._value === PANEL_HEIGHT) return null;

  return (
    <>
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Panel */}
      <Animated.View
        style={[
          styles.panel,
          { paddingBottom: insets.bottom + 8, transform: [{ translateY }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="document-text" size={18} color={colors.accent} />
            <Text style={styles.headerTitle}>Note</Text>
            {notes.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{notes.length}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Area attachment toggle */}
        {selectedArea && (
          <TouchableOpacity
            style={[styles.attachRow, attaching && styles.attachRowActive]}
            onPress={() => setAttaching((v) => !v)}
          >
            <Ionicons
              name={attaching ? 'checkbox' : 'square-outline'}
              size={16}
              color={attaching ? colors.warning : colors.textMuted}
            />
            <Text style={[styles.attachLabel, attaching && { color: colors.warning }]}>
              Allega all'area selezionata ({selectedArea.meshName || 'Mesh'})
            </Text>
          </TouchableOpacity>
        )}

        {/* Notes list */}
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NoteItem note={item} onDelete={onDeleteNote} />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={40} color={colors.textDisabled} />
              <Text style={styles.emptyTitle}>Nessuna nota</Text>
              <Text style={styles.emptySubtitle}>
                Aggiungi note per documentare osservazioni sul modello 3D.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        {/* Input area */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Scrivi una nota..."
              placeholderTextColor={colors.textDisabled}
              multiline
              maxLength={500}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                inputText.trim() ? styles.sendBtnActive : styles.sendBtnDisabled,
              ]}
              onPress={handleAdd}
              disabled={!inputText.trim()}
            >
              <Ionicons
                name="send"
                size={18}
                color={inputText.trim() ? colors.white : colors.textDisabled}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    zIndex: 10,
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    zIndex: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
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
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: colors.accentMuted,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
  },
  countBadgeText: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '700',
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachRowActive: {
    borderColor: colors.warning + '88',
    backgroundColor: colors.warning + '11',
  },
  attachLabel: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 8,
    paddingBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  noteCard: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  noteTimestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteTimestamp: {
    color: colors.textMuted,
    fontSize: 11,
  },
  noteAreaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warning + '22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  noteAreaText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 100,
  },
  noteText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  notePointText: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    padding: 4,
    borderRadius: 6,
  },
  deleteBtnConfirm: {
    backgroundColor: colors.error + '22',
    paddingHorizontal: 8,
  },
  deleteBtnConfirmText: {
    color: colors.error,
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendBtnActive: {
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: {
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
