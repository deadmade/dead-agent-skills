//! Escaping of substituted values, and removal of every form of a secret from text.

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use std::fmt::Write as _;

/// A shorter value is left alone: masking it would rewrite unrelated text.
const MIN_CHARS: usize = 4;

const XML: [(char, &str); 5] = [
    ('&', "&amp;"),
    ('<', "&lt;"),
    ('>', "&gt;"),
    ('"', "&quot;"),
    ('\'', "&apos;"),
];

/// Where a substituted value lands, which decides how it is escaped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Place {
    Url,
    Form,
    Xml,
    Json,
    Other,
}

/// `value` escaped for `place`.
#[must_use]
pub fn escape(value: &str, place: Place) -> String {
    match place {
        Place::Url | Place::Form => value
            .chars()
            .map(|c| {
                if unreserved(c) {
                    c.to_string()
                } else {
                    percent(c)
                }
            })
            .collect(),
        Place::Xml => value
            .chars()
            .map(|c| xml_entity(c).map_or_else(|| c.to_string(), String::from))
            .collect(),
        Place::Json => {
            let quoted = serde_json::Value::String(value.into()).to_string();
            quoted[1..quoted.len() - 1].to_string()
        }
        Place::Other => value.to_string(),
    }
}

/// RFC 3986's unreserved set, the only characters a percent-encoding leaves as they are.
fn unreserved(c: char) -> bool {
    c.is_ascii_alphanumeric() || "-._~".contains(c)
}

/// The percent-encoding of a character outside the unreserved set.
fn percent(c: char) -> String {
    let mut buf = [0; 4];
    c.encode_utf8(&mut buf)
        .bytes()
        .fold(String::new(), |mut out, b| {
            let _ = write!(out, "%{b:02X}");
            out
        })
}

fn xml_entity(c: char) -> Option<&'static str> {
    XML.iter().find(|(x, _)| *x == c).map(|(_, entity)| *entity)
}

fn json_short_escape(c: char) -> Option<&'static str> {
    Some(match c {
        '"' => "\\\"",
        '\\' => "\\\\",
        '/' => "\\/",
        '\n' => "\\n",
        '\r' => "\\r",
        '\t' => "\\t",
        '\u{8}' => "\\b",
        '\u{c}' => "\\f",
        _ => return None,
    })
}

/// Every way a reply can write `c`: as it is, as an XML entity, as a JSON escape or percent-encoded,
/// with either case of hex digit. One reply may escape some characters of a value and not others.
fn spellings(c: char) -> Vec<String> {
    let n = u32::from(c);
    let mut units = [0; 2];
    let mut json_u = String::new();
    for unit in c.encode_utf16(&mut units).iter() {
        let _ = write!(json_u, "\\u{unit:04X}");
    }
    let mut hex = vec![format!("&#x{n:X};"), json_u];
    if !unreserved(c) {
        hex.push(percent(c));
    }
    let mut all = vec![c.to_string(), format!("&#{n};")];
    all.extend(xml_entity(c).map(String::from));
    all.extend(json_short_escape(c).map(String::from));
    all.extend(hex.iter().map(|s| s.to_lowercase()));
    all.extend(hex);
    all.sort_unstable();
    all.dedup();
    all
}

/// One value to remove, as the spellings of each of its characters.
#[derive(PartialEq)]
struct Secret {
    chars: Vec<Vec<String>>,
    mask: String,
    digits: bool,
}

impl Secret {
    /// Where the longest spelling of the value that starts at byte `start` of `text` ends.
    fn end_at(&self, text: &str, start: usize) -> Option<usize> {
        // Nearly every position fails on its first character; this spares it the allocations below.
        if !self.chars[0]
            .iter()
            .any(|s| text[start..].starts_with(s.as_str()))
        {
            return None;
        }
        // The places the spelling so far can end, since one spelling may begin another
        // (`&` and `&amp;`).
        let mut ends = vec![start];
        for spellings in &self.chars {
            let mut next: Vec<usize> = ends
                .iter()
                .flat_map(|&e| {
                    spellings
                        .iter()
                        .filter(move |s| text[e..].starts_with(s.as_str()))
                        .map(move |s| e + s.len())
                })
                .collect();
            next.sort_unstable();
            next.dedup();
            if next.is_empty() {
                return None;
            }
            ends = next;
        }
        let end = *ends.last()?;
        let digit = |c: char| c.is_ascii_digit();
        let inside_number = text[..start].ends_with(digit) || text[end..].starts_with(digit);
        (!(self.digits && inside_number)).then_some(end)
    }
}

