fn main() {
    if std::env::args().nth(1).is_some_and(|a| a == "--version") {
        println!("http-runner {}", env!("CARGO_PKG_VERSION"));
    }
}
