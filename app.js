const STORAGE_KEY = 'calorie-tracker-v2';
const LEGACY_STORAGE_KEY = 'calorie-tracker-v1';
const MEALS = [
  { key: 'breakfast', label: 'Petit-déj', icon: '🌅' },
  { key: 'lunch', label: 'Déjeuner', icon: '☀️' },
  { key: 'dinner', label: 'Dîner', icon: '🌙' },
  { key: 'snacks', label: 'Collation', icon: '⚡' }
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
  { key: 'grams', label: 'g', type: 'weight', grams: 1, family: 'weight' },
  { key: 'ml', label: 'ml', type: 'weight', grams: 1, family: 'weight' },
  { key: 'portion', label: 'portion(s)', type: 'portion', ratio: 1, family: 'serving' },
  { key: 'slice', label: 'tranche(s)', type: 'portion', ratio: 1, family: 'slice' },
  { key: 'thinSlice', label: 'tranche(s) fine(s)', type: 'portion', ratio: 0.5, family: 'slice' },
  { key: 'thickSlice', label: 'tranche(s) épaisse(s)', type: 'portion', ratio: 1.5, family: 'slice' },
  { key: 'tbsp', label: 'cs', type: 'portion', ratio: 1, family: 'spoon' },
  { key: 'tsp', label: 'cc', type: 'portion', ratio: 0.33, family: 'spoon' },
  { key: 'piece', label: 'pièce(s)', type: 'portion', ratio: 1, family: 'piece' },
  { key: 'pot125', label: 'pot 125g', type: 'weight', grams: 125 },
  { key: 'pot150', label: 'pot 150g', type: 'weight', grams: 150 },
  { key: 'half', label: '1/2', type: 'portion', ratio: 0.5 },
  { key: 'quarter', label: '1/4', type: 'portion', ratio: 0.25 }
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
    .map((food) => ({ name: food.name, kcal: food.kcal, portionDefault: food.defaultPortion, unit: food.unit || 'portion(s)' }));
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

function getFoodDefaultGrams(food) {
  if (food.unit === 'g' || food.unit === 'ml') return Number(food.defaultPortion || 100);
  return food.kcalPer100g && food.kcal ? Number(((food.kcal / food.kcalPer100g) * 100).toFixed(1)) : Number(food.defaultPortion || 100);
}

function inferFoodUnitKey(food) {
  const unit = normalizeText(food.unit);
  if (unit === 'g' || unit === 'gramme' || unit === 'grammes') return 'grams';
  if (unit === 'ml' || unit === 'millilitre' || unit === 'millilitres') return 'ml';
  if (unit.includes('tranche fine')) return 'thinSlice';
  if (unit.includes('tranche epaisse')) return 'thickSlice';
  if (unit.includes('tranche')) return 'slice';
  if (unit === 'cs' || unit.includes('cas')) return 'tbsp';
  if (unit === 'cc' || unit.includes('cac')) return 'tsp';
  if (unit.includes('piece') || unit.includes('oeuf') || unit.includes('part') || unit.includes('pot') || unit.includes('boule') || unit.includes('tasse')) return 'piece';
  if (unit.includes('portion')) return 'portion';
  return null;
}

function quantityToGrams(food, quantity, quantityType) {
  const unit = getUnitConfig(quantityType);
  const defaultGrams = getFoodDefaultGrams(food);
  if (unit.type === 'weight') return quantity * unit.grams;

  const defaultPortion = Number(food.defaultPortion || 1) || 1;
  const foodUnitKey = inferFoodUnitKey(food);
  const foodUnit = foodUnitKey ? getUnitConfig(foodUnitKey) : null;
  if (foodUnit && foodUnit.family === unit.family && foodUnit.type === 'portion') {
    const gramsPerFoodUnit = defaultGrams / defaultPortion;
    return quantity * gramsPerFoodUnit * ((unit.ratio || 1) / (foodUnit.ratio || 1));
  }

  if (quantityType === 'portion') return quantity * defaultGrams;
  return quantity * defaultGrams * (unit.ratio || 1);
}

function calculateQuickKcal(food, quantity, quantityType) {
  if (!food) return 0;
  const grams = quantityToGrams(food, quantity, quantityType);
  if (food.kcalPer100g != null) {
    return Number(((grams / 100) * food.kcalPer100g).toFixed(1));
  }
  const defaultGrams = getFoodDefaultGrams(food);
  return Number((((grams / defaultGrams) * food.kcal) || 0).toFixed(1));
}

function calcEntry(food, quantity, quantityType) {
  const grams = quantityToGrams(food, quantity, quantityType);
  const kcal = calculateQuickKcal(food, quantity, quantityType);
  return {
    foodName: food.name,
    grams: Number(grams.toFixed(1)),
    kcal,
    protein: 0,
    carbs: 0,
    fat: 0
  };
}

function getWeeklyAverageKcal() {
  const now = new Date();
  let total = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    total += totalsForDay(day.toISOString().slice(0, 10)).kcal;
  }
  return total / 7;
}

