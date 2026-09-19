const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const STORAGE_KEY = "vital-ledger-state";
const MEAL_IMAGES_KEY = "miao-meal-thumbnails";
const MOOD_KEY = "miao-mood-checkins";
const macroColors = {
  energy: "#edeec9",
  protein: "#77bfa3",
  carbohydrates: "#98c9a3",
  fibre: "#bfd8bd"
};

const standards = {
  adult: {
    waterL: 2.7,
    calories: 2100,
    steps: 8000,
    activeMinutes: 150,
    macro: { energy: 0.28, protein: 0.22, carbohydrates: 0.42, fibre: 0.08 }
  },
  child: {
    waterL: 1.7,
    calories: 1600,
    steps: 10000,
    activeMinutes: 420,
    macro: { energy: 0.25, protein: 0.2, carbohydrates: 0.45, fibre: 0.1 }
  }
};

const metValues = {
  gym: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  run: { light: 6.0, moderate: 9.0, vigorous: 11.5 },
  cycle: { light: 4.0, moderate: 7.5, vigorous: 10.0 },
  swim: { light: 5.0, moderate: 7.0, vigorous: 9.0 },
  yoga: { light: 2.4, moderate: 3.2, vigorous: 4.0 }
};

let state = loadState();
let deferredInstallPrompt = null;
let currentAnalyzedMeal = null;
let selectedMealFile = null;
let isDetectingFood = false;
let isSavingMeal = false;
let historyDays = [];
let historyNextBefore = null;
let historyHasMore = true;
let isLoadingHistory = false;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:8765" : "";
const moods = [
  { label: "Very unhappy", color: "#a96bea", ink: "#57258f", mouth: "sad", eyes: "droop", tears: true },
  { label: "Unhappy", color: "#f29135", ink: "#8a351d", mouth: "sad", eyes: "dot-eyes" },
  { label: "Neutral", color: "#b99167", ink: "#4c2f2c", mouth: "flat", eyes: "dot-eyes" },
  { label: "Happy", color: "#f8c10e", ink: "#814600", mouth: "smile", eyes: "dot-eyes" },
  { label: "Very happy", color: "#9bbd61", ink: "#345329", mouth: "laugh", eyes: "happy-eyes" }
];
let moodValue = 2;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultState() {
  return {
    mode: "adult",
    profile: { fullName: "", height: 170, weight: 65, age: 30, sex: "female" },
    waterMl: 0,
    health: { steps: 6200, walkMinutes: 52 },
    meals: [],
    exercises: [],
    lastScore: null
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(saved) };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadMealImages() {
  try {
    return JSON.parse(localStorage.getItem(MEAL_IMAGES_KEY)) || {};
  } catch {
    return {};
  }
}

function saveMealImage(mealId, imageDataUrl) {
  if (!mealId || !imageDataUrl) return;
  const images = loadMealImages();
  images[String(mealId)] = imageDataUrl;
  localStorage.setItem(MEAL_IMAGES_KEY, JSON.stringify(images));
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function apiJson(url, options = {}) {
  const response = await fetch(apiUrl(url), options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "Request failed.");
  }
  return payload;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function kcalFromExercise(minutes, type, intensity) {
  const weight = Number(state.profile.weight) || 65;
  const met = metValues[type]?.[intensity] || 4;
  return Math.round((met * 3.5 * weight * Number(minutes)) / 200);
}

function walkingCalories() {
  const weight = Number(state.profile.weight) || 65;
  return Math.round((Number(state.health.steps) || 0) * weight * 0.00048);
}

function totalMacros() {
  return state.meals.reduce((totals, meal) => {
    Object.keys(totals).forEach((key) => {
      totals[key] += meal.macros[key] || 0;
    });
    return totals;
  }, { energy: 0, protein: 0, carbohydrates: 0, fibre: 0 });
}

function totalCalories() {
  return state.meals.reduce((sum, meal) => sum + meal.calories, 0);
}

function totalBurn() {
  return walkingCalories() + state.exercises.reduce((sum, item) => sum + item.calories, 0);
}

function defaultMealThumbnail(mealName = "Meal") {
  const label = encodeURIComponent((mealName || "Meal").slice(0, 2).toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='14' fill='%23dde7c7'/%3E%3Ccircle cx='48' cy='48' r='31' fill='%23fffef3'/%3E%3Cpath d='M29 54c10 8 28 8 38 0' fill='none' stroke='%2377bfa3' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M34 39h28' stroke='%232f6f58' stroke-width='5' stroke-linecap='round'/%3E%3Ctext x='48' y='82' text-anchor='middle' font-family='Arial' font-size='13' font-weight='700' fill='%232f6f58'%3E${label}%3C/text%3E%3C/svg%3E`;
}

function titleCaseMealName(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function inferMealTitleFromTime(value) {
  const date = value ? new Date(value) : new Date();
  const hour = Number.isNaN(date.getTime()) ? new Date().getHours() : date.getHours();
  if (hour < 11) return "Breakfast";
  if (hour < 15) return "Lunch";
  if (hour < 20) return "Dinner";
  return "Snack";
}

function displayMealTitle(meal) {
  const name = titleCaseMealName(meal?.meal_name || meal?.name);
  if (name && name.toLowerCase() !== "meal") return name;
  return inferMealTitleFromTime(meal?.created_at || meal?.updated_at);
}

function currentMealInputName() {
  const input = $("#mealName");
  return titleCaseMealName(input?.value) || titleCaseMealName(input?.placeholder) || inferMealTitleFromTime();
}

function mealDescription(meal) {
  const names = (meal.foods || []).map((food) => food[0]).filter(Boolean);
  if (!names.length) return `${meal.calories || 0} kcal logged`;
  return names.slice(0, 3).join(", ");
}

function renderDashboardMeals() {
  const container = $("#dashboardMealsList");
  if (!container) return;
  const images = loadMealImages();
  const meals = state.meals.slice(0, 3);

  if (!meals.length) {
    container.innerHTML = `
      <div class="dashboard-empty-meal">
        <strong>No meals logged yet</strong>
        <span>Use Meal photo analysis to add today's first meal.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = meals.map((meal) => {
    const title = displayMealTitle(meal);
    const thumbnail = images[String(meal.id)] || defaultMealThumbnail(title);
    return `
      <a class="dashboard-meal-row" href="#meals">
        <img src="${thumbnail}" alt="" />
        <span>
          <strong>${title}</strong>
          <small>${mealDescription(meal)}</small>
        </span>
        <i aria-hidden="true">›</i>
      </a>
    `;
  }).join("");
}

function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDashboardDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function animateWaterPour(selector = "#waterBottle") {
  const bottle = $(selector);
  if (!bottle) return;
  bottle.classList.remove("pouring");
  void bottle.offsetWidth;
  bottle.classList.add("pouring");
  window.setTimeout(() => bottle.classList.remove("pouring"), 1500);
}

function logWater(amount, bottleSelector = "#waterBottle") {
  state.waterMl += Number(amount || 0);
  saveState();
  renderSummary();
  animateWaterPour(bottleSelector);
}

function resetWater() {
  state.waterMl = 0;
  saveState();
  renderSummary();
}

function updateModeButtons() {
  $$(".segmented").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
}

function applyVisualMode() {
  document.body.classList.toggle("children-mode", state.mode === "child");
  document.documentElement.style.setProperty("color-scheme", state.mode === "child" ? "light" : "normal");
  $$(".metric-label").forEach((label) => {
    label.textContent = state.mode === "child"
      ? label.dataset.childLabel || label.textContent
      : label.dataset.adultLabel || label.textContent;
  });
}

function latestMoodCheckIn() {
  try {
    const history = JSON.parse(localStorage.getItem(MOOD_KEY) || "[]");
    return Array.isArray(history) && history.length ? history[0] : null;
  } catch {
    return null;
  }
}

function moodCheckInNote(entry) {
  if (!entry?.date) return "How are you feeling?";
  const date = new Date(entry.date);
  if (Number.isNaN(date.getTime())) return "Mood saved";
  if (date.toDateString() === new Date().toDateString()) return "Checked in today";
  return `Checked in ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function dashboardMoodFace(entry) {
  const mood = moods[Number(entry?.value)] || moods[2];
  return `<span class="dashboard-mood-face">${moodFace(mood, true)}</span>`;
}

function renderSummary() {
  const guideline = standards[state.mode];
  const waterL = state.waterMl / 1000;
  const waterPct = clamp((waterL / guideline.waterL) * 100, 0, 100);
  const steps = Number(state.health.steps || 0);
  const stepPct = clamp((steps / guideline.steps) * 100, 0, 100);
  const firstName = (state.profile.fullName || "").trim().split(/\s+/)[0] || "there";
  $("#todayDate").textContent = formatDashboardDate();
  $("#dashboardGreeting").textContent = `${greetingForNow()}, ${firstName}!`;
  $("#waterSummary").textContent = `${waterL.toFixed(1)} L`;
  $("#waterTarget").textContent = `Target ${guideline.waterL.toFixed(1)} L`;
  const homeWaterFill = $("#waterFill");
  if (homeWaterFill) homeWaterFill.style.height = `${waterPct}%`;
  const mealWaterSummary = $("#mealWaterSummary");
  if (mealWaterSummary) mealWaterSummary.textContent = `${waterL.toFixed(1)} L`;
  const mealWaterTarget = $("#mealWaterTarget");
  if (mealWaterTarget) mealWaterTarget.textContent = `Target ${guideline.waterL.toFixed(1)} L`;
  const mealWaterFill = $("#mealWaterFill");
  if (mealWaterFill) mealWaterFill.style.height = `${waterPct}%`;
  $("#waterProgress").style.width = `${waterPct}%`;
  $("#stepProgress").style.width = `${stepPct}%`;

  const calories = totalCalories();
  const macros = totalMacros();
  $("#stepSummary").textContent = state.mode === "child" ? `${steps.toLocaleString()} paws` : steps.toLocaleString();
  const stepGoalLabel = $("#stepGoalLabel");
  if (stepGoalLabel) stepGoalLabel.textContent = state.mode === "child" ? "Daily play goal" : "Personal activity goal";
  $("#mealCountSummary").textContent = `${state.meals.length} ${state.meals.length === 1 ? "meal" : "meals"}`;
  const moodEntry = latestMoodCheckIn();
  $("#scoreSummary").classList.add("dashboard-mood-display");
  $("#scoreSummary").innerHTML = dashboardMoodFace(moodEntry);
  $("#scoreNote").textContent = moodEntry?.label ? `${moodEntry.label} · ${moodCheckInNote(moodEntry)}` : "Not logged yet";
  $("#foodBalanceText").textContent = macros.protein
    ? `${Math.round(macros.protein)}g protein, ${Math.round(macros.fibre)}g fibre`
    : "No meals yet";
  renderWeeklyActivityBars(steps, guideline.steps);
  renderDashboardMeals();
}

function renderWeeklyActivityBars(steps, target) {
  const bars = $$("#weeklyActivityBars span");
  const today = new Date().getDay();
  const levels = [0.48, 0.62, 0.54, 0.76, 0.64, 0.82, 0.58];
  bars.forEach((bar, index) => {
    const isToday = index === today;
    const value = isToday ? clamp((steps / target) * 100, 12, 100) : Math.round(levels[index] * 100);
    bar.style.setProperty("--level", `${value}%`);
    bar.classList.toggle("active", isToday);
  });
}

function renderProfile() {
  $("#fullName").value = state.profile.fullName || "";
  $("#height").value = state.profile.height;
  $("#weight").value = state.profile.weight;
  $("#age").value = state.profile.age;
  $("#sex").value = state.profile.sex;
  $("#steps").value = state.health.steps;
  $("#walkMinutes").value = state.health.walkMinutes;
  updateModeButtons();
}

function renderMeals() {
  renderMealHistory();
}

function renderExercises() {
  const container = $("#exerciseList");
  if (!state.exercises.length) {
    container.innerHTML = '<div class="record"><div><strong>No extra exercise logged</strong><small>Gym, run, swim, yoga, and more can be added.</small></div></div>';
    return;
  }

  container.innerHTML = state.exercises.map((item, index) => `
    <div class="record">
      <div>
        <strong>${labelExercise(item.type)} · ${item.minutes} min</strong>
        <small>${item.intensity} intensity · ${item.calories} kcal burned</small>
      </div>
      <button class="secondary" data-remove-exercise="${index}">Remove</button>
    </div>
  `).join("");
}

function setAiStatus(title, message, tone = "idle") {
  const status = $("#aiStatus");
  status.dataset.tone = tone;
  status.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
}

function renderAnalysisResult(meal) {
  const result = $("#analysisResult");
  result.hidden = false;
  const totals = meal.foodItems.reduce((sum, food) => {
    sum.calories += Number(food.calories) || 0;
    sum.protein += Number(food.protein_g) || 0;
    sum.carbohydrates += Number(food.carbohydrates_g) || 0;
    sum.fat += Number(food.fat_g) || 0;
    return sum;
  }, { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
  const chart = macroChartStops(totals);
  result.innerHTML = `
    <div class="detected-header">
      <div>
        <strong>${meal.name}</strong>
        <span>${meal.confidence}% confidence · estimated from photo</span>
      </div>
    </div>
    <div class="nutrition-overview" aria-label="Estimated nutrition">
      <div class="calorie-ring" style="${chart.style}"><strong>${formatNumber(totals.calories)}</strong><span>kcal</span></div>
      <div><i class="macro-dot protein"></i><span>Protein</span><strong>${formatNumber(totals.protein, "g")}</strong></div>
      <div><i class="macro-dot carbs"></i><span>Carbs</span><strong>${formatNumber(totals.carbohydrates, "g")}</strong></div>
      <div><i class="macro-dot fats"></i><span>Fats</span><strong>${formatNumber(totals.fat, "g")}</strong></div>
    </div>
    <div class="ingredients-heading">
      <strong>Ingredients identified</strong>
      <span>Calories and food type are rough AI estimates.</span>
    </div>
    <div class="detected-ingredients">
      ${meal.foodItems.map((food) => renderDetectedIngredientSummary(food)).join("")}
    </div>
    <small>${meal.notes || "AI estimate based on visible foods."}</small>
  `;
}

function macroChartStops(totals) {
  const proteinKcal = Math.max(0, Number(totals.protein) || 0) * 4;
  const carbKcal = Math.max(0, Number(totals.carbohydrates) || 0) * 4;
  const fatKcal = Math.max(0, Number(totals.fat) || 0) * 9;
  const total = proteinKcal + carbKcal + fatKcal || 1;
  const proteinEnd = Math.round((proteinKcal / total) * 100);
  const carbEnd = proteinEnd + Math.round((carbKcal / total) * 100);
  return {
    style: `--protein-end:${proteinEnd}%; --carb-end:${carbEnd}%;`
  };
}

function classifyFood(food) {
  const name = (food.food_name || "").toLowerCase();
  const protein = Number(food.protein_g) || 0;
  const carbs = Number(food.carbohydrates_g) || 0;
  const fat = Number(food.fat_g) || 0;
  if (/rice|noodle|bread|toast|pasta|potato|oat|grain|corn|bun|flour/.test(name)) return "Carbs";
  if (/chicken|beef|pork|fish|egg|tofu|shrimp|meat|turkey|salmon|tuna/.test(name)) return "Protein";
  if (/broccoli|greens|lettuce|spinach|onion|vegetable|mushroom|carrot|fruit|berry|apple|banana/.test(name)) return "Dietary fibre";
  if (/milk|yogurt|yoghurt|cheese|cream|butter|dairy|custard|whey|mozzarella|parmesan|ricotta/.test(name)) return "Dairy products";
  if (/oil|avocado|nut|almond|walnut|peanut|cashew|fat/.test(name)) return "Healthy fats";
  if (protein >= carbs && protein >= fat) return "Protein";
  if (carbs >= protein && carbs >= fat) return "Carbs";
  if (fat >= protein && fat >= carbs) return "Fats";
  return "Mixed";
}

function renderDetectedIngredientSummary(food) {
  return `
    <div class="detected-ingredient">
      <strong>${food.food_name || "Food"}</strong>
      <span>${formatNumber(food.calories)} kcal</span>
      <em>${classifyFood(food)}</em>
    </div>
  `;
}

function collectDetectedIngredients() {
  if (currentAnalyzedMeal && !$$(".detected-ingredient input").length) {
    return currentAnalyzedMeal.foodItems;
  }
  return $$(".detected-ingredient").map((row) => ({
    food_name: row.querySelector('[name="food_name"]').value.trim() || "Food",
    quantity: row.querySelector('[name="quantity"]').value === "" ? null : Number(row.querySelector('[name="quantity"]').value),
    unit: row.querySelector('[name="unit"]').value.trim() || null,
    calories: Number(row.querySelector('[name="calories"]').value) || 0,
    protein_g: Number(row.querySelector('[name="protein_g"]').value) || 0,
    carbohydrates_g: Number(row.querySelector('[name="carbohydrates_g"]').value) || 0,
    fat_g: Number(row.querySelector('[name="fat_g"]').value) || 0,
    confidence: row.querySelector('[name="confidence"]').value || "medium",
    uncertainty_notes: row.querySelector('[name="uncertainty_notes"]').value || ""
  }));
}

function clearAnalysisResult() {
  currentAnalyzedMeal = null;
  $("#analysisResult").hidden = true;
  $("#analysisResult").innerHTML = "";
  $("#addMealButton").disabled = true;
}

function validateMealFile(file) {
  if (!file) return "Choose an image before detecting food.";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Please choose a JPEG, PNG, or WebP image.";
  if (file.size === 0) return "The selected image is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "The image is too large. Please choose one under 8 MB.";
  return "";
}

function setDetectButtonState() {
  $("#detectFoodButton").disabled = !selectedMealFile || isDetectingFood || Boolean(validateMealFile(selectedMealFile));
}

function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "unknown";
  return `${Math.round(Number(value))}${suffix}`;
}

function confidenceToPercent(confidence) {
  return { low: 45, medium: 70, high: 90 }[confidence] || 60;
}

function detectionToMeal(payload) {
  const summary = payload.meal_summary || {};
  const foods = payload.foods || [];
  const averageConfidence = foods.length
    ? Math.round(foods.reduce((sum, food) => sum + confidenceToPercent(food.confidence), 0) / foods.length)
    : 0;
  const foodNames = foods.map((food) => food.food_name).filter(Boolean);

  return {
    name: foodNames.length ? foodNames.join(", ") : "AI detected meal",
    calories: Math.round(Number(summary.estimated_total_calories) || 0),
    confidence: averageConfidence,
    macros: {
      energy: Math.round(Number(summary.estimated_total_fat_g) || 0),
      protein: Math.round(Number(summary.estimated_total_protein_g) || 0),
      carbohydrates: Math.round(Number(summary.estimated_total_carbohydrates_g) || 0),
      fibre: 0
    },
    foods: foods.map((food) => [
      food.food_name || "Food",
      `${food.likely_quantity ?? "unknown"} ${food.likely_unit || ""}`.trim()
    ]),
    foodItems: foods.map((food) => ({
      food_name: food.food_name || "Food",
      quantity: food.likely_quantity ?? null,
      unit: food.likely_unit || null,
      calories: Number(food.estimated_calories) || 0,
      protein_g: Number(food.estimated_protein_g) || 0,
      carbohydrates_g: Number(food.estimated_carbohydrates_g) || 0,
      fat_g: Number(food.estimated_fat_g) || 0,
      confidence: food.confidence || "medium",
      uncertainty_notes: food.uncertainty_notes || ""
    })),
    notes: payload.disclaimer || "Food identification and nutrition values are approximate estimates.",
    resultHtml: renderDetectionTable(payload)
  };
}

function renderDetectionTable(payload) {
  const rows = (payload.foods || []).map((food) => `
    <tr>
      <td>${food.food_name || "unknown"}</td>
      <td>${food.likely_quantity ?? "unknown"} ${food.likely_unit || ""}</td>
      <td>${formatNumber(food.estimated_calories)}</td>
      <td>${formatNumber(food.estimated_protein_g, "g")}</td>
      <td>${formatNumber(food.estimated_carbohydrates_g, "g")}</td>
      <td>${formatNumber(food.estimated_fat_g, "g")}</td>
      <td>${food.confidence || "unknown"}</td>
    </tr>
    <tr class="notes-row">
      <td colspan="7">${food.uncertainty_notes || "No uncertainty notes provided."}</td>
    </tr>
  `).join("");
  const summary = payload.meal_summary || {};

  return `
    <div class="result-table-wrap">
      <table class="result-table">
        <thead>
          <tr>
            <th>Food</th>
            <th>Estimated portion</th>
            <th>Calories</th>
            <th>Protein</th>
            <th>Carbs</th>
            <th>Fat</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="meal-total">
      <span>Total ${formatNumber(summary.estimated_total_calories)} kcal</span>
      <span>${formatNumber(summary.estimated_total_protein_g, "g")} protein</span>
      <span>${formatNumber(summary.estimated_total_carbohydrates_g, "g")} carbs</span>
      <span>${formatNumber(summary.estimated_total_fat_g, "g")} fat</span>
    </div>
  `;
}

function savedMealToSummary(meal) {
  const totals = meal.foods.reduce((sum, food) => {
    sum.calories += Number(food.calories) || 0;
    sum.protein += Number(food.protein_g) || 0;
    sum.carbohydrates += Number(food.carbohydrates_g) || 0;
    sum.fat += Number(food.fat_g) || 0;
    return sum;
  }, { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
  const averageConfidence = meal.foods.length
    ? Math.round(meal.foods.reduce((sum, food) => sum + confidenceToPercent(food.confidence), 0) / meal.foods.length)
    : 0;
  return {
    id: meal.id,
    name: displayMealTitle(meal),
    meal_name: meal.meal_name,
    created_at: meal.created_at,
    updated_at: meal.updated_at,
    calories: Math.round(totals.calories),
    confidence: averageConfidence,
    macros: {
      energy: Math.round(totals.fat),
      protein: Math.round(totals.protein),
      carbohydrates: Math.round(totals.carbohydrates),
      fibre: 0
    },
    foods: meal.foods.map((food) => [
      food.food_name,
      `${food.quantity ?? "unknown"} ${food.unit || ""}`.trim()
    ])
  };
}

function mergeHistoryDays(newDays, prepend = false) {
  const known = new Set(historyDays.map((day) => day.date));
  const filtered = newDays.filter((day) => !known.has(day.date));
  historyDays = prepend ? [...filtered, ...historyDays] : [...historyDays, ...filtered];
  historyDays.sort((a, b) => a.date.localeCompare(b.date));
}

function renderMealHistory() {
  const container = $("#mealHistory");
  const status = $("#historyStatus");
  if (!container || !status) return;

  if (!historyDays.length) {
    container.innerHTML = "";
    status.textContent = isLoadingHistory ? "Loading meal history..." : "No saved meals yet. Detect food, choose a date, then save the meal.";
    $("#loadOlderDays").disabled = isLoadingHistory || !historyHasMore;
    return;
  }

  status.textContent = isLoadingHistory ? "Loading older days..." : "";
  container.innerHTML = historyDays.map((day) => `
    <section class="history-day" data-date="${day.date}">
      <div class="history-day-header">
        <div>
          <p class="eyebrow">${day.totals.meal_count} saved meal${day.totals.meal_count === 1 ? "" : "s"}</p>
          <h3>${day.date}</h3>
        </div>
        <div class="daily-total">
          <span>${formatNumber(day.totals.calories)} kcal</span>
          <span>${formatNumber(day.totals.protein_g, "g")} protein</span>
          <span>${formatNumber(day.totals.carbohydrates_g, "g")} carbs</span>
          <span>${formatNumber(day.totals.fat_g, "g")} fat</span>
        </div>
      </div>
      <div class="history-meals">
        ${day.meals.map(renderSavedMealCard).join("")}
      </div>
    </section>
  `).join("");
  $("#loadOlderDays").disabled = isLoadingHistory || !historyHasMore;
  $("#loadOlderDays").textContent = historyHasMore ? "Load older days" : "No older days";
}

function renderSavedMealCard(meal) {
  const title = displayMealTitle(meal);
  const thumbnail = cartoonMealThumbnail(meal);
  const description = savedMealDescription(meal);
  return `
    <details class="saved-meal" data-meal-id="${meal.id}">
      <summary class="saved-meal-summary">
        <img src="${thumbnail}" alt="" />
        <span>
          <strong>${title}</strong>
          <small>${description}</small>
        </span>
        <i aria-hidden="true">›</i>
      </summary>
      <div class="saved-meal-details">
        <div class="saved-meal-actions">
          <button class="secondary" data-edit-meal="${meal.id}" type="button">Edit</button>
          <button class="secondary" data-delete-meal="${meal.id}" type="button">Delete</button>
        </div>
        <div class="saved-foods">
        ${meal.foods.map((food) => `
          <div class="saved-food">
            <span>${food.food_name}</span>
            <small>${formatNumber(food.calories)} kcal · ${classifyFood(food)}</small>
          </div>
        `).join("")}
        </div>
      </div>
    </details>
  `;
}

function savedMealDescription(meal) {
  const names = meal.foods.map((food) => food.food_name).filter(Boolean);
  if (!names.length) return `${meal.foods.length} food item${meal.foods.length === 1 ? "" : "s"}`;
  return names.slice(0, 3).join(", ");
}

function cartoonMealThumbnail(meal) {
  const names = meal.foods.map((food) => food.food_name.toLowerCase()).join(" ");
  const noodle = /noodle|ramen|soup|broth/.test(names);
  const greens = /salad|greens|lettuce|broccoli|cabbage|vegetable/.test(names);
  const protein = /egg|beef|chicken|fish|pork|tofu|meat/.test(names);
  const accent = noodle ? "%23d39a55" : greens ? "%2377bfa3" : protein ? "%23cf7f93" : "%2398c9a3";
  const topping = protein ? "%23fff2a8" : "%23edeec9";
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='18' fill='%23dde7c7'/%3E%3Ccircle cx='48' cy='48' r='34' fill='%23fffef3'/%3E%3Cellipse cx='48' cy='54' rx='29' ry='18' fill='${accent}' opacity='.82'/%3E%3Cpath d='M25 51c10 7 36 7 46 0' fill='none' stroke='%232f6f58' stroke-width='4' stroke-linecap='round' opacity='.55'/%3E%3Ccircle cx='37' cy='42' r='8' fill='${topping}'/%3E%3Ccircle cx='58' cy='43' r='7' fill='%23bfd8bd'/%3E%3Cpath d='M29 63h38' stroke='%232f6f58' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E`;
}

async function loadHistory({ reset = false } = {}) {
  if (isLoadingHistory) return;
  isLoadingHistory = true;
  renderMealHistory();
  try {
    const url = reset || !historyNextBefore
      ? "/api/history?limit=10"
      : `/api/history?before=${encodeURIComponent(historyNextBefore)}&limit=10`;
    const payload = await apiJson(url);
    const daysAscending = [...payload.days].reverse();
    if (reset) historyDays = [];
    mergeHistoryDays(daysAscending, !reset);
    historyHasMore = payload.has_more;
    historyNextBefore = payload.next_before;
    refreshTodayFromHistory();
  } catch (error) {
    $("#historyStatus").textContent = error.message || "Could not load meal history.";
  } finally {
    isLoadingHistory = false;
    renderMealHistory();
  }
}

async function refreshTodayFromHistory() {
  const today = localDateString();
  const day = historyDays.find((item) => item.date === today);
  if (day) {
    state.meals = day.meals.map(savedMealToSummary);
  } else {
    state.meals = [];
  }
  renderSummary();
}

function mealToEditForm(meal, dayDate) {
  return `
    <form class="edit-meal-form" data-edit-form="${meal.id}">
      <div class="form-grid">
        <label>Date
          <input name="date" type="date" value="${dayDate}" required />
        </label>
        <label>Meal name
          <input name="meal_name" type="text" value="${displayMealTitle(meal)}" required />
        </label>
      </div>
      <div class="edit-food-list">
        ${meal.foods.map(renderFoodEditRow).join("")}
      </div>
      <button class="secondary" type="button" data-add-food-row="${meal.id}">Add food item</button>
      <div class="edit-actions">
        <button class="primary" type="submit">Save changes</button>
        <button class="secondary" type="button" data-cancel-edit="${meal.id}">Cancel</button>
      </div>
    </form>
  `;
}

function renderFoodEditRow(food = {}) {
  return `
    <div class="edit-food-row">
      <input name="food_name" placeholder="Food" value="${food.food_name || ""}" required />
      <input name="quantity" type="number" min="0" step="0.1" placeholder="Qty" value="${food.quantity ?? ""}" />
      <input name="unit" placeholder="Unit" value="${food.unit || ""}" />
      <input name="calories" type="number" min="0" step="1" placeholder="kcal" value="${food.calories ?? 0}" required />
      <input name="protein_g" type="number" min="0" step="0.1" placeholder="Protein" value="${food.protein_g ?? 0}" required />
      <input name="carbohydrates_g" type="number" min="0" step="0.1" placeholder="Carbs" value="${food.carbohydrates_g ?? 0}" required />
      <input name="fat_g" type="number" min="0" step="0.1" placeholder="Fat" value="${food.fat_g ?? 0}" required />
      <select name="confidence">
        ${["low", "medium", "high"].map((value) => `<option value="${value}" ${food.confidence === value ? "selected" : ""}>${value}</option>`).join("")}
      </select>
      <input name="uncertainty_notes" placeholder="Notes" value="${food.uncertainty_notes || ""}" />
      <button class="secondary" type="button" data-remove-food-row>Remove</button>
    </div>
  `;
}

function findMealInHistory(mealId) {
  for (const day of historyDays) {
    const meal = day.meals.find((item) => item.id === mealId);
    if (meal) return { day, meal };
  }
  return null;
}

function startEditMeal(mealId) {
  const found = findMealInHistory(mealId);
  if (!found) return;
  const card = document.querySelector(`[data-meal-id="${mealId}"]`);
  card.innerHTML = mealToEditForm(found.meal, found.day.date);
}

function collectMealForm(form) {
  const rows = Array.from(form.querySelectorAll(".edit-food-row"));
  return {
    date: form.elements.date.value,
    meal_name: titleCaseMealName(form.elements.meal_name.value) || inferMealTitleFromTime(),
    foods: rows.map((row) => ({
      food_name: row.querySelector('[name="food_name"]').value.trim(),
      quantity: row.querySelector('[name="quantity"]').value === "" ? null : Number(row.querySelector('[name="quantity"]').value),
      unit: row.querySelector('[name="unit"]').value.trim() || null,
      calories: Number(row.querySelector('[name="calories"]').value),
      protein_g: Number(row.querySelector('[name="protein_g"]').value),
      carbohydrates_g: Number(row.querySelector('[name="carbohydrates_g"]').value),
      fat_g: Number(row.querySelector('[name="fat_g"]').value),
      confidence: row.querySelector('[name="confidence"]').value,
      uncertainty_notes: row.querySelector('[name="uncertainty_notes"]').value.trim()
    }))
  };
}

async function saveEditedMeal(mealId, form) {
  const payload = collectMealForm(form);
  await apiJson(`/api/meals/${mealId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  await loadHistory({ reset: true });
}

async function deleteSavedMeal(mealId) {
  if (!confirm("Delete this saved meal?")) return;
  await apiJson(`/api/meals/${mealId}`, { method: "DELETE" });
  await loadHistory({ reset: true });
}

function renderUploadPreview(file) {
  const preview = $("#mealPreview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  $("#uploadHint").style.display = "none";
  $(".upload-zone").classList.add("has-preview");
}

function createMealThumbnail(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 112;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = size;
        canvas.height = size;
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (size - width) / 2;
        const y = (size - height) / 2;
        context.drawImage(image, x, y, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = () => resolve("");
      image.src = reader.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function selectMealFile(file) {
  clearAnalysisResult();
  selectedMealFile = file || null;
  const error = validateMealFile(selectedMealFile);

  if (error) {
    setAiStatus("Image not ready", error, "error");
    setDetectButtonState();
    return;
  }

  renderUploadPreview(selectedMealFile);
  setAiStatus("Photo ready", "Tap Detect Food to analyze the visible foods.", "success");
  setDetectButtonState();
}

async function detectFood() {
  const validationError = validateMealFile(selectedMealFile);
  if (validationError) {
    setAiStatus("Image not ready", validationError, "error");
    setDetectButtonState();
    return;
  }

  clearAnalysisResult();
  isDetectingFood = true;
  setDetectButtonState();
  setAiStatus("Detecting food", "AI is analyzing the photo. This can take a few seconds.", "loading");

  try {
    const formData = new FormData();
    formData.append("image", selectedMealFile);
    const response = await fetch(apiUrl("/api/detect-food"), {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Food detection failed.");

    currentAnalyzedMeal = detectionToMeal(payload);
    renderAnalysisResult(currentAnalyzedMeal);
    $("#addMealButton").disabled = false;
    setAiStatus("Foods detected", "Review the table, then add this meal to today.", "success");
  } catch (error) {
    setAiStatus("Detection failed", error.message || "Check the server and try again.", "error");
  } finally {
    isDetectingFood = false;
    setDetectButtonState();
  }
}

function labelExercise(type) {
  return {
    gym: "Gym strength",
    run: "Running",
    cycle: "Cycling",
    swim: "Swimming",
    yoga: "Yoga"
  }[type] || type;
}

function scoreLabel(score) {
  if (score >= 85) return "Strong week";
  if (score >= 70) return "Good foundation";
  if (score >= 55) return "Needs tuning";
  return "Needs attention";
}

function calculateScore() {
  const guideline = standards[state.mode];
  const waterScore = clamp((state.waterMl / 1000 / guideline.waterL) * 22, 0, 22);
  const stepScore = clamp((state.health.steps / guideline.steps) * 18, 0, 18);
  const activeMinutes = Number(state.health.walkMinutes || 0) + state.exercises.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const weeklyActiveEquivalent = activeMinutes * 7;
  const activityScore = clamp((weeklyActiveEquivalent / guideline.activeMinutes) * 20, 0, 20);
  const calorieGap = Math.abs(totalCalories() - guideline.calories);
  const calorieScore = clamp(20 - (calorieGap / guideline.calories) * 20, 0, 20);
  const balanceScore = macroBalanceScore() * 20;
  return Math.round(waterScore + stepScore + activityScore + calorieScore + balanceScore);
}

function macroBalanceScore() {
  const totals = totalMacros();
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (!sum) return 0.3;
  const target = standards[state.mode].macro;
  const deviation = Object.keys(target).reduce((acc, key) => {
    return acc + Math.abs((totals[key] || 0) / sum - target[key]);
  }, 0);
  return clamp(1 - deviation, 0, 1);
}

function drawPie() {
  const canvas = $("#macroChart");
  const ctx = canvas.getContext("2d");
  const totals = totalMacros();
  const values = Object.entries(totals);
  const sum = values.reduce((acc, [, value]) => acc + value, 0) || 1;
  const center = canvas.width / 2;
  const radius = 108;
  let start = -Math.PI / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  values.forEach(([key, value]) => {
    const slice = (value / sum) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = macroColors[key];
    ctx.fill();
    start += slice;
  });

  ctx.beginPath();
  ctx.arc(center, center, 58, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "#18211f";
  ctx.font = "700 24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(macroBalanceScore() * 100)}%`, center, center - 2);
  ctx.font = "500 12px system-ui";
  ctx.fillStyle = "#65716e";
  ctx.fillText("balance", center, center + 18);

  $("#chartLegend").innerHTML = values.map(([key, value]) => {
    const percent = Math.round((value / sum) * 100);
    return `<span><i style="background:${macroColors[key]}"></i>${key} ${percent}%</span>`;
  }).join("");
}

function generateAdvice(score) {
  const guideline = standards[state.mode];
  const advice = [];
  if (state.waterMl / 1000 < guideline.waterL) {
    advice.push(`Raise hydration toward ${guideline.waterL.toFixed(1)} L per day.`);
  }
  if (state.health.steps < guideline.steps) {
    advice.push(`Add short walks until you approach ${guideline.steps.toLocaleString()} daily steps.`);
  }
  if (totalMacros().fibre < 25 && state.mode === "adult") {
    advice.push("Add beans, whole grains, vegetables, or fruit to improve fibre.");
  }
  if (macroBalanceScore() < 0.7) {
    advice.push("Aim for a more even plate: protein, fibre-rich plants, and steady carbohydrates.");
  }
  if (totalCalories() > guideline.calories * 1.15) {
    advice.push("Reduce energy-dense extras or split larger portions across the day.");
  }
  if (score >= 85) {
    advice.push("Keep the pattern steady and add variety across protein, fruit, vegetables, and grains.");
  }
  return advice.slice(0, 4);
}

function renderReport() {
  const score = calculateScore();
  state.lastScore = score;
  saveState();
  const calories = totalCalories();
  const burn = totalBurn();
  const net = calories - burn;
  const guideline = standards[state.mode];
  const activeMinutes = Number(state.health.walkMinutes || 0) + state.exercises.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const weeklyIntake = calories * 7;
  const weeklyBurn = burn * 7;
  const advice = generateAdvice(score);

  drawPie();
  $("#reportOutput").innerHTML = `
    <h3>${score}/100 · ${scoreLabel(score)}</h3>
    <p>Estimated intake is <strong>${calories} kcal/day</strong> and <strong>${weeklyIntake.toLocaleString()} kcal/week</strong>. Estimated exercise expenditure is <strong>${burn} kcal/day</strong> and <strong>${weeklyBurn.toLocaleString()} kcal/week</strong>, giving a daily net of <strong>${net} kcal</strong>.</p>
    <p>${state.mode === "child" ? "Children mode uses higher movement expectations and lower calorie assumptions." : "Adult mode uses weekly aerobic activity and balanced intake expectations."} Current activity is estimated at <strong>${activeMinutes} minutes/day</strong>.</p>
    <ul>
      ${advice.map((item) => `<li>${item}</li>`).join("")}
      <li>Compare your pattern with the target of about ${guideline.activeMinutes} active minutes per week.</li>
    </ul>
  `;
  renderSummary();
}

async function downloadReportPdf() {
  const reportDate = localDateString();
  const macros = totalMacros();
  const payload = {
    date: reportDate,
    mode: state.mode,
    profile: state.profile,
    waterMl: state.waterMl,
    health: state.health,
    exercises: state.exercises,
    food: {
      calories: totalCalories(),
      energy: macros.energy,
      protein: macros.protein,
      carbohydrates: macros.carbohydrates,
      fibre: macros.fibre
    }
  };
  $("#downloadReportPdf").disabled = true;
  $("#downloadReportPdf").textContent = "Preparing PDF";
  try {
    const response = await fetch(apiUrl("/api/report/pdf"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Could not generate PDF.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `miao-health-report-${reportDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    const message = error.message === "Failed to fetch"
      ? "Could not reach the local app server. Open http://127.0.0.1:8765 or start the FastAPI server, then try Download PDF again."
      : error.message || "Could not generate the PDF report.";
    $("#reportOutput").innerHTML = `<h3>PDF failed</h3><p>${message}</p>`;
  } finally {
    $("#downloadReportPdf").disabled = false;
    $("#downloadReportPdf").textContent = "Download PDF";
  }
}

function renderAll() {
  applyVisualMode();
  renderProfile();
  if ($("#mealDate") && !$("#mealDate").value) $("#mealDate").value = localDateString();
  renderSummary();
  renderMeals();
  renderExercises();
  drawPie();
}

function setupPhoneInstall() {
  const installBanner = $("#installBanner");
  const installButton = $("#installApp");

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBanner.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBanner.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBanner.hidden = true;
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function setupPhoneNavigation() {
  const links = $$("nav a");
  const pages = $$(".app-page");
  const defaultPage = "dashboard";

  function showPage(pageId) {
    const targetPage = pages.find((page) => page.id === pageId) ? pageId : defaultPage;
    pages.forEach((page) => {
      page.classList.toggle("active", page.id === targetPage);
    });
    links.forEach((link) => {
      link.classList.toggle("active", link.dataset.tab === targetPage);
      if (link.dataset.tab === targetPage) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const pageId = link.dataset.tab || defaultPage;
      if (location.hash !== `#${pageId}`) {
        history.pushState(null, "", `#${pageId}`);
      }
      showPage(pageId);
    });
  });

  window.addEventListener("hashchange", () => {
    showPage(location.hash.replace("#", "") || defaultPage);
  });
  window.addEventListener("popstate", () => {
    showPage(location.hash.replace("#", "") || defaultPage);
  });

  showPage(location.hash.replace("#", "") || defaultPage);
}

$$(".segmented").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    saveState();
    renderAll();
  });
});

const addWaterButton = $("#addWater");
if (addWaterButton) {
  addWaterButton.addEventListener("click", () => {
    logWater($("#waterAmount").value, "#waterBottle");
  });
}

const resetWaterButton = $("#resetWater");
if (resetWaterButton) {
  resetWaterButton.addEventListener("click", () => {
    resetWater();
  });
}

const mealAddWaterButton = $("#mealAddWater");
if (mealAddWaterButton) {
  mealAddWaterButton.addEventListener("click", () => {
    logWater($("#mealWaterAmount").value, "#mealWaterBottle");
  });
}

const mealResetWaterButton = $("#mealResetWater");
if (mealResetWaterButton) {
  mealResetWaterButton.addEventListener("click", () => {
    resetWater();
  });
}

$("#profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.profile = {
    fullName: $("#fullName").value.trim(),
    height: Number($("#height").value),
    weight: Number($("#weight").value),
    age: Number($("#age").value),
    sex: $("#sex").value
  };
  saveState();
  renderSummary();
});

$("#healthForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.health = {
    steps: Number($("#steps").value),
    walkMinutes: Number($("#walkMinutes").value)
  };
  saveState();
  renderSummary();
});

$("#mockSync").addEventListener("click", () => {
  state.health = {
    steps: 9340 + Math.round(Math.random() * 1400),
    walkMinutes: 68 + Math.round(Math.random() * 18)
  };
  saveState();
  renderAll();
});

$("#mealPhoto").addEventListener("change", (event) => {
  selectMealFile(event.target.files[0]);
});

$(".upload-zone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $(".upload-zone").classList.add("dragging");
});

$(".upload-zone").addEventListener("dragleave", () => {
  $(".upload-zone").classList.remove("dragging");
});

$(".upload-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  $(".upload-zone").classList.remove("dragging");
  selectMealFile(event.dataTransfer.files[0]);
});

$("#detectFoodButton").addEventListener("click", detectFood);

$("#mealForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentAnalyzedMeal) {
    setAiStatus("No AI result yet", "Upload a meal photo and wait for the AI result before adding it.", "error");
    return;
  }
  if (isSavingMeal) return;
  isSavingMeal = true;
  $("#addMealButton").disabled = true;
  setAiStatus("Saving meal", "Saving this reviewed meal to your daily history.", "loading");

  const payload = {
    date: $("#mealDate").value || localDateString(),
    meal_name: currentMealInputName(),
    foods: collectDetectedIngredients()
  };

  const photoForThumbnail = selectedMealFile;

  apiJson("/api/meals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(async (savedMeal) => {
      const thumbnail = await createMealThumbnail(photoForThumbnail);
      saveMealImage(savedMeal.id, thumbnail);
      clearAnalysisResult();
      $("#mealName").value = "";
      setAiStatus("Meal saved", "This meal is now saved in your daily history.", "success");
      await loadHistory({ reset: true });
    })
    .catch((error) => {
      $("#addMealButton").disabled = false;
      setAiStatus("Save failed", error.message || "Could not save this meal. Your detected result is still here.", "error");
    })
    .finally(() => {
      isSavingMeal = false;
    });
});

$("#clearMeals").addEventListener("click", () => {
  clearAnalysisResult();
  setAiStatus("Review cleared", "Your detected preview was cleared. Saved meal history was not deleted.", "idle");
});

$("#exerciseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const type = $("#exerciseType").value;
  const intensity = $("#exerciseIntensity").value;
  const minutes = Number($("#exerciseMinutes").value);
  state.exercises.unshift({
    type,
    intensity,
    minutes,
    calories: kcalFromExercise(minutes, type, intensity),
    timestamp: new Date().toISOString()
  });
  saveState();
  renderAll();
});

