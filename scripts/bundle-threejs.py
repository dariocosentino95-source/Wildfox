"""
Inlines Three.js r128 scripts into viewer.html for offline use.
Reads from node_modules/three (installed as devDependency) so no CDN
download is needed at build time. Falls back to CDN only if node_modules
is unavailable.
"""
import os
import sys
import time
import urllib.request

VIEWER_PATH = "src/assets/viewer.html"

# Maps CDN script tag URL -> local node_modules path
SCRIPTS = [
    (
        "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
        "node_modules/three/build/three.min.js",
    ),
    (
        "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
        "node_modules/three/examples/js/controls/OrbitControls.js",
    ),
    (
        "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
        "node_modules/three/examples/js/loaders/GLTFLoader.js",
    ),
    (
        "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js",
        "node_modules/three/examples/js/loaders/OBJLoader.js",
    ),
    (
        "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js",
        "node_modules/three/examples/js/loaders/STLLoader.js",
    ),
]


def download(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8")
        except Exception as exc:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  Retry {attempt + 2}/{retries} after {wait}s ({exc})")
                time.sleep(wait)
            else:
                raise RuntimeError(f"Download failed for {url}: {exc}")


def read_local(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


with open(VIEWER_PATH, "r", encoding="utf-8") as f:
    html = f.read()

any_inlined = False

for cdn_url, local_path in SCRIPTS:
    tag = f'<script src="{cdn_url}"></script>'
    if tag not in html:
        print(f"Tag not found (skip): {cdn_url.split('/')[-1]}")
        continue

    # Try node_modules first
    if os.path.exists(local_path):
        print(f"Inlining from node_modules: {cdn_url.split('/')[-1]}...", end=" ", flush=True)
        js = read_local(local_path)
        source = "node_modules"
    else:
        print(f"Downloading from CDN: {cdn_url.split('/')[-1]}...", end=" ", flush=True)
        js = download(cdn_url)
        source = "CDN"

    html = html.replace(tag, f"<script>\n{js}\n</script>")
    print(f"OK ({len(js):,} chars, from {source})")
    any_inlined = True

if any_inlined:
    with open(VIEWER_PATH, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\nDone – viewer.html is self-contained ({len(html):,} bytes, offline-ready)")
else:
    # Check if it's already inlined (no CDN tags remain)
    has_cdn_tags = any(f'<script src="{url}">' in html for url, _ in SCRIPTS)
    if not has_cdn_tags:
        print("Already inlined – nothing to do")
    else:
        print("WARNING: no CDN tags matched, viewer.html unchanged")
        sys.exit(1)