function getStreakInGoal() {
  const target = targetIntake();
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 60; i += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const kcal = totalsForDay(key).kcal;
    if (!kcal) break;
    if (Math.abs(kcal - target) / target <= 0.15) streak += 1;
    else break;
  }
  return streak;
}

function buildGoalRing(pctGoal, theme = 'neutral') {
  const size = 180;
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(140, pctGoal));
  const offset = circumference * (1 - progress / 100);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Progression objectif">
      <circle cx="90" cy="90" r="${radius}" stroke="rgba(148,163,184,0.3)" stroke-width="14" fill="none"></circle>
      <circle cx="90" cy="90" r="${radius}" stroke="var(--${theme})" stroke-width="14" fill="none" stroke-linecap="round"
        transform="rotate(-90 90 90)" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      <text x="90" y="88" text-anchor="middle" class="ring-number">${pctGoal.toFixed(0)}%</text>
      <text x="90" y="110" text-anchor="middle" class="ring-label">objectif</text>
    </svg>
  `;
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
  document.getElementById('goalDeltaHint').textContent = `${config.hint} · ℹ️ Basé sur 7700 kcal/kg • Safe: 0.5-1kg/sem max`;
}

function renderProjection() {
  const user = activeProfile();
  const delta = user.goal.type === 'maintain' ? 0 : user.goal.delta;
  const targetWeight = Number(user.profile.targetWeight);
  const tdee = getTDEE(user.profile);
  let text = `🔥 TDEE estimé: ${format(tdee)} kcal/j`;

  if (user.goal.type === 'loss' && delta > 0) {
    const weeklyKg = (delta * 7) / 7700;
    text = `⬇️ ${format(tdee - delta)} kcal/j · perte ~${weeklyKg.toFixed(2)} kg/sem`;
    if (targetWeight && targetWeight < user.profile.weight) {
      const kgToLose = user.profile.weight - targetWeight;
      const days = (kgToLose * 7700) / delta;
      text += ` · ${kgToLose.toFixed(1)}kg ≈ ${Math.ceil(days / 7)} semaines`;
    }
  }

  if (user.goal.type === 'gain') {
    text = `⬆️ ${format(tdee + delta)} kcal/j · surplus +${delta} kcal`;
  }

  document.getElementById('projectionText').textContent = `${text} ℹ️ Basé sur 7700 kcal/kg • Consulte un pro en cas de doute.`;
}

function getSearchScore(food, query) {
  if (!query) return 1;
  const q = normalizeText(query);
  const name = normalizeText(food.name);
  const category = normalizeText(food.category || '');
  const aliases = (food.aliases || []).map(normalizeText).join(' ');
  if (name.startsWith(q)) return 100;
  if (aliases.includes(q)) return 85;
  if (name.includes(q)) return 70;
  if (category.includes(q)) return 55;
  if (`${name} ${aliases} ${category}`.includes(q)) return 40;
  return 0;
}

function findFoodByInput(value) {
  const q = normalizeText(value);
  return FOOD_DATABASE.find((food) => normalizeText(food.name) === q);
}

function updateLiveKcal() {
  const selected = findFoodByInput(document.getElementById('foodSearch').value);
  const quantity = Number(document.getElementById('quantity').value || 1);
  const quantityType = document.getElementById('quantityType').value;
  const kcal = selected ? calculateQuickKcal(selected, quantity, quantityType) : 0;
  document.getElementById('liveKcal').textContent = `≈ ${format(kcal)} kcal`;
}

function renderSearchResults() {
  const queryRaw = document.getElementById('foodSearch').value;
  const query = normalizeText(queryRaw);
  const categoryFilter = document.getElementById('foodCategory').value;
  const ul = document.getElementById('searchResults');
  const suggestions = document.getElementById('foodSuggestions');
  ul.innerHTML = '';
  suggestions.innerHTML = '';

  const quantity = Number(document.getElementById('quantity').value || 1);
  const quantityType = document.getElementById('quantityType').value;

  const matches = FOOD_DATABASE
    .map((food) => ({ food, score: getSearchScore(food, query) }))
    .filter(({ food, score }) => score > 0 && (!categoryFilter || food.category === categoryFilter))
    .sort((a, b) => b.score - a.score)
    .slice(0, query ? 14 : 10)
    .map(({ food }) => food);

  matches.forEach((food) => {
    const opt = document.createElement('option');
    opt.value = food.name;
    suggestions.appendChild(opt);

    if (!query) return;
    const li = document.createElement('li');
    li.innerHTML = `<span>${food.name} · ${food.kcal} kcal (${food.portionDescription})</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-outline';
    btn.textContent = 'Ajouter';
    btn.addEventListener('click', () => addFood(food, quantity, quantityType));
    const favBtn = document.createElement('button');
    favBtn.className = 'btn-outline';
    favBtn.textContent = '☆';
    favBtn.title = 'Ajouter aux favoris';
    favBtn.addEventListener('click', () => addFavorite(food));
    li.appendChild(btn);
    li.appendChild(favBtn);
    ul.appendChild(li);
  });

  if (query && !matches.length) {
    ul.innerHTML = '<li><span class="muted">Aliment introuvable.</span></li>';
  }

  updateLiveKcal();
}

