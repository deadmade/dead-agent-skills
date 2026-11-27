mod common;

use std::time::Duration;

use base64::Engine as _;
use common::{Fixture, Resp, ado, fixture};
use serde_json::json;

/// `repo_list project=P` asks for the project first (through the crate), then for its repos.
const ROUTE: &str = "/tfs/Coll/_apis/projects/P";
const REPOS: &str = "/tfs/Coll/p1/_apis/git/repositories";
const PAT_LINE: &str = "Azure DevOps rejected the PAT (expired or wrong); set a new one with /plugin configure mcp-azure";

fn projects() -> Resp {
    Resp::json(&json!({"id": "p1", "name": "P", "state": "wellFormed",
        "revision": 7, "visibility": "private", "lastUpdateTime": "2025-11-04T10:12:33.47Z"}))
}

/// `repo_list`'s answer to `repos.json`, sorted by name.
const REPO_LINES: &str = "Empty  default: none\nR  default: main\nTools  default: develop";

/// Calls `repo_list project=P` against `fx` (with its repos routed) and returns `(isError, text)`.
fn repo_list(fx: &Fixture) -> (bool, String) {
    fx.route(REPOS, vec![fixture("repos.json")]);
    ado(fx, &[]).call("repo_list", json!({"project": "P"}))
}

/// Requests for the project.
fn project_hits(fx: &Fixture) -> usize {
    fx.requests()
        .iter()
        .filter(|r| r.path.starts_with(ROUTE))
        .count()
}

#[test]
fn sends_auth_version_and_suppress() {
    let fx = Fixture::start();
    // `pr_list` with project and repo: the repo, then its PRs with the crate's `$top`.
    fx.route(
        "/tfs/Coll/P/_apis/git/repositories/R",
        vec![fixture("repo.json")],
    );
    let prs = "/tfs/Coll/b5d2a1e7-6c40-4f8b-8a3d-2e9c7f10a455/_apis/git/repositories/3f2c9a14-1b7e-4c55-9d1a-6a1f0c2b7e01/pullrequests";
    fx.route(prs, vec![fixture("pr-list.json")]);
    let (err, text) = ado(&fx, &[]).call("pr_list", json!({"project": "P", "repo": "R"}));
    assert!(!err, "{text}");
    assert!(text.starts_with('!'), "{text}");
    let reqs = fx.requests();
    assert_eq!(reqs.len(), 2);
    let basic = base64::engine::general_purpose::STANDARD.encode(":test-pat");
    for r in &reqs {
        assert_eq!(
            r.header("authorization"),
            Some(format!("Basic {basic}").as_str())
        );
        assert!(
            r.path
                .split(['?', '&'])
                .any(|p| p == "api-version=7.1-preview"),
            "{}",
            r.path
        );
        assert_eq!(r.header("x-tfs-fedauthredirect"), Some("Suppress"));
        assert!(r.header("user-agent").unwrap().starts_with("ado-mcp/"));
    }
    assert!(reqs[1].path.starts_with(prs), "{}", reqs[1].path);
    assert!(reqs[1].path.contains("top=21"), "{}", reqs[1].path);
}

#[test]
fn maps_401_without_secret() {
    let fx = Fixture::start();
    fx.route(
        ROUTE,
        vec![Resp::new(401, "text/plain", "Basic OnRlc3QtcGF0")],
    );
    let (err, text) = repo_list(&fx);
    assert!(err);
    assert_eq!(text, PAT_LINE);
    assert!(!text.contains("test-pat"));
    assert_eq!(fx.requests().len(), 1, "a 401 must not be retried");
}

#[test]
fn html_203_is_one_line() {
    let fx = Fixture::start();
    fx.route(
        ROUTE,
        vec![Resp::new(
            203,
            "text/html",
            "<html><body>Sign in</body></html>",
        )],
    );
    let (err, text) = repo_list(&fx);
    assert!(err);
    assert_eq!(text, PAT_LINE);
}

