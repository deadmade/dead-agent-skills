//! Reads a REST Client `.http` file into typed requests and refuses anything outside the supported format.

use std::collections::HashMap;
use std::fmt;

use url::Url;

/// A refused file: the line (1-based) and what is wrong with it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: usize,
    pub message: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "line {}: {}", self.line, self.message)
    }
}

impl std::error::Error for ParseError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedFile {
    pub requests: Vec<Request>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub name: Option<String>,
    /// The request line's number in the file.
    pub line: usize,
    pub method: String,
    pub origin: Origin,
    /// Always starts with `/`; the query is part of it.
    pub path: Text,
    pub headers: Vec<(String, Text)>,
    pub basic: Option<BasicAuth>,
    pub body: Option<Text>,
}

/// Where a request goes. The port is `None` when the URL leaves out the scheme's default.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Origin {
    pub https: bool,
    /// Lowercased.
    pub host: String,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BasicAuth {
    pub user: Text,
    pub password: Text,
}

/// Text with the `{{...}}` tokens that a later stage fills in.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Text(pub Vec<Part>);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Part {
    Lit(String),
    /// `{{$dotenv NAME}}`: filled from the runner's store.
    Secret(String),
    /// `{{request.response.body.<path>}}` or `{{request.response.headers.<name>}}`.
    Reply {
        request: String,
        source: Source,
    },
    Guid,
    /// `{{$datetime iso8601}}`: the only format.
    Datetime,
    Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    /// A `JSONPath` or `XPath`, chosen by what the reply holds.
    Body(String),
    Header(String),
}

impl Text {
    fn push_lit(&mut self, s: &str) {
        match self.0.last_mut() {
            _ if s.is_empty() => {}
            Some(Part::Lit(last)) => last.push_str(s),
            _ => self.0.push(Part::Lit(s.to_owned())),
        }
    }

    fn push(&mut self, part: Part) {
        match part {
            Part::Lit(s) => self.push_lit(&s),
            other => self.0.push(other),
        }
    }

    fn append(&mut self, other: Text) {
        for part in other.0 {
            self.push(part);
        }
    }
}

/// File variables, already expanded, so a later line splices them in.
type Vars = HashMap<String, Text>;

type Line<'a> = (usize, &'a str);

fn err(line: usize, message: impl Into<String>) -> ParseError {
    ParseError {
        line,
        message: message.into(),
    }
}

/// # Errors
///
/// Returns the first line outside the supported format.
pub fn parse(text: &str) -> Result<ParsedFile, ParseError> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut vars = Vars::new();
    let mut requests = Vec::new();
    let mut block = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if line.starts_with("###") {
            requests.extend(parse_block(&block, &mut vars)?);
            block.clear();
        } else {
            block.push((i + 1, line));
        }
    }
    requests.extend(parse_block(&block, &mut vars)?);
    let mut first_line = HashMap::new();
    for request in &requests {
        if let Some(name) = &request.name
            && let Some(first) = first_line.insert(name, request.line)
        {
            return Err(err(
                request.line,
                format!("request name `{name}` is already used by the request on line {first}"),
            ));
        }
    }
    Ok(ParsedFile { requests })
}

/// `None` for a block with no request line; its variables still count.
fn parse_block(lines: &[Line], vars: &mut Vars) -> Result<Option<Request>, ParseError> {
    let mut lines = lines.iter().copied();
    let mut name = None;
    let mut request = loop {
        let Some((n, l)) = lines.next() else {
            return Ok(None);
        };
        if l.trim().is_empty() {
            continue;
        }
        if is_comment(l) {
            if let Some(v) = name_directive(l) {
                if !is_name(v) {
                    return Err(err(
                        n,
                        format!("request name `{v}` may hold only letters, digits, _ and -"),
                    ));
                }
                name = Some(v.to_owned());
            }
        } else if let Some(rest) = l.trim_start().strip_prefix('@') {
            define(n, rest, vars)?;
        } else {
            break request_line(n, l, name.take(), vars)?;
        }
    };
    for (n, l) in lines.by_ref() {
        if l.trim().is_empty() {
            break;
        }
        if !is_comment(l) {
            header(n, l, &mut request, vars)?;
        }
    }
    let body: Vec<Line> = lines.collect();
    let used = |&(_, l): &Line| !l.trim().is_empty();
    // Blank and comment-like lines alone are a note after the request, not a body.
    if body.iter().any(|l| used(l) && !is_comment(l.1))
        && let (Some(first), Some(last)) = (body.iter().position(used), body.iter().rposition(used))
    {
        request.body = Some(body_text(&body[first..=last], vars)?);
    }
    Ok(Some(request))
}

