"""Launch the unsigned CI build; this is a process smoke test, not full UI QA."""
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import time

def command(*arguments, timeout=120):
    return subprocess.run(arguments, check=True, capture_output=True, text=True, timeout=timeout).stdout

def choose_device(devices):
    candidates = []
    for runtime, entries in devices.items():
        version = re.search(r'iOS-(\d+)-(\d+)', runtime)
        if not version or int(version[1]) < 15:
            continue
        for device in entries:
            if device.get('isAvailable') and device.get('name', '').startswith('iPhone'):
                candidates.append(((int(version[1]), int(version[2])), device))
    if not candidates:
        raise RuntimeError('Nenhum simulador iPhone com iOS 15 ou superior está disponível.')
    return max(candidates, key=lambda item: item[0])

def main():
    if sys.platform != 'darwin':
        raise RuntimeError('Este teste exige macOS com Xcode e simuladores instalados.')
    root = Path(__file__).resolve().parent.parent
    application = root / '.mentra-private/ios-ci-build/Build/Products/Debug-iphonesimulator/App.app'
    with (application / 'Info.plist').open('rb') as source:
        identifier = plistlib.load(source)['CFBundleIdentifier']
    configuration = json.loads((root / 'capacitor.config.json').read_text(encoding='utf-8'))
    if identifier != configuration['appId']:
        raise RuntimeError('O bundle compilado não corresponde ao aplicativo configurado.')
    version, device = choose_device(json.loads(command('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))['devices'])
    udid = device['udid']
    print(f'Preparando {device["name"]}, iOS {version[0]}.{version[1]} ({device["state"]}).', flush=True)
    if device['state'] != 'Booted':
        command('xcrun', 'simctl', 'boot', udid)
    # First boot performs simulator data migration on a fresh hosted runner.
    # Stream progress and allow enough time; a boot failure must remain a failure.
    subprocess.run(['xcrun', 'simctl', 'bootstatus', udid, '-b'], check=True, timeout=600)
    command('xcrun', 'simctl', 'install', udid, str(application))
    launch = command('xcrun', 'simctl', 'launch', '--terminate-running-process', udid, identifier)
    match = re.search(r':\s*(\d+)\s*$', launch)
    if not match:
        raise RuntimeError('O simulador não confirmou o PID do aplicativo.')
    process = int(match[1])
    time.sleep(15)
    os.kill(process, 0)
    result = f'Compilação iOS e inicialização do processo aprovadas: {device["name"]}, iOS {version[0]}.{version[1]}. Não comprova login, UI, arquivos ou notificações reais.'
    print(result)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as output:
            output.write('## Validação iOS\n\n' + result + '\n')

if __name__ == '__main__':
    main()

