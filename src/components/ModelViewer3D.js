import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import colors from '../theme/colors';
import viewerHtml from '../assets/viewerHtml';

// The viewer HTML (with Three.js inlined) is embedded as a JS string and
// loaded via source={{ html }}. Loading it as a bundled asset/URL is
// unreliable in Android release builds (resolveAssetSource can produce an
// http:// dev-server URL → net::ERR_CLEARTEXT_NOT_PERMITTED).
// The baseUrl is a dummy https origin: nothing is ever fetched from it,
// it just gives the document a secure origin so blob: URLs work.
const viewerHtmlSource = { html: viewerHtml, baseUrl: 'https://wildfox3d.local/' };

// ─── ModelViewer3D ─────────────────────────────────────────────────────────────

/**
 * A full-screen 3D model viewer backed by a Three.js WebView.
 *
 * Props:
 *   modelUri      {string}   - Local file URI of the model to load
 *   format        {string}   - 'gltf'|'glb'|'obj'|'stl'|'fbx'|'ply'
 *   mode          {string}   - 'view'|'select'|'annotate'
 *   onAreaSelected  {func}   - ({point, faceIndex, meshName}) => void
 *   onAnnotationPlaced {func} - ({id, point, meshName}) => void
 *   onViewerReady  {func}    - () => void
 *   onModelLoaded  {func}    - ({format}) => void
 *   onError        {func}    - ({message}) => void
 *   style         {object}   - Additional style for the container
 *
 * Ref methods (via useImperativeHandle):
 *   loadModel(uri, format)
 *   setMode(mode)
 *   clearSelection()
 *   getAnnotations() -> Promise<annotation[]>
 *   addAnnotation(point, text)
 *   removeAnnotation(id)
 *   setModelProperty(property, value)
 *   resetCamera()
 */
