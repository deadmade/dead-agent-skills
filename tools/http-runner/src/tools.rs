//! The MCP server: two fixed tools over `run::run` and `generate::generate`.

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::schemars::{self, JsonSchema};
use rmcp::{ServerHandler, tool, tool_handler, tool_router};
use serde::Deserialize;

use crate::generate;
use crate::login_page::{Open, Pages};
use crate::run::{self, Ctx, RunArgs};
use crate::store::Store;

/// How long a login page stays open across calls.
const PAGE_LIFETIME: Duration = Duration::from_secs(300);

pub struct Server {
    ctx: Arc<Ctx>,
    router: ToolRouter<Self>,
}

/// An environment variable that only debug builds read, so tests can stand in for the browser and the clock.
fn hook(name: &str) -> Option<OsString> {
    cfg!(debug_assertions)
        .then(|| std::env::var_os(name))
        .flatten()
}

impl Server {
    /// # Errors
    ///
    /// Returns why there is no folder for the saved logins, or why the HTTP client cannot be built.
    pub fn new() -> Result<Self, String> {
        let store = Arc::new(Store::open()?);
        let open =
            hook("HTTP_RUNNER_OPEN").map_or(Open::System, |program| Open::Program(vec![program]));
        let pages = Pages::new(store.clone(), open, PAGE_LIFETIME);
        let mut ctx = Ctx::new(store, pages)?;
        if let Some(ms) = hook("HTTP_RUNNER_DEADLINE_MS").and_then(|v| v.to_str()?.parse().ok()) {
            ctx.deadline = Duration::from_millis(ms);
        }
        Ok(Self {
            ctx: Arc::new(ctx),
            router: Self::tool_router(),
        })
    }
}

#[derive(Deserialize, JsonSchema)]
#[schemars(crate = "schemars")]
struct RunParams {
    /// Absolute path of the .http file.
    file: PathBuf,
    /// The request's name, the text after `# @name`.
    request: String,
    /// Open the login page again for this run's hosts before anything is sent. Set it when the carrier rejected the login.
    #[serde(default)]
    retype_login: bool,
}

#[derive(Deserialize, JsonSchema)]
#[schemars(crate = "schemars")]
struct GenerateParams {
    /// Absolute path of a local `OpenAPI` 3 file, YAML or JSON.
    spec: PathBuf,
    /// Absolute path of the folder to write `<spec name>.http` in.
    output: PathBuf,
    /// The base URL to use. Needed when the spec lists several servers: pass the sandbox's.
    base_url: Option<String>,
}

fn text(text: String) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(text)])
}

#[tool_router]
impl Server {
    #[tool(
        description = "Run one named request of a .http file after the requests it references, and return the status, headers and body of each reply and the path of its saved copy. A login the user has not typed yet opens a page in their browser; when the result says that page is open, call run again once the user has saved. Failures come back as text to act on."
    )]
    async fn run(&self, Parameters(a): Parameters<RunParams>) -> CallToolResult {
        // A parse error quotes the line it fails on, before any secret is known to mask: only a .http file is read.
        if !a
            .file
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("http"))
        {
            return text(format!(
                "`file` must be a .http file, not {}",
                a.file.display()
            ));
        }
        let args = RunArgs {
            file: a.file,
            request: a.request,
            retype_login: a.retype_login,
        };
        text(run::run(&self.ctx, args).await)
    }

    #[tool(
        description = "Write a .http file from a local OpenAPI 3 file: one named request per operation, each body the spec's first example. It reaches no host and never replaces a file. A spec that lists several servers needs base_url."
    )]
    async fn generate(&self, Parameters(a): Parameters<GenerateParams>) -> CallToolResult {
        // The spec reader can take its full ten-second deadline, so it stays off the async threads.
        let made = tokio::task::spawn_blocking(move || {
            generate::generate(&a.spec, &a.output, a.base_url.as_deref())
        })
        .await
        .unwrap_or_else(|_| Err("generate stopped before it finished. You can write the .http file yourself instead".into()));
        match made {
            Ok(g) => text(format!(
                "Wrote {}. Requests: {}, with a body: {}.",
                g.path.display(),
                g.requests,
                g.with_body
            )),
            Err(why) => CallToolResult::error(vec![ContentBlock::text(why)]),
        }
    }
}

// The macro generates async fns without .await; the lint is new in clippy 1.99.
#[allow(unknown_lints, clippy::unused_async_trait_impl)]
#[tool_handler(
    router = self.router,
    name = "http-runner",
    instructions = "`generate` writes a .http file from a local OpenAPI 3 file, and `run` sends one named request of a .http file after the requests it references and returns the carrier's real reply, which it also saves under http-replies next to the file. Pass absolute paths; the user types every login on a page that opens in their browser, so never ask for a secret in the chat, and when `run` says that page is open, call it again once the user has saved."
)]
impl ServerHandler for Server {}
