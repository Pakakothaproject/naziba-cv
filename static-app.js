// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  models: [],
  messages: [],
  processing: false,
  extractedCv: '',
  extractedLetter: '',
  lastAiContent: '',
  suggestions: [],
  apiKey: '',
};

const $ = id => document.getElementById(id);
const SESSION_KEY = 'careercraft_session';
const MODEL_KEY = 'careercraft_model';
const THEME_KEY = 'careercraft_theme';
const API_KEY = 'careercraft_api_key';

// ─── THEME ───────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  $('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  $('themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'tt' + (isError ? ' er' : '');
  el.textContent = msg;
  $('tc').appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

// ─── FILE UPLOAD ─────────────────────────────────────────────────────────────
function setupFileUpload(inputId, textareaId, fileLabelId) {
  const input = $(inputId);
  const textarea = $(textareaId);
  const label = $(fileLabelId);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (text.trim().length > 100000) { showToast('File too large (max 100KB)', true); return; }
      textarea.value = text;
      updateCount(textareaId);
      if (label) label.textContent = file.name;
      showToast(`Loaded ${file.name}`);
    } catch { showToast('Could not read file', true); }
  });
}

function updateCount(id) {
  const ta = $(id);
  const map = { cvI: 'cvC', clI: 'clC', jobI: 'jobC' };
  const el = $(map[id]);
  if (el) el.textContent = (ta?.value?.length ?? 0).toLocaleString();
}

// ─── MARKDOWN ────────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  let h = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h = h.replace(/```cover-letter\s*\n([\s\S]*?)```/gi, (_, c) =>
    '<div class="out-card out-letter"><div class="out-label">✉️ Cover Letter</div><div class="out-body">' +
    c.trim().replace(/\n/g,'<br>') + '</div></div>');
  h = h.replace(/```cv\s*\n([\s\S]*?)```/gi, (_, c) =>
    '<div class="out-card out-cv"><div class="out-label">📄 Optimized CV</div><div class="out-body">' +
    c.trim().replace(/\n/g,'<br>') + '</div></div>');
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^#### (.+)$/gm, '<h5>$1</h5>');
  h = h.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  h = h.replace(/^\|(.+)\|$/gm, (m) => {
    if (/^\|[\s\-:]+\|$/.test(m)) return '<tr class="sep"><td colspan="99"></td></tr>';
    const cells = m.split('|').filter(c => c.trim()).map(c => c.trim());
    const tag = /-/.test(m) ? 'th' : 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  });
  let tblCount = 0;
  h = h.replace(/(<tr>.*?<\/tr>)/g, (m) => {
    if (m.includes('sep')) return m;
    tblCount++;
    const tag = tblCount % 2 === 1 ? '<table>' : '';
    if (tblCount === 1) return tag + m;
    const prevClose = '</table>';
    return prevClose + tag + m;
  });
  if (tblCount > 0) h += '</table>';
  h = h.replace(/(<\/table>){2,}/g, '</table>');
  h = h.replace(/^---+\s*$/gm, '<hr>');

  const blocks = h.split(/(<(?:pre|code|table|h[1-5]|hr)[^>]*>[\s\S]*?<\/(?:pre|code|table|h[1-5]|hr)>)/);
  for (let i = 0; i < blocks.length; i += 2) {
    blocks[i] = blocks[i]
      .replace(/^(•|[-*]) /gm, '<br>• ')
      .replace(/^\d+\. /gm, '<br>$&')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
  return blocks.join('');
}

// ─── CHAT ────────────────────────────────────────────────────────────────────
function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const b = document.createElement('div');
  b.className = 'bb';
  if (role === 'ai') { b.innerHTML = renderMarkdown(text); state.lastAiContent = text; }
  else b.textContent = text;
  el.appendChild(b);
  clearEmptyState();
  $('chat').appendChild(el);
  scrollChat();
  state.messages.push({ role, text: role === 'ai' ? text : text });
  if (role === 'ai') extractOutputs(text);
  saveSession();
  updateActionButtons();
}

function scrollChat() { $('chat').scrollTop = $('chat').scrollHeight; }