#[test]
fn maps_403_scope() {
    let fx = Fixture::start();
    fx.route(
        ROUTE,
        vec![Resp::new(403, "application/json", r#"{"message":"no"}"#)],
    );
    let (err, text) = repo_list(&fx);
    assert!(err);
    assert_eq!(
        text,
        "the PAT may not do this: it needs the Project and Team (Read) scope"
    );
}

/// Search needs the scope of what it searches.
#[test]
fn maps_403_search_scope() {
    let fx = Fixture::start();
    fx.route(
        "/tfs/Coll/_apis/search/workitemsearchresults",
        vec![Resp::new(403, "application/json", r#"{"message":"no"}"#)],
    );
    let (err, text) = ado(&fx, &[]).call("search", json!({"kind": "wi", "text": "x"}));
    assert!(err, "{text}");
    assert_eq!(
        text,
        "the PAT may not do this: it needs the Code, Work Items or Wiki (Read) scope"
    );
}

#[test]
fn maps_403_wiki_scope() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![projects()]);
    fx.route(
        "/tfs/Coll/p1/_apis/wiki/wikis",
        vec![Resp::new(403, "application/json", r#"{"message":"no"}"#)],
    );
    let (err, text) = ado(&fx, &[]).call("wiki", json!({"project": "P"}));
    assert!(err, "{text}");
    assert_eq!(
        text,
        "the PAT may not do this: it needs the Wiki (Read) scope"
    );
}

#[test]
fn retry_after_once() {
    let fx = Fixture::start();
    fx.route(
        ROUTE,
        vec![
            Resp::new(429, "text/plain", "slow down").header("Retry-After", "1"),
            projects(),
        ],
    );
    let (err, text) = repo_list(&fx);
    assert!(!err, "{text}");
    assert_eq!(text, REPO_LINES);
    assert_eq!(project_hits(&fx), 2);
}

#[test]
fn second_429_gives_up() {
    let fx = Fixture::start();
    fx.route(
        ROUTE,
        vec![Resp::new(429, "text/plain", "slow").header("Retry-After", "0")],
    );
    let (err, text) = repo_list(&fx);
    assert!(err);
    assert_eq!(
        text,
        "the server is throttling requests; try again in a minute"
    );
    assert_eq!(fx.requests().len(), 2);
}

#[test]
fn server_error_line() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![Resp::new(503, "text/plain", "down")]);
    assert_eq!(
        repo_list(&fx),
        (true, "the server failed (503); try again".into())
    );
}

#[test]
fn refused_line_carries_the_message() {
    let fx = Fixture::start();
    fx.route(
        ROUTE,
        vec![Resp::new(
            400,
            "application/json",
            r#"{"message":"TF401027: You need the permission."}"#,
        )],
    );
    let (err, text) = repo_list(&fx);
    assert!(err);
    assert_eq!(
        text,
        "the server refused it: TF401027: You need the permission."
    );
}

#[test]
fn not_json_is_one_line() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![Resp::new(200, "text/html", "<html>hi</html>")]);
    assert_eq!(
        repo_list(&fx),
        (
            true,
            "unexpected answer from the server (200, text/html)".into()
        )
    );
}

#[test]
fn timeout_line() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![projects().delay(Duration::from_secs(3))]);
    let (err, text) =
        ado(&fx, &[("ADO_TIMEOUT_MS", "300")]).call("repo_list", json!({"project": "P"}));
    assert!(err);
    assert!(text.contains("didn't answer"), "{text}");
}

#[test]
fn unreachable_names_the_host() {
    // A port that was just free and has no listener now.
    let port = std::net::TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let org = format!("http://127.0.0.1:{port}/tfs/Coll/");
    let dir = common::tempdir();
    let mut mcp = common::Mcp::start_with(
        dir.clone(),
        &[
            ("ADO_ORG_URL", org.as_str()),
            ("ADO_PAT", "test-pat"),
            ("ADO_PROJECT_DIR", dir.to_str().unwrap()),
        ],
    );
    let (err, text) = mcp.call("repo_list", json!({"project": "P"}));
    assert!(err);
    assert!(text.starts_with("can't reach 127.0.0.1: "), "{text}");
    assert!(!text.contains("test-pat"));
}

#[test]
fn root_hosted_collection() {
    let fx = Fixture::start();
    fx.route("/Coll/_apis/projects/P", vec![projects()]);
    fx.route(
        "/Coll/p1/_apis/git/repositories",
        vec![fixture("repos.json")],
    );
    let org = fx.url("/Coll/");
    let dir = common::tempdir();
    let mut mcp = common::Mcp::start_with(
        dir.clone(),
        &[
            ("ADO_ORG_URL", org.as_str()),
            ("ADO_PAT", "test-pat"),
            ("ADO_PROJECT_DIR", dir.to_str().unwrap()),
        ],
    );
    let (err, text) = mcp.call("repo_list", json!({"project": "P"}));
    assert!(!err, "{text}");
    assert_eq!(text, REPO_LINES);
    let reqs = fx.requests();
    assert_eq!(reqs.len(), 2);
    for r in reqs {
        assert!(
            r.path.starts_with("/Coll/") && !r.path.contains("//"),
            "{}",
            r.path
        );
    }
}

