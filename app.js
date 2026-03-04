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
    recents: []
  };
}

const GOAL_DELTA_RECOMMENDATIONS = {
  maintain: { options: [0], hint: 'Maintien: pas de delta, on vise la stabilité.' },
  loss: {
    options: [300, 500, 700],
    hint: 'Perte de poids: déficit conseillé entre 300 et 700 kcal/jour pour rester progressif.'
  },
  gain: {
    options: [200, 300, 400],
    hint: 'Prise de masse: surplus conseillé entre 200 et 400 kcal/jour pour limiter la prise de gras.'
  }
};

const state = {
  profiles: {
    default: { id: 'default', name: 'Profil principal', ...createDefaultUserData() }
  },
  activeProfileId: 'default',
  theme: 'light',
  calendarDate: new Date()
};

function activeProfile() {
  return state.profiles[state.activeProfileId];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
  if (user.goal.type === 'gain') return tdee + Math.min(user.goal.delta, 500);
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
    theme: parsed.theme || 'light'
  };
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
    state.calendarDate = new Date();
    return;
  }

  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;
  const legacyParsed = JSON.parse(legacyRaw);
  Object.assign(state, migrateLegacyData(legacyParsed));
  state.calendarDate = new Date();
  save();
}

function ensureDay(date) {
  const user = activeProfile();
  if (!user.logs[date]) {
    user.logs[date] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  }
  return user.logs[date];
}

