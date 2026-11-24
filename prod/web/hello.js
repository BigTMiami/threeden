// @ts-check
// Hello World: reads the server and database status and the greetings from
// the API, and adds a greeting. Text from the server is set with textContent,
// never innerHTML.

const API = '/api';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {string} dotId
 * @param {string} textId
 * @param {boolean | null} ok
 * @param {string} text
 */
function setStatus(dotId, textId, ok, text) {
  const dot = $(dotId);
  dot.classList.toggle('ok', ok === true);
  dot.classList.toggle('bad', ok === false);
  $(textId).textContent = text;
}

async function loadHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const body = await res.json().catch(() => ({}));
    setStatus('server-dot', 'server-status', true, 'running');
    const dbOk = body.database === 'ok';
    setStatus('db-dot', 'db-status', dbOk, dbOk ? 'connected' : 'unavailable');
  } catch {
    setStatus('server-dot', 'server-status', false, 'not reachable');
    setStatus('db-dot', 'db-status', null, 'unknown');
  }
}

/** @param {string} iso */
function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadGreetings() {
  const list = $('greetings');
  try {
    const res = await fetch(`${API}/v1/hello`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {{count: number, latest: {id: number, message: string, created_at: string}[]}} */
    const body = await res.json();
    $('count').textContent = `(${body.count})`;
    list.replaceChildren();
    if (body.latest.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No greetings yet. Add the first one.';
      list.append(li);
      return;
    }
    for (const g of body.latest) {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = g.created_at;
      time.textContent = formatTime(g.created_at);
      li.append(g.message, time);
      list.append(li);
    }
  } catch {
    list.replaceChildren();
    const li = document.createElement('li');
    li.className = 'error';
    li.textContent = 'Couldn’t load the greetings.';
    list.append(li);
  }
}

/** @param {Response} res */
async function errorText(res) {
  if (res.status === 422) return 'A greeting needs 1 to 200 characters.';
  return `The server said no (HTTP ${res.status}).`;
}

function setUpForm() {
  const form = /** @type {HTMLFormElement} */ ($('add-form'));
  const input = /** @type {HTMLInputElement} */ ($('message'));
  const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'));
  const error = $('form-error');

  input.addEventListener('input', () => {
    $('chars').textContent = String(input.value.length);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    try {
      const res = await fetch(`${API}/v1/hello`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.value }),
      });
      if (!res.ok) {
        error.textContent = await errorText(res);
        error.hidden = false;
        return;
      }
      input.value = '';
      $('chars').textContent = '0';
      await loadGreetings();
    } catch {
      error.textContent = 'Couldn’t reach the server.';
      error.hidden = false;
    } finally {
      button.disabled = false;
      input.focus();
    }
  });
}

setUpForm();
loadHealth();
loadGreetings();
