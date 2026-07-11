/**
 * NutriBot — Frontend Application Logic
 * IBM Watsonx.ai Nutrition Agent
 */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const State = {
  chatHistory: [],
  userProfile: {},
  familyMembers: [],
  darkMode: false,
  bmiData: null,
};

// ---------------------------------------------------------------------------
// DOM Ready
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavTabs();
  initChatInput();
  checkAPIHealth();
  loadProfileFromStorage();
  setupMarked();

  // Re-check health every 60 seconds
  setInterval(checkAPIHealth, 60000);
});

// ---------------------------------------------------------------------------
// Marked.js configuration
// ---------------------------------------------------------------------------
function setupMarked() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text);
  }
  // Fallback: basic line-break rendering
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------
function initTheme() {
  const saved = localStorage.getItem('nutribot_theme') || 'light';
  applyTheme(saved);
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-bs-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  State.darkMode = (theme === 'dark');
  localStorage.setItem('nutribot_theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
}

// ---------------------------------------------------------------------------
// Navigation tabs
// ---------------------------------------------------------------------------
function initNavTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  // Update nav links
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  // Show/hide panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('d-none', p.id !== `panel-${tabId}`);
    p.classList.toggle('active', p.id === `panel-${tabId}`);
  });
  // Post-switch actions
  if (tabId === 'dashboard') refreshDashboardFromProfile();
}

// ---------------------------------------------------------------------------
// API Health Check
// ---------------------------------------------------------------------------
async function checkAPIHealth() {
  const badge = document.getElementById('statusBadge');
  const dot = badge?.querySelector('.status-dot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.config_ready) {
      dot?.classList.add('online');
      dot?.classList.remove('error');
      if (text) text.textContent = 'AI Ready';
    } else {
      dot?.classList.add('error');
      dot?.classList.remove('online');
      if (text) text.textContent = 'Config Error';
      // Show specific issues if returned by the health endpoint
      const issues = (data.config_issues || []).join(' | ');
      showConfigError(issues || 'IBM credentials not configured. Check your .env file.');
    }
  } catch {
    dot?.classList.add('error');
    dot?.classList.remove('online');
    if (text) text.textContent = 'Offline';
  }
}

// Show a dismissible config-error banner inside the chat panel
function showConfigError(message) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  // Only add once — avoid stacking banners on repeated health checks
  if (document.getElementById('configErrorBanner')) return;

  const div = document.createElement('div');
  div.id = 'configErrorBanner';
  div.className = 'config-error-banner animate-fade-in';
  div.innerHTML = `
    <div class="ceb-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
    <div class="ceb-body">
      <strong>IBM Watsonx.ai configuration issue</strong>
      <p>${escapeHtml(message)}</p>
      <ol class="ceb-steps">
        <li>Open <strong>dataplatform.cloud.ibm.com/wx/home</strong></li>
        <li>Open your project → <strong>Manage</strong> tab → <strong>General</strong></li>
        <li>Copy the <strong>Project ID</strong> (UUID format)</li>
        <li>Paste it into <code>.env</code> as <code>IBM_PROJECT_ID=…</code></li>
        <li>Also confirm <code>IBM_WATSONX_URL</code> matches your project's region</li>
        <li>Restart the Flask server</li>
      </ol>
    </div>
    <button class="ceb-close" onclick="this.closest('#configErrorBanner').remove()" title="Dismiss">
      <i class="bi bi-x-lg"></i>
    </button>`;
  container.prepend(div);
}