function addFood(food, quantity, quantityType, date = document.getElementById('entryDate').value, mealType = document.getElementById('mealType').value) {
  const user = activeProfile();
  ensureDay(date)[mealType].push(calcEntry(food, quantity, quantityType));
  user.recents = [food.name, ...user.recents.filter((n) => n !== food.name)].slice(0, 10);
  save();
  renderAll();
}


function addCustomFood() {
  const name = prompt("Nom de l'aliment personnalisé :");
  if (!name) return;
  const kcalPer100g = Number(prompt('kcal / 100g :', '200'));
  if (!kcalPer100g || kcalPer100g < 0) return alert('Valeur kcal/100g invalide.');
  const defaultPortion = Number(prompt('Portion par défaut (g/ml ou unité) :', '100')) || 100;
  const unit = prompt('Unité par défaut (g, ml, portion, tranche, pièce, cs, cc...) :', 'g') || 'g';
  const kcal = Number(((defaultPortion / 100) * kcalPer100g).toFixed(0));
  const newFood = {
    name: name.trim(),
    defaultPortion,
    unit,
    kcal,
    kcalPer100g,
    portionDescription: `${defaultPortion}${unit} (personnalisé)`,
    category: 'Personnalisé',
    aliases: ['perso']
  };
  FOOD_DATABASE.unshift(newFood);
  document.getElementById('foodSearch').value = newFood.name;
  renderSearchResults();
}

