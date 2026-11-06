"""Enforce one Cargo workspace and inherited dependency versions (Python 3.11+)."""

from pathlib import Path
import sys
import tomllib


def check(root):
    problems = []
    manifest = tomllib.loads((root / 'Cargo.toml').read_text())
    workspace = manifest['workspace']
    members = {root / member / 'Cargo.toml' for member in workspace['members']}
    if not (root / 'Cargo.lock').is_file():
        problems.append('missing root Cargo.lock')
    # Do not inspect target directories, which can contain vendored dependency manifests.
    def manifests(folder):
        for path in folder.iterdir():
            if path.name == 'target':
                continue
            if path.is_dir():
                yield from manifests(path)
            elif path.name in {'Cargo.toml', 'Cargo.lock'}:
                yield path
    for path in manifests(root / 'crates'):
        relative = path.relative_to(root)
        if path.name == 'Cargo.lock':
            problems.append(f'{relative}: use the root lockfile')
            continue
        data = tomllib.loads(path.read_text())
        if 'workspace' in data:
            problems.append(f'{relative}: nested workspace')
        if path not in members:
            problems.append(f'{relative}: not a workspace member')
        for key in ['version', 'edition', 'rust-version', 'license', 'publish']:
            if data.get('package', {}).get(key) != {'workspace': True}:
                problems.append(f'{relative}: {key} must be inherited')
        for section in [data, *data.get('target', {}).values()]:
            for kind in ['dependencies', 'build-dependencies', 'dev-dependencies']:
                for name, dependency in section.get(kind, {}).items():
                    if (not isinstance(dependency, dict)
                            or dependency.get('workspace') is not True
                            or any(key in dependency for key in ['version', 'path', 'git', 'registry'])):
                        problems.append(f'{relative}: {kind}.{name} must inherit its source and version')
                    if name not in workspace.get('dependencies', {}):
                        problems.append(f'{relative}: {name} missing from workspace.dependencies')
    for path in members:
        if not path.is_file():
            problems.append(f'{path.relative_to(root)}: missing member')
    return problems


if __name__ == '__main__':
    errors = check(Path(__file__).resolve().parent.parent)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        sys.exit(1)
    print('Cargo workspace policy passed')
