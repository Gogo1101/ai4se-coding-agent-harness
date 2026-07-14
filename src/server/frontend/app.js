let ws = null;
let currentTaskId = null;

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.id.replace('nav-', '')}`).classList.add('active');
    if (btn.id === 'nav-history') loadTasks();
    if (btn.id === 'nav-key') loadKeyStatus();
  });
});

document.getElementById('btn-add-file').addEventListener('click', () => {
  const entry = document.querySelector('.test-file-entry').cloneNode(true);
  entry.querySelector('.test-content').value = '';
  document.getElementById('test-files-container').appendChild(entry);
  entry.querySelector('.btn-remove-file').addEventListener('click', () => entry.remove());
});
document.querySelectorAll('.btn-remove-file').forEach(btn => btn.addEventListener('click', (e) => e.target.parentElement.remove()));

document.getElementById('btn-start-task').addEventListener('click', async () => {
  const description = document.getElementById('task-description').value.trim();
  if (!description) return;
  const testFiles = {};
  document.querySelectorAll('.test-file-entry').forEach(entry => {
    const filename = entry.querySelector('.test-filename').value.trim();
    const content = entry.querySelector('.test-content').value;
    if (content.trim()) {
      const name = filename || `test_auto_${Date.now()}.py`;
      testFiles[name] = content;
    }
  });
  const response = await fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, testFiles }),
  });
  const { taskId } = await response.json();
  currentTaskId = taskId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-running').classList.add('active');
  connectWebSocket();
});

function connectWebSocket() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (event) => {
    const { type, payload } = JSON.parse(event.data);
    appendEvent(type, payload);
    if (type === 'tool:executed' && payload.action && payload.action.type === 'write_file') {
      showCode(payload.action.path, payload.action.content);
    }
    if (type === 'round:completed' && payload.feedback) {
      showTestResults(payload.feedback);
    }
    if (type === 'task:completed') {
      showStatus(payload.status);
    }
    if (type === 'agent:stopped') {
      showStatus(payload.reason);
    }
    if (type === 'guardrail:approval_requested') showHitlPanel(payload);
    if (type === 'guardrail:approval_responded') hideHitlPanel();
  };
}

function appendEvent(type, payload) {
  const log = document.getElementById('event-log');
  const div = document.createElement('div');
  div.className = `event event-${type.split(':')[0]}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${type}: ${JSON.stringify(payload)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function showCode(path, content) {
  const panel = document.getElementById('code-display');
  const codeEl = document.getElementById('code-content');
  panel.classList.remove('hidden');
  codeEl.textContent = content;
}

function showTestResults(feedback) {
  const panel = document.getElementById('test-results');
  const summary = document.getElementById('test-summary');
  const failures = document.getElementById('test-failures');
  panel.classList.remove('hidden');
  const passed = feedback.passed || 0;
  const failed = feedback.failed || 0;
  const total = feedback.total || 0;
  summary.innerHTML = `<span class="${failed === 0 ? 'test-pass' : 'test-fail'}">${passed}/${total} passed</span>`;
  if (feedback.failures && feedback.failures.length > 0) {
    failures.innerHTML = feedback.failures.map(f =>
      `<div class="test-failure-item"><strong>${f.testName}</strong><br>${f.assertion || ''}<br>Expected: ${f.expected || 'N/A'} | Actual: ${f.actual || 'N/A'}<br>${f.traceback || ''}</div>`
    ).join('');
  } else {
    failures.innerHTML = '';
  }
}

function showStatus(status) {
  const el = document.getElementById('status-line');
  if (status === 'success') {
    el.innerHTML = '<span class="test-pass">✓ Task completed successfully</span>';
  } else if (status === 'failure') {
    el.innerHTML = '<span class="test-fail">✗ Task failed</span>';
  } else {
    el.textContent = status;
  }
}

function showHitlPanel(payload) {
  const panel = document.getElementById('hitl-panel');
  panel.classList.remove('hidden');
  document.getElementById('hitl-reason').textContent = `${payload.action.type}: ${payload.reason}`;
}
function hideHitlPanel() { document.getElementById('hitl-panel').classList.add('hidden'); }

document.getElementById('btn-approve').addEventListener('click', () => { if (ws) ws.send(JSON.stringify({ type: 'approve', taskId: currentTaskId })); });
document.getElementById('btn-reject').addEventListener('click', () => { if (ws) ws.send(JSON.stringify({ type: 'reject', taskId: currentTaskId })); });

async function loadTasks() {
  const response = await fetch('/api/tasks');
  const tasks = await response.json();
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `<span class="status status-${task.status}">${task.status}</span><strong>${task.description}</strong><br><small>${task.createdAt}</small>`;
    list.appendChild(card);
  });
}

async function loadKeyStatus() {
  const response = await fetch('/api/credentials');
  const data = await response.json();
  document.getElementById('key-status').textContent = data.status;
}
