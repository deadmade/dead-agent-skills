//! The one browser window per server: an owner session that launches Chrome from the slot's config, and the cdp
//! url every other session attaches to.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::browser::Browser;
use crate::profile::Profiles;

/// The window as it is now: its generation (from 1, one more each time Chrome came back on a new url) and its url.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Live {
    pub r#gen: u32,
    pub url: String,
}

pub struct Window {
    profiles: Result<Arc<Profiles>, String>,
    /// The owner's config and the last answer; `None` until the first `live`.
    state: tokio::sync::Mutex<Option<(PathBuf, Live)>>,
}

impl Window {
    #[must_use]
    pub fn new(profiles: Result<Arc<Profiles>, String>) -> Self {
        Self {
            profiles,
            state: tokio::sync::Mutex::new(None),
        }
    }

    /// The owner session: the same in every generation.
    #[must_use]
    #[expect(
        clippy::unused_self,
        reason = "the window's own name, asked of the window"
    )]
    pub(crate) fn owner(&self) -> String {
        format!("web-mcp-{}-window", std::process::id())
    }

    /// The config of every call attached to the window (`<search dir>/attach.json`), written if it changed.
    ///
    /// # Errors
    /// When there is no search folder, or the file can't be written.
    pub(crate) fn attach_config(&self) -> Result<PathBuf, String> {
        self.profiles
            .as_ref()
            .map_err(Clone::clone)?
            .attach_config()
    }

    /// Waits for, and holds, the lock every start and owner call of the window takes.
    pub(crate) async fn hold(&self) -> tokio::sync::MutexGuard<'_, Option<(PathBuf, Live)>> {
        self.state.lock().await
    }

    /// The window's generation and cdp url, starting it on the first call.
    ///
    /// # Errors
    /// When there is no search folder, browser or extension, or the owner fails.
    pub(crate) async fn live(&self, b: &Browser) -> Result<Live, String> {
        let p = self.profiles.as_ref().map_err(Clone::clone)?;
        let mut state = self.state.lock().await;
        let owner = self.owner();
        let get_url = ["get".to_owned(), "cdp-url".to_owned()];
        let url = async |config: &Path| {
            let v = b.run_owner(&owner, config, &get_url).await;
            let v = v.map_err(|e| e.to_string())?;
            v["cdpUrl"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| format!("agent-browser answered no cdp url: {v}"))
        };
        let open = ["open".to_owned(), "about:blank".to_owned()];
        if let Some((config, live)) = state.as_mut() {
            // agent-browser 0.43.0 doesn't relaunch a dead Chrome: its owner answers "Browser not launched" until an
            // `open` launches a new one, on a new port (measured). One `open` and one more ask, then the error stands.
            // A dead daemon restarts from the config.
            let url = if let Ok(url) = url(config).await {
                url
            } else {
                b.run_owner(&owner, config, &open)
                    .await
                    .map_err(|e| e.to_string())?;
                url(config).await?
            };
            if url != live.url {
                *live = Live {
                    r#gen: live.r#gen + 1,
                    url,
                };
            }
            return Ok(live.clone());
        }
        let ready = p.ready().await?;
        p.slot()?;
        let config = p.owner_config(&ready)?;
        // Linux: a Chrome a killed web-mcp left in this slot (Windows has the job for that). An owner with no
        // daemon closes without starting one (web-mcp-one-window/findings.md).
        if cfg!(target_os = "linux")
            && let Some(prev) = p.previous_owner().filter(|o| *o != owner)
        {
            b.close_owner(&prev, &config).await;
        }
        p.set_owner(&owner);
        b.run_owner(&owner, &config, &open)
            .await
            .map_err(|e| e.to_string())?;
        let live = Live {
            r#gen: 1,
            url: url(&config).await?,
        };
        *state = Some((config, live.clone()));
        Ok(live)
    }
}