#[test]
fn missing_field_names_it() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![Resp::json(&json!({"id": "p1", "name": "P"}))]);
    let (err, text) = repo_list(&fx);
    assert!(err, "{text}");
    assert!(
        text.starts_with("unexpected answer from the server") && text.contains("visibility"),
        "{text}"
    );
}

#[test]
fn no_resend_on_503() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![Resp::new(503, "text/plain", "down")]);
    let (err, _) = repo_list(&fx);
    assert!(err);
    assert_eq!(fx.requests().len(), 1);
}

#[test]
fn no_resend_on_dropped_connection() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![Resp::hang_up()]);
    let (err, text) = repo_list(&fx);
    assert!(err);
    assert!(text.starts_with("can't reach 127.0.0.1: "), "{text}");
    assert_eq!(fx.requests().len(), 1);
}

/// A page of projects as the server answers it.
fn project_page(names: &[String]) -> Resp {
    let value: Vec<_> = names
        .iter()
        .map(|n| json!({"id": format!("id-{n}"), "name": n, "state": "wellFormed", "visibility": "private"}))
        .collect();
    Resp::json(&json!({"count": value.len(), "value": value}))
}

const PROJECTS: &str = "/tfs/Coll/_apis/projects";

/// `project_list` pages with `$top`/`$skip` until a page adds nothing, and names them sorted without regard to case.
#[test]
fn project_list_names_every_project() {
    let fx = Fixture::start();
    // A full first page in reverse order, so only the sort puts it right, then a short one and an empty one.
    let first: Vec<String> = (0..100).rev().map(|i| format!("p{i:03}")).collect();
    let second: Vec<String> = ["beta", "Alpha", "Gamma"].map(String::from).into();
    fx.route(
        PROJECTS,
        vec![
            project_page(&first),
            project_page(&second),
            project_page(&[]),
        ],
    );
    let (err, text) = ado(&fx, &[]).call("project_list", json!({}));
    assert!(!err, "{text}");
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 103);
    assert_eq!(&lines[..4], ["Alpha", "beta", "Gamma", "p000"]);
    assert_eq!(lines[102], "p099");
    let reqs = fx.requests();
    assert_eq!(reqs.len(), 3);
    assert!(reqs[0].path.contains("%24top=100"), "{}", reqs[0].path);
    assert!(reqs[1].path.contains("%24skip=100"), "{}", reqs[1].path);
    assert!(reqs[2].path.contains("%24skip=103"), "{}", reqs[2].path);
}

/// A server that hands out fewer than asked for still gets read to the end: `$skip` follows what came back.
#[test]
fn project_list_short_pages() {
    let fx = Fixture::start();
    let page = |from: usize| -> Vec<String> { (from..from + 2).map(|i| format!("p{i}")).collect() };
    fx.route(
        PROJECTS,
        vec![
            project_page(&page(0)),
            project_page(&page(2)),
            project_page(&[]),
        ],
    );
    let (err, text) = ado(&fx, &[]).call("project_list", json!({}));
    assert!(!err, "{text}");
    assert_eq!(
        text,
        "p0
p1
p2
p3"
    );
    let reqs = fx.requests();
    assert_eq!(reqs.len(), 3);
    assert!(reqs[1].path.contains("%24skip=2"), "{}", reqs[1].path);
    assert!(reqs[2].path.contains("%24skip=4"), "{}", reqs[2].path);
}

/// A server that ignores `$skip` repeats its first page: the repeat ends the listing, with no duplicates.
#[test]
fn project_list_ignored_skip() {
    let fx = Fixture::start();
    let first: Vec<String> = (0..100).map(|i| format!("p{i:03}")).collect();
    fx.route(PROJECTS, vec![project_page(&first)]);
    let (err, text) = ado(&fx, &[]).call("project_list", json!({}));
    assert!(!err, "{text}");
    assert_eq!(text.lines().count(), 100);
    assert_eq!(fx.requests().len(), 2);
}