function updateLastMessage(text) {
  const msgs = $('chat').querySelectorAll('.msg.ai');
  if (!msgs.length) return;
  msgs[msgs.length - 1].querySelector('.bb').innerHTML = renderMarkdown(text);
  scrollChat();
  state.lastAiContent = text;
  if (state.messages.length && state.messages[state.messages.length - 1].role === 'ai') {
    state.messages[state.messages.length - 1].text = text;
  }
  extractOutputs(text);
  saveSession();
  updateActionButtons();
}

function clearEmptyState() {
  const ee = $('chat').querySelector('.chat-e');
  if (ee) ee.remove();
}

function extractOutputs(text) {
  const cvBlock = text.match(/```cv\s*\n([\s\S]*?)```/i);
  if (cvBlock) state.extractedCv = cvBlock[1].trim();

  const clBlock = text.match(/```cover-letter\s*\n([\s\S]*?)```/i);
  if (clBlock) state.extractedLetter = clBlock[1].trim();

  if (!state.extractedCv) {
    const blocks = text.match(/```(\w*)\s*\n([\s\S]*?)```/g);
    if (blocks) for (const b of blocks) {
      const first = b.split('\n')[0].toLowerCase();
      if (/cv|resume/i.test(first)) { const c = b.replace(/^```\w*\s*\n/,'').replace(/```$/,'').trim(); if (c.length>50) state.extractedCv = c; }
    }
  }
  if (!state.extractedLetter) {
    const blocks = text.match(/```(\w*)\s*\n([\s\S]*?)```/g);
    if (blocks) for (const b of blocks) {
      const first = b.split('\n')[0].toLowerCase();
      if (/cover.?letter/i.test(first)) { const c = b.replace(/^```\w*\s*\n/,'').replace(/```$/,'').trim(); if (c.length>50) state.extractedLetter = c; }
    }
  }

  const hasCv = !!state.extractedCv;
  const hasLetter = !!state.extractedLetter;
  updateActionButtons();

  parseSuggestions(text);
}

function showTyping() { $('tyi').classList.add('on'); }
function hideTyping() { $('tyi').classList.remove('on'); }

function setStatus(type, text) {
  $('sDot').className = 'dot d-' + type;
  $('sText').textContent = text;
}

// ─── SUGGESTIONS ─────────────────────────────────────────────────────────────
function parseSuggestions(text) {
  const lines = text.split('\n');
  const suggs = [];
  let inDiag = false, inChanges = false, inItem = false;
  let current = { issue: '', desc: '', suggestion: '' };

  for (const line of lines) {
    const s = line.trim();
    if (/diagnostic\s*summary/i.test(s)) { inDiag = true; inChanges = false; continue; }
    if (/priority\s*changes|improvements?|action\s*items/i.test(s)) { inDiag = false; inChanges = true; continue; }
    if (inChanges && /^\d+[\.\)]/.test(s)) {
      if (inItem && current.issue) suggs.push({ ...current });
      current = { issue: '', desc: '', suggestion: '' };
      inItem = true;
      current.issue = s.replace(/^\d+[\.\)]\s*/, '');
      continue;
    }
    if (inItem && /^[A-Z]/.test(s) && s.length > 10 && !current.desc) {
      current.desc = s;
      continue;
    }
    if (inItem && /suggest|change|rewrite|replace|use|add/i.test(s) && s.length > 5) {
      if (current.suggestion) current.suggestion += ' ' + s;
      else current.suggestion = s;
    }
    if (s.startsWith('```') && current.issue && current.suggestion) {
      suggs.push({ ...current });
      current = { issue: '', desc: '', suggestion: '' };
      inItem = false;
    }
  }
  if (inItem && current.issue && current.suggestion) suggs.push({ ...current });

  if (suggs.length >= 2) {
    state.suggestions = suggs.map(s => ({
      ...s,
      icon: '→',
      status: 'pending',
    }));
    renderSuggestions();
  }
}

