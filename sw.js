"use strict";

const CACHE_NAME = "vexel-app-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/login.html",
  "/signup.html",
  "/supabaseClient.js",
  "/vexel-ui-fixes.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

/*
  ============================================================
  INSTALL
  ============================================================
*/

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );

  self.skipWaiting();
});

/*
  ============================================================
  ACTIVATE
  ============================================================
*/

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );

  self.clients.claim();
});

/*
  ============================================================
  FETCH
  ============================================================
*/

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /*
    Only handle normal GET requests.
  */

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
    Never interfere with Vexel API requests.
  */

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  /*
    Ignore external websites/CDNs.
  */

  if (url.origin !== self.location.origin) {
    return;
  }

  /*
    Navigation requests:
    try the live website first, then use the cached page.
  */

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });

          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match("/index.html");
          });
        })
    );

    return;
  }

  /*
    Other same-origin GET requests:
    use cache first, then network.
  */

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (
            response &&
            response.status === 200 &&
            response.type === "basic"
          ) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }

          return response;
        })
        .catch(() => {
          return Response.error();
        });
    })
  );
});
