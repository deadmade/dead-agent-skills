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

      repo-node = pkgs.writeShellApplication {
        name = "repo-node";
        runtimeInputs = [node pkgs.git];
        text = ''exec node scripts/test.mjs repo node'';
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
          # One hook, so check-repo runs once a commit: it holds claude plugin validate and the marketplace checks.
          repo-node = {
            enable = true;
            name = "repo checks and Node tests";
            entry = "${repo-node}/bin/repo-node";
            files = "^(plugins/|tools/|scripts/|\\.github/workflows/|package(-lock)?\\.json$|Cargo\\.(toml|lock)$|treefmt\\.toml$)";
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
          && (relative == "Cargo.toml" || relative == "Cargo.lock" || relative == "tools" || builtins.any (name: relative == "tools/${name}" || pkgs.lib.hasPrefix "tools/${name}/" relative) ["web" "ado-mcp" "http-runner"]);
      };
      webMcp = (pkgs.lib.importTOML ./tools/web/web-mcp/Cargo.toml).package;
      workspace = (pkgs.lib.importTOML ./Cargo.toml).workspace.package;
      adoMcp = (pkgs.lib.importTOML ./tools/ado-mcp/Cargo.toml).package;
      httpRunner = (pkgs.lib.importTOML ./tools/http-runner/Cargo.toml).package;
    in {
      # web-mcp, the web-mcp plugin's MCP server: `nix build .#web-mcp`.
      web-mcp = pkgs.rustPlatform.buildRustPackage {
        pname = webMcp.name;
        inherit (workspace) version;
        src = workspaceSource;
        cargoLock.lockFile = ./Cargo.lock;
        cargoBuildFlags = ["-p" "web-mcp" "--bin" "web-mcp"];
        cargoTestFlags = ["-p" "web-mcp" "-p" "browser-core"];
        # Test clients load the system trust store even when they only call the local fake server.
        nativeCheckInputs = [pkgs.cacert];
        # Debug checks: the fetch tests' WEB_MCP_TEST_PUBLIC_IP hook exists only in debug builds or the `test-hooks` feature.
        checkType = "debug";
        # The sandbox has no agent-browser, Chrome or display: the tests that start a browser run in crates.yml's rust
        # job instead (docs/adr/0017-tests-use-the-real-thing.md).
        checkFlags = [
          "--skip"
          "search_through_real_chrome_reads_captured_google"
          "--skip"
          "real_chrome_rows_match_the_parser"
          "--skip"
          "a_dropped_server_leaves_no_chrome"
          "--skip"
          "four_engines_fuse_into_one_answer_and_record"
          "--skip"
          "unread_results_are_named_and_a_private_one_is_never_asked"
          "--skip"
          "typing_a_follow_up_falls_back_or_times_out"
          "--skip"
          "no_results_rests_nothing"
          "--skip"
          "a_captcha_rests_its_engine_and_the_others_answer"
          "--skip"
          "brave_s_bot_check_rests_brave"
          "--skip"
          "a_typed_follow_up_that_meets_a_captcha_rests_without_a_load"
          "--skip"
          "consent_clears_by_the_next_search_unless_it_comes_back"
          "--skip"
          "slow_and_offline_engines_are_skipped_without_rest"
          "--skip"
          "queued_searches_each_keep_their_whole_deadline"
          "--skip"
          "rows_reads_numbered_groups_where_the_page_landed"
          "--skip"
          "rows_refuses_a_private_landing_and_a_slow_page"
          "--skip"
          "rows_hostile_pages_return_in_bounded_time"
          "--skip"
          "papers_merge_browser_engines_with_the_apis"
          "--skip"
          "each_session_reads_its_own_tab_and_exit_closes_them"
          "--skip"
          "closed_sessions_leave_no_files_and_others_keep_theirs"
          "--skip"
          "input_reaches_a_hidden_tab_despite_a_proxy"
          "--skip"
          "a_closed_tab_is_replaced_and_closing_it_again_is_no_error"
          "--skip"
          "a_dead_chrome_is_replaced_on_the_next_action"
          "--skip"
          "a_slow_page_ends_the_fallback_at_its_deadline_and_closes_its_tab"
          "--skip"
          "an_open_chrome_cannot_load_is_a_tool_error"
          "--skip"
          "a_screenshot_is_a_jpeg_and_archived"
          "--skip"
          "an_app_shell_is_rendered_archived_and_cached"
          "--skip"
          "render_reads_a_page_that_never_gets_ready"
          "--skip"
          "render_search_without_open_reads_the_tab"
          "--skip"
          "a_hung_page_ends_render_at_its_deadline_and_is_closed_later"
          "--skip"
          "bind_tries_a_failed_tab_again"
          "--skip"
          "batch_once_bails_and_never_rebinds"
          "--skip"
          "batch_once_raises_the_tab_only_for_input"
          "--skip"
          "input_takes_the_front_tab_one_session_at_a_time"
          "--skip"
          "live_starts_once_for_parallel_callers"
          "--skip"
          "same_url_keeps_the_generation"
          "--skip"
          "changed_url_starts_next_generation"
          "--skip"
          "previous_owner_is_closed_first"
          "--skip"
          "fallback_landing_on_private_url_is_dropped"
        ];
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

      # http-runner, the http-runner plugin's MCP server: `nix build .#http-runner`.
      http-runner = pkgs.rustPlatform.buildRustPackage {
        pname = httpRunner.name;
        inherit (workspace) version;
        src = workspaceSource;
        cargoLock.lockFile = ./Cargo.lock;
        cargoBuildFlags = ["-p" "http-runner" "--bin" "http-runner"];
        cargoTestFlags = ["-p" "http-runner"];
        # Test clients load the system trust store even when they only call the local fake server.
        nativeCheckInputs = [pkgs.cacert];
        # Debug checks: the HTTP_RUNNER_OPEN and HTTP_RUNNER_DEADLINE_MS hooks exist only in debug builds.
        checkType = "debug";
        # The sandbox has no agent-browser, Chrome or display: the tests that open a login page in the browser, or
        # start agent-browser as a browser that cannot open, run in crates.yml's rust job instead
        # (docs/adr/0017-tests-use-the-real-thing.md).
        checkFlags = [
          "--skip"
          "a_real_browser_submits_the_login_form"
          "--skip"
          "shows_host_and_each_field"
          "--skip"
          "refuses_missing_token"
          "--skip"
          "refuses_bad_host_and_origin"
          "--skip"
          "refuses_short_or_multiline_value"
          "--skip"
          "refuses_oversized_body"
          "--skip"
          "still_open_then_saved"
          "--skip"
          "saved_page_is_not_replayed_later"
          "--skip"
          "different_ask_replaces_the_open_page"
          "--skip"
          "idle_connection_does_not_block_the_page"
          "--skip"
          "expires_after_its_lifetime"
          "--skip"
          "no_browser_fails_without_the_address"
          "--skip"
          "one_time"
          "--skip"
          "host_without_secrets_needs_confirming"
          "--skip"
          "no_browser_tells_agent_to_ask_the_user"
          "--skip"
          "retype_login_reopens_before_sending"
          "--skip"
          "retype_retried_while_the_page_is_open_sends_nothing"
          "--skip"
          "replaced_page_sends_nothing"
          "--skip"
          "value_not_sent_to_other_host"
          "--skip"
          "deadline_before_send_says_call_again"
          "--skip"
          "run_through_the_tool"
          "--skip"
          "page_address_never_in_a_result"
          "--skip"
          "secrets_and_address_absent_from_stderr"
        ];
        meta = {
          inherit (httpRunner) description;
          mainProgram = "http-runner";
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