function renderSuggestions() {
  const list = $('suggList');
  const panel = $('suggPanel');
  const bar = $('suggBar');

  if (!state.suggestions.length) {
    panel.classList.remove('on');
    return;
  }

  panel.classList.add('on');
  $('suggCount').textContent = `${state.suggestions.length} items`;
  list.innerHTML = '';

  let accepted = 0;
  for (const [i, s] of state.suggestions.entries()) {
    if (s.status === 'accepted') accepted++;
    const card = document.createElement('div');
    card.className = 'sugg-card' + (s.status === 'accepted' ? ' resolved' : '');
    const statClass = `sg-stat-${s.status}`;
    const statLabel = s.status === 'accepted' ? '✓ Accepted' : s.status === 'rejected' ? '✕ Rejected' : 'Pending';

    card.innerHTML = `
      <div class="sg-top">
        <span class="sg-icon">${s.icon || '→'}</span>
        <div class="sg-body">
          <div class="sg-issue">${escHtml(s.issue)}</div>
          ${s.desc ? `<div class="sg-desc">${escHtml(s.desc)}</div>` : ''}
          <div class="sg-edit" id="sgEdit${i}">
            <textarea id="sgEditTA${i}">${escHtml(s.suggestion || '')}</textarea>
          </div>
          <div class="sg-actions">
            <button class="btn btn-sm btn-p" onclick="acceptSugg(${i})">${s.status === 'accepted' ? '✓' : 'Accept'}</button>
            <button class="btn btn-sm btn-s" onclick="rejectSugg(${i})">${s.status === 'rejected' ? '✕' : 'Reject'}</button>
            <button class="btn btn-sm btn-s" onclick="toggleEditSugg(${i})">✎ Edit</button>
          </div>
        </div>
        <span class="sg-status ${statClass}">${statLabel}</span>
      </div>
    `;
    list.appendChild(card);
  }

  $('suggAccepted').textContent = accepted;
  $('suggTotal').textContent = state.suggestions.length;
  bar.style.display = accepted > 0 ? 'flex' : 'none';
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function acceptSugg(i) {
  if (state.suggestions[i]) {
    state.suggestions[i].status = state.suggestions[i].status === 'accepted' ? 'pending' : 'accepted';
    renderSuggestions();
  }
}

function rejectSugg(i) {
  if (state.suggestions[i]) {
    state.suggestions[i].status = state.suggestions[i].status === 'rejected' ? 'pending' : 'rejected';
    renderSuggestions();
  }
}

function rejectAllSugg() {
  for (const s of state.suggestions) s.status = 'rejected';
  renderSuggestions();
}

function toggleEditSugg(i) {
  const ta = $(`sgEdit${i}`);
  if (!ta) return;
  ta.classList.toggle('on');
  if (ta.classList.contains('on')) {
    const textarea = $(`sgEditTA${i}`);
    if (textarea) { textarea.focus(); textarea.select(); }
  }
}

function applyAcceptedSugg() {
  const accepted = state.suggestions.filter(s => s.status === 'accepted');
  if (!accepted.length) { showToast('No accepted suggestions to apply', true); return; }

  let finalCv = state.extractedCv;
  for (const s of accepted) {
    const taId = `sgEditTA${state.suggestions.indexOf(s)}`;
    const ta = $(taId);
    const replacement = ta ? ta.value.trim() : (s.suggestion || '');
    if (!replacement) continue;
    if (finalCv.includes(replacement)) continue;
    const matchLines = s.issue.split('\n').filter(l => l.trim().length > 10);
    if (matchLines.length) {
      for (const ml of matchLines) {
        const idx = finalCv.indexOf(ml.trim());
        if (idx !== -1) {
          const end = finalCv.indexOf('\n', idx);
          const line = end !== -1 ? finalCv.slice(idx, end) : finalCv.slice(idx);
          finalCv = finalCv.replace(line, replacement);
          break;
        }
      }
    }
  }

  state.extractedCv = finalCv;
  updateActionButtons();
  $('finalOutput').value = finalCv;
  $('outputPrefill').classList.add('on');
  showToast('Applied accepted suggestions to CV');
  saveSession();
}

function applyAllAndDownload() {
  applyAcceptedSugg();
  setTimeout(() => downloadDocx(), 300);
}

// ─── API KEY MANAGEMENT ──────────────────────────────────────────────────────
function initApiKey() {
  const saved = localStorage.getItem(API_KEY);
  if (saved) {
    state.apiKey = saved;
    $('apiKeyInput').value = saved;
    updateApiStatus('ok', 'API key configured');
  } else {
    updateApiStatus('wa', 'Enter your OpenRouter API key');
  }
}

function updateApiStatus(type, text) {
  $('aDot').className = 'dot d-' + type;
  $('aSt').textContent = text;
}

$('apiKeyInput').addEventListener('input', (e) => {
  state.apiKey = e.target.value.trim();
  if (state.apiKey) {
    localStorage.setItem(API_KEY, state.apiKey);
    updateApiStatus('ok', 'API key configured');
  } else {
    localStorage.removeItem(API_KEY);
    updateApiStatus('wa', 'Enter your OpenRouter API key');
  }
});

// ─── API (Direct to OpenRouter) ──────────────────────────────────────────────
async function startOpt() {
  if (!state.apiKey) { showToast('Enter your OpenRouter API key first', true); return; }
  
  const cv = $('cvI').value.trim();
  const cover = $('clI').value.trim();
  const job = $('jobI').value.trim();
  if (!cv && !cover && !job) { showToast('Fill in at least one field', true); return; }

  const model = $('mSel').value;
  if (!model) { showToast('Select a model first', true); return; }

  $('startBtn').disabled = true;
  $('startBtn').classList.add('ld');
  $('chatI').disabled = false;
  $('sendBtn').disabled = false;
  setStatus('pr', 'Processing...');

  const userMsg = [
    cv ? '📄 MY CV:\n' + cv : '📄 CV: Create from scratch',
    cover ? '✉️ MY COVER LETTER:\n' + cover : '✉️ Cover Letter: Create new',
    job ? '🏢 COMPANY & JOB:\n' + job : '🏢 Company Info: Not provided',
  ].join('\n\n---\n\n');

  addMessage('user', userMsg);
  clearExtracted();
  $('suggPanel').classList.remove('on');

  try {
    const aiText = await chatStream(state.messages, model);
    addMessage('ai', aiText);
    setStatus('dn', 'Complete');
    const total = state.messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
    $('sessWordC').textContent = `${total} msgs`;
    if (state.extractedCv || state.extractedLetter) showToast('Output ready! Review suggestions or use the buttons below.');
  } catch (err) {
    setStatus('er', 'Error');
    addMessage('ai', '❌ Error: ' + err.message);
    showToast(err.message, true);
  } finally {
    $('startBtn').disabled = false;
    $('startBtn').classList.remove('ld');
  }
}

async function sendMsg() {
  const text = $('chatI').value.trim();
  if (!text || state.processing) return;
  $('chatI').value = '';
  addMessage('user', text);

  state.processing = true;
  $('sendBtn').disabled = true;
  $('chatI').disabled = true;
  showTyping();
  setStatus('pr', 'Processing...');

  try {
    const model = $('mSel').value;
    const aiText = await chatStream(state.messages, model);
    hideTyping();
    updateLastMessage(aiText);
    setStatus('dn', 'Complete');
    const total = state.messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
    $('sessWordC').textContent = `${total} msgs`;
  } catch (err) {
    hideTyping();
    setStatus('er', 'Error');
    addMessage('ai', '❌ Error: ' + err.message);
    showToast(err.message, true);
  } finally {
    state.processing = false;
    $('sendBtn').disabled = false;
    $('chatI').disabled = false;
    $('chatI').focus();
  }
}

async function chatStream(messages, model) {
  if (!state.apiKey) throw new Error('API key not configured');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'CareerCraft AI',
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : m.role, content: m.text || m.content })),
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  addMessage('ai', '');
  hideTyping();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data: ')) continue;
      try {
        const p = JSON.parse(t.slice(6));
        if (p.choices?.[0]?.delta?.content) {
          fullText += p.choices[0].delta.content;
          if (fullText.trim()) updateLastMessage(fullText);
        } else if (p.error) { throw new Error(p.error.message); }
      } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    }
  }

  if (!fullText.trim()) {
    const msgs = $('chat').querySelectorAll('.msg.ai');
    if (msgs.length && !msgs[msgs.length - 1].querySelector('.bb')?.textContent?.trim()) {
      msgs[msgs.length - 1].remove();
      state.messages.pop();
    }
    return 'No response received.';
  }
  return fullText;
}

