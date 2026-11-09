"""Done-check 8: `generate`, through the MCP tool, on DHL's real OpenAPI file. Not shipped.

Usage: done-check-8.py <http-runner binary> <spec.yaml> <new empty folder>
"""
import json
import os
import subprocess
import sys

import yaml

binary, spec_path, workdir = sys.argv[1:4]
output = os.path.join(workdir, "out")
store = os.path.join(workdir, "store")
os.makedirs(output)
os.makedirs(store)

proc = subprocess.Popen(
    [binary],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
    env={"PATH": os.environ["PATH"], "HTTP_RUNNER_DIR": store},
)
counter = 0


def request(method, params):
    global counter
    counter += 1
    proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": counter, "method": method, "params": params}) + "\n")
    proc.stdin.flush()
    while True:
        line = proc.stdout.readline()
        if not line:
            sys.exit("the server closed its stdout")
        message = json.loads(line)
        if message.get("id") == counter:
            return message["result"]


def call(tool, arguments):
    result = request("tools/call", {"name": tool, "arguments": arguments})
    return result.get("isError", False), "".join(p.get("text", "") for p in result["content"])


request(
    "initialize",
    {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "done-check-8", "version": "0"}},
)
proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
proc.stdin.flush()

spec = yaml.safe_load(open(spec_path, encoding="utf-8"))
servers = [s["url"] for s in spec["servers"]]
print("servers:", servers)

error, text = call("generate", {"spec": spec_path, "output": output})
print("without base_url: isError =", error, "|", text[:200])
assert error and all(url in text for url in servers), "several servers must be refused and listed"

sandbox = next(url for url in servers if "sandbox" in url)
error, text = call("generate", {"spec": spec_path, "output": output, "base_url": sandbox})
print("with base_url: isError =", error, "|", text[:200])
assert not error, text

http_file = next(os.path.join(output, name) for name in os.listdir(output) if name.endswith(".http"))
content = open(http_file, encoding="utf-8").read()

error, text = call("run", {"file": http_file, "request": "no_such_request"})
print("parse check through run:", text[:200])
assert "cannot be run" not in text, "the generated file must parse"

blocks = content.split("\n###")
block = next(b for b in blocks if "# @name createOrders" in b)
lines = block.split("\n")
start = next(i for i, line in enumerate(lines) if line.startswith("POST "))
blank = next(i for i in range(start, len(lines)) if not lines[i].strip())
body = "\n".join(lines[blank + 1 :]).strip()
expected = spec["components"]["examples"]["DHLPaket"]["value"]
parsed = json.loads(body)
assert parsed == expected, "createOrders' body differs from DHLPaket's value"
assert json.dumps(parsed) == json.dumps(expected), "createOrders' body has its keys in another order"
print("createOrders body equals components.examples.DHLPaket.value, keys in order:", len(body), "chars")

before = content
error, text = call("generate", {"spec": spec_path, "output": output, "base_url": sandbox})
print("second generate: isError =", error, "|", text[:200])
assert error and open(http_file, encoding="utf-8").read() == before, "a second generate must be refused"

proc.stdin.close()
proc.wait(timeout=10)
print("DONE-CHECK 8: PASS")
