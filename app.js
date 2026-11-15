// app.js: the "brain" of the Wardrobe app.
// Add clothes (with photos), show them in a list, edit them, remove them.
// Clothes are saved in IndexedDB, a storage area built into the browser.

// ===== Part 1: The database (where clothes are saved) =====

const DB_NAME = "wardrobe-db"; // name of our storage area
const DB_VERSION = 2;          // version 2 added the "outfits" table
const STORE = "items";         // the "table" that holds clothes
const OUTFIT_STORE = "outfits"; // the "table" that holds saved outfits

// Opens the database once, then reuses it. Creates it the first time the app runs.
let dbPromise = null;
function openDatabase() {
  if (!dbPromise) dbPromise = connectDatabase();
  return dbPromise;
}

function connectDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only when the database is new (or the version goes up).
    // Each table is only created if it doesn't exist yet, so your clothes are kept.
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // Each item gets an automatic number called "id"
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(OUTFIT_STORE)) {
        db.createObjectStore(OUTFIT_STORE, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // If a newer version of the app opens in another tab, step aside so it can upgrade
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null; // try again next time
      reject(request.error);
    };
  });
}

// Small helper: runs one action on a table and waits for the result.
// mode is "readonly" (just looking) or "readwrite" (changing things).
async function useStore(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const store = db.transaction(storeName, mode).objectStore(storeName);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// The things we can do with clothes
const getAllItems = () => useStore(STORE, "readonly", (store) => store.getAll());
const addItem = (item) => useStore(STORE, "readwrite", (store) => store.add(item));
const updateItem = (item) => useStore(STORE, "readwrite", (store) => store.put(item)); // replaces the item with the same id
const deleteItem = (id) => useStore(STORE, "readwrite", (store) => store.delete(id));

// The things we can do with saved outfits (used by outfit.js)
const getAllOutfits = () => useStore(OUTFIT_STORE, "readonly", (store) => store.getAll());
const addOutfit = (outfit) => useStore(OUTFIT_STORE, "readwrite", (store) => store.add(outfit));
const deleteOutfit = (id) => useStore(OUTFIT_STORE, "readwrite", (store) => store.delete(id));

// ===== Part 2: Grab the parts of the page we need =====

const openFormButton = document.getElementById("open-form-button");
const form = document.getElementById("add-form");
const formTitle = document.getElementById("form-title");
const cancelButton = document.getElementById("cancel-button");
const list = document.getElementById("item-list");
const emptyMessage = document.getElementById("empty-message");
const itemCount = document.getElementById("item-count");

const nameInput = document.getElementById("item-name");
const categoryInput = document.getElementById("item-category");
const warmthInput = document.getElementById("item-warmth");
const colorInput = document.getElementById("item-color");
const tagsInput = document.getElementById("item-tags");

const photoInput = document.getElementById("item-photo");
const photoPreview = document.getElementById("photo-preview");
const removePhotoButton = document.getElementById("remove-photo-button");

// ===== Part 3: Remembering what the form is doing =====

let editingId = null;    // null = adding a new item. A number = editing that item.
let currentPhoto = null; // the photo chosen in the form (or null for none)
let photoLinks = [];     // temporary links to photos on cards (cleaned up on redraw)
let previewLink = null;  // temporary link to the photo in the form

// ===== Part 4: Photos =====

const MAX_PHOTO_SIZE = 800; // longest side in pixels. Keeps storage small.

// Phone photos are huge (several MB). This shrinks one to at most
// 800 pixels wide or tall and saves it as a JPEG picture.
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const link = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Work out the new size (never make a small photo bigger)
      const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      // Draw the photo smaller onto the canvas, then save the canvas as a picture
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(link);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("shrink failed"))),
        "image/jpeg",
        0.8 // quality: 0.8 looks good and stays small
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(link);
      reject(new Error("That file couldn't be opened as a picture."));
    };

    img.src = link;
  });
}

// Shows a photo (or "NO IMG") inside a square photo box
function fillPhotoBox(box, photo, link) {
  box.innerHTML = "";
  if (photo) {
    const img = document.createElement("img");
    img.src = link;
    img.alt = "";
    box.append(img);
  } else {
    box.textContent = "NO IMG";
  }
}

// Updates the preview box in the form to match currentPhoto
function showPreview() {
  if (previewLink) URL.revokeObjectURL(previewLink); // free the old link
  previewLink = currentPhoto ? URL.createObjectURL(currentPhoto) : null;
  fillPhotoBox(photoPreview, currentPhoto, previewLink);
  removePhotoButton.hidden = !currentPhoto;
}

// Runs when you pick a photo
async function photoChosen() {
  const file = photoInput.files[0];
  if (!file) return;
  try {
    currentPhoto = await shrinkPhoto(file);
    showPreview();
  } catch (error) {
    alert("Sorry, that photo couldn't be used. Try a JPG or PNG picture.");
  }
  photoInput.value = ""; // so choosing the same file again still works
}

function removePhoto() {
  currentPhoto = null;
  showPreview();
}

// ===== Part 5: Show the list of clothes =====