/// The secrets to remove from text.
#[derive(Default)]
pub struct Masker {
    secrets: Vec<Secret>,
}

// Not derived: a derived `Debug` would print the secrets.
impl std::fmt::Debug for Masker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Masker")
            .field("secrets", &self.secrets.len())
            .finish()
    }
}

impl Masker {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Masks `value` in every spelling. A digit-only value becomes the same number of nines,
    /// so a JSON number stays one, and matches only where no digit adjoins it; any other
    /// value becomes `***`. A value under four characters is ignored.
    pub fn add(&mut self, value: &str) {
        if value.chars().count() < MIN_CHARS {
            return;
        }
        let digits = value.chars().all(|c| c.is_ascii_digit());
        let secret = Secret {
            chars: value.chars().map(spellings).collect(),
            mask: if digits {
                "9".repeat(value.len())
            } else {
                "***".into()
            },
            digits,
        };
        if !self.secrets.contains(&secret) {
            self.secrets.push(secret);
        }
    }

    /// Masks the user, the password and the Base64 of a Basic header made from them.
    pub fn add_basic(&mut self, user: &str, password: &str) {
        self.add(user);
        self.add(password);
        self.add(&STANDARD.encode(format!("{user}:{password}")));
    }

    /// `text` with every added value replaced; where two start at one place, the longer wins.
    #[must_use]
    pub fn apply(&self, text: &str) -> String {
        let mut out = String::with_capacity(text.len());
        let mut i = 0;
        while let Some(c) = text[i..].chars().next() {
            let longest = self
                .secrets
                .iter()
                .filter_map(|s| s.end_at(text, i).map(|end| (end, &s.mask)))
                .max_by_key(|(end, _)| *end);
            if let Some((end, mask)) = longest {
                out.push_str(mask);
                i = end;
            } else {
                out.push(c);
                i += c.len_utf8();
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "p&<\"x";

    fn masked(values: &[&str], text: &str) -> String {
        let mut m = Masker::new();
        for v in values {
            m.add(v);
        }
        m.apply(text)
    }

    #[test]
    fn escapes_and_masks_each_form() {
        let forms = [
            SECRET.to_string(),
            escape(SECRET, Place::Xml),
            escape(SECRET, Place::Json),
            escape(SECRET, Place::Url),
            // An XML text node that escapes `&` and `<` but leaves the quote.
            "p&amp;&lt;\"x".to_string(),
        ];
        for form in forms {
            assert_eq!(
                masked(&[SECRET], &format!("a {form} b")),
                "a *** b",
                "{form}"
            );
        }
    }

    #[test]
    fn numeric_entities_and_unicode_escapes_are_masked() {
        for form in ["p&#38;x1", "p&#x26;x1", "p\\u0026x1"] {
            assert_eq!(masked(&["p&x1"], form), "***", "{form}");
        }
        // Python's JSON writes every non-ASCII character as an escape, an emoji as a surrogate pair.
        assert_eq!(masked(&["pé😀x1"], "p\\u00e9\\ud83d\\ude00x1"), "***");
    }

    #[test]
    fn basic_header_base64_is_masked() {
        let mut m = Masker::new();
        m.add_basic("u", "p4ss");
        assert_eq!(
            m.apply("Authorization: Basic dTpwNHNz"),
            "Authorization: Basic ***"
        );
    }

    #[test]
    fn digits_become_nines() {
        assert_eq!(masked(&["12345"], r#"{"a":12345}"#), r#"{"a":99999}"#);
    }

    #[test]
    fn digit_value_matches_on_digit_boundaries() {
        assert_eq!(masked(&["1234"], "912345"), "912345");
        assert_eq!(masked(&["1234"], "a1234b"), "a9999b");
    }

    #[test]
    fn other_values_become_stars() {
        assert_eq!(masked(&["secret"], "a secret b"), "a *** b");
    }

    #[test]
    fn longest_first() {
        assert_eq!(masked(&["abcd", "abcdef"], "abcdef"), "***");
    }

    #[test]
    fn short_values_are_ignored() {
        assert_eq!(masked(&["abc"], "abc abc"), "abc abc");
    }

    #[test]
    fn escape_by_place() {
        assert_eq!(escape("&", Place::Xml), "&amp;");
        assert_eq!(escape("\"", Place::Json), "\\\"");
        assert_eq!(escape("&", Place::Url), "%26");
        assert_eq!(escape("&", Place::Form), "%26");
        assert_eq!(escape("&\"", Place::Other), "&\"");
    }
}