// ─── LOAD MODELS ─────────────────────────────────────────────────────────────
let allModels = [];
let filteredModels = [];
let searchQuery = '';

async function loadModels() {
  if (!state.apiKey) {
    $('aDot').className = 'dot d-wa';
    $('aSt').textContent = 'Enter API key to load models';
    return;
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${state.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'CareerCraft AI',
      },
    });
    const data = await res.json();
    
    allModels = (data.data || [])
      .filter(m => {
        const params = m.supported_parameters || [];
        return params.includes('tools') || params.includes('tool_choice');
      })
      .map(m => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing: m.pricing,
        architecture: m.architecture,
        supported_parameters: m.supported_parameters || [],
        tags: classifyModel(m),
      }));
    
    filteredModels = allModels;
    updateCountBadge();
    renderList(allModels);
    $('aDot').className = 'dot d-ok';
    $('aSt').textContent = `${allModels.length} tool-supported models`;
    setStatus('id', 'Ready');

    const saved = localStorage.getItem(MODEL_KEY);
    if (saved && allModels.some(m => m.id === saved)) { selectModel(saved, false); }
    else { selectModel(defaultModel(), false); }
  } catch {
    $('aDot').className = 'dot d-err';
    $('aSt').textContent = 'Failed to load models';
    $('mLabel').innerHTML = '<span class="hint">Error loading models</span>';
    showToast('Failed to load models', true);
  }
}