function renderFavorites() {
  const user = activeProfile();
  const box = document.getElementById('favoriteFoods');
  if (!Array.isArray(user.favorites)) user.favorites = [];
  if (!user.favorites.length) {
    box.innerHTML = '<small class="muted">Ajoute tes favoris pour un log en 1 clic.</small>';
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
    btn.textContent = `➕ ${favorite.name}`;
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
  if (user.favorites.length >= FAVORITES_MAX) return alert(`Maximum ${FAVORITES_MAX} favoris.`);
  user.favorites.push({ name: food.name, kcal: food.kcal, portionDefault: food.defaultPortion, unit: food.unit || 'portion(s)' });
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
    summary.innerHTML = `<span>${meal.icon} ${meal.label}</span><strong>${format(total)} kcal</strong>`;

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
    if (!list.length) ul.innerHTML = '<li><span class="muted">Aucun aliment</span></li>';
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
  const pctGoal = intakeTarget ? (totals.kcal / intakeTarget) * 100 : 0;
  const targetDiff = totals.kcal - intakeTarget;

  const deltaClass = deficit >= 0 && deficit <= 750 ? 'good' : deficit > 750 ? 'warn' : 'bad';
  const intakeClass = totals.kcal ? 'primary' : 'muted-val';
  const pctClass = pctGoal >= 85 && pctGoal <= 110 ? 'good' : pctGoal > 120 || pctGoal < 60 ? 'bad' : 'warn';

  document.getElementById('summaryStats').innerHTML = `
    <div class="stat-item"><div class="label">🍽️ Ingesté</div><div class="value big ${intakeClass}">${format(totals.kcal)} kcal</div></div>
    <div class="stat-item"><div class="label">🔥 TDEE</div><div class="value big">${format(tdee)} kcal</div></div>
    <div class="stat-item"><div class="label">🧮 Déficit</div><div class="value big ${deltaClass}">${deficit >= 0 ? '-' : '+'}${format(Math.abs(deficit))} kcal</div></div>
    <div class="stat-item"><div class="label">🎯 % objectif</div><div class="value big ${pctClass}">${pctGoal.toFixed(0)}%</div><small class="muted">${targetDiff > 0 ? '+' : ''}${format(targetDiff)} kcal</small></div>
  `;

  const macroTotalKcal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const p = macroTotalKcal ? (totals.protein * 4 / macroTotalKcal) * 100 : 0;
  const c = macroTotalKcal ? (totals.carbs * 4 / macroTotalKcal) * 100 : 0;
  const f = macroTotalKcal ? (totals.fat * 9 / macroTotalKcal) * 100 : 0;
  const pClass = p >= 50 ? 'macro-good' : '';
  document.getElementById('macroChart').innerHTML = `
    <div class="bar protein ${pClass}" style="width:${Math.max(10, p)}%" title="Protéines ${p.toFixed(0)}%">P ${p.toFixed(0)}%</div>
    <div class="bar carbs" style="width:${Math.max(10, c)}%" title="Glucides ${c.toFixed(0)}%">G ${c.toFixed(0)}%</div>
    <div class="bar fat" style="width:${Math.max(10, f)}%" title="Lipides ${f.toFixed(0)}%">L ${f.toFixed(0)}%</div>
  `;

  const ringTheme = pctGoal < 65 ? 'danger' : pctGoal > 110 ? 'warning' : deficit >= 0 && deficit <= 750 ? 'success' : 'primary';
  document.getElementById('goalProgress').innerHTML = buildGoalRing(pctGoal, ringTheme);

  const min = user.profile.sex === 'F' ? 1200 : 1500;
  const banner = document.getElementById('topAlert');
  const warnings = [];
  if (totals.kcal < min) warnings.push(`⚠️ Apport très bas (${format(totals.kcal)} kcal). Ajoute une collation protéinée pour atteindre le minimum (${min} kcal).`);
  if (deficit > 750) warnings.push('🟠 Déficit élevé (>750 kcal). Reste progressif et consulte un pro si besoin.');
  if (totals.kcal > tdee + 500) warnings.push('🔴 Surplus important détecté. Reviens vers un déficit modéré demain.');

  banner.textContent = warnings.join(' ');
  banner.classList.toggle('show', warnings.length > 0);

  const streak = getStreakInGoal();
  const weeklyAvg = getWeeklyAverageKcal();
  document.getElementById('streakBadge').textContent = `🔥 Streak ${streak} ${streak > 1 ? 'jours' : 'jour'}`;
  const goalBadge = document.getElementById('goalBadge');
  if (pctGoal >= 85 && pctGoal <= 110) {
    goalBadge.textContent = '✅ Bien joué ! Dans l\'objectif';
    goalBadge.className = 'badge-pill success';
  } else {
    goalBadge.textContent = '💬 Continue, tu progresses';
    goalBadge.className = 'badge-pill neutral';
  }
  document.getElementById('weeklyAvgBadge').textContent = `📊 Moy. hebdo ${format(weeklyAvg)} kcal`;
}

function getCalendarStatus(date) {
  const kcal = totalsForDay(date).kcal;
  if (!kcal) return { color: 'none', emoji: '•', heat: 0, text: 'Aucune donnée' };
  const target = targetIntake();
  const diff = kcal - target;
  const absRatio = Math.abs(diff) / target;

  if (kcal < (activeProfile().profile.sex === 'F' ? 1200 : 1500)) return { color: 'red', emoji: '🛑', heat: 1, text: 'Apport trop bas' };
  if (absRatio <= 0.1) return { color: 'blue', emoji: '🙂', heat: 0.2, text: 'Maintien' };
  if (diff < 0 && Math.abs(diff) <= 750) return { color: 'green', emoji: '✅', heat: 0.4, text: 'Déficit safe' };
  if (diff > 0 && absRatio <= 0.25) return { color: 'orange', emoji: '😐', heat: 0.65, text: 'Surplus léger' };
  return { color: 'red', emoji: diff > 0 ? '🔺' : '🔻', heat: 0.9, text: 'Zone alerte' };
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
    <div class="stat-item"><div class="label">Déficit</div><div class="value ${(tdee - totals.kcal) >= 0 ? 'good' : 'bad'}">${format(tdee - totals.kcal)} kcal</div></div>
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
    return `<div class="meal-detail"><h4>${meal.icon} ${meal.label} · ${format(subtotal)} kcal</h4><ul>${items}</ul></div>`;
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

function fillMonthYearControls() {
  const monthSelect = document.getElementById('calendarMonth');
  const yearSelect = document.getElementById('calendarYear');
  if (!monthSelect.options.length) {
    [...Array(12).keys()].forEach((m) => {
      const option = document.createElement('option');
      option.value = String(m);
      option.textContent = new Date(2024, m, 1).toLocaleDateString('fr-FR', { month: 'long' });
      monthSelect.appendChild(option);
    });
  }
  if (!yearSelect.options.length) {
    const current = new Date().getFullYear();
    for (let year = current - 3; year <= current + 3; year += 1) {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      yearSelect.appendChild(option);
    }
  }
  monthSelect.value = String(state.calendarDate.getMonth());
  yearSelect.value = String(state.calendarDate.getFullYear());
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  grid.innerHTML = '';
  fillMonthYearControls();

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
  const tdee = getTDEE(activeProfile().profile);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day).toISOString().slice(0, 10);
    const kcal = totalsForDay(date).kcal;
    const status = getCalendarStatus(date);
    const protein = totalsForDay(date).protein;
    const totalKcal = totalsForDay(date).kcal;
    const proteinPct = totalKcal ? (protein * 4 / totalKcal) * 100 : 0;

    const el = document.createElement('button');
    el.className = `day ${status.color}`;
    el.style.setProperty('--heat', status.heat);
    const deficit = tdee - kcal;
    el.title = `${status.text} ${deficit >= 0 ? 'Déficit' : 'Surplus'} ${format(Math.abs(deficit))} kcal • ${proteinPct.toFixed(0)}% P`;
    el.innerHTML = `<span class="day-top"><strong>${day}</strong><span class="dot">${status.emoji}</span></span><span class="day-kcal">${kcal ? `${format(kcal)} kcal` : '—'}</span>`;
    el.addEventListener('click', () => openDayDetails(date, true));
    grid.appendChild(el);
  }
}

