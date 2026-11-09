//! `run::run` through the library, against a fake carrier on loopback.

mod common;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Barrier, OnceLock};
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use common::{Seen, closed_port, ok, reply, rig, rig_with, submit};
use http_runner::mask::{Place, escape};
use http_runner::run::{self, RunArgs};
use http_runner::store::Store;

const CALL_AGAIN: &str = "call `run` again";
const LOCAL: common::Confirmed = &[("localhost", &[]), ("127.0.0.1", &[])];

fn says(result: &str, want: &str) {
    assert!(result.contains(want), "no `{want}` in: {result}");
}

fn never(result: &str, gone: &str) {
    assert!(!result.contains(gone), "`{gone}` in: {result}");
}

fn absent_from_saved(rig: &common::Rig, gone: &str) {
    for (path, text) in rig.saved() {
        assert!(!text.contains(gone), "`{gone}` in {}", path.display());
    }
}

const CHAIN: &str = "\
# @name a
GET http://localhost:PORT/a

###
# @name b
GET http://localhost:PORT/b?v={{a.response.body.$.v}}

###
# @name c
GET http://localhost:PORT/c?v={{b.response.body.$.v}}
";

#[tokio::test]
async fn chain_runs_in_order_and_every_time() {
    let rig = rig("chain", LOCAL, |_| ok(r#"{"v":"seen"}"#));
    let file = rig.file(CHAIN);
    for _ in 0..2 {
        says(&rig.run(&file, "c").await, "200 OK");
    }
    assert_eq!(
        rig.carrier.paths(),
        [
            "/a",
            "/b?v=seen",
            "/c?v=seen",
            "/a",
            "/b?v=seen",
            "/c?v=seen"
        ]
    );
}

#[tokio::test]
async fn cycle_is_an_error() {
    let rig = rig("cycle", LOCAL, |_| ok(""));
    let file = rig.file(
        "# @name a\nGET http://localhost:PORT/{{b.response.body.$.v}}\n\n###\n# @name b\nGET http://localhost:PORT/{{a.response.body.$.v}}\n",
    );
    let result = rig.run(&file, "a").await;
    says(&result, "cycle");
    says(&result, "`a`");
    assert_eq!(rig.carrier.connections(), 0);
}

#[tokio::test]
async fn unknown_request_is_an_error() {
    let rig = rig("unknown", LOCAL, |_| ok(""));
    let file = rig.file(
        "# @name a\nGET http://localhost:PORT/{{gone.response.body.$.v}}\n\n###\n# @name b\nGET http://localhost:PORT/b\n",
    );
    let result = rig.run(&file, "nope").await;
    says(&result, "`nope`");
    says(&result, "a, b");
    let result = rig.run(&file, "a").await;
    says(&result, "`gone`");
    says(&result, "line 2");
    assert_eq!(rig.carrier.connections(), 0);
}

#[tokio::test]
async fn parse_error_names_the_line() {
    let rig = rig("parse", LOCAL, |_| ok(""));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\nX: {{$prompt x}}\n");
    let result = rig.run(&file, "a").await;
    says(&result, "line 3");
    says(&result, "{{$prompt x}}");
}

#[tokio::test]
async fn relative_file_is_refused() {
    let rig = rig("relative", LOCAL, |_| ok(""));
    let result = run::run(
        &rig.ctx,
        RunArgs {
            file: PathBuf::from("relative.http"),
            request: "a".into(),
            retype_login: false,
        },
    )
    .await;
    says(&result, "absolute");
}

#[tokio::test]
async fn http_only_for_loopback() {
    let rig = rig("plain", LOCAL, |_| ok("answer"));
    let file = rig.file(
        "# @name out\nGET http://a.example/x\n\n###\n# @name one\nGET http://localhost:PORT/x\n\n###\n# @name two\nGET http://127.0.0.1:PORT/x\n",
    );
    let refused = rig.run(&file, "out").await;
    says(&refused, "line 2");
    says(&refused, "https");
    assert_eq!(rig.carrier.connections(), 0);
    for name in ["one", "two"] {
        says(&rig.run(&file, name).await, "answer");
    }
    assert_eq!(rig.carrier.seen().len(), 2);
}

#[tokio::test]
async fn no_redirect_followed() {
    let rig = rig("redirect", LOCAL, |_| {
        reply("302 Found", &[("Location", "/elsewhere")], "")
    });
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    let result = rig.run(&file, "a").await;
    says(&result, "302 Found");
    says(&result, "/elsewhere");
    assert_eq!(rig.carrier.paths(), ["/a"]);
}

const FAULT: &str = "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><soap:Fault><faultcode>soap:Client</faultcode><faultstring>depot unknown</faultstring></soap:Fault></soap:Body></soap:Envelope>";

#[tokio::test]
async fn http_error_and_soap_fault_are_results() {
    let rig = rig("errors", LOCAL, |s: &Seen| {
        if s.path == "/gone" {
            reply("404 Not Found", &[], "no such order")
        } else {
            reply("500 Internal Server Error", &[], FAULT)
        }
    });
    let file = rig.file(
        "# @name gone\nGET http://localhost:PORT/gone\n\n###\n# @name fault\nPOST http://localhost:PORT/soap\n",
    );
    let result = rig.run(&file, "gone").await;
    says(&result, "404 Not Found");
    says(&result, "no such order");
    let result = rig.run(&file, "fault").await;
    says(&result, "500 Internal Server Error");
    says(&result, "depot unknown");
    assert_eq!(rig.saved_for("fault").len(), 1);
}

#[tokio::test]
async fn unconfirmed_host_is_not_sent() {
    let rig = rig_with("unconfirmed", &["--fail"], &[], |_| ok(""));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    rig.run(&file, "a").await;
    rig.address(1).await;
    assert_eq!(rig.carrier.connections(), 0);
}

#[tokio::test]
async fn host_without_secrets_needs_confirming() {
    let rig = rig("confirming", &[], |_| ok("answer"));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    let running = rig.start(&file, "a", false);
    let page = rig.address(1).await;
    assert_eq!(rig.carrier.connections(), 0);
    submit(&page, &[]);
    says(&running.await.unwrap(), "answer");
    assert!(rig.store.is_confirmed("localhost").unwrap());
}

#[tokio::test]
async fn no_browser_tells_agent_to_ask_the_user() {
    let rig = rig_with("nobrowser", &["--fail"], &[], |_| ok(""));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    let result = rig.run(&file, "a").await;
    says(&result, "ask the user");
    says(&result, "localhost");
    let page = rig.address(1).await;
    never(&result, &page);
    never(&result, url::Url::parse(&page).unwrap().path());
}

const KEYED: &str = "# @name a\nGET http://localhost:PORT/a\nX-Key: {{$dotenv KEY}}\n";

#[tokio::test]
async fn retype_login_reopens_before_sending() {
    let rig = rig(
        "retype",
        &[("localhost", &[("KEY", "old-key-value")])],
        |_| ok("answer"),
    );
    let file = rig.file(KEYED);
    let running = rig.start(&file, "a", true);
    let page = rig.address(1).await;
    assert_eq!(rig.carrier.connections(), 0);
    submit(&page, &[("localhost/KEY", "new-key-value")]);
    says(&running.await.unwrap(), "answer");
    assert_eq!(rig.carrier.seen()[0].header("x-key"), Some("new-key-value"));
}

#[tokio::test]
async fn retype_retried_while_the_page_is_open_sends_nothing() {
    let rig = rig(
        "retype-open",
        &[("localhost", &[("KEY", "old-key-value")])],
        |_| ok("answer"),
    )
    .deadline(Duration::from_millis(300));
    let file = rig.file(KEYED);
    let first = rig.start(&file, "a", true).await.unwrap();
    says(&first, "Keep `retype_login` on");
    says(&first, CALL_AGAIN);
    let page = rig.address(1).await;
    let second = rig.start(&file, "a", true).await.unwrap();
    says(&second, "Keep `retype_login` on");
    assert_eq!(rig.carrier.connections(), 0);
    // A retry that had replaced the page would leave this address answering 404.
    submit(&page, &[("localhost/KEY", "new-key-value")]);
}

#[tokio::test]
async fn replaced_page_sends_nothing() {
    let rig = rig("replaced", &[], |_| ok("answer"));
    let file = rig.file(
        "# @name a\nGET http://localhost:PORT/a\nX-Key: {{$dotenv KEY}}\n\n###\n# @name b\nGET http://127.0.0.1:PORT/b\nX-Key: {{$dotenv KEY}}\n",
    );
    let first = rig.start(&file, "a", false);
    rig.address(1).await;
    let second = rig.start(&file, "b", false);
    let page = rig.address(2).await;
    submit(&page, &[("127.0.0.1/KEY", "second-value")]);
    let replaced = first.await.unwrap();
    says(&replaced, "replaced");
    says(&replaced, CALL_AGAIN);
    says(&second.await.unwrap(), "answer");
    assert_eq!(rig.carrier.paths(), ["/b"]);
}

const DPD_FILE: &str = r#"# @name login
POST http://localhost:PORT/login
Content-Type: text/xml; charset=utf-8

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><getAuth><delisId>{{$dotenv DPD_USER}}</delisId><password>{{$dotenv DPD_PASSWORD}}</password></getAuth></soap:Body></soap:Envelope>

###
# @name ship
POST http://localhost:PORT/ship
Content-Type: text/xml; charset=utf-8

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header><authentication><delisId>{{$dotenv DPD_USER}}</delisId><authToken>{{login.response.body.//authToken}}</authToken></authentication></soap:Header><soap:Body><storeOrders/></soap:Body></soap:Envelope>
"#;
const DPD_LOGIN: &str = "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><ns2:getAuthResponse xmlns:ns2=\"http://dpd.com/common/service/types/LoginService/2.0\"><return><delisId>sandbox</delisId><customerUid>sandbox</customerUid><authToken>dpd-tok-3141</authToken><depot>0163</depot></return></ns2:getAuthResponse></soap:Body></soap:Envelope>";
const DPD_ORDER: &str = "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><ns2:storeOrdersResponse xmlns:ns2=\"http://dpd.com/common/service/types/ShipmentService/4.4\"><orderResult><shipmentResponses><mpsId>MPS0163</mpsId></shipmentResponses></orderResult></ns2:storeOrdersResponse></soap:Body></soap:Envelope>";

fn dpd(s: &Seen) -> String {
    match s.path.as_str() {
        "/login" => ok(DPD_LOGIN),
        _ if s.body.contains("<authToken>dpd-tok-3141</authToken>") => ok(DPD_ORDER),
        _ => reply("500 Internal Server Error", &[], FAULT),
    }
}

const DPD_LOGINS: common::Confirmed = &[(
    "localhost",
    &[("DPD_USER", "dpd-user-7"), ("DPD_PASSWORD", "dpd-pass-7")],
)];

#[tokio::test]
async fn dpd_login_token_reaches_soap_header() {
    let rig = rig("dpd", DPD_LOGINS, dpd);
    let file = rig.file(DPD_FILE);
    let result = rig.run(&file, "ship").await;
    says(&result, "storeOrdersResponse");
    says(&result, "MPS0163");
    never(&result, "dpd-tok-3141");
    assert_eq!(rig.carrier.paths(), ["/login", "/ship"]);
}

#[tokio::test]
async fn xml_special_password() {
    let rig = rig("xml", &[("localhost", &[("PASSWORD", "p&<\"x1")])], |_| {
        ok("")
    });
    let file = rig.file(
        "# @name a\nPOST http://localhost:PORT/a\nContent-Type: text/xml\n\n<p>{{$dotenv PASSWORD}}</p>\n",
    );
    rig.run(&file, "a").await;
    assert_eq!(rig.carrier.seen()[0].body, "<p>p&amp;&lt;&quot;x1</p>");
}

const FOR_MASKING: &str = r"# @name login
GET http://localhost:PORT/login

###
# @name use
POST http://localhost:PORT/orders/{{login.response.body.$.ship}}
X-Token: {{login.response.body.$.head}}
Content-Type: text/xml

<soap:Envelope><soap:Header><a>{{login.response.body.$.soap}}</a></soap:Header><soap:Body>{{login.response.body.$.body}}<Header><b>{{login.response.body.$.plain}}</b></Header></soap:Body></soap:Envelope>
";
const MASKING_REPLY: &str = r#"{"ship":"SHIP-0001","head":"head-token","soap":"soap-token","plain":"plain-token","body":"body-value"}"#;

#[tokio::test]
async fn header_reply_value_is_masked_url_value_is_not() {
    let rig = rig("masking", LOCAL, |_| ok(MASKING_REPLY));
    let file = rig.file(FOR_MASKING);
    let result = rig.run(&file, "use").await;
    let sent = &rig.carrier.seen()[1];
    assert_eq!(sent.header("x-token"), Some("head-token"));
    assert!(sent.body.contains("<a>soap-token</a>") && sent.body.contains("<b>plain-token</b>"));
    for gone in ["head-token", "soap-token", "plain-token"] {
        never(&result, gone);
        absent_from_saved(&rig, gone);
    }
    says(&rig.saved_for("use")[0], "/orders/SHIP-0001");
}

#[tokio::test]
async fn shipment_number_stays_readable() {
    let rig = rig("readable", LOCAL, |_| ok(MASKING_REPLY));
    let file = rig.file(FOR_MASKING);
    rig.run(&file, "use").await;
    says(&rig.saved_for("login")[0], "SHIP-0001");
    says(&rig.saved_for("login")[0], "body-value");
}

#[tokio::test]
async fn response_header_reference_is_read_and_masked() {
    let rig = rig("resp-header", LOCAL, |s: &Seen| {
        if s.path == "/login" {
            reply("200 OK", &[("X-T", "hdr-token-9")], "in")
        } else {
            ok("done")
        }
    });
    let file = rig.file(
        "# @name login\nGET http://localhost:PORT/login\n\n###\n# @name a\nGET http://localhost:PORT/a\nX-Sent: {{login.response.headers.X-T}}\n",
    );
    let result = rig.run(&file, "a").await;
    assert_eq!(rig.carrier.seen()[1].header("x-sent"), Some("hdr-token-9"));
    never(&result, "hdr-token-9");
    absent_from_saved(&rig, "hdr-token-9");
}

const USER: &str = "cu-user-77";
const PASS: &str = "pa&s<\"w0rd";
const TOK: &str = "tok/en+abc1";

fn forms(value: &str) -> Vec<String> {
    vec![
        value.to_string(),
        escape(value, Place::Xml),
        escape(value, Place::Json),
        escape(value, Place::Url),
        value.replace('&', "&#38;").replace('/', "\\/"),
    ]
}

#[tokio::test]
async fn secrets_absent_everywhere() {
    let basic = STANDARD.encode(format!("{USER}:{PASS}"));
    let echo_basic = basic.clone();
    let rig = rig(
        "absent",
        &[("localhost", &[("USER", USER), ("PASS", PASS)])],
        move |s: &Seen| {
            if s.path == "/login" {
                let echoes = forms(PASS).join(" ") + " " + &forms(USER).join(" ");
                let json = serde_json::json!({"token": TOK, "echo": echoes, "b": echo_basic});
                ok(&json.to_string())
            } else {
                let long = format!("{0}{TOK}{0}", "QUJD".repeat(1500));
                ok(&format!(
                    "<r>{}\n<pdf>{long}</pdf></r>",
                    forms(TOK).join(" ")
                ))
            }
        },
    );
    let file = rig.file(
        "# @name login\nPOST http://localhost:PORT/login\nAuthorization: Basic {{$dotenv USER}} {{$dotenv PASS}}\nContent-Type: application/json\n\n{\"user\":\"{{$dotenv USER}}\"}\n\n###\n# @name ship\nPOST http://localhost:PORT/ship\nX-Token: {{login.response.body.$.token}}\n",
    );
    let result = rig.run(&file, "ship").await;
    says(&result, "200 OK");
    assert_eq!(
        rig.carrier.seen()[0].header("authorization"),
        Some(format!("Basic {basic}").as_str())
    );
    let mut secrets = vec![basic];
    secrets.extend(forms(USER));
    secrets.extend(forms(PASS));
    secrets.extend(forms(TOK));
    for gone in &secrets {
        never(&result, gone);
        absent_from_saved(&rig, gone);
    }
    assert!(
        rig.saved()
            .iter()
            .any(|(p, _)| { p.extension().is_none_or(|e| e != "json") })
    );
}

const LOGIN_AND_USE: &str = "# @name login\nGET http://localhost:PORT/login\n\n###\n# @name a\nGET http://localhost:PORT/a\nAuthorization: Bearer {{login.response.body.$.token}}\n";

#[tokio::test]
async fn login_reply_is_saved_masked() {
    let rig = rig("login-saved", LOCAL, |_| ok(r#"{"token":"login-tok-5"}"#));
    let file = rig.file(LOGIN_AND_USE);
    rig.run(&file, "a").await;
    let saved = &rig.saved_for("login")[0];
    never(saved, "login-tok-5");
    says(saved, "***");
}

#[tokio::test]
async fn login_run_alone_is_masked() {
    let rig = rig("login-alone", LOCAL, |_| ok(r#"{"token":"login-tok-6"}"#));
    let file = rig.file(LOGIN_AND_USE);
    let result = rig.run(&file, "login").await;
    never(&result, "login-tok-6");
    absent_from_saved(&rig, "login-tok-6");
    assert_eq!(rig.carrier.paths(), ["/login"]);
}

const TYPED_KEY: common::Confirmed = &[("localhost", &[("KEY", "typed-key-value")])];
const TYPED_LOGIN: &str =
    "# @name login\nPOST http://localhost:PORT/login\nX-Key: {{$dotenv KEY}}\n";

#[tokio::test]
async fn json_token_is_masked_when_the_file_never_references_it() {
    let rig = rig("named-json", TYPED_KEY, |_| {
        ok(r#"{"Access_Token":"named-tok-1","shipmentNumber":"SHIP-4711"}"#)
    });
    let file = rig.file(TYPED_LOGIN);
    let result = rig.run(&file, "login").await;
    never(&result, "named-tok-1");
    absent_from_saved(&rig, "named-tok-1");
    says(&result, "SHIP-4711");
    says(&rig.saved_for("login")[0], "SHIP-4711");
}

#[tokio::test]
async fn xml_token_is_masked_when_the_file_never_references_it() {
    for (tag, body) in [
        (
            "plain",
            "<r><authToken>xml-tok-2</authToken><mpsId>MPS0164</mpsId></r>",
        ),
        (
            "prefixed",
            "<r xmlns:n=\"urn:n\"><n:authToken>xml-tok-2</n:authToken><n:mpsId>MPS0164</n:mpsId></r>",
        ),
    ] {
        let rig = rig(&format!("named-xml-{tag}"), TYPED_KEY, move |_| ok(body));
        let file = rig.file(TYPED_LOGIN);
        let result = rig.run(&file, "login").await;
        never(&result, "xml-tok-2");
        absent_from_saved(&rig, "xml-tok-2");
        says(&result, "MPS0164");
    }
}

#[tokio::test]
async fn token_in_a_reply_to_a_request_with_no_typed_value_stays_readable() {
    let rig = rig("named-none", LOCAL, |_| ok(r#"{"token":"open-tok-3"}"#));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    says(&rig.run(&file, "a").await, "open-tok-3");
    says(&rig.saved_for("a")[0], "open-tok-3");
}

#[tokio::test]
async fn set_cookie_value_is_masked_and_its_attributes_stay() {
    let rig = rig("named-cookie", TYPED_KEY, |_| {
        reply(
            "200 OK",
            &[("Set-Cookie", "JSESSIONID=cookie-val-4; Path=/app; HttpOnly")],
            "{}",
        )
    });
    let file = rig.file(TYPED_LOGIN);
    let result = rig.run(&file, "login").await;
    never(&result, "cookie-val-4");
    absent_from_saved(&rig, "cookie-val-4");
    says(&result, "Path=/app");
}

#[tokio::test]
async fn named_token_is_sent_real_and_masked_from_its_reply_onward() {
    let rig = rig("named-chain", TYPED_KEY, |s: &Seen| {
        if s.path == "/login" {
            ok(r#"{"session_token":"chain-tok-5"}"#)
        } else {
            ok(r#"{"echo":"chain-tok-5"}"#)
        }
    });
    let file = rig.file(&format!(
        "{TYPED_LOGIN}\n###\n# @name use\nGET http://localhost:PORT/use/{{{{login.response.body.$.session_token}}}}\n"
    ));
    let result = rig.run(&file, "use").await;
    assert_eq!(rig.carrier.paths(), ["/login", "/use/chain-tok-5"]);
    never(&result, "chain-tok-5");
    absent_from_saved(&rig, "chain-tok-5");
}

#[tokio::test]
async fn chained_refresh_token_is_masked() {
    let rig = rig("refresh", TYPED_KEY, |s: &Seen| {
        if s.path == "/login" {
            ok(r#"{"token":"first-tok-6"}"#)
        } else {
            ok(r#"{"new_token":"second-tok-6"}"#)
        }
    });
    let file = rig.file(&format!(
        "{TYPED_LOGIN}\n###\n# @name refresh\nPOST http://localhost:PORT/refresh\nX-Old: {{{{login.response.body.$.token}}}}\n"
    ));
    let result = rig.run(&file, "refresh").await;
    assert_eq!(rig.carrier.seen()[1].header("x-old"), Some("first-tok-6"));
    never(&result, "second-tok-6");
    absent_from_saved(&rig, "second-tok-6");
}

#[tokio::test]
async fn request_with_only_a_shipment_number_keeps_a_token_readable() {
    let rig = rig("track", TYPED_KEY, |s: &Seen| {
        if s.path == "/login" {
            ok(r#"{"shipmentNumber":"SHIP-4711"}"#)
        } else {
            ok(r#"{"token":"track-tok-7"}"#)
        }
    });
    let file = rig.file(&format!(
        "{TYPED_LOGIN}\n###\n# @name track\nGET http://localhost:PORT/track/{{{{login.response.body.$.shipmentNumber}}}}\n"
    ));
    let result = rig.run(&file, "track").await;
    says(&result, "track-tok-7");
    says(&rig.saved_for("track")[0], "track-tok-7");
}

/// A reply of `tokens`, plus a field and a header no withheld reply may keep.
fn tokens_reply(tokens: &[String]) -> String {
    let items: Vec<_> = tokens
        .iter()
        .map(|t| serde_json::json!({ "token": t }))
        .collect();
    let body = serde_json::json!({ "items": items, "marker": "body-marker" });
    reply(
        "201 Created",
        &[("X-Marker", "head-marker")],
        &body.to_string(),
    )
}

fn numbered_tokens(count: usize) -> Vec<String> {
    (0..count).map(|n| format!("many-tok-{n:04}")).collect()
}

fn assert_withheld(rig: &common::Rig, result: &str, gone: &str) {
    says(result, "201 Created");
    says(result, "Withheld");
    says(&rig.saved_for("login")[0], "201");
    says(&rig.saved_for("login")[0], "Withheld");
    for text in [gone, "body-marker", "head-marker"] {
        never(result, text);
        absent_from_saved(rig, text);
    }
}

#[tokio::test]
async fn reply_over_the_value_limit_is_withheld() {
    let answer = tokens_reply(&numbered_tokens(257));
    let rig = rig("over-count", TYPED_KEY, move |_| answer.clone());
    let file = rig.file(TYPED_LOGIN);
    let result = rig.run(&file, "login").await;
    assert_withheld(&rig, &result, "many-tok-");
}

#[tokio::test]
async fn reply_over_the_byte_limit_is_withheld() {
    let answer = tokens_reply(&["a".repeat(32 * 1024), "b".repeat(32 * 1024 + 1)]);
    let rig = rig("over-bytes", TYPED_KEY, move |_| answer.clone());
    let file = rig.file(TYPED_LOGIN);
    let result = rig.run(&file, "login").await;
    assert_withheld(&rig, &result, "aaaa");
}

#[tokio::test]
async fn reply_at_the_value_limit_is_masked_normally() {
    let answer = tokens_reply(&numbered_tokens(256));
    let rig = rig("at-count", TYPED_KEY, move |_| answer.clone());
    let file = rig.file(TYPED_LOGIN);
    let result = rig.run(&file, "login").await;
    says(&result, "201 Created");
    says(&result, "body-marker");
    says(&result, "head-marker");
    never(&result, "Withheld");
    never(&result, "many-tok-");
    absent_from_saved(&rig, "many-tok-");
    says(&rig.saved_for("login")[0], "body-marker");
}

#[tokio::test]
async fn chain_stops_at_a_withheld_reply() {
    let answer = tokens_reply(&numbered_tokens(257));
    let rig = rig("withheld-chain", TYPED_KEY, move |_| answer.clone());
    let file = rig.file(&format!(
        "{TYPED_LOGIN}\n###\n# @name use\nGET http://localhost:PORT/use/{{{{login.response.body.$.items[0].token}}}}\n"
    ));
    let result = rig.run(&file, "use").await;
    assert_withheld(&rig, &result, "many-tok-");
    says(&result, "Not sent");
    says(&result, "`use`");
    assert_eq!(rig.carrier.paths(), ["/login"]);
}

#[tokio::test]
async fn saved_path_survives_a_typed_value_equal_to_one_of_its_folders() {
    let rig = rig(
        "path-segment",
        &[("localhost", &[("KEY", "http-replies")])],
        |_| ok(r#"{"v":"seen"}"#),
    );
    let text = format!(
        "# @name a\nGET http://localhost:PORT/a\nX-Key: {{{{$dotenv KEY}}}}\n\n###\n# @name b\nGET http://localhost:{}/b/{{{{a.response.body.$.v}}}}\n",
        closed_port()
    );
    let file = rig.file(&text);
    let result = rig.run(&file, "b").await;
    says(&result, "`b` (line");
    let saved = result.split("saved to ").nth(1).unwrap();
    let saved = PathBuf::from(saved.lines().next().unwrap());
    assert!(saved.is_file(), "{}", saved.display());
}

#[tokio::test]
async fn transport_error_holds_no_secret() {
    let rig = rig(
        "transport",
        &[("localhost", &[("KEY", "query-secret-1")])],
        |_| ok(""),
    );
    let text = format!(
        "# @name a\nGET http://localhost:{}/x?k={{{{$dotenv KEY}}}}&visible=1\n",
        closed_port()
    );
    let file = rig.file(&text);
    let result = rig.run(&file, "a").await;
    says(&result, "line 2");
    never(&result, "query-secret-1");
    never(&result, "visible=1");
    never(&result, "?k=");
}

#[tokio::test]
async fn value_not_sent_to_other_host() {
    let rig = rig(
        "other-host",
        &[("localhost", &[("KEY", "only-for-localhost")])],
        |_| ok(""),
    )
    .deadline(Duration::from_millis(400));
    let file = rig.file("# @name a\nGET http://127.0.0.1:PORT/a\nX-Key: {{$dotenv KEY}}\n");
    let result = rig.run(&file, "a").await;
    says(&result, "127.0.0.1");
    says(&result, CALL_AGAIN);
    assert_eq!(rig.carrier.connections(), 0);
    rig.address(1).await;
}

#[tokio::test]
async fn reply_value_equal_to_another_hosts_login_is_not_sent() {
    let rig = rig(
        "foreign",
        &[
            ("localhost", &[("KEY", "typed-for-local")]),
            ("127.0.0.1", &[]),
        ],
        |_| ok(r#"{"same":"typed-for-local","wrap":"xx typed-for-local yy"}"#),
    );
    let file = rig.file(
        "# @name login\nGET http://localhost:PORT/login\nX-Key: {{$dotenv KEY}}\n\n###\n# @name same\nPOST http://127.0.0.1:PORT/same\n\n{{login.response.body.$.same}}\n\n###\n# @name wrap\nPOST http://127.0.0.1:PORT/wrap\n\n{{login.response.body.$.wrap}}\n",
    );
    for (name, line) in [("same", "line 7"), ("wrap", "line 13")] {
        let result = rig.run(&file, name).await;
        says(&result, &format!("`{name}`"));
        says(&result, line);
        never(&result, "typed-for-local");
    }
    assert!(
        rig.carrier
            .seen()
            .iter()
            .all(|s| s.host().starts_with("localhost"))
    );
}

#[tokio::test]
async fn value_saved_mid_run_is_not_sent() {
    let slot: Arc<OnceLock<Arc<Store>>> = Arc::default();
    let store = slot.clone();
    let rig = rig(
        "mid-run",
        &[("localhost", &[("KEY", "first-typed-key")])],
        move |s: &Seen| {
            if s.path == "/login" {
                let retyped = BTreeMap::from([("KEY".to_string(), "second-typed-key".to_string())]);
                store.get().unwrap().save("localhost", &retyped).unwrap();
            }
            let echo = s.header("x-key").unwrap_or_default();
            ok(&serde_json::json!({"id": "seen", "echo": echo}).to_string())
        },
    );
    slot.set(rig.store.clone()).unwrap();
    let file = rig.file(
        "# @name login\nGET http://localhost:PORT/login\nX-Key: {{$dotenv KEY}}\n\n###\n# @name use\nGET http://localhost:PORT/use/{{login.response.body.$.id}}\nX-Key: {{$dotenv KEY}}\n",
    );
    let result = rig.run(&file, "use").await;
    assert_eq!(
        rig.carrier.seen()[1].header("x-key"),
        Some("first-typed-key")
    );
    never(&result, "first-typed-key");
    absent_from_saved(&rig, "first-typed-key");
    says(&rig.saved_for("use")[0], "***");
}

#[tokio::test]
async fn reply_echoing_another_hosts_basic_is_refused() {
    let rig = rig(
        "foreign-basic",
        &[
            (
                "localhost",
                &[("USER", "basic-user-1"), ("PASS", "basic-pass-1")],
            ),
            ("127.0.0.1", &[]),
        ],
        |s: &Seen| {
            let sent = s.header("authorization").unwrap_or_default();
            let token = sent.trim_start_matches("Basic ");
            ok(&serde_json::json!({"echo": token}).to_string())
        },
    );
    let file = rig.file(
        "# @name login\nGET http://localhost:PORT/login\nAuthorization: Basic {{$dotenv USER}} {{$dotenv PASS}}\n\n###\n# @name steal\nPOST http://127.0.0.1:PORT/steal\n\n{{login.response.body.$.echo}}\n",
    );
    let result = rig.run(&file, "steal").await;
    says(&result, "`steal`");
    says(&result, "line 7");
    assert!(
        rig.carrier
            .seen()
            .iter()
            .all(|s| s.host().starts_with("localhost"))
    );
}

fn echo(s: &Seen) -> String {
    let header = s.header("x-acct").unwrap_or_default();
    ok(&format!("echo {} {header} {}", s.path, s.body))
}

#[tokio::test]
async fn digit_value_joined_to_a_literal_digit_is_masked_as_one_run() {
    let rig = rig("joined", &[("localhost", &[("ACCT", "3333333333")])], echo);
    let file = rig.file(
        "# @name a\nPOST http://localhost:PORT/x/{{$dotenv ACCT}}0101\nX-Acct: {{$dotenv ACCT}}0101\nContent-Type: application/json\n\n{\"a\":\"{{$dotenv ACCT}}0101\"}\n",
    );
    let result = rig.run(&file, "a").await;
    let sent = &rig.carrier.seen()[0];
    assert_eq!(sent.path, "/x/33333333330101");
    assert_eq!(sent.header("x-acct"), Some("33333333330101"));
    assert_eq!(sent.body, "{\"a\":\"33333333330101\"}");
    let run = "99999999999999";
    says(&result, &format!("echo /x/{run} {run} {{\"a\":\"{run}\"}}"));
    never(&result, "3333333333");
    never(&result, "33330101");
    absent_from_saved(&rig, "3333333333");
    absent_from_saved(&rig, "33330101");
    says(&rig.saved_for("a")[0], &format!("/x/{run}"));
}

#[tokio::test]
async fn digit_values_joined_to_each_other_are_masked_as_one_run() {
    let rig = rig(
        "joined-values",
        &[("localhost", &[("A", "1111"), ("B", "2222")])],
        echo,
    );
    let file = rig
        .file("# @name a\nGET http://localhost:PORT/x/7{{$dotenv A}}{{$dotenv B}}\nX-Acct: none\n");
    let result = rig.run(&file, "a").await;
    assert_eq!(rig.carrier.seen()[0].path, "/x/711112222");
    says(&result, "echo /x/999999999 none");
    never(&result, "711112222");
    absent_from_saved(&rig, "711112222");
}

#[tokio::test]
async fn result_cut_at_40000_chars_on_a_boundary() {
    let body = "é".repeat(60_000);
    let answer = body.clone();
    let rig = rig("cut", LOCAL, move |_| ok(&answer));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    let result = rig.run(&file, "a").await;
    let (kept, note) = result.split_once("\n\n[Cut").unwrap();
    assert_eq!(kept.chars().count(), 40_000);
    let saved = rig.saved();
    says(note, &saved[0].0.display().to_string());
    says(&saved[0].1, &body);
}

#[tokio::test]
async fn secret_at_the_cut_boundary_leaves_no_prefix() {
    // Repeated every few characters, so one straddles character 40,000 however long the head is.
    let rig = rig(
        "boundary",
        &[("localhost", &[("KEY", "zq9-secret-value")])],
        |_| ok(&"<x>zq9-secret-value</x>".repeat(4000)),
    );
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\nX-Key: {{$dotenv KEY}}\n");
    let result = rig.run(&file, "a").await;
    says(&result, "[Cut at 40000");
    never(&result, "zq9");
}

#[tokio::test]
async fn long_base64_run_goes_to_its_own_file() {
    let long = "QUJD".repeat(2000);
    let answer = format!("<pdf>{long}</pdf>");
    let rig = rig("base64", LOCAL, move |_| ok(&answer));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    rig.run(&file, "a").await;
    let saved = rig.saved();
    let json = saved
        .iter()
        .find(|(p, _)| p.extension().is_some_and(|e| e == "json"))
        .unwrap();
    never(&json.1, &long);
    let side = saved.iter().find(|(p, _)| *p != json.0).unwrap();
    assert_eq!(side.0.parent(), json.0.parent());
    assert_eq!(side.1, long);
    says(&json.1, side.0.file_name().unwrap().to_str().unwrap());
}

#[tokio::test(flavor = "multi_thread")]
async fn same_timestamp_does_not_overwrite() {
    // The carrier answers all of them at once, so their saves land in the same millisecond.
    const RUNS: usize = 12;
    let gate = Arc::new(Barrier::new(RUNS));
    let rig = rig("timestamp", LOCAL, move |_| {
        gate.wait();
        ok("answer")
    });
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    let runs: Vec<_> = (0..RUNS).map(|_| rig.start(&file, "a", false)).collect();
    for running in runs {
        says(&running.await.unwrap(), "answer");
    }
    assert_eq!(rig.saved_for("a").len(), RUNS);
}

#[tokio::test]
async fn deadline_before_send_says_call_again() {
    let rig = rig("deadline-page", &[], |_| ok("")).deadline(Duration::from_millis(300));
    let file = rig.file("# @name a\nGET http://localhost:PORT/a\n");
    says(&rig.run(&file, "a").await, CALL_AGAIN);
    assert_eq!(rig.carrier.connections(), 0);
}

#[tokio::test]
async fn deadline_after_send_says_it_may_have_completed() {
    let rig = rig("deadline-send", LOCAL, |s: &Seen| {
        if s.path.starts_with("/target") {
            std::thread::sleep(Duration::from_secs(3));
        }
        ok(r#"{"id":"seen"}"#)
    })
    .deadline(Duration::from_millis(700));
    let file = rig.file(
        "# @name login\nGET http://localhost:PORT/login\n\n###\n# @name target\nGET http://localhost:PORT/target/{{login.response.body.$.id}}\n",
    );
    let result = rig.run(&file, "target").await;
    says(&result, "login: received");
    says(&result, "target: in flight");
    says(&result, "may have completed");
    never(&result, CALL_AGAIN);
    assert_eq!(rig.saved_for("login").len(), 1);
}