// ---------------------------------------------------------------------------
// Profile Management
// ---------------------------------------------------------------------------
function saveProfile() {
  State.userProfile = {
    name: document.getElementById('profileName')?.value?.trim() || '',
    age: document.getElementById('profileAge')?.value || '',
    gender: document.getElementById('profileGender')?.value || '',
    weight_kg: document.getElementById('profileWeight')?.value || '',
    height_cm: document.getElementById('profileHeight')?.value || '',
    health_goals: document.getElementById('profileGoal')?.value || 'General wellness',
    dietary_restrictions: document.getElementById('profileRestrictions')?.value?.trim() || '',
    activity_level: 'Moderate',
  };
  localStorage.setItem('nutribot_profile', JSON.stringify(State.userProfile));
  showToast('✅ Profile saved! I\'ll personalize your recommendations now.', 'success');
  refreshDashboardFromProfile();
}

function loadProfileFromStorage() {
  const saved = localStorage.getItem('nutribot_profile');
  if (!saved) return;
  try {
    State.userProfile = JSON.parse(saved);
    const p = State.userProfile;
    setValue('profileName', p.name);
    setValue('profileAge', p.age);
    setValue('profileGender', p.gender);
    setValue('profileWeight', p.weight_kg);
    setValue('profileHeight', p.height_cm);
    setValue('profileGoal', p.health_goals);
    setValue('profileRestrictions', p.dietary_restrictions);
  } catch { /* ignore parse errors */ }
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== '') el.value = value;
}

function refreshDashboardFromProfile() {
  const p = State.userProfile;
  if (!p.name && !p.age) return;

  // Update profile summary card
  const summaryEl = document.getElementById('profileSummary');
  if (summaryEl && p.name) {
    summaryEl.innerHTML = [
      ['Name', p.name],
      ['Age', p.age ? `${p.age} years` : '—'],
      ['Gender', p.gender || '—'],
      ['Weight', p.weight_kg ? `${p.weight_kg} kg` : '—'],
      ['Height', p.height_cm ? `${p.height_cm} cm` : '—'],
      ['Goal', p.health_goals || '—'],
      ['Diet', p.dietary_restrictions || 'No restrictions'],
    ].map(([label, val]) => `
      <div class="profile-summary-item">
        <span class="profile-summary-label">${label}</span>
        <span class="profile-summary-value">${val}</span>
      </div>
    `).join('');
  }

  // Auto-populate BMI tab fields
  setValue('bmiWeight', p.weight_kg);
  setValue('bmiHeight', p.height_cm);
  setValue('bmiAge', p.age);
  if (p.gender) setValue('bmiGender', p.gender);
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function initChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Enter to send, Shift+Enter for newline
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input?.value?.trim();
  if (!message) return;

  // Clear input
  input.value = '';
  input.style.height = 'auto';

  appendMessage('user', message);
  State.chatHistory.push({ role: 'user', content: message });

  showTyping(true);
  disableSend(true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: State.chatHistory.slice(-20),
        profile: State.userProfile,
      }),
    });
    const data = await res.json();
    showTyping(false);

    if (data.error) {
      if (data.config_error) {
        // Config/credentials error — show structured help panel instead of raw text
        appendConfigErrorMessage(data.error);
      } else {
        appendMessage('assistant', `❌ **Error:** ${data.error}`);
      }
    } else {
      appendMessage('assistant', data.reply);
      State.chatHistory.push({ role: 'assistant', content: data.reply });
      // Trim history to avoid unbounded growth
      if (State.chatHistory.length > 40) {
        State.chatHistory = State.chatHistory.slice(-40);
      }
    }
  } catch (err) {
    showTyping(false);
    appendMessage('assistant', '❌ **Connection error.** Please check the server is running and your .env is configured.');
  } finally {
    disableSend(false);
  }
}

function sendQuickMessage(message) {
  const input = document.getElementById('chatInput');
  if (input) input.value = message;
  switchTab('chat');
  sendMessage();
}

