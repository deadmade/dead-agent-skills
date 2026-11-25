// app-shell.html's app: writes an article of about 48,000 characters that names the page's path.
const path = location.pathname;
let html = `<article><h1>Rendered ${path}</h1>`;
for (let i = 0; i < 120; i++) {
  html += `<p>Paragraph ${i} of ${path}, written by its script after load. `;
  html += 'The server sent an empty shell; only a browser that runs scripts sees this text. '.repeat(4);
  html += '</p>';
}
document.getElementById('root').innerHTML = `${html}</article>`;
