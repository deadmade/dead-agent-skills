//! Reads one value out of a JSON or XML reply, for `{{name.response.body.<path>}}`.

use jsonpath_rust::JsonPath;
use serde_json::Value as Json;
use sxd_xpath::Value as Xml;

use crate::mask::maskable;

/// Masking time grows with the number of values, so one reply may add only this many.
const MAX_VALUES: usize = 256;
const MAX_VALUE_BYTES: usize = 64 * 1024;

/// A path starting with `$` is `JSONPath`; any other is `XPath` 1.0 with no namespace map. The first
/// match wins: a JSON string yields its content, any other JSON value its JSON text; an `XPath`
/// node its text content (an attribute its value), anything else its text.
///
/// # Errors
///
/// Returns why the body or the path cannot be used, or that the path matches nothing.
pub fn from_body(body: &str, path: &str) -> Result<String, String> {
    if path.starts_with('$') {
        from_json(body, path)
    } else {
        from_xml(body, path)
    }
}

fn from_json(body: &str, path: &str) -> Result<String, String> {
    let json: Json =
        serde_json::from_str(body).map_err(|e| format!("the reply is not valid JSON: {e}"))?;
    let found = json
        .query(path)
        .map_err(|e| format!("cannot use JSONPath `{path}`: {e}"))?;
    match found.first() {
        None => Err(format!("JSONPath `{path}` matches nothing in the reply")),
        Some(Json::String(s)) => Ok(s.clone()),
        Some(other) => Ok(other.to_string()),
    }
}

fn from_xml(body: &str, path: &str) -> Result<String, String> {
    if has_prefix(path) {
        return Err(format!(
            "XPath `{path}` uses a namespace prefix, which has no namespace here; \
             match by local name instead, as in //*[local-name()='name']"
        ));
    }
    let package = sxd_document::parser::parse(body)
        .map_err(|e| format!("the reply is not valid XML: {e}"))?;
    let document = package.as_document();
    match sxd_xpath::evaluate_xpath(&document, path) {
        Err(e) => Err(format!("cannot use XPath `{path}`: {e}")),
        Ok(Xml::Nodeset(nodes)) if nodes.size() == 0 => {
            Err(format!("XPath `{path}` matches nothing in the reply"))
        }
        Ok(value) => Ok(value.into_string()),
    }
}

/// Whether a JSON key, XML element or response header is named like a credential, ignoring case,
/// `-` and `_`.
fn credential_name(name: &str) -> bool {
    const WORDS: [&str; 6] = ["token", "session", "jwt", "secret", "password", "apikey"];
    let name: String = name
        .chars()
        .filter(|c| !matches!(c, '-' | '_'))
        .map(|c| c.to_ascii_lowercase())
        .collect();
    matches!(name.as_str(), "sid" | "setcookie" | "authorization")
        || WORDS.iter().any(|word| name.contains(word))
}

/// The value of a `Set-Cookie` header: what stands between the first `=` and the first `;`.
fn cookie_value(header: &str) -> &str {
    let pair = header.split(';').next().unwrap_or_default();
    let value = pair.split_once('=').map_or(pair, |(_, value)| value);
    value.trim().trim_matches('"')
}

/// Every scalar in a reply that its own name marks as a credential: response headers, JSON keys
/// and XML elements by local name. A boolean or `null` holds no secret, and masking `true` would
/// rewrite every other `true` in the reply. A body that is neither JSON nor XML yields only headers.
/// Each value comes once, and a value too short to mask is left out.
///
/// # Errors
///
/// Returns the note that replaces the reply when it holds more than one reply may add to the mask.
pub fn credential_values(headers: &[(String, String)], body: &str) -> Result<Vec<String>, String> {
    let mut found: Vec<String> = headers
        .iter()
        .filter(|(name, _)| credential_name(name))
        .map(|(name, value)| {
            if name.eq_ignore_ascii_case("set-cookie") {
                cookie_value(value).to_owned()
            } else {
                value.clone()
            }
        })
        .collect();
    // A .NET service commonly starts its XML with a byte order mark, which neither parser takes.
    let body = body.trim_start_matches('\u{feff}');
    if let Ok(json) = serde_json::from_str::<Json>(body) {
        json_credentials(&json, &mut found);
    } else {
        xml_credentials(body, &mut found);
    }
    found.retain(|value| maskable(value));
    found.sort_unstable();
    found.dedup();
    let bytes: usize = found.iter().map(String::len).sum();
    if found.len() > MAX_VALUES || bytes > MAX_VALUE_BYTES {
        return Err(format!(
            "Withheld: this reply holds {} values named like credentials, {bytes} bytes in all. One reply may add at most {MAX_VALUES} values and {MAX_VALUE_BYTES} bytes to the mask, because masking time grows with their number. Its body and headers were not kept.",
            found.len()
        ));
    }
    Ok(found)
}

