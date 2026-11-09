---
name: http-runner
description: "Use when building an integration with an HTTP API, REST or SOAP, and you need its real replies. You write a .http file, run it with http-runner's run tool, fix it from the real error, and build DTOs and test fixtures from the saved replies. Needs http-runner."
---

# http-runner

Without a real reply you guess what an API returns and write tests around the guess. `run` sends one request of a `.http` file (VS Code REST Client's format, so the user can open the file there) and returns the real reply or the real error. It saves every exchange, with typed secrets masked.

## The tools

- Both take absolute paths and refuse a relative one. `run` takes only a `.http` file.
- `generate { spec, output, base_url? }` writes `<spec name>.http` in `output` from a local OpenAPI 3 file: one request per operation, named by its `operationId`, each body the spec's first example. It reaches no host and never replaces a file. A spec that lists several servers needs `base_url`: pass the sandbox, never production.
- `run { file, request, retype_login? }` sends the request named by `# @name`, after the named requests it refers to.

## Method

1. With an OpenAPI file, call `generate` with the sandbox as `base_url`. For SOAP, read the WSDL and write the file yourself; the XML body is plain text. An operation with no example has no body: write one from the schema.
2. Add the login as a named request. Secrets appear only as `{{$dotenv NAME}}`. Never write a secret into a file, and never ask for one in the chat. A host the user has not confirmed, or a secret with no saved value, makes `run` open a login page in the user's browser. When the result says that page is open, call `run` again once the user has saved. A refusal is final: plain http to any host but `localhost` and `127.0.0.1`, or a reply value that holds what the user typed for another host, means the file names the wrong host or carries a value it must not, so correct the file's host or ask the user, and never work around the refusal.
3. Read a value from an earlier reply with `{{login.response.body.<path>}}` or `{{login.response.headers.<name>}}`. A path starting with `$` is JSONPath. Any other is XPath 1.0 with no namespace map, so write `//*[local-name()='token']` for a prefixed element. Anything outside REST Client's format comes back as a parse error with its line.
4. Run, read the real error, fix the file, run again. Do not guess past an error.
5. Keep chains to logins. Every run repeats every named request it refers to, so a chain through a create request creates again each time. Copy any other value from a saved reply into a file variable (`@orderId = 123`).
6. When the carrier rejects the login, call `run` with `retype_login: true` so the user can type it again. A rejection never reopens the page by itself, and a 401 may mean your header is wrong.
7. After a timeout, read what the result says was in flight before repeating. An in-flight request may have completed, and repeating a create makes a second one. Call `run` again only when nothing was sent.

## Saved replies

Each exchange is saved, masked, as `http-replies/<file stem>/<request name>/<timestamp>.json` beside the `.http` file. Build DTOs, mappings and test fixtures only from those files, never from a reply you expect. A result is cut at 40,000 characters and can be shortened further before you read it: when it looks shortened, read the saved reply.