function classifyModel(m) {
  const tags = [];
  if (m.pricing?.prompt === '0') tags.push('free');
  if (m.tags?.includes('free')) tags.push('free');
  if (m.context_length && m.context_length > 100000) tags.push('long-context');
  if (m.id.includes('flash') || m.id.includes('fast')) tags.push('fast');
  if (m.id.includes('pro') || m.id.includes('sonnet') || m.id.includes('opus')) tags.push('premium');
  if (m.id.includes('reasoning') || m.id.includes('r1')) tags.push('reasoning');
  if (m.supported_parameters?.includes('tools')) tags.push('tool-supported');
  return tags;
}

function defaultModel() {
  const preferred = ['google/gemini-2.5-flash','google/gemini-2.5-pro','anthropic/claude-3.5-sonnet','openai/gpt-4o'];
  for (const id of preferred) {
    if (allModels.some(m => m.id === id)) return id;
  }
  return allModels[0]?.id || '';
}

function updateCountBadge() { $('mCnt').textContent = allModels.length ? `${allModels.length}` : ''; }

function renderList(models) {
  const container = $('mResults');
  container.innerHTML = '';
  const sel = $('mSel').value;

  if (!models.length) { container.innerHTML = '<div class="empty">No models match your search</div>'; $('mFoot').textContent = ''; return; }

  for (const m of models) {
    const div = document.createElement('div');
    div.className = 'it' + (m.id === sel ? ' sel' : '');
    div.dataset.modelId = m.id;
    const tags = (m.tags || [])
      .filter(t => t !== 'budget' && t !== 'lightweight')
      .sort((a, b) => a === 'tool-supported' ? -1 : b === 'tool-supported' ? 1 : 0)
      .map(t => `<span class="tag tag-${t}">${t}</span>`).join('');
    const ctx = m.context_length ? (m.context_length / 1000).toFixed(0) + 'k' : '?';
    const pp = m.pricing ? `$${parseFloat(m.pricing.prompt).toFixed(4)}/${parseFloat(m.pricing.completion).toFixed(4)}` : '';
    div.innerHTML = `<span class="mid">${hl(m.id)}</span><span class="meta">${tags}<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">${ctx}</span><span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">${pp}</span></span>`;
    div.onclick = () => selectModel(m.id);
    container.appendChild(div);
  }

  const shown = models.length < allModels.length ? `${models.length} of ${allModels.length}` : `${allModels.length}`;
  $('mFoot').textContent = shown + ' models (tool-supported)';
}

