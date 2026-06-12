#!/usr/bin/env python3
"""
Wildfox 3D Server - GPU-accelerated photogrammetry server for PC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setup:
  pip install flask trimesh numpy pillow

Optional (GPU reconstruction, one of):
  - Meshroom:  https://alicevision.org/#meshroom  (add bin/ to PATH)
  - COLMAP:    https://colmap.github.io           (add to PATH)

Run:
  python wildfox_server.py

Then open the app → Impostazioni → Server PC and enter your local IP.
To find your local IP: ipconfig (Windows) / ip a (Linux)
"""

import os
import sys
import json
import time
import uuid
import shutil
import threading
import subprocess
import tempfile
from pathlib import Path

try:
    from flask import Flask, request, jsonify, send_file, abort
except ImportError:
    print("[error] Flask non trovato. Esegui: pip install flask trimesh numpy pillow")
    sys.exit(1)

app = Flask(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

PORT = int(os.environ.get('WILDFOX_PORT', 8765))
HOST = os.environ.get('WILDFOX_HOST', '0.0.0.0')
WORK_DIR = Path(tempfile.gettempdir()) / 'wildfox_server'
WORK_DIR.mkdir(parents=True, exist_ok=True)

# ─── Job store ────────────────────────────────────────────────────────────────

_jobs = {}
_jobs_lock = threading.Lock()


def create_job(job_id):
    with _jobs_lock:
        _jobs[job_id] = {
            'status': 'queued',
            'progress': 0,
            'stage': 'In coda...',
            'result_path': None,
            'error': None,
            'created_at': time.time(),
        }


def update_job(job_id, **kwargs):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)


def get_job(job_id):
    with _jobs_lock:
        return dict(_jobs[job_id]) if job_id in _jobs else None


# ─── Engine detection ─────────────────────────────────────────────────────────

def detect_engine():
    for name in ['meshroom_batch', 'MeshroomBatch', 'meshroom']:
        if shutil.which(name):
            return 'meshroom', name
    if shutil.which('colmap'):
        return 'colmap', 'colmap'
    return None, None


