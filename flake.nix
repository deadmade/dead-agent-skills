{
  description = "dead-claude-skills: dev shell and pre-commit checks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    git-hooks,
  }: let
    forAllSystems = nixpkgs.lib.genAttrs ["x86_64-linux"];

    # Upstream files copied by tools/upstream-sync/src/adapters/*.ts, and graphify's committed output: fixing them here would churn every sync PR or graph rebuild.
    vendored = ["^\\.claude-plugin/" "^\\.agents/plugins/" "^plugins/shared/agent-review/(LICENSE$|UPSTREAM$|skills/)" "^plugins/flows/packs/" "^plugins/flows/agents/" "^plugins/shared/graphify/" "^plugins/opt-in/hallmark/" "^plugins/opt-in/implementation/(rust|csharp)-skills/(library/|skills/|LICENSE$|UPSTREAM$)" "^plugins/opt-in/implementation/postgres/skills/" "^plugins/flows/skills/self-review/(LICENSE|references/upstream/)" "^crates/flow-cockpit/bindings/" "^crates/flow-cockpit/app/shell/vendor/" "^crates/flow-cockpit/core/tests/fixtures/" "^graphify-out/"];

    # treefmt with the formatters treefmt.toml names: `nix fmt` and the pre-commit hook.
    treefmt = system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in
      pkgs.writeShellApplication {
        name = "treefmt";
        runtimeInputs = [pkgs.treefmt pkgs.alejandra pkgs.prettier pkgs.rustfmt];
        text = ''exec treefmt "$@"'';
      };

    preCommit = system: let
      pkgs = nixpkgs.legacyPackages.${system};

      check-repo = pkgs.writeShellApplication {
        name = "check-repo";
        runtimeInputs = [pkgs.nodejs];
        text = ''exec node scripts/check-repo.mjs'';
      };

      installer-test = pkgs.writeShellApplication {
        name = "installer-test";
        runtimeInputs = [pkgs.nodejs];
        text = ''
          node --test --experimental-test-coverage --test-coverage-include='tools/installer/**' \
            --test-coverage-exclude='tools/installer/**/*.test.ts' --test-coverage-lines=79 'tools/installer/**/*.test.ts'
          node --test 'tools/upstream-sync/src/**/*.test.ts' 'tools/upstream-sync/src/**/*.test.mjs'
          node --test 'tools/harness-compiler/test/**/*.test.ts' 'tools/harness-compiler/test/**/*.test.mjs'
          exec node --test 'scripts/*.test.mjs' 'plugins/flows/skills/writing/tests/*.test.mjs' 'plugins/default/hooks/*.test.mjs' 'plugins/flows/hooks/*.test.mjs' 'plugins/opt-in/headroom-trim/hooks/*.test.mjs' 'plugins/opt-in/flow-cockpit/hooks/*.test.mjs'
        '';
      };
    in
      git-hooks.lib.${system}.run {
        src = ./.;
        hooks = {
          treefmt = {
            enable = true;
            package = treefmt system;
          };
          check-merge-conflicts.enable = true;
          check-json.enable = true;
          end-of-file-fixer = {
            enable = true;
            excludes = vendored;
          };
          plugin-validate = {
            enable = true;
            name = "claude plugin validate + marketplace consistency";
            entry = "${check-repo}/bin/check-repo";
            files = "^(\\.claude-plugin/|plugins/|tools/harness-compiler/|crates/|scripts/check-repo\\.mjs$|Cargo\\.(toml|lock)$|package\\.json$)";
            pass_filenames = false;
          };
          installer-test = {
            enable = true;
            name = "installer tests";
            entry = "${installer-test}/bin/installer-test";
            files = "^(plugins/catalog\\.json$|\\.claude-plugin/|\\.agents/plugins/|tools/installer/|tools/harness-compiler/|tools/upstream-sync/|scripts/|crates/|Cargo\\.(toml|lock)$|plugins/default/hooks/|plugins/flows/hooks/|plugins/opt-in/headroom-trim/hooks/|plugins/flows/skills/|plugins/opt-in/flow-cockpit/hooks/|\\.claude-plugin/marketplace\\.json$|package\\.json$)";
            pass_filenames = false;
          };
        };
      };
  in {
    checks = forAllSystems (system: {pre-commit = preCommit system;});

    # The tui-review plugin's Rust binary: `nix build .#tui-review`, or `nix run .#tui-review -- gen`. Its tests run in the build.
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      # Cargo resolves the whole workspace even for a single package. Keep every member in the source,
      # but exclude unrelated plugins/docs and local build artifacts.
      workspaceSource = pkgs.lib.cleanSourceWith {
        src = pkgs.lib.cleanSource ./.;
        filter = path: type: let
          relative = pkgs.lib.removePrefix (toString ./. + "/") (toString path);
        in
          builtins.baseNameOf path
          != "target"
          && (relative == "Cargo.toml" || relative == "Cargo.lock" || relative == "crates" || pkgs.lib.hasPrefix "crates/" relative);
      };
      manifest = (pkgs.lib.importTOML ./crates/tui-review/Cargo.toml).package;
      webMcp = (pkgs.lib.importTOML ./crates/web-mcp/Cargo.toml).package;
      workspace = (pkgs.lib.importTOML ./Cargo.toml).workspace.package;
      cockpitApp = (pkgs.lib.importTOML ./crates/flow-cockpit/app/Cargo.toml).package;
      adoMcp = (pkgs.lib.importTOML ./crates/ado-mcp/Cargo.toml).package;
    in {
      tui-review = pkgs.rustPlatform.buildRustPackage {
        pname = manifest.name;
        inherit (workspace) version;
        src = workspaceSource;
        cargoLock.lockFile = ./Cargo.lock;
        cargoBuildFlags = ["-p" "tui-review" "--bin" "tui-review"];
        cargoTestFlags = ["-p" "tui-review"];
        # tests/review.rs builds its fixture repositories with git.
        nativeCheckInputs = [pkgs.git];
        meta = {
          inherit (manifest) description;
          mainProgram = "tui-review";
        };
      };
      # web-mcp, the web-mcp plugin's MCP server: `nix build .#web-mcp`.
      web-mcp = pkgs.rustPlatform.buildRustPackage {
        pname = webMcp.name;
        inherit (workspace) version;
        src = workspaceSource;
        cargoLock.lockFile = ./Cargo.lock;
        cargoBuildFlags = ["-p" "web-mcp" "--bin" "web-mcp"];
        cargoTestFlags = ["-p" "web-mcp"];
        # Test clients load the system trust store even when they only call the local fake server.
        nativeCheckInputs = [pkgs.cacert];
        # Debug checks: the fetch tests' WEB_MCP_TEST_PUBLIC_IP hook exists only in debug builds or the `test-hooks` feature.
        checkType = "debug";
        meta = {
          inherit (webMcp) description;
          mainProgram = "web-mcp";
        };
      };
      # The flow cockpit window (Tauri, crates/flow-cockpit/app): `nix run .#flow-cockpit`, or the package in a system
      # config. It links the system's GTK and WebKit, so Linux gets it from here, not as a release download.
      flow-cockpit = pkgs.rustPlatform.buildRustPackage {
        pname = cockpitApp.name;
        inherit (workspace) version;
        src = workspaceSource;
        cargoLock.lockFile = ./Cargo.lock;
        cargoBuildFlags = ["-p" "flow-cockpit" "--bin" "flow-cockpit"];
        cargoTestFlags = ["-p" "flow-cockpit"];
        nativeBuildInputs = with pkgs; [pkg-config wrapGAppsHook3];
        buildInputs = with pkgs; [webkitgtk_4_1 gtk3 libsoup_3 librsvg dbus];
        # The hosted-session tests start a command in a session of its own with `setsid`, which the build's PATH lacks.
        nativeCheckInputs = [pkgs.util-linux];
        # These time the poll against file changes and the clock; they run in a local `cargo test`, not in the sandboxed
        # build.
        checkFlags = map (t: "--skip=${t}") ["poll_emits_once_per_change" "poll_sees_folders_created_later" "first_paint_before_link_scan"];
        # The default extensions, which the app finds at <exe dir>/../share/flow-cockpit/extensions. `tests/` holds the
        # views' tests and fixtures, not an extension; the tsconfig.json beside the folders isn't copied either.
        postInstall = ''
          dest=$out/share/flow-cockpit/extensions
          mkdir -p "$dest"
          for dir in crates/flow-cockpit/extensions/*/; do
            name=$(basename "$dir")
            [ "$name" = tests ] || cp -r "$dir" "$dest/$name"
          done
        '';
        # The installed tree holds the four defaults and no tests, fixtures or configs, and the app finds it. Copied
        # out as a user would, the defaults type-check against `--print-types` as they are (the skill's tsc line).
        doInstallCheck = true;
        nativeInstallCheckInputs = [pkgs.typescript];
        installCheckPhase = ''
          runHook preInstallCheck
          dest=$out/share/flow-cockpit/extensions
          test "$(ls "$dest" | tr '\n' ' ')" = "activity docs list run "
          test -z "$(find "$dest" -name '*.test.ts' -o -name fixtures -o -name '*.json')"
          $out/bin/flow-cockpit --print-paths | grep -Fx "default extensions: $dest"
          copy=$(mktemp -d)
          cp -r "$dest"/. "$copy"
          chmod -R u+w "$copy"
          $out/bin/flow-cockpit --print-types > "$copy/flow-cockpit.d.ts"
          (cd "$copy" && tsc --noEmit --strict --target es2023 --lib es2023,dom,dom.iterable --module esnext \
            --moduleResolution bundler --verbatimModuleSyntax --erasableSyntaxOnly flow-cockpit.d.ts ./*/*.ts)
          runHook postInstallCheck
        '';
        meta = {
          inherit (cockpitApp) description;
          mainProgram = "flow-cockpit";

          platforms = ["x86_64-linux"];
        };
      };

      # ado-mcp, the mcp-azure plugin's MCP server: `nix build .#ado-mcp`.
      ado-mcp = pkgs.rustPlatform.buildRustPackage {
        pname = adoMcp.name;
        inherit (workspace) version;
        src = workspaceSource;
        cargoLock.lockFile = ./Cargo.lock;
        cargoBuildFlags = ["-p" "ado-mcp" "--bin" "ado-mcp"];
        cargoTestFlags = ["-p" "ado-mcp"];
        # The tests read git remotes and build reqwest clients, whose platform verifier needs CA certificates (cacert's
        # setup hook sets SSL_CERT_FILE in the sandbox); debug checks keep the ADO_TIMEOUT_MS hook, debug builds only.
        nativeCheckInputs = [pkgs.git pkgs.cacert];
        # timetrack's test looks up Europe/Berlin. jiff reads $TZDIR, else system directories like /usr/share/zoneinfo,
        # which the sandbox lacks, and tzdata has no setup hook to set it.
        preCheck = "export TZDIR=${pkgs.tzdata}/share/zoneinfo";
        checkType = "debug";
        meta = {
          inherit (adoMcp) description;
          mainProgram = "ado-mcp";
        };
      };
    });

    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      pre-commit = self.checks.${system}.pre-commit;
    in {
      default = pkgs.mkShell {
        inherit (pre-commit) shellHook;
        buildInputs = pre-commit.enabledPackages;
        # What tools/upstream-sync/src/adapters/*.ts and the workflows use besides stdenv, the Rust toolchain for the crates, and the
        # libraries the flow cockpit window builds against.
        packages = with pkgs; [git gh nodejs_26 uv python3 cargo rustc clippy rustfmt rust-analyzer pkg-config webkitgtk_4_1 gtk3 libsoup_3 librsvg dbus];
        RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
      };
    });

    formatter = forAllSystems treefmt;
  };
}
