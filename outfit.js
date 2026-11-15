// outfit.js: builds outfits, learns your taste, and keeps saved outfits.
// It uses simple rules (no AI): every item gets points for
//   1. matching the words you typed (its tags, color, and name),
//   2. having the right warmth for today's weather, and
//   3. what the app has learned from your Likes and Dislikes.
// Then it picks a high-scoring item for each slot, with a little randomness
// so pressing Generate again gives you a different mix.

// ===== Part 1: Word lists =====

// Small words to ignore in what you type ("a dark AND comfy look" -> dark, comfy)
const IGNORE_WORDS = new Set([
  "a", "an", "the", "and", "or", "with", "for", "of", "in", "to", "my", "some",
  "style", "vibe", "vibes", "look", "outfit", "fit", "kind", "like", "very", "really", "something",
]);

// Words that describe a group of colors.
// e.g. typing "dark" also matches items whose color is black, navy, charcoal...
const COLOR_GROUPS = {
  dark: ["black", "charcoal", "navy", "dark", "grey", "gray", "brown", "olive", "burgundy", "maroon"],
  light: ["white", "cream", "beige", "light", "tan", "khaki", "ivory", "pastel"],
  bright: ["red", "yellow", "orange", "pink", "green", "blue", "purple", "neon"],
  colorful: ["red", "yellow", "orange", "pink", "green", "blue", "purple", "neon"],
  neutral: ["black", "white", "grey", "gray", "beige", "cream", "tan", "navy", "khaki", "brown"],
  earthy: ["brown", "olive", "tan", "khaki", "beige", "green", "rust"],
  monochrome: ["black", "white", "grey", "gray", "charcoal"],
};

// Warmth levels as numbers, so we can measure how far off an item is
const WARMTH_LEVEL = { light: 0, medium: 1, warm: 2 };

// ===== Part 2: What the app has learned (your taste) =====
// Saved in the browser as three lists of points:
//   items: each piece of clothing on its own       e.g. { "7": 2 }
//   pairs: two pieces worn together                e.g. { "3-7": -2 }
//   words: a piece of clothing for a word you typed e.g. { "cozy": { "7": 1 } }

const PREFS_KEY = "wardrobe-prefs";

// How much one Like or Dislike changes things
const LIKE = { item: 1, pair: 1, word: 1 };
const DISLIKE = { item: -0.5, pair: -2, word: -1 }; // pairs drop most: it's usually the combo that's wrong

// Limits, so learning only nudges choices and never takes over
const MAX = { item: 3, pair: 4, word: 3, learned: 4 };

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (prefs && prefs.items && prefs.pairs && prefs.words) return prefs;
  } catch {
    // broken or missing: start fresh below
  }
  return { items: {}, pairs: {}, words: {} };
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// Keeps a number between -limit and +limit
function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

// Adds points to one entry, staying inside the limit. Removes it if it's back to 0.
function nudge(list, key, amount, limit) {
  const value = clamp((list[key] || 0) + amount, limit);
  if (value === 0) delete list[key];
  else list[key] = value;
}

// The same name for a pair, whichever order: items 7 and 3 -> "3-7"
function pairKey(a, b) {
  return a < b ? a + "-" + b : b + "-" + a;
}

// Learns from one outfit. liked = true for Like, false for Dislike.
function learnFrom(outfit, liked) {
  const prefs = loadPrefs();
  const change = liked ? LIKE : DISLIKE;
  const ids = outfit.picks.filter((p) => p.pick).map((p) => p.pick.item.id);
  const words = styleWords(outfit.styleText);

  for (const id of ids) {
    nudge(prefs.items, id, change.item, MAX.item);
    for (const word of words) {
      prefs.words[word] = prefs.words[word] || {};
      nudge(prefs.words[word], id, change.word, MAX.word);
      if (Object.keys(prefs.words[word]).length === 0) delete prefs.words[word];
    }
  }
  // Every pair of items in the outfit
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      nudge(prefs.pairs, pairKey(ids[i], ids[j]), change.pair, MAX.pair);
    }
  }
  savePrefs(prefs);
}

// Points one item has earned from the item list and the word list
function learnedPoints(prefs, id, words) {
  let wordPoints = 0;
  for (const word of words) {
    wordPoints += (prefs.words[word] && prefs.words[word][id]) || 0;
  }
  const total = clamp((prefs.items[id] || 0) + wordPoints, MAX.learned);
  return { total, wordPoints };
}

