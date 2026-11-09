# http-runner

A stdio MCP server (`http-runner`, Rust, `tools/http-runner/`) with two tools. `run` sends one named request of a VS
Code REST Client `.http` file, after the named requests it refers to, and returns the real reply. `generate` writes a
starting `.http` file from a local OpenAPI 3 file. The `http-runner` skill tells the agent how to use them.

## Where typed values live

The agent never sees a login. The server opens a page in your browser and you type each host's values there. They are
saved unencrypted in `logins.json`, never in the project. The server creates the folder so that only your user can
read it; a folder that already exists keeps its own permissions, so check any folder you pick yourself:

- Linux: `$XDG_DATA_HOME/http-runner/`, or `~/.local/share/http-runner/` when that is not set.
- Windows: `%LOCALAPPDATA%\http-runner\`.

Set `HTTP_RUNNER_DIR` to keep the file somewhere else.

## Confirming and forgetting a host

The server calls a host only after you have confirmed it on that page, and it asks once per host. A confirmed host and
its values stay until you remove them: delete the host's entry from `logins.json`, and the next run that needs the host
opens the page again.

## Review `http-replies/` before committing it

`run` saves every exchange in `http-replies/` beside the `.http` file, so that fixtures can be built from real replies.
It masks every value you typed, in the plain, XML-escaped, JSON-escaped and percent-encoded spellings and as the Base64
of a Basic header. It also masks a reply value that a request sends in a header or a SOAP header. In the reply to a
request that carried a typed value or a masked reply value, it masks a value named like a credential: a JSON key, XML element or response header
containing `token`, `session`, `jwt`, `secret`, `password` or `apikey`, the name `sid`, `Set-Cookie` and `Authorization`.

Masking does not catch:

- A credential under an unusual name, in an XML attribute or as an item of a list, until a request sends it in a header.
- A credential in the reply to a request that carried neither a typed value nor a masked reply value, until a request
  sends it in a header.
- A reply value shorter than four characters.
- A secret the carrier hashed, split or encoded in some other way.
- A value saved for a host the run did not call.
- A file saved by an earlier run, which a later run never rewrites.
- Names, addresses and other personal data, which stay readable because fixtures need them.

A real field with a credential-like name shows as `***` in the saved reply, or as nines when it holds only digits. A
masked value is replaced everywhere in that run, not only in its own field: a `token_type` of `Bearer` also hides the
word `Bearer` in every other place it appears.

One reply can add at most 256 such values, 64 KiB in all. A reply over either limit is withheld: the result and the
saved file keep its status and say why, hold none of its body or headers, and the chain stops there.
