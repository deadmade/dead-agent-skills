# web-mcp's browser doesn't announce automation

agent-browser starts the window's Chrome with `--remote-debugging-port=0`, and Chrome answers a debugging port by
setting `navigator.webdriver` to `true` in every tab. Bot checks read that flag first. A spike
(`docs/features/web-mcp-google-block/findings.md`) found it the one signal every check named: sannysoft,
deviceandbrowserinfo and browserscan all called the window a bot for it, and Google sent the first typed search to
`/sorry`. With the flag off, the same line, profile and typing got results, and sannysoft and browserscan found
nothing. The owner config's `userAgent` never reached the tabs that do the work (they attach to the owner's Chrome),
and in the one tab it reached it stripped the client hints.

ADR 0004's "No stealth" line allowed normal browser settings and forbade fingerprint patching. The flag is a gray
case: it is the browser reporting a debugging port that agent-browser's launcher opened, not a trait of the browser
itself. So the window's normal settings now include `--disable-blink-features=AutomationControlled` in the owner's
`args`, and no user agent override at all: every tab sends the browser's own UA and matching `Sec-CH-UA` client hints.

Still forbidden: anything that makes the browser report values other than its own. That is a faked user agent,
overridden `navigator` properties, and hiding the CDP connection.

## Considered options

- **CDP `Emulation.setAutomationOverride` per tab.** Rejected: web-mcp would need its own CDP client holding a session
  per tab, for the same result as the launch switch.
- **A fixed debugging port instead of port 0.** Rejected: measured, agent-browser never connected to it
  (`--remote-debugging-port=0` can't be overridden from `args`), and its daemon kept relaunching the browser.
- **Leave the flag on and take the blocks.** Rejected: the user wants the cause fixed once, not captchas solved over
  and over.
- **Keep the `userAgent` override.** Rejected: it never reached the attached tabs, and where it did it dropped the
  client hints, which made that tab less like the browser it is.

## Consequences

- **The risk is named.** Google's terms forbid "bypassing our systems or protective measures", and turning the flag
  off can be read that way. The line held here: the switch is Chromium's own and sets no value the browser would not
  otherwise report, the window stays headed on the machine's real GPU and screen, and an engine that blocks anyway
  rests for 30 minutes instead of being worked around further.
- **What remains visible.** deviceandbrowserinfo still flags the CDP connection and two timing and worker
  inconsistencies (the latter may be Helium's fingerprint randomization). Google ignored them in the spike. Hiding
  them would be patching and stays out.
- **No browser version is read any more.** The Chrome major was only there to build the user agent, so `--version`
  runs only to check that Chrome for Testing starts.
- **Windows is not measured.** The switch is Chromium's, so it should behave the same with Chrome for Testing; the
  user runs the checks there once after release.
