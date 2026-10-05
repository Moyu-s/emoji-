import { supabase } from './supabaseClient.js';
import * as XLSX from 'xlsx';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const bankSelect = document.getElementById('bankSelect');
const bankOptions = document.getElementById('bankOptions');
const bankConfirmBtn = document.getElementById('bankConfirmBtn');
const contentArea = document.getElementById('contentArea');
const mainButtons = document.getElementById('mainButtons');
const nextBtn = document.getElementById('nextBtn');
const newGameBtn = document.getElementById('newGameBtn');
const clearFileBtn = document.getElementById('clearFileBtn');
const progressHint = document.getElementById('progressHint');
const statusMsg = document.getElementById('statusMsg');

let banksData = [];
let currentQuestion = '';
let currentAnswer = '';
let gameActive = false;
let selectedBanks = [];
let usedAnswers = [];
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
  dropZone.style.display = 'none';
  bankSelect.style.display = 'none';
  mainButtons.style.display = 'none';
  contentArea.classList.remove('visible');
  contentArea.innerHTML = '';
  progressHint.textContent = '';
  if (statusMsg) statusMsg.style.display = 'none';

  if (phase !== 'selecting') {
    delete bankSelect.dataset.initialized;
  }

  // 状态 0：请上传文件
  if (phase === 'welcome') {
    dropZone.style.display = 'block';
    return;
  }

  // 状态 1：等待玩家确认游戏开始
  if (phase === 'uploaded' || phase === 'newgame') {
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.textContent = '✅ 文件已就绪，等待题目页点击「开始游戏」…';
    }
    return;
  }

  // 状态 2：挑选题库
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
    return;
  }

  // 状态 3：题目 + 答案 + 下一题
  if (phase === 'playing') {
    if (currentQuestion) {
      mainButtons.style.display = 'flex';
      contentArea.classList.add('visible');
      contentArea.innerHTML = `
        <div class="qa-block">
          <div class="qa-item q">
            <div class="qa-label">题目</div>
            <div class="question-text">${escapeHtml(currentQuestion)}</div>
          </div>
          <div class="qa-item a">
            <div class="qa-label">答案</div>
            <div class="answer-text">${escapeHtml(currentAnswer) || '（无对应答案）'}</div>
          </div>
        </div>`;
      progressHint.textContent = `已抽取 ${usedAnswers.length} 题`;
    } else {
      contentArea.classList.add('visible');
      contentArea.innerHTML = `<div class="welcome-text">等待抽题…</div>`;
    }
    return;
  }

  // 抽完所有题
  if (phase === 'exhausted') {
    mainButtons.style.display = 'flex';
    contentArea.classList.add('visible');
    contentArea.innerHTML = `<div class="placeholder-text">本局已抽完所有不重复答案的题目<br>点击「新的一局」重新开始</div>`;
    progressHint.textContent = `已抽取 ${usedAnswers.length} 题`;
    return;
  }
}

function parseWorkbook(workbook) {
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length < 4) throw new Error(`Excel 需要至少 4 个工作表，当前只有 ${sheetNames.length} 个`);
  const banks = [];
  for (let s = 0; s < 4; s++) {
    const worksheet = workbook.Sheets[sheetNames[s]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const pairs = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const q = (row[0] !== undefined && row[0] !== null) ? String(row[0]).trim() : '';
      if (q === '') continue;
      const a = (row[1] !== undefined && row[1] !== null) ? String(row[1]).trim() : '';
      pairs.push({ question: q, answer: a });
    }
    banks.push(pairs);
  }
  return banks;
}