// Builds one card for one item
function makeCard(item) {
  const card = document.createElement("li");
  card.className = "panel item-card";

  // Left side: the photo
  const photoBox = document.createElement("div");
  photoBox.className = "photo-box";
  let link = null;
  if (item.photo) {
    link = URL.createObjectURL(item.photo);
    photoLinks.push(link); // remember it so we can clean it up later
  }
  fillPhotoBox(photoBox, item.photo, link);

  // Right side: name, details, buttons
  const body = document.createElement("div");
  body.className = "item-body";

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

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const editButton = document.createElement("button");
  editButton.className = "btn btn-small";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openForm(item));

  const removeButton = document.createElement("button");
  removeButton.className = "btn btn-danger";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => removeItem(item));

  actions.append(editButton, removeButton);
  head.append(titleBox, actions);

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

  body.append(head, details);
  card.append(photoBox, body);
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

  // Free the photo links from the last time we drew the list
  photoLinks.forEach((link) => URL.revokeObjectURL(link));
  photoLinks = [];

  list.innerHTML = ""; // clear the old list
  for (const item of items) {
    list.append(makeCard(item));
  }

  // Show the "empty" message only when there are no clothes
  emptyMessage.hidden = items.length > 0;
  itemCount.textContent = "ITEMS: " + items.length;
}

// ===== Part 6: Opening, closing, and saving the form =====

// Opens the form. With no item it's a blank "new item" form.
// With an item, the boxes are filled in so you can edit it.
function openForm(item) {
  form.reset();
  if (item && item.id) {
    editingId = item.id;
    formTitle.textContent = "// Edit item " + String(item.id).padStart(4, "0");
    nameInput.value = item.name;
    categoryInput.value = item.category;
    warmthInput.value = item.warmth;
    colorInput.value = item.color;
    tagsInput.value = item.tags.join(", ");
    currentPhoto = item.photo || null;
  } else {
    editingId = null;
    formTitle.textContent = "// New item";
    currentPhoto = null;
  }
  showPreview();

  form.hidden = false;
  openFormButton.hidden = true;
  form.scrollIntoView({ behavior: "smooth", block: "start" }); // jump up to the form
  nameInput.focus({ preventScroll: true }); // put the cursor in the Name box
}

function closeForm() {
  form.reset(); // empty all the boxes
  editingId = null;
  currentPhoto = null;
  showPreview();
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
    photo: currentPhoto, // the shrunk photo, or null
  };

  if (editingId) {
    // Editing: keep the same id and original "added" time
    const old = (await getAllItems()).find((i) => i.id === editingId);
    item.id = editingId;
    item.addedAt = old ? old.addedAt : Date.now();
    await updateItem(item);
  } else {
    item.addedAt = Date.now(); // when it was added
    await addItem(item);
  }

  closeForm();
  showItems();
}

// ===== Part 7: Removing an item =====

async function removeItem(item) {
  // Ask first, so nothing gets deleted by accident
  const sure = confirm('Remove "' + item.name + '" from your wardrobe?');
  if (!sure) return;

  await deleteItem(item.id);
  if (editingId === item.id) closeForm(); // don't keep editing a deleted item
  showItems();
}

// ===== Part 8: Bottom menu (switching screens) =====

const navButtons = document.querySelectorAll(".nav-button");
const screens = document.querySelectorAll(".screen");

// Other files can add a function here to run when their screen opens,
// e.g. screenHooks["screen-saved"] = showSaved;
const screenHooks = {};

// Shows one screen, hides the others, and lights up the matching button
function showScreen(screenId) {
  if (!document.getElementById(screenId)) screenId = "screen-wardrobe"; // unknown: go home
  screens.forEach((screen) => (screen.hidden = screen.id !== screenId));
  navButtons.forEach((button) =>
    button.classList.toggle("active", button.dataset.screen === screenId)
  );
  window.scrollTo(0, 0); // start at the top of the new screen
  if (screenHooks[screenId]) screenHooks[screenId]();
}

// The screen's name goes at the end of the web address, like "#outfit".
// That way the phone's Back button goes to the previous screen
// instead of closing the app.
function screenFromAddress() {
  const name = location.hash.slice(1) || "wardrobe"; // "#outfit" -> "outfit"
  return "screen-" + name;
}

navButtons.forEach((button) =>
  button.addEventListener("click", () => {
    const name = button.dataset.screen.replace("screen-", ""); // "screen-outfit" -> "outfit"
    if (location.hash !== "#" + name) location.hash = name; // this triggers "hashchange" below
    else showScreen(button.dataset.screen); // already there: just refresh it
  })
);
window.addEventListener("hashchange", () => showScreen(screenFromAddress()));

// ===== Part 9: Connect buttons to actions, then start =====

openFormButton.addEventListener("click", () => openForm());
cancelButton.addEventListener("click", closeForm);
form.addEventListener("submit", saveForm);
photoInput.addEventListener("change", photoChosen);
removePhotoButton.addEventListener("click", removePhoto);

showItems(); // draw the list when the page first opens

// ===== Part 10: Phone app extras =====

// Turn on offline support (only works when the app is on a web address, not a file)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js");
}

// Ask the browser not to delete our data when the phone runs low on space.
// Chrome decides by itself (no pop-up); it usually says yes once the app is installed.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}