function buildHistoryData(days = 30) {
  const data = [];
  const now = new Date();
  const tdee = getTDEE(activeProfile().profile);
  const objective = targetIntake();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const totals = totalsForDay(key);
    data.push({
      date: key,
      kcal: totals.kcal,
      tdee,
      deficit: tdee - totals.kcal,
      pct: objective ? (totals.kcal / objective) * 100 : 0
    });
  }
  return data;
}

function renderHistory() {
  const rows = buildHistoryData(30);
  const body = document.getElementById('historyPreviewBody');
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${new Date(row.date).toLocaleDateString('fr-FR')}</td>
      <td>${format(row.kcal)}</td>
      <td>${format(row.tdee)}</td>
      <td class="${row.deficit >= 0 ? 'good' : 'bad'}">${row.deficit >= 0 ? '-' : '+'}${format(Math.abs(row.deficit))}</td>
      <td>${row.pct.toFixed(0)}%</td>
    </tr>
  `).join('');

  const avg = rows.reduce((sum, row) => sum + row.kcal, 0) / rows.length;
  const avgDeficit = rows.reduce((sum, row) => sum + row.deficit, 0) / rows.length;
  document.getElementById('historyStats').innerHTML = `
    <div class="stat-item"><div class="label">Moyenne kcal</div><div class="value">${format(avg)}</div></div>
    <div class="stat-item"><div class="label">Déficit moyen</div><div class="value ${avgDeficit >= 0 ? 'good' : 'bad'}">${avgDeficit >= 0 ? '-' : '+'}${format(Math.abs(avgDeficit))}</div></div>
    <div class="stat-item"><div class="label">Objectif moyen</div><div class="value">${rows.reduce((s, r) => s + r.pct, 0) / rows.length | 0}%</div></div>
  `;

  const maxY = Math.max(...rows.map((r) => Math.max(r.kcal, r.tdee)), 2000);
  const pointsReal = rows.map((r, i) => `${(i / (rows.length - 1)) * 100},${100 - (r.kcal / maxY) * 100}`).join(' ');
  const pointsTarget = rows.map((r, i) => `${(i / (rows.length - 1)) * 100},${100 - (targetIntake() / maxY) * 100}`).join(' ');
  document.getElementById('historyChart').innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Courbe kcal réelle et cible">
      <polyline points="${pointsTarget}" class="line-target" />
      <polyline points="${pointsReal}" class="line-real" />
    </svg>
    <div class="chart-legend"><span class="legend-target">— Cible</span><span class="legend-real">— Réel</span></div>
  `;
}

function exportCsv() {
  const days = Number(document.getElementById('exportDays').value);
  const now = new Date();
  const tdee = getTDEE(activeProfile().profile);
  const objective = targetIntake();
  const rows = ['date,kcal_ingere,tdee,deficit,pourcent_objectif'];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const t = totalsForDay(key);
    const deficit = tdee - t.kcal;
    const pct = objective ? (t.kcal / objective) * 100 : 0;
    rows.push(`${key},${t.kcal.toFixed(1)},${tdee.toFixed(1)},${deficit.toFixed(1)},${pct.toFixed(1)}`);
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
  renderHistory();
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
  document.getElementById('foodCategory').addEventListener('change', renderSearchResults);
  document.getElementById('addCustomFoodBtn').addEventListener('click', addCustomFood);

  document.getElementById('prevMonth').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('calendarMonth').addEventListener('change', (e) => {
    state.calendarDate.setMonth(Number(e.target.value));
    renderCalendar();
  });
  document.getElementById('calendarYear').addEventListener('change', (e) => {
    state.calendarDate.setFullYear(Number(e.target.value));
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
