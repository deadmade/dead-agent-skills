{
  description = "dead-agent-skills: dev shell and pre-commit checks";

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

    # treefmt.toml's excludes as regexes, for the hooks that don't read treefmt.toml themselves.
    vendored = map (g: "^" + builtins.replaceStrings ["." "**" "*"] ["\\." ".*" "[^/]*"] g + "$") (nixpkgs.lib.importTOML ./treefmt.toml).excludes;

    # treefmt with the formatters treefmt.toml names: `nix fmt` and the pre-commit hook.
    treefmt = system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in
      pkgs.writeShellApplication {
        name = "treefmt";
        runtimeInputs = [pkgs.treefmt pkgs.alejandra pkgs.prettier pkgs.rustfmt pkgs.taplo];
        text = ''exec treefmt "$@"'';
      };

    preCommit = system: let
      pkgs = nixpkgs.legacyPackages.${system};
      inherit (pkgs) lib;
      node = pkgs.nodejs_26;

      # What package-lock.json pins (the compiler's smol-toml among it), for the sandboxed check, which has no `npm ci`:
      # check-repo and the compiler tests import it. Built from the manifests alone, so only they rebuild it.
      workspaces = (lib.importJSON ./package.json).workspaces;
      npmRoot = lib.fileset.toSource {
        root = ./.;
        fileset = lib.fileset.unions ([./package.json ./package-lock.json] ++ map (ws: ./. + "/${ws}/package.json") workspaces);
      };
      nodeModules = pkgs.importNpmLock.buildNodeModules {
        inherit npmRoot;
        nodejs = node;
        derivationArgs = {
          # npm ci installs a workspace's dependencies only when its package.json is there.
          postPatch = lib.concatMapStrings (ws: "mkdir -p ${ws} && cp ${npmRoot}/${ws}/package.json ${ws}/\n") workspaces;
          # The links to the workspaces would dangle here; the checked tree has the workspaces themselves.
          postInstall = "rm -r $out/node_modules/@dead-claude-skills";
        };
      };

      check-repo = pkgs.writeShellApplication {
        name = "check-repo";
        runtimeInputs = [node];
        text = ''exec node scripts/check-repo.mjs'';
      };

      installer-test = pkgs.writeShellApplication {
        name = "installer-test";
        runtimeInputs = [node pkgs.git];
        text = ''exec npm test'';
      };
    in
      git-hooks.lib.${system}.run {
        src = ./.;
        # The checked tree, with node_modules beside package.json as `npm ci` would leave it (git ignores the link).
        rootSrc = lib.mkForce (pkgs.runCommand "source-with-node-modules" {} ''
          cp -r ${./.} $out
          chmod u+w $out
          ln -s ${nodeModules}/node_modules $out/node_modules
        '');
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
            files = "^(plugins/|tools/harness-compiler/|tools/(ado-mcp|web-mcp)/|scripts/check-repo\\.mjs$|Cargo\\.(toml|lock)$|package\\.json$)";
            pass_filenames = false;
          };
          installer-test = {
            enable = true;
            name = "installer tests";
            entry = "${installer-test}/bin/installer-test";
            files = "^(plugins/catalog\\.json$|tools/installer/|tools/harness-compiler/|tools/upstream-sync/|scripts/|tools/(ado-mcp|web-mcp)/|plugins/default/hooks/|plugins/flows/hooks/|plugins/opt-in/headroom-trim/hooks/|plugins/flows/skills/|package\\.json$)";
            pass_filenames = false;
          };
        };
      };
  in {
    checks = forAllSystems (system: {pre-commit = preCommit system;});

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
          && (relative == "Cargo.toml" || relative == "Cargo.lock" || relative == "tools" || builtins.any (name: relative == "tools/${name}" || pkgs.lib.hasPrefix "tools/${name}/" relative) ["web-mcp" "ado-mcp"]);
      };
      webMcp = (pkgs.lib.importTOML ./tools/web-mcp/Cargo.toml).package;
      workspace = (pkgs.lib.importTOML ./Cargo.toml).workspace.package;
      adoMcp = (pkgs.lib.importTOML ./tools/ado-mcp/Cargo.toml).package;
    in {
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
        # What tools/upstream-sync/src/adapters/*.ts and the workflows use besides stdenv, and the Rust toolchain for the crates.
        packages = with pkgs; [git gh nodejs_26 uv python3 cargo rustc clippy rustfmt rust-analyzer];
        RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
      };
    });

    formatter = forAllSystems treefmt;
  };
}