// Points from how well an item has gone with the items already picked
function pairPoints(prefs, id, chosenIds) {
  let points = 0;
  for (const other of chosenIds) {
    points += prefs.pairs[pairKey(id, other)] || 0;
  }
  return clamp(points, MAX.pair);
}

// ===== Part 3: Reading the weather =====

// Decides how warm the clothes should be, from the "feels like" temperature.
//   below 10°C (50°F)        -> warm
//   10°C to 20°C (50–68°F)   -> medium
//   above 20°C (68°F)        -> light
function targetWarmth(weather) {
  if (!weather) return null; // no weather yet: warmth won't count
  if (weather.feelsC < 10) return "warm";
  if (weather.feelsC <= 20) return "medium";
  return "light";
}

// Decides whether to add a jacket or coat: when it feels cold, or it's wet
function needsOuterwear(weather) {
  if (!weather) return false;
  const wet = /rain|drizzle|snow|thunder|showers/.test(weather.sky);
  return weather.feelsC < 15 || (wet && weather.feelsC < 22);
}

// ===== Part 4: Scoring one item =====

// Splits what you typed into useful words: "Dark, comfy streetwear!" -> ["dark", "comfy", "streetwear"]
function styleWords(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/) // split on anything that isn't a letter, number, or dash
    .filter((word) => word.length >= 2 && !IGNORE_WORDS.has(word));
}

// Two words "match" if they're equal, or one contains the other
// (so "street" matches "streetwear"). Very short words must match exactly.
function wordsMatch(a, b) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  return a.includes(b) || b.includes(a);
}

// Gives an item a score. Also notes WHY, so we can show it on screen.
function scoreItem(item, words, warmthGoal, prefs) {
  let score = 0;
  const matched = []; // words that matched, e.g. ["streetwear", "black"]
  const colorWords = (item.color || "").split(/\s+/).filter(Boolean); // "dark green" -> ["dark", "green"]
  const name = item.name.toLowerCase();

  for (const word of words) {
    // Tags are the strongest match: +3
    const tag = item.tags.find((t) => wordsMatch(t, word));
    if (tag) {
      score += 3;
      matched.push(tag);
      continue;
    }
    // Color match: +2 (direct, like "black", or a group, like "dark")
    const group = COLOR_GROUPS[word] || [];
    const color = colorWords.find((c) => c === word || group.includes(c));
    if (color) {
      score += 2;
      matched.push(color);
      continue;
    }
    // Word appears in the name, like "hoodie": +1
    if (name.includes(word)) {
      score += 1;
      matched.push(word);
    }
  }
  const styleScore = score;

  // Warmth: right warmth +3, one step off +1, two steps off -3
  let warmthFit = null; // "good", "ok", or "bad"
  if (warmthGoal) {
    const gap = Math.abs(WARMTH_LEVEL[item.warmth] - WARMTH_LEVEL[warmthGoal]);
    if (gap === 0) { score += 3; warmthFit = "good"; }
    else if (gap === 1) { score += 1; warmthFit = "ok"; }
    else { score -= 3; warmthFit = "bad"; }
  }

  // What you've taught the app (Likes and Dislikes)
  const learned = learnedPoints(prefs, item.id, words);
  score += learned.total;

  return { item, score, styleScore, matched, warmthFit, learned: learned.total, wordPoints: learned.wordPoints };
}

// ===== Part 5: Picking items =====

let lastPicks = {};       // what was picked last time, per slot, so we can avoid repeats
let currentOutfit = null; // the outfit on screen

