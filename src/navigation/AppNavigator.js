import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// ─── Screens ──────────────────────────────────────────────────────────────────

import HomeScreen from '../screens/HomeScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CaptureScreen from '../screens/CaptureScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import ViewerScreen from '../screens/ViewerScreen';

// ─── Navigator instances ──────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Tab bar icon helper ──────────────────────────────────────────────────────

function TabIcon({ name, focused, color, size }) {
  return (
    <View style={tabStyles.iconWrap}>
      <Ionicons
        name={focused ? name : `${name}-outline`}
        size={size}
        color={color}
      />
      {focused && <View style={[tabStyles.activeDot, { backgroundColor: color }]} />}
    </View>
  );
}

// ─── Bottom tab navigator ─────────────────────────────────────────────────────

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 4,
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="home" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarLabel: 'Progetti',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="folder" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Impostazioni',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="settings" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root stack navigator ─────────────────────────────────────────────────────

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      {/* Main tab navigator */}
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ animation: 'none' }}
      />

      {/* Camera capture */}
      <Stack.Screen
        name="Capture"
        component={CaptureScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: '#000' },
        }}
      />

      {/* Processing/reconstruction */}
      <Stack.Screen
        name="Processing"
        component={ProcessingScreen}
        options={{
          presentation: 'card',
          gestureEnabled: false,
          animation: 'fade',
        }}
      />

      {/* 3D Viewer */}
      <Stack.Screen
        name="Viewer"
        component={ViewerScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
    </Stack.Navigator>
  );
}

// ─── Local tab styles ─────────────────────────────────────────────────────────

const tabStyles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    gap: 3,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
