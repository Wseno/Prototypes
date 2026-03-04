const STORAGE_KEY = 'calorie-tracker-v2';
const LEGACY_STORAGE_KEY = 'calorie-tracker-v1';
const MEALS = [
  { key: 'breakfast', label: 'Petit-déj' },
  { key: 'lunch', label: 'Déjeuner' },
  { key: 'dinner', label: 'Dîner' },
  { key: 'snacks', label: 'Collations' }
];

function createDefaultUserData() {
  return {
    profile: { sex: 'H', age: 30, weight: 75, height: 175, activity: 1.55, targetWeight: '' },
    goal: { type: 'loss', delta: 500 },
    logs: {},
    recents: [],
    favorites: []
  };
}

const GOAL_DELTA_RECOMMENDATIONS = {
  maintain: { options: [0], hint: 'Maintien · delta 0 kcal' },
  loss: { options: [250, 500, 750], hint: 'Perte safe: -250/-500/-750 kcal' },
  gain: { options: [250, 500], hint: 'Prise modérée: +250/+500 kcal' }
};

const state = {
  profiles: { default: { id: 'default', name: 'Profil principal', ...createDefaultUserData() } },
  activeProfileId: 'default',
  theme: 'dark',
  calendarDate: new Date(),
  activeDayDetails: null,
  activeTab: 'today',
  favoriteEditMode: false
};

const FAVORITES_MAX = 10;
const DEFAULT_FAVORITE_NAMES = ['Œuf entier', 'Thon naturel', 'Jambon blanc', 'Steak haché 5%', 'Yaourt nature'];
const QUICK_UNITS = [
  { key: 'portion', label: 'portion(s)', type: 'portion', factor: 1 },
  { key: 'grams', label: 'g', type: 'grams', factor: 1 },
  { key: 'ml', label: 'ml', type: 'grams', factor: 1 },
  { key: 'slice', label: 'tranche(s)', type: 'portion', factor: 0.5 },
  { key: 'piece', label: 'pièce(s)', type: 'portion', factor: 1 }
];

const activeProfile = () => state.profiles[state.activeProfileId];
const todayStr = () => new Date().toISOString().slice(0, 10);
const format = (num) => Number(num).toFixed(0);