// Picks one item from a list of scored items.
// Adds points for how well each one goes with the items already chosen,
// then takes the best ones (within 1 point of the top) and chooses one at random.
function pickOne(scored, slot, chosenIds, prefs) {
  if (scored.length === 0) return null;
  const withPairs = scored.map((s) => {
    const pair = pairPoints(prefs, s.item.id, chosenIds);
    // All learned points together stay within the limit (4), so the
    // weather (which can swing 6 points) always matters more
    const learned = clamp(s.learned + pair, MAX.learned);
    return { ...s, learned, score: s.score - s.learned + learned };
  });
  const best = Math.max(...withPairs.map((s) => s.score));
  let pool = withPairs.filter((s) => s.score >= best - 1);

  // If there's a choice, avoid showing the exact same item as last time
  if (pool.length > 1) {
    pool = pool.filter((s) => s.item.id !== lastPicks[slot]);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// Builds a whole outfit. Returns the picks plus notes to show on screen.
function buildOutfit(items, styleText, weather) {
  const prefs = loadPrefs();
  const words = styleWords(styleText);
  const warmthGoal = targetWarmth(weather);
  const wantOuterwear = needsOuterwear(weather);

  // Score every item, then group them by category
  const byCategory = { top: [], bottom: [], shoes: [], outerwear: [], accessory: [] };
  for (const item of items) {
    // Warmth doesn't matter for accessories (a chain or a watch isn't "warm")
    const goal = item.category === "accessory" ? null : warmthGoal;
    byCategory[item.category].push(scoreItem(item, words, goal, prefs));
  }

  const picks = []; // { slot, pick } where pick is null if nothing to choose from
  const notes = [];
  const chosenIds = []; // grows as we pick, so later picks can check pairs

  function choose(slot, list) {
    const pick = pickOne(list, slot, chosenIds, prefs);
    if (pick) chosenIds.push(pick.item.id);
    return pick;
  }

  // The three must-haves
  for (const slot of ["top", "bottom", "shoes"]) {
    picks.push({ slot, pick: choose(slot, byCategory[slot]) });
  }

  // Outerwear only when it's cold or wet
  if (wantOuterwear) {
    const pick = choose("outerwear", byCategory.outerwear);
    picks.push({ slot: "outerwear", pick });
    if (!pick) notes.push("It's cold or wet, but you have no outerwear yet. Consider adding a jacket.");
  }

  // An accessory only if one matches your words (typed, or learned from Likes)
  const matchingAccessories = byCategory.accessory.filter((s) => s.styleScore > 0 || s.wordPoints > 0);
  const accessory = choose("accessory", matchingAccessories);
  if (accessory) picks.push({ slot: "accessory", pick: accessory });

  if (!weather) notes.push("No weather yet, so warmth was ignored. Set your city above.");
  if (words.length === 0) notes.push("No style typed, so items were picked by weather and your Likes.");

  // Remember this time's picks so the next one can be different
  lastPicks = {};
  picks.forEach((p) => { if (p.pick) lastPicks[p.slot] = p.pick.item.id; });

  return { picks, notes, warmthGoal, wantOuterwear, styleText, rated: false, saved: false };
}

// ===== Part 6: Showing the outfit =====

const styleForm = document.getElementById("style-form");
const styleInput = document.getElementById("style-input");
const outfitResult = document.getElementById("outfit-result");
const outfitSummary = document.getElementById("outfit-summary");
const outfitList = document.getElementById("outfit-list");
const outfitNotes = document.getElementById("outfit-notes");
const outfitActions = document.getElementById("outfit-actions");
const outfitFeedback = document.getElementById("outfit-feedback");
const likeButton = document.getElementById("like-button");
const dislikeButton = document.getElementById("dislike-button");
const saveButton = document.getElementById("save-button");

let outfitPhotoLinks = []; // temporary photo links, cleaned up each time

// Turns 2 into "+2" and -1.5 into "-1.5"
function signed(number) {
  const rounded = Math.round(number * 10) / 10;
  return (rounded > 0 ? "+" : "") + rounded;
}

// Builds one outfit card (or a "missing" card if there was nothing to pick)
function makeOutfitCard(slot, pick) {
  const card = document.createElement("li");

  if (!pick) {
    card.className = "panel slot-missing";
    card.textContent = "[ " + slot + " ] none in wardrobe. Add one on the Wardrobe screen.";
    return card;
  }

  const item = pick.item;
  card.className = "panel item-card";

  // Photo on the left
  const photoBox = document.createElement("div");
  photoBox.className = "photo-box";
  let link = null;
  if (item.photo) {
    link = URL.createObjectURL(item.photo);
    outfitPhotoLinks.push(link);
  }
  fillPhotoBox(photoBox, item.photo, link); // from app.js

  // Slot, name, and the reason it was picked on the right
  const body = document.createElement("div");
  body.className = "item-body";

  const slotLabel = document.createElement("span");
  slotLabel.className = "slot-label";
  slotLabel.textContent = "[ " + slot + " ]";

  const name = document.createElement("h3");
  name.className = "item-name glow";
  name.textContent = item.name;

  const reason = document.createElement("p");
  reason.className = "reason";

  // Style part: which words matched
  const styleSpan = document.createElement("span");
  if (pick.matched.length > 0) {
    styleSpan.className = "hit";
    styleSpan.textContent = "match: " + pick.matched.join(", ");
  } else {
    styleSpan.textContent = "no style match";
  }
  reason.append(styleSpan);

  // Warmth part: ✓ right, ~ close, ✗ wrong
  if (pick.warmthFit) {
    const warmthSpan = document.createElement("span");
    const marks = { good: "✓", ok: "~", bad: "✗" };
    warmthSpan.className = pick.warmthFit === "good" ? "hit" : pick.warmthFit === "bad" ? "miss" : "";
    warmthSpan.textContent = " · warmth " + item.warmth + " " + marks[pick.warmthFit];
    reason.append(warmthSpan);
  }

  // Learned part: points from your Likes and Dislikes (only shown if not zero)
  const learnedTotal = pick.learned;
  if (learnedTotal !== 0) {
    const learnedSpan = document.createElement("span");
    learnedSpan.className = learnedTotal > 0 ? "hit" : "miss";
    learnedSpan.textContent = " · learned " + signed(learnedTotal);
    reason.append(learnedSpan);
  }

  body.append(slotLabel, name, reason);
  card.append(photoBox, body);
  return card;
}

// Shows a short message under the buttons, like "Saved."
function setFeedback(text) {
  outfitFeedback.textContent = text ? "> " + text : "";
  outfitFeedback.hidden = !text;
}

// Turns the Like / Dislike / Save buttons on or off to match the outfit
function updateButtons() {
  const hasItems = currentOutfit && currentOutfit.picks.some((p) => p.pick);
  outfitActions.hidden = !hasItems;
  if (!hasItems) return;
  likeButton.disabled = currentOutfit.rated;
  dislikeButton.disabled = currentOutfit.rated;
  saveButton.disabled = currentOutfit.saved;
  saveButton.innerHTML = currentOutfit.saved ? "&#9632; Saved" : "&#9632; Save";
}

// Puts a whole outfit on the screen
function showOutfit(outfit) {
  outfitPhotoLinks.forEach((link) => URL.revokeObjectURL(link));
  outfitPhotoLinks = [];
  outfitList.innerHTML = "";

  // Summary line, e.g. "TARGET WARMTH: WARM (FEELS 36°F) · OUTERWEAR: YES"
  if (outfit.warmthGoal) {
    outfitSummary.textContent =
      "Target warmth: " + outfit.warmthGoal +
      " (feels " + formatTemp(currentWeather.feelsC) + ")" + // formatTemp is from weather.js
      " · outerwear: " + (outfit.wantOuterwear ? "yes" : "no");
  } else {
    outfitSummary.textContent = "Target warmth: unknown (no weather)";
  }

  for (const { slot, pick } of outfit.picks) {
    outfitList.append(makeOutfitCard(slot, pick));
  }

  outfitNotes.textContent = outfit.notes.map((n) => "> " + n).join("  ");
  outfitNotes.hidden = outfit.notes.length === 0;
  setFeedback("");
  updateButtons();
  outfitResult.hidden = false;
}

// ===== Part 7: The Generate button =====

const STYLE_KEY = "wardrobe-last-style"; // remembers what you last typed

async function generate() {
  localStorage.setItem(STYLE_KEY, styleInput.value);

  const items = await getAllItems(); // from app.js
  if (items.length === 0) {
    currentOutfit = null;
    outfitResult.hidden = false;
    outfitSummary.textContent = "";
    outfitList.innerHTML = "";
    setFeedback("");
    updateButtons();
    outfitNotes.hidden = false;
    outfitNotes.textContent = "> Your wardrobe is empty. Add some clothes on the Wardrobe screen first.";
    return;
  }

  currentOutfit = buildOutfit(items, styleInput.value, currentWeather);
  showOutfit(currentOutfit);
}

styleForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the page from reloading
  await generate();
  outfitResult.scrollIntoView({ behavior: "smooth", block: "start" });
});
styleInput.value = localStorage.getItem(STYLE_KEY) || ""; // fill in your last vibe