async function handleFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) { alert('请上传 .xlsx 或 .xls 文件'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      banksData = parseWorkbook(workbook);
      sessionStorage.setItem('banksData', JSON.stringify(banksData));
      await updateGameState({ phase: 'uploaded' });
      startPolling();
      alert(`✅ 文件已保存！共 4 个题库，等待题目页点击「开始游戏」。`);
    } catch(err) {
      alert('❌ 解析失败：' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
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

  const saved = sessionStorage.getItem('banksData');
  if (saved) banksData = JSON.parse(saved);

  render();
  startPolling();
}

function startPolling() {
  if (pollTimer) clearTimeout(pollTimer);

  pollTimer = setTimeout(async () => {
    const { data, error } = await supabase.from('game_state').select('*').eq('id', 1).single();
    if (!error && data) {
      currentQuestion = data.question || '';
      currentAnswer = data.answer || '';
      usedAnswers = data.used_answers || [];
      selectedBanks = data.selected_banks || [];
      gameActive = data.game_active || false;
      phase = data.phase || 'welcome';

      // 题目页选了题库、进入 playing 但还没题目时，答案页自动抽第一题
      if (phase === 'playing' && !currentQuestion && selectedBanks.length > 0 && banksData.length > 0) {
        await pickNext();
        return;
      }

      render();

      if (phase === 'exhausted') {
        return;
      }
    }
    startPolling();
  }, 300);
}

async function pickNext() {
  if (!banksData || banksData.length === 0) return;

  let all = [];
  selectedBanks.forEach(idx => { if (banksData[idx]) all = all.concat(banksData[idx]); });

  const available = all.filter(item => {
    if (!item.answer) return true;
    return !usedAnswers.includes(item.answer);
  });

  if (available.length === 0) {
    await updateGameState({
      phase: 'exhausted',
      question: '',
      answer: ''
    });
    render();
    return;
  }

  const idx = Math.floor(Math.random() * available.length);
  const pair = available[idx];
  currentQuestion = pair.question;
  currentAnswer = pair.answer || '';

  if (currentAnswer && !usedAnswers.includes(currentAnswer)) usedAnswers.push(currentAnswer);

  await updateGameState({
    question: currentQuestion,
    answer: currentAnswer,
    used_answers: usedAnswers,
    game_active: true,
    phase: 'playing'
  });

  render();
}

bankConfirmBtn.addEventListener('click', async () => {
  const checked = [];
  bankOptions.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => checked.push(parseInt(cb.value)));
  if (checked.length === 0) { alert('请至少选择一个题库'); return; }

  selectedBanks = checked;
  usedAnswers = [];
  currentQuestion = '';
  currentAnswer = '';

  await updateGameState({
    selected_banks: checked,
    used_answers: [],
    game_active: true,
    question: '',
    answer: '',
    phase: 'playing'
  });

  await pickNext();
});

nextBtn.addEventListener('click', pickNext);

// 新的一局：有文件 → newgame（状态 1）；没文件 → welcome（状态 0）
newGameBtn.addEventListener('click', async () => {
  usedAnswers = [];
  currentQuestion = '';
  currentAnswer = '';
  selectedBanks = [];

  const hasFile = banksData && banksData.length > 0;

  await updateGameState({
    used_answers: [],
    game_active: false,
    question: '',
    answer: '',
    selected_banks: [],
    phase: hasFile ? 'newgame' : 'welcome'
  });

  bankOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.bank-option').classList.remove('selected');
  });

  startPolling();
});

// 清除文件：清空一切 → welcome（状态 0）
clearFileBtn.addEventListener('click', async () => {
  if (!confirm('确定要清除已保存的 Excel 数据吗？')) return;
  sessionStorage.removeItem('banksData');
  banksData = [];
  currentQuestion = '';
  currentAnswer = '';
  gameActive = false;
  selectedBanks = [];
  usedAnswers = [];

  await updateGameState({
    question: '',
    answer: '',
    used_answers: [],
    selected_banks: [],
    game_active: false,
    phase: 'welcome'
  });
});

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); fileInput.value = ''; });
['dragenter','dragover'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); }));
['dragleave','drop'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
dropZone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

bankOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => cb.closest('.bank-option').classList.toggle('selected', cb.checked));
});

loadState();