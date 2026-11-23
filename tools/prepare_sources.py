"""Prepare a source-only handoff, then finalize after npm ci && npm run build."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = '1c-amocrm-2026-11-23'
DEST = ROOT / 'deliverables' / NAME
FIX = Path('1c-test-base/extension/price-contract-fix')


def copy_file(relative, destination=None):
    source = ROOT / relative
    target = DEST / (destination or relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def copy_tree(relative):
    for item in sorted((ROOT / relative).rglob('*')):
        if item.is_file():
            copy_file(item.relative_to(ROOT))


def routes():
    tree = ET.parse(ROOT / FIX / 'src/HTTPServices/TeMa_HTTPСервис.xml')
    ns = {'m': 'http://v8.1c.ru/8.3/MDClasses'}
    lines = ['# Маршруты HTTP-сервиса', '',
             'Сформировано из XML исправленного расширения. Префикс: `/hs/integration`.', '',
             '| Метод | Маршрут | Обработчик BSL |', '| --- | --- | --- |']
    for template in tree.findall('.//m:URLTemplate', ns):
        path = template.findtext('m:Properties/m:Template', namespaces=ns)
        for method in template.findall('m:ChildObjects/m:Method/m:Properties', ns):
            verb = method.findtext('m:HTTPMethod', namespaces=ns)
            handler = method.findtext('m:Handler', namespaces=ns)
            lines.append(f'| {verb} | `{path}` | `{handler}` |')
    (ROOT / 'docs/API-ROUTES.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def prepare():
    if DEST.exists():
        raise SystemExit(f'Existing handoff preserved: {DEST}. Use --finalize or choose a fresh destination.')
    routes()
    for relative in ('README.md', '.gitignore', 'frontend/package.json',
                     'frontend/package-lock.json', 'frontend/vite.config.js',
                     'backend/main.py', 'backend/requirements.txt',
                     '1c-test-base/README.md', '1c-test-base/manifest.json',
                     '1c-test-base/Restore-Dump.ps1', '1c-test-base/Verify-Extension.py',
                     '1c-test-base/.gitignore', 'tools/prepare_sources.py'):
        copy_file(relative)
    for relative in ('docs', 'frontend/src', str(FIX)):
        copy_tree(relative)
    for item in (ROOT / 'frontend/widget').rglob('*'):
        if item.is_file() and item.name not in ('app.js', 'app.js.map', 'app.js.LICENSE.txt'):
            copy_file(item.relative_to(ROOT))
    for item in (ROOT / '1c-test-base/extension').iterdir():
        if item.is_file():
            copy_file(item.relative_to(ROOT))
    tests = ('RuntimeTests.bsl', 'PriceContractTests.bsl', 'prepare_harness.py',
             'REPORT.md', 'runtime-results.json', 'static-checks.json',
             'installed-modules.json', 'extension-check.log.txt',
             'price-contract-results.json', 'price-group-regression.json',
             'price-contract-syntax.txt', 'Prepare-TestPublication.ps1', 'Enable-TestLan.ps1')
    for name in tests:
        copy_file(Path('1c-test-base/verification') / name)
    harness = ROOT / '1c-test-base/verification/harness'
    if not (harness / 'PriceTestAmo.xml').exists():
        harness = ROOT / '1c-test-base/restored/harness'
    if (harness / 'PriceTestAmo.xml').exists():
        copy_file((harness / 'PriceTestAmo.xml').relative_to(ROOT),
                  Path('1c-test-base/verification/harness/PriceTestAmo.xml'))
        for item in (harness / 'PriceTestAmo').rglob('*'):
            if item.is_file():
                copy_file(item.relative_to(ROOT), Path('1c-test-base/verification/harness') / item.relative_to(harness))
    print(f'Prepared: {DEST}')


def included_files():
    return [p for p in sorted(DEST.rglob('*')) if p.is_file()
            and 'node_modules' not in p.relative_to(DEST).parts
            and '__pycache__' not in p.relative_to(DEST).parts
            and p.name != 'SOURCE-MANIFEST.json']


def finalize():
    manifest = json.loads((DEST / FIX / 'manifest.json').read_text(encoding='utf-8-sig'))
    cfe = (DEST / FIX / manifest['cfe']).read_bytes()
    assert len(cfe) == manifest['bytes']
    assert hashlib.sha256(cfe).hexdigest() == manifest['sha256']
    spec = importlib.util.spec_from_file_location('verify_cfe', DEST / '1c-test-base/Verify-Extension.py')
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    embedded = [content for _, content in verifier.leaves(cfe)]
    for entry in manifest['module_sources']:
        data = (DEST / FIX / entry['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['path']
        assert data in embedded, f'Module absent from CFE: {entry["path"]}'
    with zipfile.ZipFile(DEST / 'frontend/widget.zip') as widget:
        assert widget.testzip() is None
        assert {'manifest.json', 'script.js', 'app.js'} <= set(widget.namelist())
    for name, expected in [('price-contract-results.json', 4), ('price-group-regression.json', 14)]:
        results = json.loads((DEST / '1c-test-base/verification' / name).read_text(encoding='utf-8-sig'))
        assert len(results) == expected and all(row['passed'] for row in results), name
    try:
        commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = 'not available; source snapshot'
    # Heuristic check; never print matched credential material.
    import re
    secret_patterns = [r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}',
                       r'gh[pousr]_[A-Za-z0-9]{25,}',
                       r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----']
    for p in included_files():
        if p.suffix.lower() in ('.js', '.jsx', '.bsl', '.json', '.xml', '.ps1', '.md'):
            content = p.read_text(encoding='utf-8-sig', errors='replace')
            assert not any(re.search(pattern, content) for pattern in secret_patterns), f'Credential pattern in {p.relative_to(DEST)}'
    entries = [{'path': p.relative_to(DEST).as_posix(), 'bytes': p.stat().st_size,
                'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in included_files()]
    metadata = {'prepared_date': '2026-11-23', 'base_commit': commit,
                'includes_uncommitted_changes': True, 'runtime_tests_date': '2026-10-26',
                'runtime_tests_rerun_for_delivery': False, 'files': entries}
    (DEST / 'SOURCE-MANIFEST.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    archive = DEST.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
        for p in included_files() + [DEST / 'SOURCE-MANIFEST.json']:
            output.write(p, f'{NAME}/{p.relative_to(DEST).as_posix()}')
    with zipfile.ZipFile(archive) as output:
        assert output.testzip() is None
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='ascii')
    print(f'Checked CFE, five modules, widget ZIP, 18 saved results and archive integrity.\nArchive: {archive}\nSHA-256: {digest}\nFiles: {len(entries) + 1}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--finalize', action='store_true')
    args = parser.parse_args()
    finalize() if args.finalize else prepare()