/// Walks with a list, not recursion, as a reply decides how deep it goes.
fn json_credentials(json: &Json, found: &mut Vec<String>) {
    let mut todo = vec![json];
    while let Some(value) = todo.pop() {
        match value {
            Json::Object(fields) => {
                for (key, value) in fields {
                    match value {
                        Json::String(s) if credential_name(key) => found.push(s.clone()),
                        Json::Number(n) if credential_name(key) => found.push(n.to_string()),
                        other => todo.push(other),
                    }
                }
            }
            Json::Array(items) => todo.extend(items),
            _ => {}
        }
    }
}

/// An element is a scalar when it holds only text.
fn xml_credentials(body: &str, found: &mut Vec<String>) {
    let Ok(package) = sxd_document::parser::parse(body) else {
        return;
    };
    let document = package.as_document();
    let roots = document.root().children();
    let mut todo: Vec<_> = roots.iter().filter_map(|c| c.element()).collect();
    while let Some(element) = todo.pop() {
        let children = element.children();
        let before = todo.len();
        todo.extend(children.iter().filter_map(|c| c.element()));
        if todo.len() == before && credential_name(element.name().local_part()) {
            let text: String = children
                .iter()
                .filter_map(|c| c.text())
                .map(|t| t.text())
                .collect();
            found.push(text.trim().to_owned());
        }
    }
}

