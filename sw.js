// sw.js: the "service worker". It runs in the background and keeps a copy
// of the app's files, so the app still opens when you have no internet.
//
// How it works ("network first"):
//   - Online: always load the newest files, and update the saved copy.
//   - Offline: use the saved copy.
// Weather still needs the internet, but your wardrobe works offline.

const CACHE_NAME = "wardrobe-app-v1";

// The app's own files to keep a copy of
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./weather.js",
  "./outfit.js",
  "./settings.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// When first installed: save a copy of every app file
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting(); // start working straight away
});

// When a new version takes over: delete copies from older versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Every time the app asks for a file
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle our own files. Weather and fonts go straight to the internet.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Got the newest version: update the saved copy, then use it
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      // No internet: use the saved copy (ignoring things like ?v=2 on the address)
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
