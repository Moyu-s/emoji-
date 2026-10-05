import { supabase } from './supabaseClient.js';

const contentArea = document.getElementById('contentArea');
const bankSelect = document.getElementById('bankSelect');
const bankOptions = document.getElementById('bankOptions');
const bankConfirmBtn = document.getElementById('bankConfirmBtn');
const progressHint = document.getElementById('progressHint');
const startBtn = document.getElementById('startBtn');
const startBtnInner = document.getElementById('startBtnInner');

let currentQuestion = '';
let currentAnswer = '';
let usedAnswers = [];
let selectedBanks = [];
let phase = 'welcome';

let pollTimer = null;

const SUPABASE_URL = 'https://zjyycxlzzcqlqrkzafcj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xROd_7V0WnncKUlnxeoCMA_qGqNROA6';

async function fetchState() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_state?id=eq.1`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    cache: 'no-store'
  });
  if (!res.ok) return null;
  const arr = await res.json();
  return arr[0] || null;
}

async function updateGameState(fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_state?id=eq.1`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(fields)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('写入失败:', res.status, text);
    return { error: { message: `HTTP ${res.status}: ${text}` } };
  }
  return { data: await res.json(), error: null };
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function render() {
  contentArea.classList.remove('visible');
  bankSelect.style.display = 'none';
  if (startBtn) startBtn.style.display = 'none';

  if (phase !== 'selecting') {
    delete bankSelect.dataset.initialized;
  }

  if (phase === 'welcome') {
    contentArea.classList.add('visible');
    contentArea.innerHTML = `<div class="welcome-text">✨ 欢迎来到 emoji 乐园 ✨</div>`;
    progressHint.textContent = '';
    return;
  }

  if (phase === 'uploaded' || phase === 'newgame') {
    contentArea.classList.add('visible');
    contentArea.innerHTML = `<div class="welcome-text">✨ 欢迎来到 emoji 乐园 ✨</div>`;
    if (startBtn) startBtn.style.display = 'flex';
    progressHint.textContent = '';
    return;
  }

  if (phase === 'selecting') {
    bankSelect.style.display = 'block';
    if (!bankSelect.dataset.initialized) {
      bankOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const val = parseInt(cb.value);
        cb.checked = selectedBanks.includes(val);
        cb.closest('.bank-option').classList.toggle('selected', cb.checked);
      });
      bankSelect.dataset.initialized = '1';
    }
    progressHint.textContent = '';
    return;
  }

  if (phase === 'playing') {
    if (currentQuestion) {
      contentArea.classList.add('visible');
      contentArea.innerHTML = `<div class="question-text">${escapeHtml(currentQuestion)}</div>`;
      progressHint.textContent = `已抽取 ${usedAnswers.length} 题`;
    } else {
      contentArea.classList.add('visible');
      contentArea.innerHTML = `<div class="welcome-text">等待抽题…</div>`;
      progressHint.textContent = '';
    }
    return;
  }

  if (phase === 'exhausted') {
    contentArea.classList.add('visible');
    contentArea.innerHTML = `<div class="placeholder-text">本局已抽完所有不重复答案的题目<br>点击「新的一局」重新开始</div>`;
    progressHint.textContent = `已抽取 ${usedAnswers.length} 题`;
    return;
  }
}

async function refresh() {
  const data = await fetchState();
  if (!data) return;

  currentQuestion = data.question || '';
  currentAnswer = data.answer || '';
  usedAnswers = data.used_answers || [];
  selectedBanks = data.selected_banks || [];
  phase = data.phase || 'welcome';

  render();
}

// 题目页在所有非 welcome 阶段都轮询，确保能感知答案页的操作
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);

  // 高频阶段：uploaded / newgame / selecting / playing
  // 低频阶段：welcome / exhausted
  const highFreq = (phase === 'uploaded' || phase === 'newgame' || phase === 'selecting' || phase === 'playing');
  const interval = highFreq ? 300 : 2000;

  pollTimer = setTimeout(async () => {
    await refresh();
    schedulePoll();
  }, interval);
}

bankOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => cb.closest('.bank-option').classList.toggle('selected', cb.checked));
});

if (startBtnInner) {
  startBtnInner.addEventListener('click', async () => {
    await updateGameState({
      phase: 'selecting',
      selected_banks: [],
      used_answers: [],
      game_active: false,
      question: '',
      answer: ''
    });
    await refresh();
  });
}

bankConfirmBtn.addEventListener('click', async () => {
  const checked = [];
  bankOptions.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => checked.push(parseInt(cb.value)));
  if (checked.length === 0) { alert('请至少选择一个题库'); return; }

  await updateGameState({
    selected_banks: checked,
    used_answers: [],
    game_active: true,
    question: '',
    answer: '',
    phase: 'playing'
  });
  await refresh();
});

async function init() {
  await refresh();
  schedulePoll();
}

init();