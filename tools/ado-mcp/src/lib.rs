//! The MCP server's library: the config, the Azure DevOps client and the tools.

mod api;
mod config;
mod ctx;
mod file;
mod out;
mod pipeline;
mod pr;
mod remote;
mod search;
mod tools;
mod wi;
mod wiki;

pub use config::Config;
pub use tools::Server;
