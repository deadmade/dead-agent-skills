// Every command the window can call. A command left out here is not gated by a capability, and one left out of
// capabilities/default.json is refused; `every_registered_command_has_a_capability` keeps both lists and main.rs's
// handlers the same.
const COMMANDS: &[&str] = &[
    "projects",
    "entries",
    "flow_run",
    "doc",
    "session",
    "tool_input",
    "tool_result",
    "views",
    "view_source",
    "extensions",
    "preview_command",
    "start_session",
    "resume_session",
    "send_input",
    "resize_session",
    "kill_session",
    "hosted_sessions",
    "subscribe_session",
    "scrollback",
    "confirm_close",
    "background_tasks",
    "background_output",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
