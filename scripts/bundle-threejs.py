"""
Downloads Three.js r158 scripts from CDN and inlines them directly
into viewer.html so the 3D viewer works completely offline in the APK.
Run this script after npm ci and before expo prebuild.
"""
import urllib.request
import sys
import time

CDN_SCRIPTS = [
    "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js",
]

VIEWER_PATH = "src/assets/viewer.html"


def download(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read().decode("utf-8")
            return content
        except Exception as exc:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  Retry {attempt + 2}/{retries} after {wait}s ({exc})")
                time.sleep(wait)
            else:
                raise RuntimeError(f"Download failed for {url}: {exc}")


with open(VIEWER_PATH, "r", encoding="utf-8") as f:
    html = f.read()

any_inlined = False
for url in CDN_SCRIPTS:
    tag = f'<script src="{url}"></script>'
    if tag not in html:
        print(f"Tag not found (skip): {url.split('/')[-1]}")
        continue
    print(f"Downloading {url.split('/')[-1]}...", end=" ", flush=True)
    js = download(url)
    html = html.replace(tag, f"<script>\n{js}\n</script>")
    print(f"OK ({len(js):,} chars)")
    any_inlined = True

if any_inlined:
    with open(VIEWER_PATH, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\nDone – viewer.html is self-contained ({len(html):,} bytes, offline-ready)")
else:
    if all(f'<script src="https://cdn.jsdelivr.net' not in html for _ in [1]):
        print("Already inlined or no CDN tags found – nothing to do")
    else:
        print("WARNING: no CDN tags matched, viewer.html unchanged")
        sys.exit(1)