const ALICE: &str = "7c1e4d52-93ab-4f06-b1d8-5a2f6e0c9d13";
const BOB: &str = "2d9e7b10-5f21-4c8a-a0b3-9c4e1d6f7a22";
const PROJ_ID: &str = "b5d2a1e7-6c40-4f8b-8a3d-2e9c7f10a455";
const REPO_ID: &str = "3f2c9a14-1b7e-4c55-9d1a-6a1f0c2b7e01";
const SID: &str = "S-1-5-21-1004336348-1177238915-682003330-1100";

/// An identity as git answers carry it, on the server `base`.
fn person(base: &str, id: &str, name: &str, email: &str) -> serde_json::Value {
    json!({"displayName": name, "id": id, "uniqueName": email,
        "descriptor": format!("win.Uy0xLTUtMjEtMTAwNDMzNjM0OC0{}", &id[..4]),
        "url": format!("{base}/tfs/Acme/_apis/Identities/{id}"),
        "imageUrl": format!("{base}/tfs/Acme/_api/_common/identityImage?id={id}"),
        "_links": {"avatar": {"href": format!("{base}/tfs/Acme/_apis/GraphProfile/MemberAvatars/{id}")}}})
}

/// Repo `url-tools` in project `url`: the project is named like a JSON key and is a prefix of the repo's name.
fn tools_repo(base: &str) -> serde_json::Value {
    json!({"id": REPO_ID, "name": "url-tools",
        "url": format!("{base}/tfs/Acme/{PROJ_ID}/_apis/git/repositories/{REPO_ID}"),
        "project": {"id": PROJ_ID, "name": "url", "state": "wellFormed", "revision": 41,
            "visibility": "private", "lastUpdateTime": "2025-11-04T10:12:33.47Z",
            "url": format!("{base}/tfs/Acme/_apis/projects/{PROJ_ID}")},
        "defaultBranch": "refs/heads/main",
        "remoteUrl": format!("{base}/tfs/Acme/url/_git/url-tools"),
        "sshUrl": "ssh://127.0.0.1:22/tfs/Acme/url/_git/url-tools",
        "webUrl": format!("{base}/tfs/Acme/url/_git/url-tools"), "isDisabled": false})
}

/// Every string value in `v`, keys left out.
fn strings(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::String(s) => out.push(s.clone()),
        serde_json::Value::Array(a) => a.iter().for_each(|x| strings(x, out)),
        serde_json::Value::Object(o) => o.values().for_each(|x| strings(x, out)),
        _ => {}
    }
}

/// The answers `capture_writes_masked_answers` reads: real-shaped identities, and the collection `Acme`, project
/// `url` and repo `url-tools` in paths and values.
fn capture_routes(fx: &Fixture) {
    let base = fx.url("");
    let alice = person(&base, ALICE, "Alice Example", "alice@corp.example");
    let mut bob = person(&base, BOB, "Bob Roe", "bob.roe@corp.example");
    bob["vote"] = json!(10);
    fx.route(
        "/tfs/Acme/_apis/connectionData",
        vec![Resp::json(&json!({"authenticatedUser": {"id": ALICE,
            "descriptor": format!("Microsoft.TeamFoundation.Identity;{SID}"),
            "subjectDescriptor": "win.Uy0xLTUtMjEtMTAwNDMzNjM0OC0xMTAw",
            "providerDisplayName": "Alice Example", "isActive": true,
            "properties": {"Account": {"$type": "System.String", "$value": "CORP\\alice"}}},
            "deploymentType": "onPremises"}))],
    );
    fx.route(
        "/tfs/Acme/url/_apis/git/repositories/url-tools",
        vec![Resp::json(&tools_repo(&base))],
    );
    let pr_url =
        format!("{base}/tfs/Acme/{PROJ_ID}/_apis/git/repositories/{REPO_ID}/pullRequests/412");
    fx.route(
        &format!("/tfs/Acme/{PROJ_ID}/_apis/git/repositories/{REPO_ID}/pullrequests"),
        vec![Resp::json(
            &json!({"count": 1, "value": [{"pullRequestId": 412, "codeReviewId": 1412,
            "status": "active", "isDraft": false, "title": "Retry login",
            "description": "Asked by Alice Example (alice@corp.example) in url-tools.",
            "createdBy": alice, "creationDate": "2026-03-02T09:30:11.123Z",
            "sourceRefName": "refs/heads/feature/login-retry", "targetRefName": "refs/heads/main",
            "mergeStatus": "succeeded", "repository": tools_repo(&base), "reviewers": [bob],
            "url": pr_url, "_links": {"self": {"href": pr_url}}, "supportsIterations": true}]}),
        )],
    );
    fx.route(
        "/tfs/Acme/_apis/projects/url",
        vec![Resp::json(&tools_repo(&base)["project"])],
    );
    let builds = format!("/tfs/Acme/{PROJ_ID}/_apis/build/builds/77");
    fx.route(
        &format!("{builds}/timeline/"),
        vec![fixture("timeline.json")],
    );
    fx.route(&format!("{builds}/logs"), vec![fixture("logs.json")]);
    let log = format!(
        "2026-03-05T10:00:00.0000000Z ##[error]push to {base}/tfs/Acme/url/_git/url-tools failed for Alice Example <alice@corp.example>\r\n"
    );
    fx.route(
        &format!("{builds}/logs/4"),
        vec![Resp::new(200, "text/plain", log)],
    );
}

