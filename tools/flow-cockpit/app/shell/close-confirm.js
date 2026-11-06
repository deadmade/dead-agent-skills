// The close confirmation: shell chrome, not a view. Closing the window stops every hosted session, so when one is still
// working, waiting for the user, or too new to tell, the app holds the close and emits `close-requested`. This plain
// dialog (no Tauri plugin) asks once. "Close anyway" calls `shell.confirmClose`, which only the shell's own chrome
// holds: it stops the sessions and closes the window from the app's side, so a view can never close it.

/**
 * @typedef {{ confirmClose(): Promise<void> }} CloseShell
 * @typedef {(event: string, handler: () => void) => Promise<unknown>} Listen
 */

/** @param {unknown} err */
const reason = (err) => (err instanceof Error ? err.message : String(err));

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {...(Node | string)} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className = '', ...kids) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids);
  return node;
}

/**
 * Mounts the dialog into `host` and shows it whenever the app asks to close. Resolves once it is listening.
 * @param {{ shell: CloseShell, listen: Listen, host?: HTMLElement }} app
 */
export async function mountCloseConfirm({ shell, listen, host = document.body }) {
  const title = el('h2', '', 'Close the window?');
  title.id = 'close-confirm-title';
  const problem = el('p', 'error');
  problem.setAttribute('role', 'alert');
  problem.hidden = true;
  const keep = el('button', '', 'Keep working');
  keep.type = 'button';
  keep.dataset.keep = '';
  const close = el('button', '', 'Close anyway');
  close.type = 'button';
  close.dataset.closeAnyway = '';
  const dialog = el(
    'dialog',
    'close-dialog',
    title,
    el(
      'p',
      '',
      'A session is still working, waiting for you, or just started. Closing the window stops every session.',
    ),
    problem,
    el('div', 'actions', close, keep),
  );
  dialog.setAttribute('aria-labelledby', title.id);
  host.append(dialog);

  keep.addEventListener('click', () => dialog.close());
  close.addEventListener('click', async () => {
    close.disabled = true;
    problem.hidden = true;
    try {
      await shell.confirmClose();
    } catch (err) {
      problem.textContent = `The window didn't close: ${reason(err)}`;
      problem.hidden = false;
      close.disabled = false;
    }
  });

  // A second close request while the dialog is up is the same question: it is shown once.
  await listen('close-requested', () => {
    if (!dialog.open) dialog.showModal();
  });
  return { dialog };
}
