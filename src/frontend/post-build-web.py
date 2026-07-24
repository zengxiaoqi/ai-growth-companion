#!/usr/bin/env python3
"""
Post-build script for Flutter Web.
Run after `flutter build web` to:
1. Add useLocalCanvasKit to flutter_bootstrap.js
2. Switch renderer from canvaskit to html (eliminate 7MB WASM download)
3. Version main.dart.js (cache-bust)
4. Add .catch() error handling to load() call
5. Pre-compress .gz files for gzip_static
6. Copy updated index.html to build/web

Usage: cd src/frontend && python3 post-build-web.py
       or: python3 post-build-web.py
"""

import os, re, shutil, subprocess, sys, gzip, time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(SCRIPT_DIR, "build", "web")
BOOTSTRAP_JS = os.path.join(BUILD_DIR, "flutter_bootstrap.js")
SRC_INDEX = os.path.join(SCRIPT_DIR, "web", "index.html")

def main():
    print(f"=== Post-build web: {BUILD_DIR} ===")
    
    # Read bootstrap
    with open(BOOTSTRAP_JS, "r") as f:
        content = f.read()
    
    # Step 1: useLocalCanvasKit + html renderer
    print("\n[1] Patching build config...")
    config_match = re.search(r'_flutter\.buildConfig\s*=\s*(\{[^;]+\});', content)
    if not config_match:
        print("  ERROR: Could not find _flutter.buildConfig")
        sys.exit(1)
    
    config_str = config_match.group(1)
    
    # Add useLocalCanvasKit
    if '"useLocalCanvasKit"' not in config_str:
        config_str = config_str.replace('"engineRevision"', '"useLocalCanvasKit":true,"engineRevision"')
        print("  ✓ useLocalCanvasKit: true added")
    else:
        print("  ✓ useLocalCanvasKit already set")
    
    # Switch renderer to html
    if '"renderer":"canvaskit"' in config_str:
        config_str = config_str.replace('"renderer":"canvaskit"', '"renderer":"html"')
        print("  ✓ renderer: canvaskit → html")
    elif '"renderer":"html"' in config_str:
        print("  ✓ renderer already html")
    else:
        print("  ⚠ renderer not found in expected format")
    
    # Step 2: Version main.dart.js
    print("\n[2] Versioning main.dart.js...")
    
    # Find latest version number
    latest_v = 0
    for f in os.listdir(BUILD_DIR):
        m = re.match(r'main\.dart\.v(\d+)\.js', f)
        if m:
            latest_v = max(latest_v, int(m.group(1)))
    
    next_v = latest_v + 1
    versioned_js = f"main.dart.v{next_v}.js"
    versioned_path = os.path.join(BUILD_DIR, versioned_js)
    
    shutil.copy2(os.path.join(BUILD_DIR, "main.dart.js"), versioned_path)
    print(f"  Created: {versioned_js}")
    
    # Update reference in buildConfig
    config_str = re.sub(
        r'"mainJsPath"\s*:\s*"main\.dart\.js"',
        f'"mainJsPath":"{versioned_js}"',
        config_str
    )
    
    # Replace config in content
    content = content.replace(config_match.group(1), config_str)
    
    # Clean old versioned files (keep latest 2)
    versioned_files = sorted([
        f for f in os.listdir(BUILD_DIR)
        if re.match(r'main\.dart\.v\d+\.js', f) and f != versioned_js
    ])
    for old_f in versioned_files[:-1]:  # keep the one before latest
        os.remove(os.path.join(BUILD_DIR, old_f))
        print(f"  Removed old: {old_f}")
    
    # Step 3: Add .catch() to load() call
    print("\n[3] Adding load() error handling...")
    
    # Find the load() call pattern
    load_pattern = r'(_flutter\.loader\.load\([\s\S]*?\);)'
    load_match = re.search(load_pattern, content)
    if load_match:
        load_call = load_match.group(1)
        # Replace the load call with a variable + .catch()
        catch_code = (
            f"var _loadPromise = {load_call}\n"
            f"if (_loadPromise && _loadPromise.catch) _loadPromise.catch(function(err) {{\n"
            f"  console.error('[Flutter] Load FAILED:', err);\n"
            f"  if (window._lingxiLoader) window._lingxiLoader.error('Flutter加载失败: ' + (err.message || String(err)));\n"
            f"}});"
        )
        content = content.replace(load_call, catch_code)
        print("  ✓ .catch() error handling added")
    else:
        print("  ⚠ Could not find load() call — check manually")
    
    # Write updated bootstrap
    with open(BOOTSTRAP_JS, "w") as f:
        f.write(content)
    print("  ✓ flutter_bootstrap.js written")
    
    # Step 4: Copy updated index.html
    print("\n[4] Syncing index.html...")
    shutil.copy2(SRC_INDEX, os.path.join(BUILD_DIR, "index.html"))
    print("  ✓ index.html copied to build/web")
    
    # Step 5: Pre-compress gzip
    print("\n[5] Pre-compressing gzip files...")
    for fname in ["index.html", "flutter_bootstrap.js", versioned_js]:
        fpath = os.path.join(BUILD_DIR, fname)
        if os.path.exists(fpath):
            with open(fpath, "rb") as fin:
                data = fin.read()
            with gzip.open(fpath + ".gz", "wb", compresslevel=9) as fout:
                fout.write(data)
            orig_size = os.path.getsize(fpath)
            gz_size = os.path.getsize(fpath + ".gz")
            ratio = (1 - gz_size / orig_size) * 100
            print(f"  ✓ {fname}: {orig_size:,} → {gz_size:,} bytes ({ratio:.0f}% saved)")
    
    # Step 6: Verify
    print("\n[6] Verification...")
    with open(BOOTSTRAP_JS, "r") as f:
        final = f.read()
    
    checks = [
        ('useLocalCanvasKit', '"useLocalCanvasKit":true'),
        ('renderer: html', '"renderer":"html"'),
        (f'versioned: {versioned_js}', versioned_js),
        ('.catch() error handling', '.catch('),
        ('window._lingxiLoader', 'window._lingxiLoader'),
    ]
    for name, pattern in checks:
        if pattern in final:
            print(f"  ✓ {name}")
        else:
            print(f"  ✗ {name} — MISSING!")
    
    print(f"\n=== Post-build complete ===")
    print(f"Next: cd build/web && sudo cp -r * /var/www/lingxi/")

if __name__ == "__main__":
    main()