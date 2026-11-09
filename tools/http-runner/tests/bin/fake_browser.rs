//! A stand-in for the system browser: prints its last argument (the page's address) to stdout and
//! stderr and appends it to the file after `--out` (else `$FAKE_BROWSER_OUT`). With `--fail` (else
//! `$FAKE_BROWSER_FAIL`) it exits 3, as a browser that could not open.
use std::io::Write;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let last = args.last().map_or("", String::as_str);
    println!("{last}");
    eprintln!("{last}");
    let out = args
        .iter()
        .position(|a| a == "--out")
        .and_then(|i| args.get(i + 1).cloned().map(Into::into))
        .or_else(|| std::env::var_os("FAKE_BROWSER_OUT"));
    if let Some(out) = out {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(out)
            .unwrap();
        writeln!(file, "{last}").unwrap();
    }
    if args.iter().any(|a| a == "--fail") || std::env::var_os("FAKE_BROWSER_FAIL").is_some() {
        std::process::exit(3);
    }
}
