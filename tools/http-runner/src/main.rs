use http_runner::tools::Server;
use rmcp::{ServiceExt, transport::stdio};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().nth(1).is_some_and(|a| a == "--version") {
        println!("http-runner {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    // ring, not aws-lc-rs: no cmake or C toolchain needed to build.
    let _ = rustls::crypto::ring::default_provider().install_default();
    Server::new()?.serve(stdio()).await?.waiting().await?;
    Ok(())
}
