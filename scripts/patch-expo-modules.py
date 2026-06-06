"""
Patches expo-modules-core/android/ExpoModulesCorePlugin.gradle to remove
the afterEvaluate maven publishing block that fails with AGP 8.x.

The 'release' software component is created lazily in AGP 8.x and is not
available inside afterEvaluate. Maven publishing is only needed for library
distribution — not for building an APK — so removing it is safe.
"""
import sys

path = "node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle"

with open(path, "r") as f:
    content = f.read()

old = (
    "  afterEvaluate {\n"
    "    publishing {\n"
    "      publications {\n"
    "        release(MavenPublication) {\n"
    "          from components.release\n"
    "        }\n"
    "      }\n"
    "      repositories {\n"
    "        maven {\n"
    "          url = mavenLocal().url\n"
    "        }\n"
    "      }\n"
    "    }\n"
    "  }"
)

new = "  // afterEvaluate publishing removed: not needed for APK build, fails on AGP 8.x"

if old in content:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("Patch applied: removed maven publishing block from useExpoPublishing")
elif new in content:
    print("Patch already applied: skipping (idempotent)")
else:
    print("ERROR: pattern not found in ExpoModulesCorePlugin.gradle")
    for i, line in enumerate(content.splitlines()):
        if "components" in line:
            start = max(0, i - 3)
            end = min(len(content.splitlines()), i + 5)
            for j, l in enumerate(content.splitlines()[start:end], start + 1):
                print(f"  {j}: {repr(l)}")
            break
    sys.exit(1)
