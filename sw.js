const CACHE_NAME = "adm-finance-v6"; // Version එක v6 කලා
const LOGO_URL = "https://raw.githubusercontent.com/janithdidula70-sudo/ADM/35f3a32a1de1d1ad22bcb71229bb2698add86d8b/logo.jpeg";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  LOGO_URL // 1. ලෝගෝ එකත් ඇසෙට්ස් වලට එකතු කලා
];

// Install Event
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch Event (මේක තමයි වැදගත්ම වෙනස)
self.addEventListener("fetch", event => {
  // වෙනත් සර්වර් වල (GitHub වගේ) රික්වෙස්ට් වලදී CORS ප්‍රශ්න මඟහැරීමට 'no-cors' ආකාරයට Fetch කිරීම
  if (event.request.url.includes("raw.githubusercontent.com")) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        
        return fetch(event.request, { mode: 'no-cors' }).then(response => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        }).catch(() => caches.match(LOGO_URL)); // Fail වුනොත් කලින් සේව් වුන ලෝගෝ එක දෙනවා
      })
    );
    return;
  }

  // සාමාන්‍ය ඔයාගේ සයිට් එකේ ෆයිල් ලෝඩ් වන ක්‍රමය
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => {
        // රික්වෙස්ට් එක පිටුවක් (Page) එකක් නම් පමණක් index.html එක පෙන්වන්න
        if (event.request.mode === 'navigate') {
          return caches.match("./index.html");
        }
      });
    })
  );
});
