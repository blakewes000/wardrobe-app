// outfit.js: builds an outfit from your wardrobe.
// It uses simple rules (no AI): every item gets points for
//   1. matching the words you typed (its tags, color, and name), and
//   2. having the right warmth for today's weather.
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

// ===== Part 2: Reading the weather =====

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

// ===== Part 3: Scoring one item =====

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
function scoreItem(item, words, warmthGoal) {
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

  return { item, score, styleScore, matched, warmthFit };
}

// ===== Part 4: Picking items =====

let lastPicks = {}; // what was picked last time, per slot, so we can avoid repeats
let currentOutfit = null; // the outfit on screen (step 6 will save this when you Like it)

// Picks one item from a list of scored items.
// Takes the best ones (within 1 point of the top score) and chooses one at random.
function pickOne(scored, slot) {
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((s) => s.score));
  let pool = scored.filter((s) => s.score >= best - 1);

  // If there's a choice, avoid showing the exact same item as last time
  if (pool.length > 1) {
    pool = pool.filter((s) => s.item.id !== lastPicks[slot]);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// Builds a whole outfit. Returns the picks plus notes to show on screen.
function buildOutfit(items, styleText, weather) {
  const words = styleWords(styleText);
  const warmthGoal = targetWarmth(weather);
  const wantOuterwear = needsOuterwear(weather);

  // Score every item, then group them by category
  const byCategory = { top: [], bottom: [], shoes: [], outerwear: [], accessory: [] };
  for (const item of items) {
    // Warmth doesn't matter for accessories (a chain or a watch isn't "warm")
    const goal = item.category === "accessory" ? null : warmthGoal;
    byCategory[item.category].push(scoreItem(item, words, goal));
  }

  const picks = [];   // { slot, pick } where pick is null if nothing to choose from
  const notes = [];

  // The three must-haves
  for (const slot of ["top", "bottom", "shoes"]) {
    picks.push({ slot, pick: pickOne(byCategory[slot], slot) });
  }

  // Outerwear only when it's cold or wet
  if (wantOuterwear) {
    const pick = pickOne(byCategory.outerwear, "outerwear");
    picks.push({ slot: "outerwear", pick });
    if (!pick) notes.push("It's cold or wet, but you have no outerwear yet. Consider adding a jacket.");
  }

  // An accessory only if one matches your style words
  const matchingAccessories = byCategory.accessory.filter((s) => s.styleScore > 0);
  const accessory = pickOne(matchingAccessories, "accessory");
  if (accessory) picks.push({ slot: "accessory", pick: accessory });

  if (!weather) notes.push("No weather yet, so warmth was ignored. Set your city above.");
  if (words.length === 0) notes.push("No style typed, so items were picked by weather only.");

  // Remember this time's picks so the next one can be different
  lastPicks = {};
  picks.forEach((p) => { if (p.pick) lastPicks[p.slot] = p.pick.item.id; });

  return { picks, notes, warmthGoal, wantOuterwear, styleText };
}

// ===== Part 5: Showing the outfit =====

const styleForm = document.getElementById("style-form");
const styleInput = document.getElementById("style-input");
const outfitResult = document.getElementById("outfit-result");
const outfitSummary = document.getElementById("outfit-summary");
const outfitList = document.getElementById("outfit-list");
const outfitNotes = document.getElementById("outfit-notes");

let outfitPhotoLinks = []; // temporary photo links, cleaned up each time

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

  body.append(slotLabel, name, reason);
  card.append(photoBox, body);
  return card;
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
  outfitResult.hidden = false;
}

// ===== Part 6: The Generate button =====

const STYLE_KEY = "wardrobe-last-style"; // remembers what you last typed

async function generate(event) {
  event.preventDefault(); // stop the page from reloading
  localStorage.setItem(STYLE_KEY, styleInput.value);

  const items = await getAllItems(); // from app.js
  if (items.length === 0) {
    outfitResult.hidden = false;
    outfitSummary.textContent = "";
    outfitList.innerHTML = "";
    outfitNotes.hidden = false;
    outfitNotes.textContent = "> Your wardrobe is empty. Add some clothes on the Wardrobe screen first.";
    return;
  }

  currentOutfit = buildOutfit(items, styleInput.value, currentWeather);
  showOutfit(currentOutfit);
  outfitResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

styleForm.addEventListener("submit", generate);
styleInput.value = localStorage.getItem(STYLE_KEY) || ""; // fill in your last vibe
