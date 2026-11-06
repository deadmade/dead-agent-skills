"""Regression cases for workspace policy, using disposable manifests."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from check_cargo_workspace import check


class WorkspacePolicy(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / 'Cargo.toml').write_text('''[workspace]
members = ["crates/app"]
[workspace.dependencies]
serde = "1"
''')
        (self.root / 'Cargo.lock').touch()
        self.member = self.root / 'crates/app/Cargo.toml'
        self.member.parent.mkdir(parents=True)
        self.member.write_text('''[package]
name = "app"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
publish.workspace = true
[dependencies]
serde = { workspace = true, features = ["derive"] }
''')

    def test_inherited_versions_and_local_features(self):
        self.assertEqual(check(self.root), [])

    def test_local_versions_in_every_dependency_kind(self):
        for section in ['dependencies', 'dev-dependencies', 'build-dependencies', 'target.\'cfg(windows)\'.dependencies']:
            with self.subTest(section=section):
                source = self.member.read_text()
                self.member.write_text(source.replace('[dependencies]', f'[{section}]').replace('workspace = true, features', 'version = "1", features'))
                self.assertTrue(any('must inherit its source and version' in x for x in check(self.root)))
                self.member.write_text(source)

    def test_nested_workspace_and_lockfile(self):
        (self.member.parent / 'Cargo.lock').touch()
        with self.member.open('a') as f:
            f.write('\n[workspace]\n')
        errors = check(self.root)
        self.assertTrue(any('nested workspace' in x for x in errors))
        self.assertTrue(any('root lockfile' in x for x in errors))

    def test_unlisted_package(self):
        extra = self.root / 'crates/extra'
        extra.mkdir()
        (extra / 'Cargo.toml').write_text(self.member.read_text())
        self.assertTrue(any('not a workspace member' in x for x in check(self.root)))

    def test_missing_member_and_central_dependency(self):
        self.member.write_text(self.member.read_text().replace('serde =', 'other ='))
        self.assertTrue(any('missing from workspace.dependencies' in x for x in check(self.root)))
        self.member.unlink()
        self.assertTrue(any('missing member' in x for x in check(self.root)))

    def test_build_artifacts_are_not_members(self):
        target = self.root / 'crates/app/target/vendor'
        target.mkdir(parents=True)
        (target / 'Cargo.toml').write_text('[workspace]')
        self.assertEqual(check(self.root), [])