/// Puts web-mcp in a kill-on-close job, so the window's daemon and Chrome die with it, even when it is killed
/// (Windows). Best effort: one line on stderr when it can't.
///
/// # Panics
/// Never: the job's limit struct is far smaller than `u32::MAX` bytes.
pub fn tie_to_process() {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };
        use windows_sys::Win32::System::Threading::GetCurrentProcess;

        // SAFETY: plain Win32 calls on a zeroed info struct and the handles they return. The job's handle is never
        // closed on success: the system closes it when web-mcp exits, which is what kills the job.
        unsafe {
            // No security attributes: the handle isn't inherited, so no child keeps the job open.
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let tied = !job.is_null()
                && SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    (&raw const info).cast(),
                    u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
                        .expect("a small struct"),
                ) != 0
                && AssignProcessToJobObject(job, GetCurrentProcess()) != 0;
            if !tied {
                eprintln!(
                    "web-mcp: its browser may outlive it: no kill-on-close job ({})",
                    std::io::Error::last_os_error()
                );
                if !job.is_null() {
                    CloseHandle(job);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::browser::{Real, end_chrome};

    #[tokio::test]
    async fn live_starts_once_for_parallel_callers() {
        let r = Real::new("parallel");
        let w = r.window();
        let (x, y) = tokio::join!(w.live(&r.b), w.live(&r.b));
        let x = x.unwrap();
        assert_eq!(x.r#gen, 1);
        assert_eq!(y.unwrap(), x);
    }

    #[tokio::test]
    async fn same_url_keeps_the_generation() {
        let r = Real::new("same");
        let w = r.window();
        let first = w.live(&r.b).await.unwrap();
        assert_eq!(first.r#gen, 1);
        assert_eq!(w.live(&r.b).await.unwrap(), first);
    }

    /// Chrome gone under the window: the owner starts another, on a new url, which is the next generation.
    #[tokio::test]
    async fn changed_url_starts_next_generation() {
        let r = Real::new("changed");
        let w = r.window();
        let first = w.live(&r.b).await.unwrap();
        end_chrome(&first.url);
        let next = w.live(&r.b).await.unwrap();
        assert_eq!(next.r#gen, 2);
        assert_ne!(next.url, first.url);
    }

    /// The owner a killed web-mcp left in the slot is closed (it has no daemon, so its close starts none), its tab
    /// binding goes with it, and the slot names the new owner.
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn previous_owner_is_closed_first() {
        let r = Real::new("previous");
        let w = r.window();
        let previous = "web-mcp-999999-window";
        std::fs::create_dir_all(r.dir.join("profiles/1")).unwrap();
        std::fs::write(r.dir.join("profiles/1/owner"), previous).unwrap();
        std::fs::create_dir_all(&r.b.session_dir).unwrap();
        let target = r.b.session_dir.join(format!("{previous}.target"));
        std::fs::write(&target, "{}").unwrap();
        w.live(&r.b).await.unwrap();
        assert!(!target.exists(), "{} is left", target.display());
        let owner = std::fs::read_to_string(r.dir.join("profiles/1/owner")).unwrap();
        assert_eq!(owner, w.owner());
    }

    /// Run as a helper (`WEB_MCP_TIE_HELPER` = a pid file): ties itself, starts a sleeping child, writes its pid
    /// and waits to be killed.
    #[cfg(windows)]
    #[test]
    fn tie_to_process_kills_children() {
        use std::time::{Duration, Instant};
        use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
        };

        if let Some(pid_file) = std::env::var_os("WEB_MCP_TIE_HELPER") {
            tie_to_process();
            let mut child = std::process::Command::new("ping")
                .args(["-n", "60", "127.0.0.1"])
                .stdout(std::process::Stdio::null())
                .spawn()
                .unwrap();
            std::fs::write(pid_file, child.id().to_string()).unwrap();
            let _ = child.wait(); // until the test kills this helper
            return;
        }
        let pid_file = std::env::temp_dir().join(format!("web-mcp-tie-{}", std::process::id()));
        let _ = std::fs::remove_file(&pid_file);
        let mut helper = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "window::tests::tie_to_process_kills_children"])
            .env("WEB_MCP_TIE_HELPER", &pid_file)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let until = Instant::now() + Duration::from_secs(20);
        let pid = loop {
            if let Some(pid) = std::fs::read_to_string(&pid_file)
                .ok()
                .and_then(|s| s.parse::<u32>().ok())
            {
                break pid;
            }
            assert!(Instant::now() < until, "the helper never started its child");
            std::thread::sleep(Duration::from_millis(50));
        };
        // SAFETY: plain Win32 calls on a pid and the handle they return, closed below.
        unsafe {
            let child = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
            assert!(!child.is_null(), "the child is already gone");
            helper.kill().unwrap(); // TerminateProcess: no cleanup runs in the helper
            let gone = WaitForSingleObject(child, 2000) == WAIT_OBJECT_0;
            CloseHandle(child);
            assert!(gone, "the child outlived its killed parent");
        }
        let _ = helper.wait();
    }
}