/// One captured file: its name's shape, no leak in name or body, and a JSON body that still fits the crate model.
fn check_capture(name: &str, body: &str, leaks: &[&str]) {
    use azure_devops_rust_api::{build, core, git};
    let (stem, ext) = name.rsplit_once('.').unwrap();
    let hash = stem.rsplit_once('-').unwrap().1;
    assert!(
        stem.starts_with("GET-") && hash.len() == 8 && hash.bytes().all(|b| b.is_ascii_hexdigit()),
        "{name}"
    );
    for leak in leaks {
        let low = leak.to_ascii_lowercase();
        assert!(
            !name.to_ascii_lowercase().contains(&low),
            "{leak} in {name}"
        );
        assert!(
            !body.to_ascii_lowercase().contains(&low),
            "{leak} in {name}:\n{body}"
        );
    }
    if ext == "txt" {
        return;
    }
    assert_eq!(ext, "json", "{name}");
    let v: serde_json::Value = serde_json::from_str(body).unwrap();
    let mut values = Vec::new();
    strings(&v, &mut values);
    for s in values {
        assert!(
            !s.to_ascii_lowercase().contains("url"),
            "project name in {name}: {s}"
        );
    }
    let check: fn(&[u8]) -> serde_json::Result<()> = if name.contains("connectionData") {
        |_| Ok(())
    } else if name.contains("_pullrequests-") {
        |b| serde_json::from_slice::<git::models::GitPullRequestList>(b).map(drop)
    } else if name.contains("_repositories_") {
        |b| serde_json::from_slice::<git::models::GitRepository>(b).map(drop)
    } else if name.contains("_projects_") {
        |b| serde_json::from_slice::<core::models::TeamProject>(b).map(drop)
    } else if name.contains("_timeline_") {
        |b| serde_json::from_slice::<build::models::Timeline>(b).map(drop)
    } else if name.contains("_logs-") {
        |b| serde_json::from_slice::<build::models::BuildLogList>(b).map(drop)
    } else {
        panic!("unexpected capture {name}")
    };
    check(body.as_bytes()).unwrap_or_else(|e| panic!("{name}: {e}"));
}

/// `pr_list` (with `connectionData`) and `pipeline_log` (a text answer) in the collection `Acme`, `extra` on top.
fn capture_calls(fx: &Fixture, extra: &[(&str, &str)]) -> [(bool, String); 2] {
    let dir = common::tempdir();
    let org = fx.url("/tfs/Acme/");
    let mut env = vec![
        ("ADO_ORG_URL", org.as_str()),
        ("ADO_PAT", "test-pat"),
        ("ADO_PROJECT_DIR", dir.to_str().unwrap()),
    ];
    env.extend_from_slice(extra);
    let mut mcp = common::Mcp::start_with(dir.clone(), &env);
    let prs = json!({"project": "url", "repo": "url-tools", "creator": "me"});
    [
        mcp.call("pr_list", prs),
        mcp.call("pipeline_log", json!({"project": "url", "run": 77})),
    ]
}

