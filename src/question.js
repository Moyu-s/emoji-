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
let gameActive = false;
let usedAnswers = [];
let selectedBanks = [];
let phase = 'welcome';

let pollTimer = null;

const SUPABASE_URL = 'https://zjyycxlzzcqlqrkzafcj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xROd_7V0WnncKUlnxeoCMA_qGqNROA6';

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
  const data = await res.json();
  return { data, error: null };
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
}

async function loadState() {
  const { data, error } = await supabase.from('game_state').select('*').eq('id', 1).single();
  if (error) { console.error(error); return; }
  if (!data) return;

  currentQuestion = data.question || '';
  currentAnswer = data.answer || '';
  usedAnswers = data.used_answers || [];
  selectedBanks = data.selected_banks || [];
  gameActive = data.game_active || false;
  phase = data.phase || 'welcome';

  render();
}

// 单次轮询
async function pollOnce() {
  const { data, error } = await supabase.from('game_state').select('*').eq('id', 1).single();
  if (error || !data) return;

  currentQuestion = data.question || '';
  currentAnswer = data.answer || '';
  usedAnswers = data.used_answers || [];
  selectedBanks = data.selected_banks || [];
  gameActive = data.game_active || false;
  phase = data.phase || 'welcome';

  render();
}

// 题目页轮询：selecting / playing 高频，其他低频
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);

  const highFreq = (phase === 'selecting' || phase === 'playing');
  const interval = highFreq ? 300 : 2000;

  pollTimer = setTimeout(async () => {
    await pollOnce();
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
});

// 启动
loadState().then(() => {
  schedulePoll();
});