function hl(text) {
  if (!searchQuery || searchQuery.length < 2) return text;
  const idx = text.toLowerCase().indexOf(searchQuery);
  if (idx === -1) return text;
  return text.slice(0, idx) + '<span class="hl">' + text.slice(idx, idx + searchQuery.length) + '</span>' + text.slice(idx + searchQuery.length);
}

function selectModel(id, save = true) {
  $('mSel').value = id;
  const m = allModels.find(x => x.id === id);
  if (m) {
    const tags = (m.tags || []).filter(t => t !== 'free' && t !== 'budget' && t !== 'lightweight');
    $('mLabel').textContent = m.id + (tags.length ? ` [${tags.join(', ')}]` : '');
  }
  if (save) localStorage.setItem(MODEL_KEY, id);
  closeM();
  renderList(filteredModels);
}

function toggleM() {
  const d = $('mDrop');
  d.classList.contains('open') ? closeM() : openM();
}

function openM() {
  $('mDrop').classList.add('open');
  $('mTrig').classList.add('open');
  $('mTrig').setAttribute('aria-expanded', 'true');
  searchQuery = '';
  $('mFilter').value = '';
  filteredModels = allModels;
  renderList(allModels);
  setTimeout(() => $('mFilter').focus(), 50);
}

function closeM() {
  $('mDrop').classList.remove('open');
  $('mTrig').classList.remove('open');
  $('mTrig').setAttribute('aria-expanded', 'false');
}

function filterM(q) {
  searchQuery = q.toLowerCase().trim();
  filteredModels = !searchQuery ? allModels : allModels.filter(m =>
    m.id.toLowerCase().includes(searchQuery) ||
    (m.name || '').toLowerCase().includes(searchQuery) ||
    (m.tags || []).some(t => t.includes(searchQuery)) ||
    (m.supported_parameters || []).some(p => p.includes(searchQuery))
  );
  renderList(filteredModels);
}

document.addEventListener('click', (e) => {
  const w = document.querySelector('.model-wrap');
  if (w && !w.contains(e.target)) closeM();
});