const ModelViewer3D = forwardRef(function ModelViewer3D(props, ref) {
  const {
    modelUri,
    format = 'gltf',
    mode = 'view',
    onAreaSelected,
    onAnnotationPlaced,
    onViewerReady,
    onModelLoaded,
    onMeshData,
    onError,
    style,
  } = props;

  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const pendingAnnotationResolvers = useRef({});
  const annotationResponseCounter = useRef(0);

  // ── Send a command to the WebView ─────────────────────────────────────────
  const sendCommand = useCallback((command) => {
    if (!webViewRef.current) return;
    const js = `
      (function() {
        try {
          var msg = ${JSON.stringify(JSON.stringify(command))};
          if (window.wildfoxReceiveMessage) {
            window.wildfoxReceiveMessage(msg);
          } else {
            window.dispatchEvent(new MessageEvent('message', { data: msg }));
          }
        } catch(e) {}
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(js);
  }, []);

  // ── Load a model, reading file content for local file:// URIs ─────────────
  // Android WebView cannot fetch file:// URIs via XHR from non-file origins,
  // so we read the file in React Native and pass content directly.
  // STL/GLB possono essere binari: vanno letti come base64 per non corrompere i byte.
  const sendLoadModel = useCallback((uri, fmt) => {
    if (!uri) return;
    const fmtLower = (fmt || format).toLowerCase();
    const isLocal = uri.startsWith('file://') || uri.startsWith('/');
    const isBinary = fmtLower === 'stl' || fmtLower === 'glb';

    // Formato 'relief': l'URI è la foto catturata; il viewer la trasforma
    // in una mesh 3D a rilievo con texture fotografica.
    if (fmtLower === 'relief') {
      FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        .then((b64) => {
          const mime = /\.png$/i.test(uri) ? 'image/png' : 'image/jpeg';
          sendCommand({ type: 'loadRelief', image: b64, mime });
        })
        .catch(() => {
          if (onError) onError({ message: 'Immagine sorgente non leggibile' });
        });
      return;
    }

    if (isLocal && (fmtLower === 'gltf' || fmtLower === 'obj' || isBinary)) {
      FileSystem.readAsStringAsync(
        uri,
        isBinary ? { encoding: FileSystem.EncodingType.Base64 } : undefined,
      )
        .then((content) => {
          sendCommand({
            type: 'loadModelContent',
            content,
            format: fmtLower,
            encoding: isBinary ? 'base64' : 'utf8',
          });
        })
        .catch(() => {
          sendCommand({ type: 'loadModel', uri, format: fmtLower });
        });
    } else {
      sendCommand({ type: 'loadModel', uri, format: fmtLower });
    }
  }, [sendCommand, format, onError]);

  // ── Expose methods via ref ────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      loadModel: (uri, fmt) => {
        sendLoadModel(uri, fmt);
      },
      setMode: (newMode) => {
        sendCommand({ type: 'setMode', mode: newMode });
      },
      clearSelection: () => {
        sendCommand({ type: 'clearSelection' });
      },
      getAnnotations: () => {
        return new Promise((resolve) => {
          const id = ++annotationResponseCounter.current;
          pendingAnnotationResolvers.current[id] = resolve;
          sendCommand({ type: 'getAnnotations', _requestId: id });
          // Timeout fallback
          setTimeout(() => {
            if (pendingAnnotationResolvers.current[id]) {
              delete pendingAnnotationResolvers.current[id];
              resolve([]);
            }
          }, 3000);
        });
      },
      addAnnotation: (point, text) => {
        sendCommand({ type: 'addAnnotation', point, text });
      },
      removeAnnotation: (id) => {
        sendCommand({ type: 'removeAnnotation', id });
      },
      setModelProperty: (property, value) => {
        sendCommand({ type: 'setModelProperty', property, value });
      },
      resetCamera: () => {
        sendCommand({ type: 'resetCamera' });
      },
    }),
    [sendCommand, sendLoadModel, format],
  );

  // ── When modelUri / mode changes, push to WebView ─────────────────────────
  useEffect(() => {
    if (!viewerReady) return;
    if (modelUri) {
      sendLoadModel(modelUri, format);
    }
  }, [viewerReady, modelUri, format, sendLoadModel]);

  useEffect(() => {
    if (!viewerReady) return;
    sendCommand({ type: 'setMode', mode });
  }, [viewerReady, mode, sendCommand]);

  // ── Handle messages from WebView ──────────────────────────────────────────
  const handleMessage = useCallback(
    (event) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        switch (msg.type) {
          case 'viewerReady':
            setViewerReady(true);
            setIsLoading(false);
            if (onViewerReady) onViewerReady();
            if (modelUri) {
              sendLoadModel(modelUri, format);
            }
            sendCommand({ type: 'setMode', mode });
            break;

          case 'modelLoaded':
            if (onModelLoaded) {
              onModelLoaded({
                format: msg.format,
                vertexCount: msg.vertexCount,
                faceCount: msg.faceCount,
              });
            }
            break;

          case 'meshData':
            if (onMeshData) {
              onMeshData({
                positions: msg.positions,
                uvs: msg.uvs,
                colors: msg.colors,
                indices: msg.indices,
                vertexCount: msg.vertexCount,
                faceCount: msg.faceCount,
              });
            }
            break;

          case 'modelError':
            if (onError) onError({ message: msg.error });
            break;

          case 'areaSelected':
            if (onAreaSelected) {
              onAreaSelected({
                point: msg.point,
                faceIndex: msg.faceIndex,
                meshName: msg.meshName,
              });
            }
            break;

          case 'annotationPlaced':
          case 'annotationAdded':
            if (onAnnotationPlaced) {
              onAnnotationPlaced({
                id: msg.id,
                point: msg.point,
                meshName: msg.meshName,
              });
            }
            break;

          case 'annotations': {
            // Resolve any pending getAnnotations() promise
            const resolvers = pendingAnnotationResolvers.current;
            Object.keys(resolvers).forEach((key) => {
              resolvers[key](msg.data || []);
              delete resolvers[key];
            });
            break;
          }

          case 'error':
            if (onError) onError({ message: msg.message });
            break;

          default:
            break;
        }
      } catch {
        // Ignore parse errors
      }
    },
    [onViewerReady, onModelLoaded, onMeshData, onAreaSelected, onAnnotationPlaced, onError, modelUri, format, mode, sendCommand, sendLoadModel],
  );

  // ── WebView error ─────────────────────────────────────────────────────────
  const handleWebViewError = useCallback(
    (syntheticEvent) => {
      setIsLoading(false);
      const { nativeEvent } = syntheticEvent;
      if (onError) onError({ message: nativeEvent.description || 'WebView error' });
    },
    [onError],
  );

  const handleLoadEnd = useCallback(() => {
    // Loading indicator will be dismissed by viewerReady message
    // Set a fallback timeout in case the message never arrives
    setTimeout(() => setIsLoading(false), 5000);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={viewerHtmlSource}
        style={styles.webView}
        onMessage={handleMessage}
        onError={handleWebViewError}
        onLoadEnd={handleLoadEnd}
        originWhitelist={['*']}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        mixedContentMode="always"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        backgroundColor={colors.background}
        renderToHardwareTextureAndroid={true}
        androidLayerType="hardware"
        cacheEnabled={true}
        incognito={false}
      />

      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Caricamento viewer 3D...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
});

export default ModelViewer3D;