fn is_comment(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with('#') || t.starts_with("//")
}

/// The name in `# @name x` or `// @name x`.
fn name_directive(line: &str) -> Option<&str> {
    let t = line.trim_start();
    let t = t.strip_prefix("//").or_else(|| t.strip_prefix('#'))?;
    let rest = t
        .trim_start_matches(['#', '/'])
        .trim_start()
        .strip_prefix("@name")?;
    (rest.is_empty() || rest.starts_with(char::is_whitespace)).then(|| rest.trim())
}

/// Request names, variable names and secret names: they end up in folder names and store keys.
fn is_name(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// `rest` is a line after its `@`.
fn define(n: usize, rest: &str, vars: &mut Vars) -> Result<(), ParseError> {
    let (name, value) = rest
        .split_once('=')
        .ok_or_else(|| err(n, format!("`@{}` is not `@name = value`", rest.trim())))?;
    let name = name.trim();
    if !is_name(name) {
        return Err(err(
            n,
            format!("variable name `{name}` may hold only letters, digits, _ and -"),
        ));
    }
    let value = expand(value.trim(), n, vars)?;
    vars.insert(name.to_owned(), value);
    Ok(())
}

fn request_line(
    n: usize,
    line: &str,
    name: Option<String>,
    vars: &Vars,
) -> Result<Request, ParseError> {
    let bad = || err(n, format!("`{}` is not `METHOD URL`", line.trim()));
    let (method, rest) = line
        .trim()
        .split_once(char::is_whitespace)
        .ok_or_else(bad)?;
    if !method.bytes().all(|b| b.is_ascii_alphabetic()) {
        return Err(bad());
    }
    let rest = rest.trim();
    let url = match rest.rsplit_once(char::is_whitespace) {
        Some((url, version)) if version.starts_with("HTTP/") => url,
        _ => rest,
    };
    let (origin, path) = split_url(expand(url.trim(), n, vars)?, n)?;
    Ok(Request {
        name,
        line: n,
        method: method.to_ascii_uppercase(),
        origin,
        path,
        headers: Vec::new(),
        basic: None,
        body: None,
    })
}

/// The origin comes from the URL's literal start; a token there would let a reply or secret pick the host.
fn split_url(url: Text, n: usize) -> Result<(Origin, Text), ParseError> {
    let in_host = || {
        err(
            n,
            "the host must be written in the URL, not set by a {{...}} token",
        )
    };
    let mut parts = url.0.into_iter();
    let Some(Part::Lit(first)) = parts.next() else {
        return Err(in_host());
    };
    let (scheme, rest) = first
        .split_once("://")
        .ok_or_else(|| err(n, "the URL must start with http:// or https://"))?;
    let end = rest.find(['/', '?', '#']);
    if end.is_none() && parts.len() > 0 {
        return Err(in_host());
    }
    let (authority, tail) = rest.split_at(end.unwrap_or(rest.len()));
    let shown = format!("{scheme}://{authority}");
    let base = Url::parse(&shown).map_err(|e| err(n, format!("`{shown}` is not a URL: {e}")))?;
    if !matches!(base.scheme(), "http" | "https") {
        return Err(err(
            n,
            format!("`{shown}`: only http and https are supported"),
        ));
    }
    if !base.username().is_empty() || base.password().is_some() {
        return Err(err(
            n,
            "credentials in the URL are not supported; use an `Authorization: Basic` header",
        ));
    }
    let host = base
        .host_str()
        .ok_or_else(|| err(n, format!("`{shown}` has no host")))?;
    let origin = Origin {
        https: base.scheme() == "https",
        host: host.to_owned(),
        port: base.port(),
    };
    let mut path = Text::default();
    if !tail.starts_with('/') {
        path.push_lit("/");
    }
    path.push_lit(tail);
    path.0.extend(parts);
    Ok((origin, path))
}

fn header(n: usize, line: &str, request: &mut Request, vars: &Vars) -> Result<(), ParseError> {
    let (name, value) = line
        .split_once(':')
        .map(|(name, value)| (name.trim(), value.trim()))
        .filter(|(name, _)| {
            !name.is_empty()
                && name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
        })
        .ok_or_else(|| {
            err(
                n,
                format!(
                    "`{}` is not a `Name: value` header (a body follows a blank line)",
                    line.trim()
                ),
            )
        })?;
    if name.eq_ignore_ascii_case("host") {
        return Err(err(
            n,
            "a Host header is not supported: the URL alone says where a request goes",
        ));
    }
    let (scheme, credentials) = value.split_once(char::is_whitespace).unwrap_or((value, ""));
    if name.eq_ignore_ascii_case("authorization") && scheme.eq_ignore_ascii_case("basic") {
        request.basic = Some(basic(expand(credentials.trim(), n, vars)?, n)?);
    } else {
        request
            .headers
            .push((name.to_owned(), expand(value, n, vars)?));
    }
    Ok(())
}

/// Splits only on a literal space or colon: a token (`{{$dotenv U}}`) holds a space of its own.
fn basic(credentials: Text, n: usize) -> Result<BasicAuth, ParseError> {
    let (mut user, mut password) = (Text::default(), Text::default());
    let mut split = false;
    for part in credentials.0 {
        match part {
            Part::Lit(s) if !split => match s.split_once([' ', ':']) {
                Some((u, p)) => {
                    user.push_lit(u);
                    password.push_lit(p.trim_start());
                    split = true;
                }
                None => user.push_lit(&s),
            },
            other if split => password.push(other),
            other => user.push(other),
        }
    }
    if !split {
        return Err(err(n, "Basic needs `user password` or `user:password`"));
    }
    Ok(BasicAuth { user, password })
}

fn body_text(lines: &[Line], vars: &Vars) -> Result<Text, ParseError> {
    let mut body = Text::default();
    for (i, &(n, l)) in lines.iter().enumerate() {
        // `< file` and `<@ file` import a file; an XML tag never has a space or @ after its `<`.
        if l.trim_start()
            .strip_prefix('<')
            .is_some_and(|r| r.starts_with(|c: char| c.is_whitespace() || c == '@'))
        {
            return Err(err(
                n,
                format!(
                    "`{}` is not supported: a body cannot import a file",
                    l.trim()
                ),
            ));
        }
        if i > 0 {
            body.push_lit("\n");
        }
        body.append(expand(l, n, vars)?);
    }
    Ok(body)
}

/// Reads the `{{...}}` tokens of one line; file variables are spliced in here, so nothing later sees them.
fn expand(s: &str, n: usize, vars: &Vars) -> Result<Text, ParseError> {
    let mut out = Text::default();
    let mut rest = s;
    while let Some(open) = rest.find("{{") {
        out.push_lit(&rest[..open]);
        let close = open
            + rest[open..]
                .find("}}")
                .ok_or_else(|| err(n, format!("`{}` has no closing `}}}}`", &rest[open..])))?;
        out.append(token(
            rest[open + 2..close].trim(),
            &rest[open..close + 2],
            n,
            vars,
        )?);
        rest = &rest[close + 2..];
    }
    out.push_lit(rest);
    Ok(out)
}

/// `shown` is the token as written, for the error.
fn token(raw: &str, shown: &str, n: usize, vars: &Vars) -> Result<Text, ParseError> {
    let unsupported = || err(n, format!("`{shown}` is not supported"));
    let part = if let Some(system) = raw.strip_prefix('$') {
        let (kind, arg) = system
            .split_once(char::is_whitespace)
            .map_or((system, ""), |(kind, arg)| (kind, arg.trim()));
        match (kind, arg) {
            ("dotenv", name) if is_name(name) => Part::Secret(name.to_owned()),
            ("guid", "") => Part::Guid,
            ("datetime", "iso8601") => Part::Datetime,
            ("timestamp", "") => Part::Timestamp,
            _ => return Err(unsupported()),
        }
    } else if raw.contains('.') {
        reply(raw).ok_or_else(unsupported)?
    } else {
        return vars.get(raw).cloned().ok_or_else(|| {
            err(
                n,
                format!("`{shown}` is not a variable defined above this line"),
            )
        });
    };
    Ok(Text(vec![part]))
}

/// `name.response.body.<path>` or `name.response.headers.<header>`.
fn reply(raw: &str) -> Option<Part> {
    let (request, rest) = raw.split_once('.')?;
    let (body, path) = match rest.strip_prefix("response.body.") {
        Some(path) => (true, path),
        None => (false, rest.strip_prefix("response.headers.")?),
    };
    let path = path.trim();
    (is_name(request) && !path.is_empty()).then(|| Part::Reply {
        request: request.to_owned(),
        source: if body {
            Source::Body(path.to_owned())
        } else {
            Source::Header(path.to_owned())
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lit(s: &str) -> Text {
        Text(vec![Part::Lit(s.into())])
    }

    fn secret(s: &str) -> Text {
        Text(vec![Part::Secret(s.into())])
    }

    fn origin(host: &str) -> Origin {
        Origin {
            https: true,
            host: host.into(),
            port: None,
        }
    }

    fn one(src: &str) -> Request {
        let mut requests = parse(src).unwrap().requests;
        assert_eq!(requests.len(), 1, "{requests:?}");
        requests.remove(0)
    }

    fn refused(src: &str) -> ParseError {
        parse(src).unwrap_err()
    }

    #[test]
    fn optional_version_and_trailing_separator() {
        let plain = "POST https://a.example/x\nContent-Type: text/xml\n\n<a/>\n\n###\n";
        assert_eq!(
            parse(plain).unwrap().requests,
            vec![Request {
                name: None,
                line: 1,
                method: "POST".into(),
                origin: origin("a.example"),
                path: lit("/x"),
                headers: vec![("Content-Type".into(), lit("text/xml"))],
                basic: None,
                body: Some(lit("<a/>")),
            }]
        );
        let versioned = plain.replace("/x\n", "/x HTTP/1.1\n");
        assert_eq!(parse(&versioned), parse(plain));
    }

    #[test]
    fn comment_only_blocks_are_skipped() {
        let file =
            parse("### note\n# only a comment\n// another\n\n### next\nGET https://a.example/y\n")
                .unwrap();
        assert_eq!(file.requests.len(), 1);
        assert_eq!(file.requests[0].line, 6);
    }

    #[test]
    fn crlf_file_parses_like_lf() {
        let lf = "# @name a\nPOST https://a.example/x\nContent-Type: text/xml\n\n<a/>\n<b/>\n\n###\nGET https://a.example/y\n";
        let crlf = lf.replace('\n', "\r\n");
        assert_eq!(parse(&crlf), parse(lf));
        assert_eq!(parse(lf).unwrap().requests.len(), 2);
    }

    #[test]
    fn names_in_both_comment_forms() {
        let file = parse(
            "# @name a\nGET https://a.example/a\n\n###\n// @name b\nGET https://a.example/b\n",
        )
        .unwrap();
        let names: Vec<_> = file.requests.iter().map(|r| r.name.as_deref()).collect();
        assert_eq!(names, [Some("a"), Some("b")]);
    }

    #[test]
    fn request_name_is_restricted() {
        let err = refused("# @name ../../x\nGET https://a.example/x\n");
        assert_eq!(err.line, 1);
        assert!(err.message.contains("../../x"), "{err}");
        assert_eq!(
            one("# @name a-B_1\nGET https://a.example/x\n")
                .name
                .as_deref(),
            Some("a-B_1")
        );
    }

    #[test]
    fn a_repeated_name_is_refused_naming_both_lines() {
        let err = refused(
            "# @name a\nGET https://a.example/1\n\n###\n# @name b\nGET https://a.example/2\n\n###\n# @name a\nGET https://a.example/3\n",
        );
        assert_eq!(err.line, 10);
        assert!(
            err.message.contains("`a`") && err.message.contains("line 2"),
            "{err}"
        );
    }

    #[test]
    fn unnamed_requests_may_repeat() {
        let file = parse("GET https://a.example/1\n\n###\nGET https://a.example/2\n").unwrap();
        assert_eq!(file.requests.len(), 2);
    }

    #[test]
    fn a_byte_order_mark_at_the_start_is_ignored() {
        let plain = "# @name a\nGET https://a.example/x\n";
        assert_eq!(parse(&format!("\u{feff}{plain}")), parse(plain));
        assert_eq!(one("\u{feff}GET https://a.example/x\n").line, 1);
    }

    #[test]
    fn file_variables_expand_in_later_lines() {
        let req = one(
            "@baseUrl = https://a.example\n@id = 7\n\n###\nGET {{baseUrl}}/x?id={{id}}\nX-Id: {{id}}\n",
        );
        assert_eq!(req.origin, origin("a.example"));
        assert_eq!(req.path, lit("/x?id=7"));
        assert_eq!(req.headers, vec![("X-Id".into(), lit("7"))]);
    }

    #[test]
    fn variable_used_before_it_is_defined_is_refused() {
        let err = refused("GET {{baseUrl}}/x\n\n###\n@baseUrl = https://a.example\n");
        assert_eq!(err.line, 1);
        assert!(err.message.contains("{{baseUrl}}"), "{err}");
    }

    #[test]
    fn tokens_become_parts() {
        let req = one(concat!(
            "POST https://a.example/x\n",
            "X-S: {{$dotenv P}}\n",
            "X-R: {{login.response.body.//authToken}}\n",
            "X-H: {{login.response.headers.X-T}}\n",
            "X-G: {{$guid}}\n",
            "X-D: {{$datetime iso8601}}\n",
            "X-T: {{$timestamp}}\n",
            "X-M: Bearer {{login.response.body.$.token}}\n",
        ));
        let reply = |source| Part::Reply {
            request: "login".into(),
            source,
        };
        assert_eq!(
            req.headers,
            vec![
                ("X-S".into(), secret("P")),
                (
                    "X-R".into(),
                    Text(vec![reply(Source::Body("//authToken".into()))])
                ),
                (
                    "X-H".into(),
                    Text(vec![reply(Source::Header("X-T".into()))])
                ),
                ("X-G".into(), Text(vec![Part::Guid])),
                ("X-D".into(), Text(vec![Part::Datetime])),
                ("X-T".into(), Text(vec![Part::Timestamp])),
                (
                    "X-M".into(),
                    Text(vec![
                        Part::Lit("Bearer ".into()),
                        reply(Source::Body("$.token".into()))
                    ])
                ),
            ]
        );
    }

    #[test]
    fn tokens_in_comments_are_ignored() {
        let req =
            one("# {{$prompt x}}\n// {{$aadToken}}\nGET https://a.example/x\n# {{$prompt y}}\n");
        assert_eq!(req.path, lit("/x"));
    }

    #[test]
    fn comment_like_lines_stay_in_the_body() {
        let req = one(
            "POST https://a.example/x\nContent-Type: text/plain\n\nfirst\n# second\n// third\nlast\n",
        );
        assert_eq!(req.body, Some(lit("first\n# second\n// third\nlast")));
    }

    #[test]
    fn trailing_comment_is_not_a_body() {
        let req = one("GET https://a.example/x\n\n# check the result\n###\n");
        assert_eq!(req.body, None);
    }

    #[test]
    fn basic_forms() {
        let spaced =
            one("GET https://a.example/x\nAuthorization: Basic {{$dotenv U}} {{$dotenv P}}\n");
        let colon = one("GET https://a.example/x\nauthorization: Basic u:p\n");
        let mixed =
            one("GET https://a.example/x\nAuthorization: Basic {{$dotenv U}}:{{$dotenv P}}\n");
        assert_eq!(
            (spaced.basic, spaced.headers),
            (
                Some(BasicAuth {
                    user: secret("U"),
                    password: secret("P")
                }),
                vec![]
            )
        );
        assert_eq!(
            (colon.basic, colon.headers),
            (
                Some(BasicAuth {
                    user: lit("u"),
                    password: lit("p")
                }),
                vec![]
            )
        );
        assert_eq!(
            mixed.basic,
            Some(BasicAuth {
                user: secret("U"),
                password: secret("P")
            })
        );
    }

    #[test]
    fn xml_body_is_text() {
        let req = one(concat!(
            "POST https://a.example/soap\n",
            "Content-Type: text/xml; charset=utf-8\n",
            "SOAPAction: \"urn:login\"\n",
            "\n",
            "<?xml version=\"1.0\"?>\n",
            "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n",
            "  <soap:Body><t>{{login.response.body.//authToken}}</t></soap:Body>\n",
            "</soap:Envelope>\n",
        ));
        let token = Part::Reply {
            request: "login".into(),
            source: Source::Body("//authToken".into()),
        };
        assert_eq!(
            req.body,
            Some(Text(vec![
                Part::Lit(
                    "<?xml version=\"1.0\"?>\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n  <soap:Body><t>"
                        .into()
                ),
                token,
                Part::Lit("</t></soap:Body>\n</soap:Envelope>".into()),
            ]))
        );
    }

    #[test]
    fn hosts_are_lowercased() {
        assert_eq!(
            one("GET https://API.Example/x\n").origin.host,
            "api.example"
        );
    }

    #[test]
    fn origin_holds_scheme_host_and_port() {
        let req = one("GET http://a.example:8080?q=1\n");
        assert_eq!(
            req.origin,
            Origin {
                https: false,
                host: "a.example".into(),
                port: Some(8080)
            }
        );
        assert_eq!(req.path, lit("/?q=1"));
    }

    #[test]
    fn refuses_host_header() {
        let err = refused("GET https://a.example/x\nAccept: */*\nhost: evil.example\n");
        assert_eq!(err.line, 3);
        assert!(err.message.contains("Host"), "{err}");
    }

    #[test]
    fn refuses_token_in_host() {
        for url in [
            "https://{{$dotenv H}}/x",
            "https://{{a.response.body.$.h}}/x",
        ] {
            let err = refused(&format!("GET {url}\n"));
            assert_eq!(err.line, 1, "{url}");
            assert!(err.message.contains("host"), "{err}");
        }
    }

    #[test]
    fn refuses_credentials_in_the_url() {
        let err = refused("GET https://user:pw@a.example/x\n");
        assert_eq!(err.line, 1);
        assert!(err.message.contains("Basic"), "{err}");
    }

    #[test]
    fn refuses_unsupported() {
        for (src, line, construct) in [
            (
                "GET https://a.example/x\nX: {{$prompt x}}\n",
                2,
                "{{$prompt x}}",
            ),
            (
                "GET https://a.example/x\nAuthorization: Bearer {{$aadToken}}\n",
                2,
                "{{$aadToken}}",
            ),
            (
                "POST https://a.example/x\nContent-Type: text/xml\n\n< ./f.xml\n",
                4,
                "< ./f.xml",
            ),
        ] {
            let err = refused(src);
            assert_eq!(err.line, line, "{src}");
            assert!(err.message.contains(construct), "{err}");
        }
    }
}
