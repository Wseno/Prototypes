const STORAGE_KEY = 'calorie-tracker-v1';
const MEALS = [
  { key: 'breakfast', label: 'Petit-déj' },
  { key: 'lunch', label: 'Déjeuner' },
  { key: 'dinner', label: 'Dîner' },
  { key: 'snacks', label: 'Collations' }
];

const state = {
  profile: { sex: 'H', age: 30, weight: 75, height: 175, activity: 1.55, targetWeight: '' },
  goal: { type: 'loss', delta: 500 },
  logs: {},
  recents: [],
  theme: 'light',
  calendarDate: new Date()
};

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
  const tdee = getTDEE(state.profile);
  if (state.goal.type === 'loss') return tdee - state.goal.delta;
  if (state.goal.type === 'gain') return tdee + Math.min(state.goal.delta, 500);
  return tdee;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const parsed = JSON.parse(raw);
  Object.assign(state, parsed);
  state.calendarDate = new Date();
}

function ensureDay(date) {
  if (!state.logs[date]) {
    state.logs[date] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  }
  return state.logs[date];
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

function renderProjection() {
  const tdee = getTDEE(state.profile);
  const delta = state.goal.type === 'maintain' ? 0 : state.goal.delta;
  const projection = document.getElementById('projectionText');
  const targetWeight = Number(state.profile.targetWeight);
  let text = `TDEE estimé: ${format(tdee)} kcal/jour. Cible d'apport: ${format(targetIntake())} kcal/jour.`;

  if (state.goal.type === 'loss' && delta > 0) {
    const kgPerDay = delta / 7700;
    const daysPerKg = 1 / kgPerDay;
    text += ` Avec un déficit moyen de ${delta} kcal/jour, tu perds environ 1 kg tous les ~${daysPerKg.toFixed(1)} jours.`;
    if (targetWeight && targetWeight < state.profile.weight) {
      const kgToLose = state.profile.weight - targetWeight;
      const days = kgToLose * 7700 / delta;
      const months = days / 30;
      text += ` Pour perdre ${kgToLose.toFixed(1)} kg → estimation: ${months.toFixed(1)} mois (≈ ${days.toFixed(0)} jours).`;
    }
  }

  if (state.goal.type === 'gain') {
    text += ` En prise de masse, un surplus modéré (${Math.min(delta, 500)} kcal/jour) est appliqué pour rester progressif.`;
  }

  projection.textContent = text;
}

function renderSearchResults() {
  const query = document.getElementById('foodSearch').value.trim().toLowerCase();
  const ul = document.getElementById('searchResults');
  ul.innerHTML = '';
  if (!query) return;

  const matches = FOOD_DATABASE
    .filter((food) => food.name.toLowerCase().includes(query))
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
  const date = document.getElementById('entryDate').value;
  const meal = document.getElementById('mealType').value;
  const entry = calcEntry(food, quantity, quantityType);
  ensureDay(date)[meal].push(entry);

  state.recents = [food.name, ...state.recents.filter((n) => n !== food.name)].slice(0, 10);
  save();
  renderAll();
}

function renderFavorites() {
  const box = document.getElementById('favoriteFoods');
  if (!state.recents.length) {
    box.innerHTML = '<small>Favoris rapides: les 10 derniers aliments apparaissent ici.</small>';
    return;
  }
  box.innerHTML = '<strong>Ajout rapide</strong>';
  state.recents.forEach((name) => {
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
  const date = document.getElementById('entryDate').value;
  const totals = totalsForDay(date);
  const tdee = getTDEE(state.profile);
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

  const min = state.profile.sex === 'F' ? 1200 : 1500;
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

function bindProfile() {
  ['sex', 'age', 'weight', 'height', 'activity', 'targetWeight'].forEach((id) => {
    const el = document.getElementById(id);
    el.value = state.profile[id];
    el.addEventListener('change', () => {
      state.profile[id] = ['age', 'weight', 'height', 'activity', 'targetWeight'].includes(id)
        ? Number(el.value)
        : el.value;
      save();
      renderAll();
    });
  });

  document.getElementById('goalType').value = state.goal.type;
  document.getElementById('goalDelta').value = state.goal.delta;
  document.getElementById('goalType').addEventListener('change', (e) => {
    state.goal.type = e.target.value;
    save();
    renderAll();
  });
  document.getElementById('goalDelta').addEventListener('change', (e) => {
    state.goal.delta = Number(e.target.value);
    save();
    renderAll();
  });
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
  bindProfile();

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
