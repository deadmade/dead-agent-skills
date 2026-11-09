//! The `http-runner` binary over stdio: the tool layer, and what reaches the model and stderr.

mod common;

use std::process::Command;

use common::{Carrier, Mcp, ok};
use serde_json::json;

const LOCAL: common::Confirmed = &[("localhost", &[])];
const TYPED: &str = "typed-key-4711";
const TYPING: &[(&str, &str)] = &[("localhost/KEY", TYPED)];
const KEYED: &str = "# @name a\nGET http://localhost:PORT/a\nX-Key: {{$dotenv KEY}}\n";
const LOGIN_AND_SHIP: &str = "# @name login\nGET http://localhost:PORT/login\nX-Key: {{$dotenv KEY}}\n\n###\n# @name ship\nGET http://localhost:PORT/ship\nAuthorization: Bearer {{login.response.body.$.token}}\n";
const SPEC: &str = "openapi: 3.0.3
info: {title: t, version: '1'}
paths:
  /things:
    get: {operationId: listThings}
    post:
      operationId: createThing
      requestBody:
        content:
          application/json:
            example: {name: widget}
";

fn says(result: &str, want: &str) {
    assert!(result.contains(want), "no `{want}` in: {result}");
}

fn never(result: &str, gone: &str) {
    assert!(!result.contains(gone), "`{gone}` in: {result}");
}

fn at(text: &str, carrier: &Carrier) -> String {
    text.replace("PORT", &carrier.port.to_string())
}

/// The one-time part of a page's address.
fn token(address: &str) -> &str {
    address.rsplit('/').next().unwrap()
}

#[test]
fn version_prints() {
    let out = Command::new(env!("CARGO_BIN_EXE_http-runner"))
        .arg("--version")
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8(out.stdout).unwrap(),
        format!("http-runner {}\n", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn tool_list_is_fixed_and_identical_after_calls() {
    let mut mcp = Mcp::start("list", LOCAL, &[]);
    let before = mcp.request("tools/list", json!({}));
    let names: Vec<_> = before["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["generate", "run"]);
    assert!(!before.to_string().contains("requiresUserInteraction"));
    mcp.call("run", json!({"file": "relative.http", "request": "a"}));
    mcp.call("generate", json!({"spec": "a.yaml", "output": "out"}));
    assert_eq!(mcp.request("tools/list", json!({})), before);
}

#[test]
fn run_through_the_tool() {
    let carrier =
        Carrier::start(|s| ok(&json!({"echo": s.header("x-key"), "kept": "visible"}).to_string()));
    let mut mcp = Mcp::start("run", &[], &[]);
    let file = mcp.file(&at(KEYED, &carrier));
    let typing = mcp.type_login(TYPING);
    let result = mcp.call("run", json!({"file": file, "request": "a"}));
    typing.join().unwrap();
    says(&result, "200 OK");
    says(&result, "visible");
    never(&result, TYPED);
    assert_eq!(carrier.seen()[0].header("x-key"), Some(TYPED));
}

#[test]
fn page_address_never_in_a_result() {
    let carrier = Carrier::start(|_| ok("fine"));
    // The page is saved, still open when the call's time is up, and never opened.
    let cases = [
        ("address-saved", None, true, "200 OK"),
        (
            "address-open",
            Some(("HTTP_RUNNER_DEADLINE_MS", "500")),
            false,
            "open and waiting",
        ),
        (
            "address-none",
            Some(("FAKE_BROWSER_FAIL", "1")),
            false,
            "ask the user",
        ),
    ];
    for (tag, env, types, want) in cases {
        let mut mcp = Mcp::start(tag, &[], env.as_slice());
        let file = mcp.file(&at(KEYED, &carrier));
        let typing = types.then(|| mcp.type_login(TYPING));
        let result = mcp.call("run", json!({"file": file, "request": "a"}));
        if let Some(typing) = typing {
            typing.join().unwrap();
        }
        says(&result, want);
        let address = mcp.address(1);
        never(&result, &address);
        never(&result, token(&address));
    }
}

#[test]
fn secrets_and_address_absent_from_stderr() {
    let carrier = Carrier::start(|s| {
        ok(if s.path == "/login" {
            r#"{"token":"login-tok-5"}"#
        } else {
            "fine"
        })
    });
    let mut mcp = Mcp::start("stderr", &[], &[]);
    let file = mcp.file(&at(LOGIN_AND_SHIP, &carrier));
    let typing = mcp.type_login(TYPING);
    says(
        &mcp.call("run", json!({"file": file, "request": "ship"})),
        "200 OK",
    );
    typing.join().unwrap();
    // Both values did pass through the server.
    let seen = carrier.seen();
    assert_eq!(seen[0].header("x-key"), Some(TYPED));
    assert_eq!(seen[1].header("authorization"), Some("Bearer login-tok-5"));
    let address = mcp.address(1);
    let stderr = mcp.finish();
    for gone in [TYPED, "login-tok-5", &address, token(&address)] {
        never(&stderr, gone);
    }
}

#[test]
fn failures_are_results_not_protocol_errors() {
    let mut mcp = Mcp::start("failures", LOCAL, &[]);
    let broken = mcp.file("# @name a\nGET http://localhost:1/a\nX: {{$prompt x}}\n");
    let calls = [
        ("run", json!({"file": broken, "request": "a"}), "line 3"),
        ("run", json!({"file": "t.http", "request": "a"}), "absolute"),
        (
            "generate",
            json!({"spec": "a.yaml", "output": "out"}),
            "absolute",
        ),
    ];
    for (tool, arguments, want) in calls {
        let response = mcp.request_raw("tools/call", json!({"name": tool, "arguments": arguments}));
        assert!(response["error"].is_null(), "{response}");
        says(
            response["result"]["content"][0]["text"].as_str().unwrap(),
            want,
        );
    }
}

#[test]
fn run_refuses_a_file_that_is_not_http() {
    let mut mcp = Mcp::start("not-http", LOCAL, &[]);
    // A parse error quotes the line it fails on, so reading this file would show the marker.
    let logins = mcp.dir.join("logins.json");
    std::fs::write(
        &logins,
        "{\"localhost\":{\"KEY\":\"stored-marker-5e2d9\"}}\n",
    )
    .unwrap();
    let result = mcp.call("run", json!({"file": logins, "request": "a"}));
    says(&result, "must be a .http file");
    never(&result, "stored-marker-5e2d9");
}

#[test]
fn generate_writes_a_file_run_can_parse() {
    let carrier = Carrier::start(|_| ok("made"));
    let mut mcp = Mcp::start("generate", LOCAL, &[]);
    let spec = mcp.dir.join("api.yaml");
    std::fs::write(&spec, SPEC).unwrap();
    let output = mcp.dir.join("out");
    let base = format!("http://localhost:{}", carrier.port);
    let made = mcp.call(
        "generate",
        json!({"spec": spec, "output": output, "base_url": base}),
    );
    let written = output.join("api.http");
    says(&made, &written.display().to_string());
    says(&made, "with a body: 1");
    let result = mcp.call("run", json!({"file": written, "request": "createThing"}));
    says(&result, "200 OK");
    let sent = &carrier.seen()[0];
    assert_eq!(
        (sent.method.as_str(), sent.path.as_str()),
        ("POST", "/things")
    );
    let body: serde_json::Value = serde_json::from_str(&sent.body).unwrap();
    assert_eq!(body, json!({"name": "widget"}));
}
