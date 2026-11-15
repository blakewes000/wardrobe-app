// app.js: the "brain" of the Wardrobe app.
// Step 2: add clothes, show them in a list, remove them.
// Clothes are saved in IndexedDB, a storage area built into the browser.

// ===== Part 1: The database (where clothes are saved) =====

const DB_NAME = "wardrobe-db"; // name of our storage area
const DB_VERSION = 1;          // bump this if we ever change the layout
const STORE = "items";         // the "table" that holds clothes

// Opens the database. Creates it the first time the app runs.
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only when the database is new (or the version goes up)
    request.onupgradeneeded = () => {
      const db = request.result;
      // Each item gets an automatic number called "id"
      db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Small helper: runs one action on the items store and waits for the result.
// mode is "readonly" (just looking) or "readwrite" (changing things).
async function useStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// The three things we can do with clothes right now
const getAllItems = () => useStore("readonly", (store) => store.getAll());
const addItem = (item) => useStore("readwrite", (store) => store.add(item));
const deleteItem = (id) => useStore("readwrite", (store) => store.delete(id));

// ===== Part 2: Grab the parts of the page we need =====

const openFormButton = document.getElementById("open-form-button");
const form = document.getElementById("add-form");
const cancelButton = document.getElementById("cancel-button");
const list = document.getElementById("item-list");
const emptyMessage = document.getElementById("empty-message");
const itemCount = document.getElementById("item-count");

const nameInput = document.getElementById("item-name");
const categoryInput = document.getElementById("item-category");
const warmthInput = document.getElementById("item-warmth");
const colorInput = document.getElementById("item-color");
const tagsInput = document.getElementById("item-tags");

// ===== Part 3: Show the list of clothes =====

// Builds one card for one item
function makeCard(item) {
  const card = document.createElement("li");
  card.className = "panel item-card";

  // Top row: ID number, name, and Remove button
  const head = document.createElement("div");
  head.className = "item-head";

  const titleBox = document.createElement("div");
  const idLabel = document.createElement("span");
  idLabel.className = "item-id";
  idLabel.textContent = "ID " + String(item.id).padStart(4, "0"); // e.g. ID 0007
  const name = document.createElement("h3");
  name.className = "item-name glow";
  name.textContent = item.name;
  titleBox.append(idLabel, name);

  const removeButton = document.createElement("button");
  removeButton.className = "btn btn-danger";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => removeItem(item));

  head.append(titleBox, removeButton);

  // Detail rows: category, color, warmth, tags
  const details = document.createElement("dl");
  details.className = "item-details";
  addDetail(details, "CAT", item.category);
  addDetail(details, "COLOR", item.color || "--");
  addDetail(details, "WARMTH", item.warmth);

  // Tags show as little pink boxes
  const tagsValue = document.createElement("span");
  if (item.tags.length === 0) {
    tagsValue.textContent = "--";
  }
  for (const tag of item.tags) {
    const tagBox = document.createElement("span");
    tagBox.className = "tag";
    tagBox.textContent = tag;
    tagsValue.append(tagBox);
  }
  addDetail(details, "TAGS", tagsValue);

  card.append(head, details);
  return card;
}

// Adds one "LABEL  value" row to a card
function addDetail(details, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  if (typeof value === "string") {
    dd.textContent = value;
  } else {
    dd.append(value); // value is already a page element (used for tags)
  }
  details.append(dt, dd);
}

// Reads all clothes from the database and redraws the list
async function showItems() {
  const items = await getAllItems();
  items.reverse(); // newest first

  list.innerHTML = ""; // clear the old list
  for (const item of items) {
    list.append(makeCard(item));
  }

  // Show the "empty" message only when there are no clothes
  emptyMessage.hidden = items.length > 0;
  itemCount.textContent = "ITEMS: " + items.length;
}

// ===== Part 4: Opening, closing, and saving the form =====

function openForm() {
  form.hidden = false;
  openFormButton.hidden = true;
  nameInput.focus(); // put the cursor in the Name box
}

function closeForm() {
  form.reset(); // empty all the boxes
  form.hidden = true;
  openFormButton.hidden = false;
}

// Runs when you press Save
async function saveForm(event) {
  event.preventDefault(); // stop the browser from reloading the page

  // Turn "streetwear, Casual , " into ["streetwear", "casual"]
  const tags = tagsInput.value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== "");

  const item = {
    name: nameInput.value.trim(),
    category: categoryInput.value,
    warmth: warmthInput.value,
    color: colorInput.value.trim().toLowerCase(),
    tags: tags,
    addedAt: Date.now(), // when it was added
  };

  await addItem(item);
  closeForm();
  showItems();
}

// ===== Part 5: Removing an item =====

async function removeItem(item) {
  // Ask first, so nothing gets deleted by accident
  const sure = confirm('Remove "' + item.name + '" from your wardrobe?');
  if (!sure) return;

  await deleteItem(item.id);
  showItems();
}

// ===== Part 6: Connect buttons to actions, then start =====

openFormButton.addEventListener("click", openForm);
cancelButton.addEventListener("click", closeForm);
form.addEventListener("submit", saveForm);

showItems(); // draw the list when the page first opens