function normalizeText(value) {
  return String(value || '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getTDEE(profile) {
  const bmr = profile.sex === 'H'
    ? 88.362 + 13.397 * profile.weight + 4.799 * profile.height - 5.677 * profile.age
    : 447.593 + 9.247 * profile.weight + 3.098 * profile.height - 4.33 * profile.age;
  return bmr * Number(profile.activity || 1.2);
}

function targetIntake() {
  const user = activeProfile();
  const tdee = getTDEE(user.profile);
  if (user.goal.type === 'loss') return tdee - user.goal.delta;
  if (user.goal.type === 'gain') return tdee + user.goal.delta;
  return tdee;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function migrateLegacyData(parsed) {
  return {
    profiles: {
      default: {
        id: 'default',
        name: 'Profil principal',
        profile: parsed.profile || createDefaultUserData().profile,
        goal: parsed.goal || createDefaultUserData().goal,
        logs: parsed.logs || {},
        recents: parsed.recents || []
      }
    },
    activeProfileId: 'default',
    theme: parsed.theme || 'dark'
  };
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    Object.assign(state, JSON.parse(raw));
    state.calendarDate = new Date();
    return;
  }
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;
  Object.assign(state, migrateLegacyData(JSON.parse(legacyRaw)));
  state.calendarDate = new Date();
  save();
}

function enrichProfile(profile) {
  if (!Array.isArray(profile.favorites)) profile.favorites = [];
  if (profile.favorites.length) return;
  profile.favorites = DEFAULT_FAVORITE_NAMES
    .map((name) => FOOD_DATABASE.find((food) => normalizeText(food.name) === normalizeText(name)))
    .filter(Boolean)
    .map((food) => ({ name: food.name, kcal: food.kcalPerPortion, portionDefault: food.defaultPortionG, unit: 'portion(s)' }));
}

function ensureDay(date) {
  const user = activeProfile();
  if (!user.logs[date]) user.logs[date] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  return user.logs[date];
}

function totalsForDay(date) {
  return Object.values(ensureDay(date)).flat().reduce((acc, item) => {
    acc.kcal += item.kcal;
    acc.protein += item.protein;
    acc.carbs += item.carbs;
    acc.fat += item.fat;
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function getUnitConfig(unitKey) {
  return QUICK_UNITS.find((unit) => unit.key === unitKey) || QUICK_UNITS[0];
}

function calcEntry(food, quantity, quantityType) {
  const unit = getUnitConfig(quantityType);
  const grams = unit.type === 'grams' ? quantity * unit.factor : quantity * food.defaultPortionG * unit.factor;
  const ratio = grams / food.defaultPortionG;
  return {
    foodName: food.name,
    grams: Number(grams.toFixed(1)),
    kcal: Number((food.kcalPerPortion * ratio).toFixed(1)),
    protein: Number((food.protein * ratio).toFixed(1)),
    carbs: Number((food.carbs * ratio).toFixed(1)),
    fat: Number((food.fat * ratio).toFixed(1))
  };
}

function updateGoalDeltaOptions(reset = false) {
  const user = activeProfile();
  const config = GOAL_DELTA_RECOMMENDATIONS[user.goal.type] || GOAL_DELTA_RECOMMENDATIONS.maintain;
  const select = document.getElementById('goalDelta');
  select.innerHTML = '';
  config.options.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    const sign = user.goal.type === 'loss' ? '-' : user.goal.type === 'gain' ? '+' : '';
    option.textContent = `${sign}${value} kcal`;
    select.appendChild(option);
  });
  if (user.goal.type === 'maintain') user.goal.delta = 0;
  if (reset || !config.options.includes(user.goal.delta)) user.goal.delta = config.options[0];
  select.value = String(user.goal.delta);
  document.getElementById('goalDeltaHint').textContent = config.hint;
}

function renderProjection() {
  const user = activeProfile();
  const delta = user.goal.type === 'maintain' ? 0 : user.goal.delta;
  const targetWeight = Number(user.profile.targetWeight);
  let text = `${format(targetIntake())} kcal / jour`;

  if (user.goal.type === 'loss' && delta > 0) {
    const weeklyKg = (delta * 7) / 7700;
    text = `Perte estimée: ${weeklyKg.toFixed(2)} kg/sem (max safe 1.00)`;
    if (targetWeight && targetWeight < user.profile.weight) {
      const kgToLose = user.profile.weight - targetWeight;
      const days = (kgToLose * 7700) / delta;
      text = `${kgToLose.toFixed(1)} kg → ~${Math.ceil(days / 7)} semaines (estimation approx.)`;
    }
  }

  if (user.goal.type === 'gain') {
    text = `Surplus +${delta} kcal/j · progression modérée`;
  }

  document.getElementById('projectionText').textContent = `${text} · ℹ️ Estimation approx. Consultez un pro santé.`;
}

function renderSearchResults() {
  const query = normalizeText(document.getElementById('foodSearch').value);
  const ul = document.getElementById('searchResults');
  const suggestions = document.getElementById('foodSuggestions');
  ul.innerHTML = '';
  suggestions.innerHTML = '';

  const quantity = Number(document.getElementById('quantity').value || 1);
  const quantityType = document.getElementById('quantityType').value;
  const matches = FOOD_DATABASE
    .filter((food) => normalizeText(food.name).includes(query))
    .slice(0, query ? 12 : 8);

  matches.forEach((food) => {
    const opt = document.createElement('option');
    opt.value = food.name;
    suggestions.appendChild(opt);

    if (!query) return;
    const li = document.createElement('li');
    li.innerHTML = `<span>${food.name} · ${food.kcalPerPortion} kcal</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-outline';
    btn.textContent = 'Ajouter';
    btn.addEventListener('click', () => addFood(food, quantity, quantityType));
    const favBtn = document.createElement('button');
    favBtn.className = 'btn-outline';
    favBtn.textContent = '☆ Favori';
    favBtn.addEventListener('click', () => addFavorite(food));
    li.appendChild(btn);
    li.appendChild(favBtn);
    ul.appendChild(li);
  });
}

function addFood(food, quantity, quantityType, date = document.getElementById('entryDate').value, mealType = document.getElementById('mealType').value) {
  const user = activeProfile();
  ensureDay(date)[mealType].push(calcEntry(food, quantity, quantityType));
  user.recents = [food.name, ...user.recents.filter((n) => n !== food.name)].slice(0, 10);
  save();
  renderAll();
}

function renderFavorites() {
  const user = activeProfile();
  const box = document.getElementById('favoriteFoods');
  if (!Array.isArray(user.favorites)) user.favorites = [];
  if (!user.favorites.length) {
    box.innerHTML = '<small class="muted">Ajoute tes aliments favoris pour aller plus vite !</small>';
    return;
  }

  box.innerHTML = '';
  user.favorites.forEach((favorite) => {
    const food = FOOD_DATABASE.find((f) => f.name === favorite.name);
    if (!food) return;
    const wrap = document.createElement('div');
    wrap.className = 'favorite-item';
    const btn = document.createElement('button');
    btn.className = 'btn-outline favorite-btn';
    btn.textContent = favorite.name;
    btn.addEventListener('click', () => addFood(food, 1, 'portion'));
    wrap.appendChild(btn);

    if (state.favoriteEditMode) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'favorite-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => removeFavorite(favorite.name));
      wrap.appendChild(removeBtn);
    }

    box.appendChild(wrap);
  });
}

function addFavorite(food) {
  const user = activeProfile();
  if (user.favorites.some((fav) => normalizeText(fav.name) === normalizeText(food.name))) return;
  if (user.favorites.length >= FAVORITES_MAX) {
    alert(`Maximum ${FAVORITES_MAX} favoris.`);
    return;
  }
  user.favorites.push({ name: food.name, kcal: food.kcalPerPortion, portionDefault: food.defaultPortionG, unit: 'portion(s)' });
  save();
  renderFavorites();
}

function removeFavorite(name) {
  const user = activeProfile();
  user.favorites = user.favorites.filter((fav) => normalizeText(fav.name) !== normalizeText(name));
  save();
  renderFavorites();
}

function renderMeals() {
  const day = ensureDay(document.getElementById('entryDate').value);
  const container = document.getElementById('mealColumns');
  container.innerHTML = '';

  MEALS.forEach((meal) => {
    const list = day[meal.key];
    const total = list.reduce((sum, i) => sum + i.kcal, 0);
    const details = document.createElement('details');
    details.className = 'meal-col';
    details.open = true;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${meal.label}</span><strong>${format(total)} kcal</strong>`;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-outline tiny-btn';
    addBtn.textContent = '+ item';
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('mealType').value = meal.key;
      document.getElementById('foodSearch').focus();
    });
    summary.appendChild(addBtn);
    details.appendChild(summary);

    const ul = document.createElement('ul');
    list.forEach((item, index) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.foodName} (${item.grams}g)</span><span>${format(item.kcal)} kcal</span>`;
      const del = document.createElement('button');
      del.className = 'btn-outline tiny-btn';
      del.textContent = '×';
      del.addEventListener('click', () => {
        list.splice(index, 1);
        save();
        renderAll();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    details.appendChild(ul);
    container.appendChild(details);
  });
}

function renderSummary() {
  const user = activeProfile();
  const currentDate = document.getElementById('entryDate').value;
  const totals = totalsForDay(currentDate);
  const tdee = getTDEE(user.profile);
  const intakeTarget = targetIntake();
  const deficit = tdee - totals.kcal;
  const targetDiff = totals.kcal - intakeTarget;

  document.getElementById('summaryStats').innerHTML = `
    <div class="stat-item"><div class="label">🍽️ Ingesté</div><div class="value">${format(totals.kcal)} kcal</div></div>
    <div class="stat-item"><div class="label">🔥 TDEE</div><div class="value">${format(tdee)} kcal</div></div>
    <div class="stat-item"><div class="label">⬇️ Déficit</div><div class="value ${deficit >= 0 ? 'good' : 'bad'}">${deficit >= 0 ? '-' : '+'}${format(Math.abs(deficit))} kcal</div></div>
    <div class="stat-item"><div class="label">🎯 Écart objectif</div><div class="value ${Math.abs(targetDiff) < 120 ? 'good' : 'bad'}">${targetDiff > 0 ? '+' : ''}${format(targetDiff)} kcal</div></div>
  `;

  const macroTotalKcal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const p = macroTotalKcal ? (totals.protein * 4 / macroTotalKcal) * 100 : 0;
  const c = macroTotalKcal ? (totals.carbs * 4 / macroTotalKcal) * 100 : 0;
  const f = macroTotalKcal ? (totals.fat * 9 / macroTotalKcal) * 100 : 0;
  document.getElementById('macroChart').innerHTML = `
    <div class="bar protein" style="width:${p}%">P ${p.toFixed(0)}%</div>
    <div class="bar carbs" style="width:${c}%">G ${c.toFixed(0)}%</div>
    <div class="bar fat" style="width:${f}%">L ${f.toFixed(0)}%</div>
  `;

  const min = user.profile.sex === 'F' ? 1200 : 1500;
  const banner = document.getElementById('topAlert');
  banner.textContent = totals.kcal < min
    ? `⚠️ Apport très bas (${format(totals.kcal)} kcal). Minimum recommandé: ${min} kcal.`
    : '';
  banner.classList.toggle('show', Boolean(banner.textContent));
}

function dayColor(date) {
  const total = totalsForDay(date).kcal;
  const target = targetIntake();
  if (!total) return 'none';
  const ratio = Math.abs(total - target) / target;
  if (ratio <= 0.1) return 'green';
  if (ratio <= 0.2) return 'orange';
  return 'red';
}

function updatePath(path) {
  if (window.location.protocol === 'file:') return;
  history.pushState({}, '', path);
}

function openDayDetails(date, fromCalendar = false) {
  state.activeDayDetails = date;
  updatePath(`/day/${date}`);
  renderDayDetails();
  switchTab('day-details');
  if (fromCalendar) state.calendarDate = new Date(date);
}

function renderDayDetails() {
  const date = state.activeDayDetails || document.getElementById('entryDate').value;
  const totals = totalsForDay(date);
  const tdee = getTDEE(activeProfile().profile);
  const objective = targetIntake();
  const pctGoal = objective ? (totals.kcal / objective) * 100 : 0;
  const isToday = date === todayStr();
  const dayData = ensureDay(date);

  document.getElementById('dayDetailsTitle').textContent = `Détails du ${new Date(date).toLocaleDateString('fr-FR')}`;
  document.getElementById('dayDetailsSummary').innerHTML = `
    <div class="stat-item"><div class="label">Ingesté</div><div class="value">${format(totals.kcal)} kcal</div></div>
    <div class="stat-item"><div class="label">TDEE</div><div class="value">${format(tdee)} kcal</div></div>
    <div class="stat-item"><div class="label">Déficit</div><div class="value ${tdee - totals.kcal >= 0 ? 'good' : 'bad'}">${format(tdee - totals.kcal)} kcal</div></div>
    <div class="stat-item"><div class="label">% objectif</div><div class="value">${pctGoal.toFixed(0)}%</div></div>
  `;

  const mealsHtml = MEALS.map((meal) => {
    const entries = dayData[meal.key];
    const subtotal = entries.reduce((sum, item) => sum + item.kcal, 0);
    const items = entries.map((item, idx) => `
      <li>
        <span>${item.foodName} · ${item.grams}g · ${format(item.kcal)} kcal</span>
        ${isToday ? `<button class="btn-outline tiny-btn" data-day-remove="${meal.key}:${idx}:${date}">×</button>` : ''}
      </li>
    `).join('') || '<li><span class="muted">Aucun aliment</span></li>';
    return `<div class="meal-detail"><h4>${meal.label} · ${format(subtotal)} kcal</h4><ul>${items}</ul></div>`;
  }).join('');

  document.getElementById('dayDetailsMeals').innerHTML = mealsHtml;
  document.getElementById('editTodayBtn').style.display = isToday ? 'inline-flex' : 'none';

  document.querySelectorAll('[data-day-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [mealKey, idx, d] = btn.dataset.dayRemove.split(':');
      ensureDay(d)[mealKey].splice(Number(idx), 1);
      save();
      renderAll();
      renderDayDetails();
    });
  });
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  grid.innerHTML = '';

  const d = state.calendarDate;
  const year = d.getFullYear();
  const month = d.getMonth();
  title.textContent = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach((label) => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = label;
    grid.appendChild(el);
  });

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  for (let i = 0; i < offset; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    grid.appendChild(empty);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day).toISOString().slice(0, 10);
    const kcal = totalsForDay(date).kcal;
    const color = dayColor(date);
    const el = document.createElement('button');
    el.className = `day ${color}`;
    el.title = `${date} · ${kcal ? `${format(kcal)} kcal` : 'Pas de log'} · déficit ${format(getTDEE(activeProfile().profile) - kcal)} kcal`;
    el.innerHTML = `<span class="day-top"><strong>${day}</strong><span class="dot"></span></span><span class="day-kcal">${kcal ? `${format(kcal)} kcal` : '—'}</span>`;
    el.addEventListener('click', () => openDayDetails(date, true));
    grid.appendChild(el);
  }
}

function exportCsv() {
  const days = Number(document.getElementById('exportDays').value);
  const now = new Date();
  const rows = ['date,kcal,protein,carbs,fat'];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const t = totalsForDay(key);
    rows.push(`${key},${t.kcal.toFixed(1)},${t.protein.toFixed(1)},${t.carbs.toFixed(1)},${t.fat.toFixed(1)}`);
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `calories-${days}j.csv`;
  a.click();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data: state }, null, 2)], {
    type: 'application/json;charset=utf-8;'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `calorie-backup-${todayStr()}.json`;
  a.click();
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.data?.profiles) return alert('Fichier invalide.');
      Object.assign(state, parsed.data);
      state.calendarDate = new Date();
      if (!state.profiles[state.activeProfileId]) state.activeProfileId = Object.keys(state.profiles)[0];
      save();
      renderProfileSelector();
      bindProfile();
      renderAll();
      alert('Import OK');
    } catch {
      alert('JSON invalide.');
    }
  };
  reader.readAsText(file);
}

function renderProfileSelector() {
  const select = document.getElementById('profileSelect');
  select.innerHTML = '';
  Object.values(state.profiles).forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    select.appendChild(option);
  });
  select.value = state.activeProfileId;
  document.getElementById('profileName').value = activeProfile().name;
}

function bindProfile() {
  const user = activeProfile();
  ['sex', 'age', 'weight', 'height', 'activity', 'targetWeight'].forEach((id) => {
    const el = document.getElementById(id);
    el.value = user.profile[id];
    el.onchange = () => {
      user.profile[id] = ['age', 'weight', 'height', 'activity', 'targetWeight'].includes(id) ? Number(el.value) : el.value;
      save();
      renderAll();
    };
  });

  document.getElementById('profileName').onchange = (e) => {
    user.name = e.target.value.trim() || user.name;
    save();
    renderProfileSelector();
  };

  document.getElementById('goalType').value = user.goal.type;
  updateGoalDeltaOptions();
  document.getElementById('goalType').onchange = (e) => {
    user.goal.type = e.target.value;
    updateGoalDeltaOptions(true);
    save();
    renderAll();
  };

  document.getElementById('goalDelta').onchange = (e) => {
    user.goal.delta = Number(e.target.value);
    save();
    renderAll();
  };
}

function createProfile(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const id = `p-${Date.now()}`;
  state.profiles[id] = { id, name: trimmed, ...createDefaultUserData() };
  enrichProfile(state.profiles[id]);
  state.activeProfileId = id;
  save();
  renderProfileSelector();
  bindProfile();
  renderAll();
}

function deleteActiveProfile() {
  const ids = Object.keys(state.profiles);
  if (ids.length <= 1) return alert('Un profil minimum.');
  delete state.profiles[state.activeProfileId];
  state.activeProfileId = Object.keys(state.profiles)[0];
  save();
  renderProfileSelector();
  bindProfile();
  renderAll();
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((el) => {
    const isActive = el.dataset.tab === tab;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((el) => el.classList.toggle('active', el.dataset.panel === tab));
}

function renderAll() {
  renderProjection();
  renderSearchResults();
  renderFavorites();
  renderMeals();
  renderSummary();
  renderCalendar();
  if (state.activeDayDetails) renderDayDetails();
}

function openRouteFromPath() {
  const match = window.location.pathname.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    state.activeDayDetails = match[1];
    switchTab('day-details');
    renderDayDetails();
  }
}

function init() {
  load();
  Object.values(state.profiles).forEach(enrichProfile);
  save();
  document.getElementById('entryDate').value = todayStr();
  renderProfileSelector();
  bindProfile();

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      updatePath('/');
      state.activeDayDetails = null;
      switchTab(tab.dataset.tab);
      renderAll();
    });
  });

  document.getElementById('toggleFavoriteEditBtn').addEventListener('click', () => {
    state.favoriteEditMode = !state.favoriteEditMode;
    const btn = document.getElementById('toggleFavoriteEditBtn');
    btn.classList.toggle('active', state.favoriteEditMode);
    btn.textContent = state.favoriteEditMode ? '✓ Fermer' : '✏️ Gérer favoris';
    renderFavorites();
  });

  document.getElementById('profileSelect').addEventListener('change', (e) => {
    state.activeProfileId = e.target.value;
    enrichProfile(activeProfile());
    save();
    bindProfile();
    renderAll();
  });
  document.getElementById('createProfileBtn').addEventListener('click', () => {
    const input = document.getElementById('newProfileName');
    createProfile(input.value);
    input.value = '';
  });
  document.getElementById('deleteProfileBtn').addEventListener('click', deleteActiveProfile);

  document.getElementById('foodSearch').addEventListener('input', renderSearchResults);
  document.getElementById('quantity').addEventListener('input', renderSearchResults);
  document.getElementById('quantityType').addEventListener('change', renderSearchResults);

  document.getElementById('prevMonth').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    document.getElementById('entryDate').value = todayStr();
    updatePath('/');
    state.activeDayDetails = null;
    switchTab('today');
    renderAll();
  });

  document.getElementById('entryDate').addEventListener('change', renderAll);
  document.getElementById('openDayDetailsBtn').addEventListener('click', () => openDayDetails(document.getElementById('entryDate').value));
  document.getElementById('backToCalendarBtn').addEventListener('click', () => {
    updatePath('/');
    switchTab('calendar');
  });
  document.getElementById('editTodayBtn').addEventListener('click', () => {
    document.getElementById('entryDate').value = todayStr();
    updatePath('/');
    switchTab('today');
    renderAll();
  });

  document.getElementById('exportBtn').addEventListener('click', exportCsv);
  document.getElementById('backupExportBtn').addEventListener('click', exportBackup);
  document.getElementById('backupImportInput').addEventListener('change', (e) => importBackup(e.target.files[0]));

  const toggle = document.getElementById('themeToggle');
  toggle.checked = state.theme === 'dark';
  document.documentElement.dataset.theme = state.theme;
  toggle.addEventListener('change', () => {
    state.theme = toggle.checked ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.theme;
    save();
  });

  renderAll();
  openRouteFromPath();
  switchTab(state.activeTab);
}

init();