// ===== Part 8: Like, Dislike, Save =====

// Like: teach the app, keep the outfit on screen
likeButton.addEventListener("click", () => {
  if (!currentOutfit || currentOutfit.rated) return;
  learnFrom(currentOutfit, true);
  currentOutfit.rated = true;
  updateButtons();
  setFeedback("Liked. Future outfits will lean this way.");
});

// Dislike: teach the app, then make a new outfit straight away
dislikeButton.addEventListener("click", async () => {
  if (!currentOutfit || currentOutfit.rated) return;
  learnFrom(currentOutfit, false);
  await generate();
  setFeedback("Disliked. Here's a different one.");
});

// Save: keep the outfit on the Saved screen. Does NOT change what the app has learned.
saveButton.addEventListener("click", async () => {
  if (!currentOutfit || currentOutfit.saved) return;

  // Store names too, so the saved outfit still makes sense if you delete an item later
  const record = {
    savedAt: Date.now(),
    styleText: currentOutfit.styleText,
    weather: currentWeather
      ? { feelsC: currentWeather.feelsC, sky: currentWeather.sky, place: currentWeather.place }
      : null,
    items: currentOutfit.picks
      .filter((p) => p.pick)
      .map((p) => ({ id: p.pick.item.id, name: p.pick.item.name, slot: p.slot })),
  };

  await addOutfit(record); // from app.js
  currentOutfit.saved = true;
  updateButtons();
  setFeedback("Saved. Find it on the Saved screen.");
});