def detect_gpu():
    try:
        r = subprocess.run(
            ['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip().split('\n')[0]
    except Exception:
        pass
    return None


ENGINE, ENGINE_CMD = detect_engine()

# ─── Meshroom reconstruction ──────────────────────────────────────────────────

_MESHROOM_STAGES = {
    'CameraInit':          ('Inizializzazione fotocamera...', 5),
    'FeatureExtraction':   ('Estrazione features (GPU)...', 20),
    'ImageMatching':       ('Corrispondenze immagini...', 35),
    'FeatureMatching':     ('Matching features (GPU)...', 50),
    'StructureFromMotion': ('Ricostruzione struttura 3D...', 65),
    'PrepareDenseScene':   ('Preparazione scena densa...', 72),
    'DepthMap':            ('Mappa di profondità (GPU)...', 82),
    'Meshing':             ('Generazione mesh...', 88),
    'MeshFiltering':       ('Filtraggio mesh...', 92),
    'Texturing':           ('Applicazione texture...', 96),
}


def run_meshroom(job_id, image_dir, output_dir):
    cache_dir = output_dir / 'cache'
    cache_dir.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        [ENGINE_CMD, '--input', str(image_dir), '--output', str(output_dir), '--cache', str(cache_dir)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace',
    )
    for line in proc.stdout:
        line = line.strip()
        for key, (label, pct) in _MESHROOM_STAGES.items():
            if key in line:
                update_job(job_id, stage=label, progress=pct)
                break
    proc.wait()
    return proc.returncode == 0


# ─── COLMAP reconstruction ────────────────────────────────────────────────────

def run_colmap(job_id, image_dir, output_dir):
    ws = output_dir / 'workspace'
    ws.mkdir(parents=True, exist_ok=True)
    update_job(job_id, stage='Estrazione features COLMAP (GPU)...', progress=15)
    steps = [
        (['colmap', 'feature_extractor', '--database_path', str(ws / 'db.db'),
          '--image_path', str(image_dir), '--ImageReader.single_camera', '1'], 30),
        (['colmap', 'exhaustive_matcher', '--database_path', str(ws / 'db.db')], 50),
    ]
    sparse = ws / 'sparse'
    sparse.mkdir(exist_ok=True)
    steps.append((['colmap', 'mapper', '--database_path', str(ws / 'db.db'),
                   '--image_path', str(image_dir), '--output_path', str(sparse)], 70))

    for cmd, pct in steps:
        r = subprocess.run(cmd, capture_output=True, timeout=600)
        if r.returncode != 0:
            return False
        update_job(job_id, progress=pct)

    update_job(job_id, stage='Generazione mesh densa...', progress=80)
    dense = ws / 'dense'
    dense.mkdir(exist_ok=True)
    sparse0 = next(sparse.iterdir(), None)
    if sparse0:
        subprocess.run(['colmap', 'image_undistorter', '--image_path', str(image_dir),
                        '--input_path', str(sparse0), '--output_path', str(dense)], capture_output=True)
        subprocess.run(['colmap', 'patch_match_stereo', '--workspace_path', str(dense)], capture_output=True)
        subprocess.run(['colmap', 'stereo_fusion', '--workspace_path', str(dense),
                        '--output_path', str(dense / 'fused.ply')], capture_output=True)
    update_job(job_id, progress=90)
    return True


# ─── Fallback: relief model from photo (no engine) ───────────────────────────

def create_relief_model(job_id, image_dir, output_dir):
    """
    When no photogrammetry engine is installed, build a textured relief mesh
    from the reference photo using numpy (same technique as on-device viewer).
    Requires: pip install trimesh numpy pillow
    """
    try:
        import numpy as np
        from PIL import Image as PILImage
        import trimesh

        images = sorted(image_dir.glob('*'))
        if not images:
            raise RuntimeError('Nessuna immagine trovata')

        ref = PILImage.open(images[len(images) // 2]).convert('RGB')
        ref.thumbnail((1024, 1024))
        w, h = ref.size
        aspect = h / w

        update_job(job_id, stage='Generazione mesh di rilievo...', progress=60)

        gray = np.array(ref.convert('L'), dtype=float) / 255.0
        grid = 96
        S = grid + 1

        verts, uvs = [], []
        for row in range(S):
            for col in range(S):
                u = col / grid
                v = row / grid
                px = int(u * (gray.shape[1] - 1))
                py = int(v * (gray.shape[0] - 1))
                # Gaussian smooth depth
                depth = gray[py, px] * 0.35
                verts.append([u * 2 - 1, (1 - v) * 2 * aspect - aspect, depth])
                uvs.append([u, 1 - v])

        faces = []
        for row in range(grid):
            for col in range(grid):
                a = row * S + col
                b = a + 1
                c = a + S
                d = c + 1
                faces.extend([[a, b, d], [a, d, c]])
                # Mirrored back
                faces.extend([[a + S * S, d + S * S, b + S * S], [a + S * S, c + S * S, d + S * S]])

        # Double vertices: front + back (flipped Z for back)
        front = [[x, y, z] for x, y, z in verts]
        back = [[x, y, -z] for x, y, z in verts]
        all_verts = np.array(front + back, dtype=float)
        all_uvs = np.array(uvs + uvs, dtype=float)
        all_faces = np.array(faces, dtype=int)

        # Save texture
        tex_path = output_dir / 'texture.png'
        ref.save(str(tex_path))

        mesh = trimesh.Trimesh(vertices=all_verts, faces=all_faces)
        texture_img = PILImage.open(str(tex_path))
        mesh.visual = trimesh.visual.TextureVisuals(uv=all_uvs, image=texture_img)

        glb_path = output_dir / 'result.glb'
        mesh.export(str(glb_path))
        return True
    except Exception as e:
        print(f'[server] relief fallback error: {e}')
        return False


# ─── Output model discovery ───────────────────────────────────────────────────

def find_output_model(output_dir):
    for pat in ['**/*.glb', '**/texturedMesh.obj', '**/model.obj', '**/fused.ply']:
        matches = list(output_dir.glob(pat))
        if matches:
            return matches[0]
    return None


def convert_to_glb(src, dst):
    try:
        import trimesh
        scene = trimesh.load(str(src))
        if hasattr(scene, 'geometry') and scene.geometry:
            mesh = trimesh.util.concatenate(list(scene.geometry.values()))
        else:
            mesh = scene
        mesh.export(str(dst))
        return True
    except Exception as e:
        print(f'[server] GLB conversion error: {e}')
        return False


# ─── Worker thread ────────────────────────────────────────────────────────────

def reconstruction_worker(job_id, image_dir, output_dir):
    try:
        update_job(job_id, status='running', stage='Preparazione...', progress=2)
        success = False

        if ENGINE == 'meshroom':
            update_job(job_id, stage='Avvio Meshroom (GPU)...', progress=5)
            success = run_meshroom(job_id, image_dir, output_dir)
        elif ENGINE == 'colmap':
            update_job(job_id, stage='Avvio COLMAP (GPU)...', progress=5)
            success = run_colmap(job_id, image_dir, output_dir)
        else:
            success = create_relief_model(job_id, image_dir, output_dir)

        if not success:
            update_job(job_id, status='error',
                       error='Ricostruzione fallita. Verifica che Meshroom o COLMAP siano installati e nel PATH.')
            return

        update_job(job_id, stage='Esportazione GLB...', progress=97)
        model_path = find_output_model(output_dir)
        glb_path = output_dir / 'result.glb'

        if glb_path.exists():
            pass  # Already a GLB (relief fallback writes it directly)
        elif model_path:
            if str(model_path).endswith('.glb'):
                shutil.copy(model_path, glb_path)
            else:
                convert_to_glb(model_path, glb_path)

        if not glb_path.exists():
            update_job(job_id, status='error', error='File GLB non trovato dopo la ricostruzione.')
            return

        update_job(job_id, status='done', progress=100, stage='Completato!', result_path=str(glb_path))

    except Exception as e:
        import traceback
        traceback.print_exc()
        update_job(job_id, status='error', error=str(e))


# ─── Flask routes ─────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'engine': ENGINE or 'none',
        'gpu': detect_gpu(),
        'version': '1.0.0',
    })


@app.route('/reconstruct', methods=['POST'])
def reconstruct():
    files = request.files.getlist('photos')
    if not files:
        return jsonify({'error': 'Nessuna foto ricevuta. Invia le foto nel campo "photos".'}), 400

    job_id = uuid.uuid4().hex[:8]
    job_dir = WORK_DIR / job_id
    image_dir = job_dir / 'images'
    output_dir = job_dir / 'output'
    image_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    for i, f in enumerate(files):
        ext = Path(f.filename or 'photo.jpg').suffix or '.jpg'
        f.save(str(image_dir / f'{i:04d}{ext}'))

    create_job(job_id)
    t = threading.Thread(target=reconstruction_worker, args=(job_id, image_dir, output_dir), daemon=True)
    t.start()

    return jsonify({'job_id': job_id})


@app.route('/status/<job_id>', methods=['GET'])
def status(job_id):
    j = get_job(job_id)
    if j is None:
        return jsonify({'error': 'Job non trovato'}), 404
    return jsonify({
        'status': j['status'],
        'progress': j['progress'],
        'stage': j['stage'],
        'error': j['error'],
    })


@app.route('/result/<job_id>', methods=['GET'])
def result(job_id):
    j = get_job(job_id)
    if j is None or j['status'] != 'done' or not j['result_path']:
        abort(404)
    return send_file(j['result_path'], mimetype='model/gltf-binary',
                     as_attachment=True, download_name='model.glb')


@app.route('/cleanup/<job_id>', methods=['DELETE'])
def cleanup(job_id):
    job_dir = WORK_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    with _jobs_lock:
        _jobs.pop(job_id, None)
    return jsonify({'ok': True})


# ─── Startup banner ───────────────────────────────────────────────────────────

def print_banner():
    gpu = detect_gpu()
    print()
    print('╔══════════════════════════════════════════════╗')
    print('║          Wildfox 3D Server  v1.0             ║')
    print('╚══════════════════════════════════════════════╝')
    print()
    print(f'  Porta     : {PORT}')
    print(f'  GPU       : {gpu or "non rilevata"}')
    print(f'  Motore 3D : {ENGINE or "nessuno (modalità rilievo fallback)"}')
    print()

    if not ENGINE:
        print('  ⚠  Nessun motore 3D trovato.')
        print('     Per ricostruzioni reali installa Meshroom:')
        print('     https://alicevision.org/#meshroom')
        print('     Poi aggiungi la cartella bin/ al PATH.')
        print()

    if not gpu:
        print('  ⚠  GPU NVIDIA non rilevata.')
        print('     Driver CUDA: https://www.nvidia.com/drivers')
        print()

    print('  ✅ Server pronto!')
    print('     1. Trova il tuo IP locale: ipconfig (Win) / ip a (Linux)')
    print(f'     2. Nell\'app: Impostazioni → Server PC → [tuo-IP]:{PORT}')
    print()


if __name__ == '__main__':
    print_banner()
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
