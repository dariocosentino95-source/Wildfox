import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

// Cattura gli errori JS e mostra una schermata leggibile invece di
// chiudere l'app di colpo (nei build release un errore non gestito
// termina il processo senza alcun messaggio).
class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <ScrollView contentContainerStyle={styles.errorContent}>
            <Text style={styles.errorTitle}>Si è verificato un errore</Text>
            <Text style={styles.errorMessage}>
              {String(this.state.error?.message || this.state.error)}
            </Text>
            <TouchableOpacity
              style={styles.errorBtn}
              onPress={() => this.setState({ error: null })}
            >
              <Text style={styles.errorBtnText}>Riprova</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar style="light" backgroundColor="#0A0A0F" />
            <AppNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  errorRoot: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  errorContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#B8B8CC',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
  },
  errorBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
