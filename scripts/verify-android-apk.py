"""Verify the actual APK contains the current public mobile build, byte for byte."""
import hashlib
import json
import sys
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
source = root / '.mobile-public'
apk = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'android/app/build/outputs/apk/debug/app-debug.apk'
# Android App Bundles keep the base module assets under base/.
prefix = 'base/assets/public/' if apk.suffix == '.aab' else 'assets/public/'
manifest = {}
with ZipFile(apk) as archive:
    names = set(archive.namelist())
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(source).as_posix()
        target = prefix + relative
        if target not in names:
            raise RuntimeError('Arquivo ausente no APK: ' + relative)
        expected = hashlib.sha256(path.read_bytes()).hexdigest()
        if hashlib.sha256(archive.read(target)).hexdigest() != expected:
            raise RuntimeError('APK desatualizado: ' + relative)
        manifest[relative] = expected
    for name in names:
        if not name.startswith(prefix):
            continue
        relative = name[len(prefix):]
        if relative and not name.endswith('/') and relative not in manifest:
            if relative not in {'cordova.js', 'cordova_plugins.js'}:
                raise RuntimeError('Arquivo inesperado no APK: ' + relative)
            generated = root / 'android/app/src/main/assets/public' / relative
            digest = hashlib.sha256(generated.read_bytes()).hexdigest()
            if hashlib.sha256(archive.read(name)).hexdigest() != digest:
                raise RuntimeError('Runtime nativo desatualizado: ' + relative)
            manifest[relative] = digest
        if any(part.startswith(('.env', '.dev.vars')) or part in {'handoff', 'downloads', '.mentra-private'} for part in Path(relative).parts):
            raise RuntimeError('Área privada encontrada no APK.')
    for required in ['entry.mjs', 'compat.mjs', 'native-runtime.js', 'admin.mjs', 'calendar-native-return.mjs']:
        if required not in manifest:
            raise RuntimeError('Entrada mobile obrigatória ausente: ' + required)
result = {
    'apk': str(apk.relative_to(root)),
    'bytes': apk.stat().st_size,
    'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
    'webAssetsChecked': True,
    'verifiedAssets': len(manifest),
    'assetsDigest': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
    'apiOrigin': json.loads((source / 'mobile-build.json').read_text(encoding='utf-8'))['apiOrigin'],
}
output = root / ('qa/mobile/android-' + apk.stem + '.json')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
