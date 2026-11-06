//! The one place a hosted session's `claude` command line is built. Fields come from the start form; the PTY layer
//! receives only the argv this module returns.

use std::path::PathBuf;

use uuid::Uuid;

/// What the start form resolved: the folder to run in (the checkout, or an existing worktree, already picked), an
/// optional new worktree name, and the optional flags and prompt. `session_id` is generated once by the caller and
/// reused for the preview and the launch.
pub struct LaunchSpec {
    pub cwd: PathBuf,
    pub new_worktree: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub prompt: Option<String>,
    pub session_id: Uuid,
}

#[must_use]
pub fn build_start_argv(spec: &LaunchSpec) -> Vec<String> {
    let mut argv = vec![
        "claude".to_owned(),
        "--session-id".to_owned(),
        spec.session_id.to_string(),
    ];
    if let Some(model) = &spec.model {
        argv.extend(["--model".to_owned(), model.clone()]);
    }
    if let Some(effort) = &spec.effort {
        argv.extend(["--effort".to_owned(), effort.clone()]);
    }
    if let Some(name) = &spec.new_worktree {
        argv.extend(["-w".to_owned(), name.clone()]);
    }
    if let Some(prompt) = &spec.prompt {
        argv.extend(["--".to_owned(), prompt.clone()]);
    }
    argv
}

#[must_use]
pub fn build_resume_argv(id: Uuid) -> Vec<String> {
    vec!["claude".to_owned(), "--resume".to_owned(), id.to_string()]
}

#[must_use]
pub fn preview_command(spec: &LaunchSpec) -> String {
    build_start_argv(spec)
        .iter()
        .map(|arg| shell_quote(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_quote(arg: &str) -> String {
    let safe = !arg.is_empty()
        && arg
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_./=:,@%+".contains(&b));
    if safe {
        arg.to_owned()
    } else {
        format!("'{}'", arg.replace('\'', r"'\''"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> LaunchSpec {
        LaunchSpec {
            cwd: PathBuf::from("/work/repo"),
            new_worktree: None,
            model: None,
            effort: None,
            prompt: None,
            session_id: Uuid::nil(),
        }
    }

    #[test]
    fn start_argv_has_session_id_and_model_and_effort() {
        let id = Uuid::new_v4();
        let spec = LaunchSpec {
            model: Some("opus".into()),
            effort: Some("high".into()),
            session_id: id,
            ..spec()
        };
        assert_eq!(
            build_start_argv(&spec),
            [
                "claude",
                "--session-id",
                &id.to_string(),
                "--model",
                "opus",
                "--effort",
                "high"
            ]
        );
    }

    #[test]
    fn start_argv_new_worktree_adds_dash_w() {
        let spec = LaunchSpec {
            new_worktree: Some("fix-login".into()),
            ..spec()
        };
        assert_eq!(
            build_start_argv(&spec),
            [
                "claude",
                "--session-id",
                &Uuid::nil().to_string(),
                "-w",
                "fix-login"
            ]
        );
    }

    #[test]
    fn start_argv_prompt_is_after_double_dash() {
        let spec = LaunchSpec {
            prompt: Some("-explain the diff".into()),
            ..spec()
        };
        assert_eq!(
            build_start_argv(&spec),
            [
                "claude",
                "--session-id",
                &Uuid::nil().to_string(),
                "--",
                "-explain the diff"
            ]
        );
    }

    #[test]
    fn resume_argv_takes_an_id() {
        let id = Uuid::new_v4();
        assert_eq!(
            build_resume_argv(id),
            ["claude", "--resume", &id.to_string()]
        );
    }

    #[test]
    fn preview_command_matches_the_given_id() {
        let id = Uuid::new_v4();
        let spec = LaunchSpec {
            model: Some("sonnet".into()),
            prompt: Some("hello world".into()),
            session_id: id,
            ..spec()
        };
        assert_eq!(
            preview_command(&spec),
            format!("claude --session-id {id} --model sonnet -- 'hello world'")
        );
    }
}