/// With `ADO_CAPTURE_DIR` set, each answer lands in one file, its identities, names and host masked, its keys kept.
#[test]
fn capture_writes_masked_answers() {
    let fx = Fixture::start();
    capture_routes(&fx);
    let plain = capture_calls(&fx, &[]);
    let before = fx.requests().len();
    let out = common::tempdir().join("capture");
    let captured = capture_calls(&fx, &[("ADO_CAPTURE_DIR", out.to_str().unwrap())]);
    for (p, c) in plain.iter().zip(&captured) {
        assert!(!p.0, "{}", p.1);
        assert_eq!(p, c, "the caller gets the unmasked answer");
    }
    assert!(captured[0].1.contains("Retry login"), "{}", captured[0].1);

    let mut names: Vec<String> = std::fs::read_dir(&out)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    assert_eq!(names.len(), fx.requests().len() - before, "{names:?}");
    let port = format!(":{}", fx.addr.port());
    let leaks = [
        "alice",
        "Bob Roe",
        "bob.roe",
        "corp.example",
        ALICE,
        BOB,
        SID,
        "Uy0xLTUtMjEt",
        "Acme",
        "url-tools",
        "-tools",
        "test-pat",
        "127.0.0.1",
        &port,
    ];
    let file = |prefix: &str| -> (String, String) {
        let n = names
            .iter()
            .find(|n| n.starts_with(prefix))
            .unwrap_or_else(|| panic!("{prefix} in {names:?}"));
        (n.clone(), std::fs::read_to_string(out.join(n)).unwrap())
    };
    for name in &names {
        let body = std::fs::read_to_string(out.join(name)).unwrap();
        check_capture(name, &body, &leaks);
    }

    let (_, conn) = file("GET-_apis_connectionData-");
    let conn: serde_json::Value = serde_json::from_str(&conn).unwrap();
    let me = &conn["authenticatedUser"];
    assert_eq!(me["providerDisplayName"], "User 1");
    assert_eq!(me["id"], "00000000-0000-0000-0000-000000000001");
    assert_eq!(me["properties"]["Account"]["$value"], "User 1");
    let (_, repo) = file("GET-Project1__apis_git_repositories_Repo1-");
    let repo: serde_json::Value = serde_json::from_str(&repo).unwrap();
    assert_eq!(repo["name"], "Repo1");
    assert_eq!(
        repo["project"]["name"], "Project1",
        "the key `url` survives, the name doesn't"
    );
    assert_eq!(repo["id"], REPO_ID, "other GUIDs stay");
    assert_eq!(
        repo["remoteUrl"],
        "http://dev.example/tfs/Coll/Project1/_git/Repo1"
    );
    let (_, prs) = file(&format!(
        "GET-{PROJ_ID}__apis_git_repositories_{REPO_ID}_pullrequests-"
    ));
    let prs: serde_json::Value = serde_json::from_str(&prs).unwrap();
    let pr = &prs["value"][0];
    assert_eq!(pr["createdBy"]["displayName"], "User 1");
    assert_eq!(pr["createdBy"]["uniqueName"], "user1@example.com");
    assert_eq!(
        pr["createdBy"]["imageUrl"],
        "http://dev.example/tfs/Coll/_api/_common/identityImage?id=00000000-0000-0000-0000-000000000001"
    );
    assert_eq!(pr["reviewers"][0]["displayName"], "User 2");
    assert_eq!(pr["reviewers"][0]["uniqueName"], "user2@example.com");
    assert_eq!(
        pr["description"],
        "Asked by User 1 (user1@example.com) in Repo1."
    );
    let (log_name, log) = file(&format!("GET-{PROJ_ID}__apis_build_builds_77_logs_4-"));
    assert_eq!(log_name.rsplit_once('.').map(|(_, e)| e), Some("txt"));
    assert!(
        log.contains("push to http://dev.example/tfs/Coll/Project1/_git/Repo1 failed for User 1 <user1@example.com>"),
        "{log}"
    );
}

/// A capture that can't be written (the folder is a file) leaves the caller's answer as it was.
#[test]
fn capture_failure_keeps_the_answer() {
    let fx = Fixture::start();
    fx.route(ROUTE, vec![projects()]);
    let blocked = common::tempdir().join("not-a-folder");
    std::fs::write(&blocked, "kept").unwrap();
    fx.route(REPOS, vec![fixture("repos.json")]);
    let (err, text) = ado(&fx, &[("ADO_CAPTURE_DIR", blocked.to_str().unwrap())])
        .call("repo_list", json!({"project": "P"}));
    assert!(!err, "{text}");
    assert_eq!(text, REPO_LINES);
    assert_eq!(std::fs::read_to_string(&blocked).unwrap(), "kept");
}

/// None visible: the PAT's user may lack access, so the line says whose view it is.
#[test]
fn project_list_none() {
    let fx = Fixture::start();
    fx.route(PROJECTS, vec![project_page(&[])]);
    let (err, text) = ado(&fx, &[]).call("project_list", json!({}));
    assert!(!err, "{text}");
    assert_eq!(text, "no projects visible to this PAT");
}
