//! Reads one value out of a JSON or XML reply, for `{{name.response.body.<path>}}`.

use jsonpath_rust::JsonPath;
use serde_json::Value as Json;
use sxd_xpath::Value as Xml;

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

    #[test]
    fn invalid_body_or_path_is_an_error() {
        assert!(from_body("<a>", "//a").is_err());
        assert!(from_body("not json", "$.a").is_err());
        assert!(from_body("{\"a\":1}", "$[").is_err());
        assert!(from_body("<a/>", "//[").is_err());
    }
}
