#!/bin/bash
set -e

echo "=== Build APK Briscola ==="

# 1. Build React
echo "[1/4] Build React..."
npm run build

# 2. Sync Capacitor
echo "[2/4] Sync Capacitor..."
npx cap sync android

# 3. Build APK debug (non richiede firma)
echo "[3/4] Build APK..."
cd android
./gradlew assembleDebug

# 4. Copia APK nella cartella principale
cd ..
cp android/app/build/outputs/apk/debug/app-debug.apk ./Briscola.apk

echo ""
echo "=== FATTO! ==="
echo "APK pronto: briscola-app/Briscola.apk"
echo ""
echo "Per installare sul telefono:"
echo "  adb install Briscola.apk"
echo "  oppure copia il file sul telefono e aprilo"