function calcEntry(food, quantity, quantityType) {
  const grams = quantityType === 'grams' ? quantity : quantity * food.defaultPortionG;
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

function totalsForDay(date) {
  const day = ensureDay(date);
  const items = Object.values(day).flat();
  return items.reduce((acc, item) => {
    acc.kcal += item.kcal;
    acc.protein += item.protein;
    acc.carbs += item.carbs;
    acc.fat += item.fat;
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function format(num) {
  return Number(num).toFixed(0);
}
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function updateGoalDeltaOptions() {
  const user = activeProfile();
  const goalType = user.goal.type;
  const config = GOAL_DELTA_RECOMMENDATIONS[goalType] || GOAL_DELTA_RECOMMENDATIONS.maintain;
  const select = document.getElementById('goalDelta');
  const hint = document.getElementById('goalDeltaHint');

  select.innerHTML = '';
  config.options.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    select.appendChild(option);
  });

  if (!config.options.includes(user.goal.delta)) {
    user.goal.delta = config.options[0];
  }

  select.value = String(user.goal.delta);
  hint.textContent = config.hint;
}


function renderProjection() {
  const user = activeProfile();
  const tdee = getTDEE(user.profile);
  const delta = user.goal.type === 'maintain' ? 0 : user.goal.delta;
  const projection = document.getElementById('projectionText');
  const targetWeight = Number(user.profile.targetWeight);
  let text = `TDEE estimé: ${format(tdee)} kcal/jour. Cible d'apport: ${format(targetIntake())} kcal/jour.`;

  if (user.goal.type === 'loss' && delta > 0) {
    const kgPerDay = delta / 7700;
    const daysPerKg = 1 / kgPerDay;
    text += ` Avec un déficit moyen de ${delta} kcal/jour, tu perds environ 1 kg tous les ~${daysPerKg.toFixed(1)} jours.`;
    if (targetWeight && targetWeight < user.profile.weight) {
      const kgToLose = user.profile.weight - targetWeight;
      const days = kgToLose * 7700 / delta;
      const months = days / 30;
      text += ` Pour perdre ${kgToLose.toFixed(1)} kg → estimation: ${months.toFixed(1)} mois (≈ ${days.toFixed(0)} jours).`;
    }
  }

  if (user.goal.type === 'gain') {
    text += ` En prise de masse, un surplus modéré (${Math.min(delta, 500)} kcal/jour) est appliqué pour rester progressif.`;
  }

  projection.textContent = text;
}

function renderSearchResults() {
  const query = normalizeText(document.getElementById('foodSearch').value);
  const ul = document.getElementById('searchResults');
  ul.innerHTML = '';
  if (!query) return;

  const matches = FOOD_DATABASE
    .filter((food) => normalizeText(food.name).includes(query))
    .slice(0, 12);

  const quantity = Number(document.getElementById('quantity').value || 1);
  const quantityType = document.getElementById('quantityType').value;

  matches.forEach((food) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${food.name} · ${food.defaultPortionG}g · ${food.kcalPerPortion} kcal</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Ajouter';
    btn.addEventListener('click', () => addFood(food, quantity, quantityType));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function addFood(food, quantity, quantityType) {
  const user = activeProfile();
  const date = document.getElementById('entryDate').value;
  const meal = document.getElementById('mealType').value;
  const entry = calcEntry(food, quantity, quantityType);
  ensureDay(date)[meal].push(entry);

  user.recents = [food.name, ...user.recents.filter((n) => n !== food.name)].slice(0, 10);
  save();
  renderAll();
}

function renderFavorites() {
  const user = activeProfile();
  const box = document.getElementById('favoriteFoods');
  if (!user.recents.length) {
    box.innerHTML = '<small>Favoris rapides: les 10 derniers aliments apparaissent ici.</small>';
    return;
  }
  box.innerHTML = '<strong>Ajout rapide</strong>';
  user.recents.forEach((name) => {
    const food = FOOD_DATABASE.find((f) => f.name === name);
    if (!food) return;
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => addFood(food, 1, 'portion'));
    box.appendChild(btn);
  });
}

function renderMeals() {
  const date = document.getElementById('entryDate').value;
  const day = ensureDay(date);
  const container = document.getElementById('mealColumns');
  container.innerHTML = '';

  MEALS.forEach((meal) => {
    const col = document.createElement('div');
    col.className = 'meal-col';
    const list = day[meal.key];
    const total = list.reduce((sum, i) => sum + i.kcal, 0);
    col.innerHTML = `<h3>${meal.label} (${format(total)} kcal)</h3>`;
    const ul = document.createElement('ul');
    list.forEach((item, index) => {
      const li = document.createElement('li');
      li.innerHTML = `${item.foodName} (${item.grams}g) - ${format(item.kcal)} kcal`;
      const del = document.createElement('button');
      del.textContent = '×';
      del.addEventListener('click', () => {
        list.splice(index, 1);
        save();
        renderAll();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    col.appendChild(ul);
    container.appendChild(col);
  });
}

function renderSummary() {
  const user = activeProfile();
  const date = document.getElementById('entryDate').value;
  const totals = totalsForDay(date);
  const tdee = getTDEE(user.profile);
  const intakeTarget = targetIntake();
  const diff = totals.kcal - tdee;
  const targetDiff = totals.kcal - intakeTarget;
  const objectivePct = intakeTarget ? (totals.kcal / intakeTarget) * 100 : 100;

  document.getElementById('summaryStats').innerHTML = `
    <div><strong>Ingesté:</strong> ${format(totals.kcal)} kcal</div>
    <div><strong>TDEE:</strong> ${format(tdee)} kcal</div>
    <div><strong>Déficit / surplus:</strong> ${diff > 0 ? '+' : ''}${format(diff)} kcal</div>
    <div><strong>Écart à l'objectif:</strong> ${targetDiff > 0 ? '+' : ''}${format(targetDiff)} kcal</div>
    <div><strong>% objectif:</strong> ${objectivePct.toFixed(1)}%</div>
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
  document.getElementById('intakeAlert').textContent = totals.kcal < min
    ? `⚠️ Apport bas: ${format(totals.kcal)} kcal (< ${min} kcal recommandé minimum).`
    : '';
}

function dayColor(date) {
  const total = totalsForDay(date).kcal;
  const target = targetIntake();
  if (!total) return 'none';
  const ratio = Math.abs(total - target) / target;
  if (ratio <= 0.1) return 'green';
  if (ratio <= 0.15) return 'orange';
  return 'red';
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
    const el = document.createElement('button');
    el.className = `day ${dayColor(date)}`;
    const kcal = totalsForDay(date).kcal;
    el.innerHTML = `<span>${day}</span><small>${kcal ? format(kcal) : '-'} kcal</small>`;
    el.addEventListener('click', () => {
      document.getElementById('entryDate').value = date;
      renderAll();
    });
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
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
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
      if (!parsed.data?.profiles) {
        alert('Fichier invalide: profils manquants.');
        return;
      }
      Object.assign(state, parsed.data);
      state.calendarDate = new Date();
      if (!state.profiles[state.activeProfileId]) {
        state.activeProfileId = Object.keys(state.profiles)[0];
      }
      save();
      renderProfileSelector();
      bindProfile();
      renderAll();
      alert('Sauvegarde importée avec succès.');
    } catch {
      alert('Impossible de lire le fichier JSON.');
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
}

function bindProfile() {
  const user = activeProfile();
  ['sex', 'age', 'weight', 'height', 'activity', 'targetWeight'].forEach((id) => {
    const el = document.getElementById(id);
    el.value = user.profile[id];
    el.onchange = () => {
      user.profile[id] = ['age', 'weight', 'height', 'activity', 'targetWeight'].includes(id)
        ? Number(el.value)
        : el.value;
      save();
      renderAll();
    };
  });

  document.getElementById('goalType').value = user.goal.type;
  updateGoalDeltaOptions();
  document.getElementById('goalType').onchange = (e) => {
    user.goal.type = e.target.value;
    updateGoalDeltaOptions();
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
  state.activeProfileId = id;
  save();
  renderProfileSelector();
  bindProfile();
  renderAll();
}

function deleteActiveProfile() {
  const ids = Object.keys(state.profiles);
  if (ids.length <= 1) {
    alert('Au moins un profil est obligatoire.');
    return;
  }
  delete state.profiles[state.activeProfileId];
  state.activeProfileId = Object.keys(state.profiles)[0];
  save();
  renderProfileSelector();
  bindProfile();
  renderAll();
}

function renderAll() {
  renderProjection();
  renderSearchResults();
  renderFavorites();
  renderMeals();
  renderSummary();
  renderCalendar();
}

function init() {
  load();
  document.getElementById('entryDate').value = todayStr();
  renderProfileSelector();
  bindProfile();

  document.getElementById('profileSelect').addEventListener('change', (e) => {
    state.activeProfileId = e.target.value;
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
    renderAll();
  });
  document.getElementById('entryDate').addEventListener('change', renderAll);
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
}

init();