document.addEventListener('keydown', (e) => {
  if (!$('mDrop').classList.contains('open')) return;
  if (e.key === 'Escape') { closeM(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const s = $('mResults').querySelector('.it.sel') || $('mResults').querySelector('.it');
    if (s) selectModel(s.dataset.modelId);
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = $('mResults').querySelectorAll('.it');
    if (!items.length) return;
    let idx = -1;
    items.forEach((item, i) => { if (item.classList.contains('sel')) idx = i; });
    let next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items.forEach(i => i.classList.remove('sel'));
    items[next].classList.add('sel');
    items[next].scrollIntoView({ block: 'nearest' });
  }
});

// ─── EDIT MODAL ──────────────────────────────────────────────────────────────
function openModal(type) {
  const content = type === 'cv' ? state.extractedCv : state.extractedLetter;
  if (!content) { showToast('Nothing to edit', true); return; }
  if (!state.apiKey) { showToast('Enter API key first', true); return; }
  
  $('modal').classList.add('on');
  $('modalType').value = type;
  $('modalCurrent').textContent = content.slice(0, 600) + (content.length > 600 ? '...' : '');
  $('modalReq').value = '';
  $('modalResult').style.display = 'none';
  $('modalBtn').disabled = false;
  $('modalBtn').textContent = 'Apply Edit';
  $('modalBtn').replaceWith($('modalBtn').cloneNode(true));
  $('modalBtn').addEventListener('click', submitModal);
  setTimeout(() => $('modalReq').focus(), 100);
}

function closeModal() { $('modal').classList.remove('on'); }

async function submitModal() {
  const req = $('modalReq').value.trim();
  if (!req) { showToast('Describe what to change', true); return; }

  const type = $('modalType').value;
  const content = type === 'cv' ? state.extractedCv : state.extractedLetter;
  const model = $('mSel').value;
  if (!model) { showToast('Select a model first', true); return; }

  $('modalBtn').disabled = true;
  $('modalBtn').textContent = '✎ Editing...';
  $('modalResult').style.display = 'none';

  try {
    const REFINE_PROMPT = `You are CareerCraft AI's refinement engine. Apply the user's requested changes precisely while preserving everything else.`;
    
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'CareerCraft AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: REFINE_PROMPT },
          { role: 'user', content: `Here is my current ${type === 'cv' ? 'CV' : 'Cover Letter'}:\n\n\`\`\`\n${content}\n\`\`\`\n\nPlease apply this edit: ${req}\n\nReturn the complete revised version.` },
        ],
      }),
    });
    
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message || `HTTP ${res.status}`);

    const data = await res.json();
    const refined = data.choices[0].message.content || '';
    const blockMatch = refined.match(/```[\s\S]*?\n([\s\S]*?)```/);
    const clean = blockMatch ? blockMatch[1].trim() : refined.trim();

    $('modalResult').textContent = clean;
    $('modalResult').style.display = 'block';
    $('modalBtn').textContent = '✓ Apply to Output';
    $('modalBtn').disabled = false;
    $('modalBtn').replaceWith($('modalBtn').cloneNode(true));
    $('modalBtn').addEventListener('click', () => { applyEditFromModal(type, clean); closeModal(); });
  } catch (err) {
    showToast(err.message, true);
    $('modalBtn').disabled = false;
    $('modalBtn').textContent = 'Apply Edit';
  }
}

function applyEditFromModal(type, content) {
  if (type === 'cv') { state.extractedCv = content; }
  else { state.extractedLetter = content; }
  updateActionButtons();
  showToast(type === 'cv' ? 'CV updated!' : 'Cover letter updated!');
  saveSession();
}

function updateActionButtons() {
  const hasCv = !!state.extractedCv;
  const hasLetter = !!state.extractedLetter;
  $('editCVBtn').disabled = !hasCv;
  $('cpyCVBtn').disabled = !hasCv;
  $('editLBtn').disabled = !hasLetter;
  $('cpyLBtn').disabled = !hasLetter;
  $('pdfBtn').disabled = !hasCv && !hasLetter;
  $('docxBtn').disabled = !hasCv && !hasLetter;
}

function clearExtracted() {
  state.extractedCv = ''; state.extractedLetter = ''; state.lastAiContent = '';
  updateActionButtons();
}

document.addEventListener('click', (e) => {
  if ($('modal')?.classList.contains('on') && e.target === $('modal')) closeModal();
});

// ─── COPY ────────────────────────────────────────────────────────────────────
function copyOut(type) {
  const text = type === 'cv' ? state.extractedCv : state.extractedLetter;
  if (!text) { showToast('Nothing to copy', true); return; }
  navigator.clipboard.writeText(text).then(() => {
    showToast(type === 'cv' ? 'CV copied' : 'Cover letter copied');
  }).catch(() => showToast('Failed to copy', true));
}

// ─── DOWNLOAD DOCX (Browser-based) ───────────────────────────────────────────
async function downloadDocx() {
  if (!state.extractedCv && !state.extractedLetter) { showToast('Nothing to download', true); return; }
  setStatus('pr', 'Generating DOCX...');

  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm');
    
    const children = [];
    
    if (state.extractedCv) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'OPTIMIZED CV', bold: true, size: 32 })],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }));
      
      const cvLines = state.extractedCv.split('\n');
      for (const line of cvLines) {
        if (line.trim()) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 100 },
          }));
        }
      }
    }

    if (state.extractedLetter) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'COVER LETTER', bold: true, size: 32 })],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 },
      }));
      
      const letterLines = state.extractedLetter.split('\n');
      for (const line of letterLines) {
        if (line.trim()) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 100 },
          }));
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CareerCraft_CV.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('dn', 'DOCX downloaded');
    showToast('DOCX downloaded');
  } catch (err) {
    setStatus('er', 'Error');
    showToast(err.message || 'Failed to generate DOCX', true);
  }
}

