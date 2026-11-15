// settings.js: the Settings screen.
// City for the weather, °F or °C, reset learned taste, and clear all data.

// ===== Part 1: Grab the parts of the page we need =====

const settingsCityForm = document.getElementById("settings-city-form");
const settingsCityInput = document.getElementById("settings-city-input");
const settingsCityNow = document.getElementById("settings-city-now");
const settingsCityMessage = document.getElementById("settings-city-message");
const unitButtons = document.querySelectorAll(".toggle-option");
const learnedInfo = document.getElementById("settings-learned-info");
const storageInfo = document.getElementById("settings-storage-info");

// ===== Part 2: Fill in the screen with the current settings =====

function showSettings() {
  // City
  const location = loadLocation(); // from weather.js
  settingsCityNow.textContent = location ? location.name : "none";

  // °F / °C: light up the chosen one
  const unit = localStorage.getItem(UNIT_KEY) || "F"; // UNIT_KEY is from weather.js
  unitButtons.forEach((button) => button.classList.toggle("active", button.dataset.unit === unit));

  // How much has been learned
  const prefs = loadPrefs(); // from outfit.js
  const count = Object.keys(prefs.items).length;
  learnedInfo.textContent =
    count === 0
      ? "Nothing learned yet. Like or Dislike outfits to teach the app your taste."
      : "The app has learned about " + count + " item" + (count === 1 ? "" : "s") + " from your Likes and Dislikes.";

  showStorageInfo();
}

// Shows roughly how much space the app uses, like "1.2 MB used"
async function showStorageInfo() {
  if (!navigator.storage || !navigator.storage.estimate) {
    storageInfo.textContent = "";
    return;
  }
  const { usage } = await navigator.storage.estimate();
  const mb = (usage / (1024 * 1024)).toFixed(1);
  storageInfo.textContent = "About " + mb + " MB used.";
}

// ===== Part 3: City =====

function setCityMessage(text, isError) {
  settingsCityMessage.textContent = text ? "> " + text : "";
  settingsCityMessage.hidden = !text;
  settingsCityMessage.classList.toggle("error", Boolean(isError));
}

settingsCityForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the page from reloading
  const city = settingsCityInput.value.trim();
  if (!city) return;

  setCityMessage("Searching for " + city + "...");
  try {
    const name = await setCity(city); // from weather.js
    settingsCityInput.value = "";
    setCityMessage("City set to " + name + ".");
    showSettings();
  } catch (error) {
    setCityMessage(error.message, true);
  }
});

// ===== Part 4: °F / °C =====

unitButtons.forEach((button) =>
  button.addEventListener("click", () => {
    localStorage.setItem(UNIT_KEY, button.dataset.unit);
    showSettings();
    showWeather(); // redraw the weather box (weather.js)
    if (currentOutfit) showOutfit(currentOutfit); // redraw the outfit summary (outfit.js)
  })
);

// ===== Part 5: Reset learned taste =====

document.getElementById("reset-learning-button").addEventListener("click", () => {
  const sure = confirm(
    "Forget everything the app learned from your Likes and Dislikes?\n\n" +
    "Your clothes and saved outfits are kept."
  );
  if (!sure) return;
  localStorage.removeItem(PREFS_KEY); // PREFS_KEY is from outfit.js
  showSettings();
  alert("Done. The app has forgotten your Likes and Dislikes.");
});

// ===== Part 6: Clear all data =====

document.getElementById("clear-all-button").addEventListener("click", async () => {
  // Ask twice, because this deletes everything for good
  if (!confirm("Delete ALL your clothes, photos, saved outfits, and settings from this browser?")) return;
  if (!confirm("Are you really sure? This can't be undone.")) return;

  // 1. Close our connection to the database, then delete the whole database
  const db = await openDatabase(); // from app.js
  db.close();
  dbPromise = null;
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = resolve;
    // "blocked" means the app is open in another tab. The delete finishes once that tab closes.
    request.onblocked = () => {
      alert("Please close any other tabs with this app open, then press OK.");
    };
  });

  // 2. Delete every small setting this app saved (they all start with "wardrobe-")
  Object.keys(localStorage)
    .filter((key) => key.startsWith("wardrobe-"))
    .forEach((key) => localStorage.removeItem(key));

  // 3. Start fresh
  alert("All data cleared.");
  location.reload();
});

// ===== Part 7: Refresh this screen each time you open it =====

document.querySelector('[data-screen="screen-settings"]').addEventListener("click", showSettings);