// Renders a structured config-error card as an assistant message
function appendConfigErrorMessage(rawText) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  // Convert the plain-text fix instructions into HTML list items
  const lines = rawText.split('\n').filter(l => l.trim());
  const htmlLines = lines.map(line => {
    const t = line.trim();
    if (t.startsWith('❌')) return `<p class="ceb-headline">${escapeHtml(t)}</p>`;
    if (/^\d+\./.test(t))   return `<li>${escapeHtml(t.replace(/^\d+\.\s*/, ''))}</li>`;
    if (t.startsWith('•'))  return `<li>${escapeHtml(t.slice(1).trim())}</li>`;
    if (t.endsWith(':'))    return `<p class="ceb-section">${escapeHtml(t)}</p>`;
    return `<p>${escapeHtml(t)}</p>`;
  });
  // Wrap consecutive <li> items in <ol>/<ul>
  const body = htmlLines.join('\n')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, match => `<ol>${match}</ol>`);

  const div = document.createElement('div');
  div.className = 'chat-message assistant-message animate-fade-in';
  div.innerHTML = `
    <div class="message-avatar assistant-avatar">
      <i class="bi bi-robot"></i>
    </div>
    <div class="message-content" style="max-width:90%">
      <div class="message-bubble config-error-bubble">
        <div class="ceb-inner">${body}</div>
        <p class="ceb-tip">After fixing <code>.env</code>, restart the server and refresh this page.</p>
      </div>
      <div class="message-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendMessage(role, content) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const isUser = role === 'user';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const div = document.createElement('div');
  div.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'} animate-fade-in`;

  const avatarIcon = isUser ? 'bi-person-fill' : 'bi-robot';
  const avatarClass = isUser ? 'user-avatar' : 'assistant-avatar';
  const renderedContent = isUser ? escapeHtml(content) : renderMarkdown(content);

  div.innerHTML = `
    <div class="message-avatar ${avatarClass}">
      <i class="bi ${avatarIcon}"></i>
    </div>
    <div class="message-content">
      <div class="message-bubble">${renderedContent}</div>
      <div class="message-time">${time}</div>
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping(show) {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  el.classList.toggle('d-none', !show);
  if (show) {
    const container = document.getElementById('chatMessages');
    if (container) container.scrollTop = container.scrollHeight;
  }
}

function disableSend(disabled) {
  const btn = document.getElementById('sendBtn');
  const input = document.getElementById('chatInput');
  if (btn) btn.disabled = disabled;
  if (input) input.disabled = disabled;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// BMI Calculator
// ---------------------------------------------------------------------------
async function calculateBMI() {
  const weight = parseFloat(document.getElementById('bmiWeight')?.value);
  const height = parseFloat(document.getElementById('bmiHeight')?.value);
  const age = parseInt(document.getElementById('bmiAge')?.value, 10) || 30;
  const gender = document.getElementById('bmiGender')?.value || 'female';
  const activity = document.getElementById('bmiActivity')?.value || 'moderate';
  const goal = document.getElementById('bmiGoal')?.value || 'maintain';

  if (!weight || !height || weight <= 0 || height <= 0) {
    showToast('⚠️ Please enter valid weight and height.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/bmi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: weight, height_cm: height, age, gender, activity, goal }),
    });
    const data = await res.json();

    if (data.error) {
      showToast('❌ ' + data.error, 'danger');
      return;
    }

    State.bmiData = data;
    renderBMIResults(data, weight, height);

    // Show AI advice button
    const aiBtn = document.getElementById('bmiAIBtn');
    if (aiBtn) aiBtn.classList.remove('d-none');

    // Update dashboard too
    updateDashboard(data);

  } catch (err) {
    showToast('❌ Server error. Is the Flask app running?', 'danger');
  }
}

function renderBMIResults(data, weight, height) {
  const colorMap = { success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', info: '#3b82f6' };
  const borderColor = colorMap[data.color] || '#3b82f6';

  const resultsEl = document.getElementById('bmiResults');
  if (!resultsEl) return;

  const macros = data.macros || {};

  resultsEl.innerHTML = `
    <div class="col-12">
      <div class="bmi-result-card" style="border-color:${borderColor}">
        <div class="bmi-value" style="color:${borderColor}">${data.bmi}</div>
        <div class="bmi-category" style="color:${borderColor}">${data.category}</div>
        <p class="text-muted small mt-2 mb-0">${data.advice}</p>
      </div>
    </div>
    <div class="col-6 col-md-4">
      <div class="stat-card">
        <div class="stat-icon" style="background:#fff0e6"><i class="bi bi-fire" style="color:#f97316"></i></div>
        <div class="stat-value">${data.goal_calories}</div>
        <div class="stat-label">Calories/day</div>
      </div>
    </div>
    <div class="col-6 col-md-4">
      <div class="stat-card">
        <div class="stat-icon" style="background:#e6f4ff"><i class="bi bi-droplet" style="color:#0ea5e9"></i></div>
        <div class="stat-value">${data.water_ml}</div>
        <div class="stat-label">Water (ml/day)</div>
      </div>
    </div>
    <div class="col-6 col-md-4">
      <div class="stat-card">
        <div class="stat-icon" style="background:#f0fdf4"><i class="bi bi-activity" style="color:#22c55e"></i></div>
        <div class="stat-value">${data.tdee}</div>
        <div class="stat-label">TDEE (kcal)</div>
      </div>
    </div>
    <div class="col-12">
      <div class="card card-panel">
        <div class="card-header-custom"><i class="bi bi-pie-chart me-2"></i>Daily Macros (${data.goal_calories} kcal)</div>
        <div class="card-body p-3">
          <div class="row g-3 text-center">
            <div class="col-4">
              <div class="fw-bold text-warning">${macros.carbohydrates_g}g</div>
              <div class="small text-muted">Carbs</div>
            </div>
            <div class="col-4">
              <div class="fw-bold text-danger">${macros.protein_g}g</div>
              <div class="small text-muted">Protein</div>
            </div>
            <div class="col-4">
              <div class="fw-bold text-info">${macros.fat_g}g</div>
              <div class="small text-muted">Fat</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-12">
      <div class="card card-panel">
        <div class="card-body p-3 small text-muted">
          <strong>Healthy weight range:</strong> ${data.healthy_range} &nbsp;·&nbsp;
          <strong>BMR:</strong> ${data.bmr} kcal &nbsp;·&nbsp;
          <strong>Goal:</strong> ${data.goal_label}
        </div>
      </div>
    </div>
  `;

  // Animate BMI marker on scale
  animateBMIMarker(data.bmi);
}

function animateBMIMarker(bmi) {
  const marker = document.getElementById('bmiMarker');
  if (!marker) return;
  marker.classList.remove('d-none');

  // Scale: 10–50 range mapped to 0–100%
  const pct = Math.min(Math.max(((bmi - 10) / 40) * 100, 1), 99);
  marker.style.left = `${pct}%`;
}

async function getBMIAdvice() {
  if (!State.bmiData) return;
  const p = State.userProfile;
  const d = State.bmiData;

  const message = `My BMI is ${d.bmi} (${d.category}). I am ${p.age || '30'} years old, ${p.gender || 'female'}. My goal is ${p.health_goals || 'general wellness'}. Give me personalized Indian nutrition advice and a 30-day improvement plan.`;

  const adviceEl = document.getElementById('bmiAIAdvice');
  if (adviceEl) {
    adviceEl.innerHTML = `
      <div class="card card-panel">
        <div class="card-header-custom"><i class="bi bi-robot me-2"></i>AI Nutrition Advice</div>
        <div class="card-body p-3">
          <div class="loading-animation">
            <div class="loading-spinner"></div>
            <p>Generating personalized advice…</p>
          </div>
        </div>
      </div>`;
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [], profile: p }),
    });
    const data = await res.json();
    if (adviceEl) {
      adviceEl.innerHTML = `
        <div class="card card-panel">
          <div class="card-header-custom"><i class="bi bi-robot me-2"></i>AI Nutrition Advice</div>
          <div class="card-body p-3 ai-output-area">${renderMarkdown(data.reply || data.error)}</div>
        </div>`;
    }
  } catch {
    if (adviceEl) adviceEl.innerHTML = '<div class="alert alert-danger">Failed to get advice.</div>';
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function calculateDashboard() {
  const p = State.userProfile;
  if (!p.weight_kg || !p.height_cm) {
    showToast('⚠️ Please fill in weight and height in your profile first.', 'warning');
    return;
  }
  // Sync activity/goal from dashboard selectors
  const activity = document.getElementById('dbActivity')?.value || 'moderate';
  const goal = document.getElementById('dbGoal')?.value || 'maintain';

  setValue('bmiWeight', p.weight_kg);
  setValue('bmiHeight', p.height_cm);
  setValue('bmiAge', p.age);
  if (p.gender) setValue('bmiGender', p.gender);

  // Fetch from API
  fetch('/api/bmi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weight_kg: p.weight_kg,
      height_cm: p.height_cm,
      age: p.age || 30,
      gender: p.gender || 'female',
      activity,
      goal,
    }),
  })
    .then(r => r.json())
    .then(data => {
      if (!data.error) updateDashboard(data);
    })
    .catch(() => showToast('❌ Server not available.', 'danger'));
}

function updateDashboard(data) {
  setDashVal('dashBMI', data.bmi);
  setDashVal('dashCalories', data.goal_calories);
  setDashVal('dashWater', data.water_ml);
  setDashVal('dashBMR', data.bmr);

  const bmiColors = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info' };
  const badge = document.getElementById('dashBMIBadge');
  if (badge) {
    badge.textContent = data.category;
    badge.className = `stat-badge ${bmiColors[data.color] || 'bg-primary'} text-white`;
  }

  // Macro bars
  const macros = data.macros || {};
  const total = (macros.carbohydrates_g * 4) + (macros.protein_g * 4) + (macros.fat_g * 9);
  setMacro('carbsVal', 'carbsBar', macros.carbohydrates_g, 'g', (macros.carbohydrates_g * 4 / total) * 100);
  setMacro('proteinVal', 'proteinBar', macros.protein_g, 'g', (macros.protein_g * 4 / total) * 100);
  setMacro('fatVal', 'fatBar', macros.fat_g, 'g', (macros.fat_g * 9 / total) * 100);

  // Healthy range
  const rangeEl = document.getElementById('healthyRange');
  if (rangeEl) {
    rangeEl.innerHTML = `
      <div class="profile-summary-item">
        <span class="profile-summary-label">Your BMI</span>
        <span class="profile-summary-value">${data.bmi} (${data.category})</span>
      </div>
      <div class="profile-summary-item">
        <span class="profile-summary-label">Healthy Weight Range</span>
        <span class="profile-summary-value">${data.healthy_range}</span>
      </div>
      <div class="profile-summary-item">
        <span class="profile-summary-label">Daily Goal</span>
        <span class="profile-summary-value">${data.goal_label}</span>
      </div>
      <div class="profile-summary-item">
        <span class="profile-summary-label">Water Intake Goal</span>
        <span class="profile-summary-value">${data.water_ml} ml/day</span>
      </div>
      <p class="text-muted small mt-2">${data.advice}</p>
    `;
  }
}

function setDashVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

function setMacro(valId, barId, grams, unit, pct) {
  const valEl = document.getElementById(valId);
  const barEl = document.getElementById(barId);
  if (valEl) valEl.textContent = `${grams}${unit}`;
  if (barEl) barEl.style.width = `${Math.round(pct)}%`;
}

// ---------------------------------------------------------------------------
// Meal Planner
// ---------------------------------------------------------------------------
async function generateMealPlan() {
  const duration = document.querySelector('input[name="planDuration"]:checked')?.value || '1-day';
  const goal = document.getElementById('planGoal')?.value || 'general wellness';
  const calories = document.getElementById('planCalories')?.value || '1800';
  const diet = document.getElementById('planDiet')?.value || 'Indian vegetarian';
  const avoid = document.getElementById('planAvoid')?.value?.trim();

  const outputEl = document.getElementById('mealPlanOutput');
  const loadingEl = document.getElementById('mealPlanLoading');
  const copyBtn = document.getElementById('copyPlanBtn');

  if (outputEl) outputEl.classList.add('d-none');
  if (loadingEl) loadingEl.classList.remove('d-none');
  if (copyBtn) copyBtn.classList.add('d-none');

  const taskKey = duration === '7-day' ? 'weekly_meal_plan' : 'daily_meal_plan';
  let message = `Create a ${duration} ${diet} meal plan for ${goal} targeting ${calories} kcal/day.`;
  if (avoid) message += ` Avoid: ${avoid}.`;
  message += ' Include calorie counts and macros for each meal. Use Indian foods.';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [], profile: State.userProfile }),
    });
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = data.error
        ? `<div class="alert alert-danger">${data.error}</div>`
        : renderMarkdown(data.reply);
    }
    if (!data.error && copyBtn) copyBtn.classList.remove('d-none');

  } catch {
    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = '<div class="alert alert-danger">Server error. Please try again.</div>';
    }
  }
}

// ---------------------------------------------------------------------------
// Food Analyzer
// ---------------------------------------------------------------------------
async function analyzeFood() {
  const food = document.getElementById('analyzeFood')?.value?.trim();
  if (!food) {
    showToast('⚠️ Please enter a food item or meal description.', 'warning');
    return;
  }

  const outputEl = document.getElementById('analysisOutput');
  const loadingEl = document.getElementById('analysisLoading');
  const copyBtn = document.getElementById('copyAnalysisBtn');

  if (outputEl) outputEl.classList.add('d-none');
  if (loadingEl) loadingEl.classList.remove('d-none');

  try {
    const res = await fetch('/api/nutrition-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ food, profile: State.userProfile }),
    });
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = data.error
        ? `<div class="alert alert-danger">${data.error}</div>`
        : renderMarkdown(data.reply);
    }
    if (!data.error && copyBtn) copyBtn.classList.remove('d-none');

  } catch {
    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = '<div class="alert alert-danger">Server error. Please try again.</div>';
    }
  }
}

function setAnalyzeFood(food) {
  const el = document.getElementById('analyzeFood');
  if (el) el.value = food;
}

async function getHealthySwap() {
  const food = document.getElementById('swapFood')?.value?.trim();
  if (!food) {
    showToast('⚠️ Please enter a food to swap.', 'warning');
    return;
  }

  const outputEl = document.getElementById('analysisOutput');
  const loadingEl = document.getElementById('analysisLoading');
  const copyBtn = document.getElementById('copyAnalysisBtn');

  if (outputEl) outputEl.classList.add('d-none');
  if (loadingEl) loadingEl.classList.remove('d-none');

  const message = `Suggest 5 healthy Indian food alternatives to replace "${food}". Include nutritional benefits and calorie comparison.`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [], profile: State.userProfile }),
    });
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = data.error
        ? `<div class="alert alert-danger">${data.error}</div>`
        : renderMarkdown(data.reply);
    }
    if (!data.error && copyBtn) copyBtn.classList.remove('d-none');

  } catch {
    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = '<div class="alert alert-danger">Server error.</div>';
    }
  }
}

// ---------------------------------------------------------------------------
// Family Plan
// ---------------------------------------------------------------------------
function addFamilyMember() {
  const name = document.getElementById('memberName')?.value?.trim();
  const age = document.getElementById('memberAge')?.value;
  const gender = document.getElementById('memberGender')?.value;
  const goal = document.getElementById('memberGoal')?.value;
  const restrictions = document.getElementById('memberRestrictions')?.value?.trim();

  if (!name) {
    showToast('⚠️ Please enter a name for the family member.', 'warning');
    return;
  }
  if (!age) {
    showToast('⚠️ Please enter an age.', 'warning');
    return;
  }

  const member = { name, age: parseInt(age, 10), gender, health_goal: goal, restrictions: restrictions || 'none' };
  State.familyMembers.push(member);
  renderFamilyMembers();

  // Clear form
  setValue('memberName', '');
  setValue('memberAge', '');
  setValue('memberRestrictions', '');
}

function removeFamilyMember(index) {
  State.familyMembers.splice(index, 1);
  renderFamilyMembers();
}

function renderFamilyMembers() {
  const listEl = document.getElementById('membersList');
  const countEl = document.getElementById('memberCount');
  const genBtn = document.getElementById('generateFamilyBtn');

  if (countEl) countEl.textContent = State.familyMembers.length;
  if (genBtn) genBtn.classList.toggle('d-none', State.familyMembers.length === 0);

  if (!listEl) return;
  if (State.familyMembers.length === 0) {
    listEl.innerHTML = '<p class="text-muted small text-center py-3">No members added yet.</p>';
    return;
  }

  const avatarColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#14b8a6'];
  listEl.innerHTML = State.familyMembers.map((m, i) => {
    const color = avatarColors[i % avatarColors.length];
    const initial = m.name.charAt(0).toUpperCase();
    return `
      <div class="member-card">
        <div class="member-avatar" style="background:${color}20;color:${color}">
          ${initial}
        </div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.name)}</div>
          <div class="member-details">${m.age}y · ${m.gender} · ${m.health_goal}</div>
        </div>
        <button class="member-remove" onclick="removeFamilyMember(${i})" title="Remove">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    `;
  }).join('');
}

async function generateFamilyPlan() {
  if (State.familyMembers.length === 0) {
    showToast('⚠️ Please add at least one family member.', 'warning');
    return;
  }

  const outputEl = document.getElementById('familyPlanOutput');
  const loadingEl = document.getElementById('familyPlanLoading');
  const copyBtn = document.getElementById('copyFamilyBtn');

  if (outputEl) outputEl.classList.add('d-none');
  if (loadingEl) loadingEl.classList.remove('d-none');

  try {
    const res = await fetch('/api/family-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: State.familyMembers, profile: State.userProfile }),
    });
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = data.error
        ? `<div class="alert alert-danger">${data.error}</div>`
        : renderMarkdown(data.reply);
    }
    if (!data.error && copyBtn) copyBtn.classList.remove('d-none');

  } catch {
    if (loadingEl) loadingEl.classList.add('d-none');
    if (outputEl) {
      outputEl.classList.remove('d-none');
      outputEl.innerHTML = '<div class="alert alert-danger">Server error. Please try again.</div>';
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text)
    .then(() => {
      showToast('✅ Content copied to clipboard!', 'success');
      // Visual feedback on button
      const btns = document.querySelectorAll(`[onclick*="${elementId}"]`);
      btns.forEach(btn => {
        btn.classList.add('copy-success');
        setTimeout(() => btn.classList.remove('copy-success'), 1500);
      });
    })
    .catch(() => showToast('⚠️ Copy failed. Try manually selecting the text.', 'warning'));
}

function showToast(message, type = 'info') {
  const toastEl = document.getElementById('appToast');
  const toastBody = document.getElementById('toastBody');
  if (!toastEl || !toastBody) return;

  const bgMap = {
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning text-dark',
    info: 'bg-primary',
  };

  // Reset classes
  toastEl.className = 'toast align-items-center border-0 text-white';
  toastEl.classList.add(bgMap[type] || 'bg-primary');
  if (type === 'warning') toastEl.classList.remove('text-white');

  toastBody.textContent = message;

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3500 });
  toast.show();
}