/// Whether the path has a `:` outside quotes that is not part of `::`. sxd-xpath panics on a
/// prefix it has no namespace for, so such a path is refused before it is evaluated.
fn has_prefix(path: &str) -> bool {
    let bytes = path.as_bytes();
    let mut quote = None;
    for (i, &c) in bytes.iter().enumerate() {
        match quote {
            Some(q) if c == q => quote = None,
            None if c == b'"' || c == b'\'' => quote = Some(c),
            None if c == b':'
                && bytes.get(i + 1) != Some(&b':')
                && bytes[..i].last() != Some(&b':') =>
            {
                return true;
            }
            _ => {}
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOAP: &str = "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><ns2:getAuthResponse xmlns:ns2=\"http://dpd.com/common/service/types/LoginService/2.0\"><return><authToken>T1</authToken></return></ns2:getAuthResponse></soap:Body></soap:Envelope>";

    #[test]
    fn xpath_bare_name_on_unqualified_element() {
        assert_eq!(from_body(SOAP, "//authToken"), Ok("T1".into()));
    }

    #[test]
    fn xpath_local_name_reaches_namespaced() {
        let path = "//*[local-name()='getAuthResponse']/return/authToken";
        assert_eq!(from_body(SOAP, path), Ok("T1".into()));
    }

    #[test]
    fn xpath_no_match_is_an_error() {
        let err = from_body(SOAP, "//missing").unwrap_err();
        assert!(err.contains("//missing"), "{err}");
    }

    #[test]
    fn xpath_prefixed_name_is_an_error_not_a_panic() {
        let err = from_body(SOAP, "//ns2:authToken").unwrap_err();
        assert!(err.contains("local-name()"), "{err}");
    }

    #[test]
    fn xpath_axis_is_not_a_prefix() {
        assert_eq!(from_body(SOAP, "//self::authToken"), Ok("T1".into()));
    }

    #[test]
    fn xpath_colon_inside_quotes_is_not_a_prefix() {
        let xml = "<a x=\"p:q\"/>";
        assert_eq!(from_body(xml, "//a[@x='p:q']/@x"), Ok("p:q".into()));
    }

    #[test]
    fn xpath_attribute_yields_its_value() {
        let xml = "<a><b id=\"7\">x</b></a>";
        assert_eq!(from_body(xml, "//b/@id"), Ok("7".into()));
    }

    #[test]
    fn xpath_number_and_boolean_yield_their_text() {
        assert_eq!(from_body(SOAP, "count(//authToken)"), Ok("1".into()));
        assert_eq!(from_body(SOAP, "boolean(//authToken)"), Ok("true".into()));
    }

    #[test]
    fn several_matches_take_the_first() {
        assert_eq!(from_body("<a><b>1</b><b>2</b></a>", "//b"), Ok("1".into()));
        assert_eq!(from_body("{\"a\":[1,2]}", "$.a[*]"), Ok("1".into()));
    }

    #[test]
    fn jsonpath_string_and_number() {
        let body = "{\"token\":\"T\",\"n\":5}";
        assert_eq!(from_body(body, "$.token"), Ok("T".into()));
        assert_eq!(from_body(body, "$.n"), Ok("5".into()));
    }

    #[test]
    fn jsonpath_object_comes_back_as_json() {
        assert_eq!(
            from_body("{\"o\":{\"a\":1}}", "$.o"),
            Ok("{\"a\":1}".into())
        );
    }

    #[test]
    fn jsonpath_no_match_is_an_error() {
        let err = from_body("{\"a\":1}", "$.b").unwrap_err();
        assert!(err.contains("$.b"), "{err}");
    }

    const NONE: [&str; 0] = [];

    fn credentials(body: &str) -> Vec<String> {
        let mut values = credential_values(&[], body).unwrap();
        values.sort();
        values
    }

    #[test]
    fn credential_names_ignore_case_dashes_and_underscores() {
        for name in [
            "token",
            "access_token",
            "X-Auth-Token",
            "sessionId",
            "JWT",
            "client-secret",
            "PassWord",
            "api_key",
            "API-Key",
            "SID",
            "Set-Cookie",
            "authorization",
        ] {
            assert!(credential_name(name), "{name}");
        }
        for name in ["delisId", "inside", "shipmentNumber", "Authorized", "id"] {
            assert!(!credential_name(name), "{name}");
        }
    }

    #[test]
    fn json_scalars_named_like_credentials_are_found_at_any_depth() {
        let body = r#"{"a":{"token":"TOK1","n":"keep"},"list":[{"sid":12345}],"apiKey":"KEY2"}"#;
        assert_eq!(credentials(body), ["12345", "KEY2", "TOK1"]);
    }

    #[test]
    fn only_scalars_count() {
        let body = r#"{"session":{"id":"keep"},"tokens":["keep"],"tokenValid":true,"jwt":null}"#;
        assert_eq!(credentials(body), NONE);
        assert_eq!(credentials("<a><session><id>keep</id></session></a>"), NONE);
    }

    #[test]
    fn xml_elements_match_by_local_name_and_lose_outer_space() {
        let body = "<a xmlns:n=\"urn:n\"><n:authToken>\n  TOK1\n</n:authToken><id>keep</id></a>";
        assert_eq!(credentials(body), ["TOK1"]);
    }

    #[test]
    fn a_byte_order_mark_does_not_hide_a_credential() {
        assert_eq!(
            credentials("\u{feff}<a><authToken>TOK1</authToken></a>"),
            ["TOK1"]
        );
    }

    #[test]
    fn text_that_is_neither_json_nor_xml_has_no_credentials() {
        assert_eq!(credentials("token=abcd"), NONE);
    }

    #[test]
    fn headers_named_like_credentials_are_found() {
        let headers = [
            ("x-auth-token".to_string(), "TOK1".to_string()),
            ("content-type".to_string(), "text/plain".to_string()),
        ];
        assert_eq!(credential_values(&headers, "").unwrap(), ["TOK1"]);
    }

    #[test]
    fn set_cookie_yields_the_cookie_value() {
        for (header, want) in [
            ("SID=abc123; Path=/; HttpOnly", "abc123"),
            ("a=b64==; Secure", "b64=="),
            ("a=\"quoted\"", "quoted"),
            ("bare", "bare"),
        ] {
            let headers = [("Set-Cookie".to_string(), header.to_string())];
            assert_eq!(credential_values(&headers, "").unwrap(), [want], "{header}");
        }
    }

    fn tokens(values: &[String]) -> String {
        let items: Vec<_> = values
            .iter()
            .map(|v| serde_json::json!({"token": v}))
            .collect();
        Json::Array(items).to_string()
    }

    #[test]
    fn the_limits_count_distinct_maskable_values() {
        let numbered: Vec<_> = (0..MAX_VALUES).map(|n| format!("tok-{n:04}")).collect();
        assert_eq!(credentials(&tokens(&numbered)).len(), MAX_VALUES);
        let mut repeated = numbered.clone();
        repeated.extend(numbered.clone());
        assert_eq!(credentials(&tokens(&repeated)).len(), MAX_VALUES);
        let mut too_short = numbered.clone();
        too_short.extend((0..500).map(|n| n.to_string()));
        assert_eq!(credentials(&tokens(&too_short)).len(), MAX_VALUES);
        let mut one_more = numbered;
        one_more.push("tok-over".into());
        assert!(credential_values(&[], &tokens(&one_more)).is_err());
    }

    #[test]
    fn the_byte_limit_is_inclusive() {
        let fits = [
            "a".repeat(MAX_VALUE_BYTES / 2),
            "b".repeat(MAX_VALUE_BYTES / 2),
        ];
        assert_eq!(credentials(&tokens(&fits)).len(), 2);
        let over = [
            "a".repeat(MAX_VALUE_BYTES / 2),
            "b".repeat(MAX_VALUE_BYTES / 2 + 1),
        ];
        assert!(credential_values(&[], &tokens(&over)).is_err());
    }

    #[test]
    fn invalid_body_or_path_is_an_error() {
        assert!(from_body("<a>", "//a").is_err());
        assert!(from_body("not json", "$.a").is_err());
        assert!(from_body("{\"a\":1}", "$[").is_err());
        assert!(from_body("<a/>", "//[").is_err());
    }
}