// ===== Part 9: The Saved screen =====

const savedList = document.getElementById("saved-list");
const savedEmpty = document.getElementById("saved-empty");
let savedPhotoLinks = [];

// Builds one card for a saved outfit
function makeSavedCard(record, itemsById) {
  const card = document.createElement("li");
  card.className = "panel";

  // Top: date and weather, the vibe, and a Remove button
  const head = document.createElement("div");
  head.className = "saved-head";

  const titleBox = document.createElement("div");
  const meta = document.createElement("span");
  meta.className = "saved-meta";
  const date = new Date(record.savedAt).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
  meta.textContent = record.weather
    ? date + " · " + formatTemp(record.weather.feelsC) + " " + record.weather.sky + " · " + record.weather.place
    : date;
  const vibe = document.createElement("h3");
  vibe.className = "saved-vibe glow";
  vibe.textContent = record.styleText.trim() || "(no vibe typed)";
  titleBox.append(meta, vibe);

  const removeButton = document.createElement("button");
  removeButton.className = "btn btn-danger";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", async () => {
    if (!confirm("Remove this saved outfit?")) return;
    await deleteOutfit(record.id); // from app.js
    showSaved();
  });

  head.append(titleBox, removeButton);

  // Bottom: small photo + name for each piece
  const row = document.createElement("ul");
  row.className = "saved-items";
  for (const entry of record.items) {
    const item = itemsById[entry.id]; // undefined if it was deleted from the wardrobe
    const li = document.createElement("li");

    const box = document.createElement("div");
    box.className = "photo-box small";
    let link = null;
    if (item && item.photo) {
      link = URL.createObjectURL(item.photo);
      savedPhotoLinks.push(link);
    }
    fillPhotoBox(box, item && item.photo, link); // from app.js

    const label = document.createElement("span");
    label.textContent = item ? item.name : entry.name;
    if (!item) {
      label.className = "deleted";
      label.textContent += " (deleted)";
    }
    li.append(box, label);
    row.append(li);
  }

  card.append(head, row);
  return card;
}

// Reads saved outfits and draws the list (newest first)
async function showSaved() {
  const [records, items] = await Promise.all([getAllOutfits(), getAllItems()]);
  const itemsById = {};
  items.forEach((item) => (itemsById[item.id] = item));

  savedPhotoLinks.forEach((link) => URL.revokeObjectURL(link));
  savedPhotoLinks = [];
  savedList.innerHTML = "";

  records.reverse();
  for (const record of records) {
    savedList.append(makeSavedCard(record, itemsById));
  }
  savedEmpty.hidden = records.length > 0;
}

// Redraw the Saved list each time the Saved screen opens
screenHooks["screen-saved"] = showSaved; // screenHooks is from app.js

// All files are loaded now, so open the screen named in the web address (e.g. "#outfit")
showScreen(screenFromAddress());