// ─── DOWNLOAD PDF ────────────────────────────────────────────────────────────
function downloadPDF() {
  const parts = [];
  if (state.extractedCv) parts.push('=== OPTIMIZED CV ===\n\n' + state.extractedCv);
  if (state.extractedLetter) parts.push('\n\n=== COVER LETTER ===\n\n' + state.extractedLetter);
  if (!parts.length) { showToast('Nothing to download', true); return; }

  const content = parts.join('\n');
  const win = window.open('', '_blank');
  if (!win) { showToast('Pop-up blocked', true); return; }
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>CareerCraft Output</title>
<style>
  body{font-family:'Inter','Segoe UI',system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;line-height:1.6;color:#1a1a1a;}
  h1{color:#6c5ce7;border-bottom:2px solid #6c5ce7;padding-bottom:8px;font-size:22px;font-weight:600;}
  pre{background:#faf9f7;padding:16px;border-radius:6px;white-space:pre-wrap;font-family:'JetBrains Mono','Consolas',monospace;font-size:13px;line-height:1.5;border:1px solid #eeede9;}
  @media print{body{padding:20px;}}
</style></head><body><h1>⚡ CareerCraft AI &mdash; Optimized Output</h1>
<pre>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
<script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script></body></html>`);
  win.document.close();
}

// ─── CLEAR ───────────────────────────────────────────────────────────────────
function clearChat() {
  $('chat').innerHTML = '';
  state.messages = [];
  state.suggestions = [];
  clearExtracted();
  $('chatI').disabled = true;
  $('sendBtn').disabled = true;
  $('suggPanel').classList.remove('on');
  $('outputPrefill').classList.remove('on');
  setStatus('id', 'Ready');
  $('sessWordC').textContent = '';
  localStorage.removeItem(SESSION_KEY);
}

// ─── SESSION ─────────────────────────────────────────────────────────────────
function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      messages: state.messages,
      extractedCv: state.extractedCv,
      extractedLetter: state.extractedLetter,
      cvInput: $('cvI').value,
      coverLetterInput: $('clI').value,
      jobInput: $('jobI').value,
      model: $('mSel').value,
    }));
  } catch { /* ignore */ }
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.cvInput) $('cvI').value = d.cvInput;
    if (d.coverLetterInput) $('clI').value = d.coverLetterInput;
    if (d.jobInput) $('jobI').value = d.jobInput;
    if (d.messages?.length) {
      state.messages = d.messages;
      state.extractedCv = d.extractedCv || '';
      state.extractedLetter = d.extractedLetter || '';
      clearEmptyState();
      for (const msg of d.messages) {
        const el = document.createElement('div');
        el.className = 'msg ' + msg.role;
        const b = document.createElement('div');
        b.className = 'bb';
        if (msg.role === 'ai') b.innerHTML = renderMarkdown(msg.text || msg.content);
        else b.textContent = msg.text || msg.content;
        el.appendChild(b);
        $('chat').appendChild(el);
      }
      scrollChat();
      $('chatI').disabled = false;
      $('sendBtn').disabled = false;
      updateActionButtons();
      const total = state.messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
      $('sessWordC').textContent = `${total} msgs`;
    }
  } catch { /* ignore */ }
}

setInterval(saveSession, 5000);

// ─── EVENTS ──────────────────────────────────────────────────────────────────
['cvI','clI','jobI'].forEach(id => {
  $(id).addEventListener('input', () => updateCount(id));
});

$('chatI').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});

$('modalReq').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); submitModal(); }
});

$('mTrig').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleM(); }
});

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
setupFileUpload('cvF', 'cvI', 'cvFN');
setupFileUpload('clF', 'clI', 'clFN');

// ─── INIT ────────────────────────────────────────────────────────────────────
const savedModel = localStorage.getItem(MODEL_KEY);
if (savedModel) $('mLabel').textContent = savedModel;
initTheme();
initApiKey();
restoreSession();