document.addEventListener("click", (event) => {
  const exerciseIndex = event.target.dataset.removeExercise;
  if (exerciseIndex !== undefined) {
    state.exercises.splice(Number(exerciseIndex), 1);
    saveState();
    renderAll();
  }

  const editMealId = event.target.dataset.editMeal;
  if (editMealId !== undefined) startEditMeal(Number(editMealId));

  const cancelEditId = event.target.dataset.cancelEdit;
  if (cancelEditId !== undefined) renderMealHistory();

  const deleteMealId = event.target.dataset.deleteMeal;
  if (deleteMealId !== undefined) {
    deleteSavedMeal(Number(deleteMealId)).catch((error) => {
      $("#historyStatus").textContent = error.message || "Could not delete meal.";
    });
  }

  if (event.target.dataset.addFoodRow !== undefined) {
    const form = event.target.closest(".edit-meal-form");
    form.querySelector(".edit-food-list").insertAdjacentHTML("beforeend", renderFoodEditRow({
      food_name: "",
      quantity: null,
      unit: "",
      calories: 0,
      protein_g: 0,
      carbohydrates_g: 0,
      fat_g: 0,
      confidence: "medium",
      uncertainty_notes: ""
    }));
  }

  if (event.target.dataset.removeFoodRow !== undefined) {
    const rows = event.target.closest(".edit-food-list").querySelectorAll(".edit-food-row");
    if (rows.length > 1) {
      event.target.closest(".edit-food-row").remove();
    }
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest(".edit-meal-form");
  if (!form) return;
  event.preventDefault();
  saveEditedMeal(Number(form.dataset.editForm), form).catch((error) => {
    $("#historyStatus").textContent = error.message || "Could not update meal.";
  });
});

$("#loadOlderDays").addEventListener("click", () => {
  loadHistory({ reset: false });
});

$("#mealHistory").addEventListener("scroll", () => {
  const history = $("#mealHistory");
  if (history.scrollTop < 80 && historyHasMore && !isLoadingHistory) {
    const previousHeight = history.scrollHeight;
    loadHistory({ reset: false }).then(() => {
      history.scrollTop = history.scrollHeight - previousHeight + history.scrollTop;
    });
  }
});

$("#generateReport").addEventListener("click", renderReport);
$("#downloadReportPdf").addEventListener("click", downloadReportPdf);

function moodFace(mood, selected = false) {
  return `
    <span class="mood-face ${mood.eyes} ${mood.mouth}${selected ? " selected" : ""}" style="--mood-ink:${mood.ink}">
      <i class="mood-face__eye left"></i>
      <i class="mood-face__eye right"></i>
      <i class="mood-face__mouth"></i>
      ${mood.tears ? '<i class="mood-face__tear left"></i><i class="mood-face__tear right"></i>' : ""}
    </span>
  `;
}

function renderMoodSlider() {
  const mood = moods[moodValue];
  $("#moodThumb").style.left = `${((moodValue + 0.5) / moods.length) * 100}%`;
  $("#moodThumb").style.backgroundColor = mood.color;
  $("#moodThumb").innerHTML = moodFace(mood, true);
  $("#moodDot").style.backgroundColor = mood.color;
  $("#moodResult").textContent = mood.label.toLowerCase();
}

function setMoodFromPointer(clientX) {
  const slider = $("#moodSlider");
  const bounds = slider.getBoundingClientRect();
  const position = Math.max(0, Math.min(0.9999, (clientX - bounds.left) / bounds.width));
  moodValue = Math.floor(position * moods.length);
  renderMoodSlider();
}

function saveMoodCheckIn() {
  const history = JSON.parse(localStorage.getItem(MOOD_KEY) || "[]");
  history.unshift({
    date: new Date().toISOString(),
    value: moodValue,
    label: moods[moodValue].label
  });
  localStorage.setItem(MOOD_KEY, JSON.stringify(history.slice(0, 60)));
}

function closeMoodModal({ save = false } = {}) {
  if (save) {
    saveMoodCheckIn();
    renderSummary();
  }
  $("#moodModal").hidden = true;
}

function setupMoodModal() {
  const stops = $("#moodStops");
  stops.innerHTML = moods.map((mood, index) => `
    <button class="mood-slider__stop" type="button" data-mood="${index}" aria-label="Select ${mood.label}">
      ${moodFace(mood)}
    </button>
  `).join("");
  stops.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mood]");
    if (!button) return;
    moodValue = Number(button.dataset.mood);
    renderMoodSlider();
  });
  $("#moodSlider").addEventListener("pointerdown", (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoodFromPointer(event.clientX);
  });
  $("#moodSlider").addEventListener("pointermove", (event) => {
    if (event.buttons === 1) setMoodFromPointer(event.clientX);
  });
  $("#moodClose").addEventListener("click", () => closeMoodModal());
  $("#moodSave").addEventListener("click", () => closeMoodModal({ save: true }));
  renderMoodSlider();
  $("#moodModal").hidden = false;
}

setupPhoneInstall();
setupPhoneNavigation();
renderAll();
loadHistory({ reset: true });
setupMoodModal();
