(function () {
  "use strict";

  // Read config from the script tag: <script src="..." data-client-id="UUID" data-endpoint="https://..."></script>
  var scriptTag = document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var clientId = scriptTag && scriptTag.getAttribute("data-client-id");
  var endpoint =
    (scriptTag && scriptTag.getAttribute("data-endpoint")) ||
    "https://ferova-whatsapp-ai.vercel.app/api/catalog/sync";

  if (!clientId) return;

  // FNV-1a 32-bit hash — no crypto API needed, works everywhere
  function fnv1a(str) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16);
  }

  function extractProduct() {
    var product = {
      url_producto: location.href.split("?")[0],
      nombre: "",
      precio: "",
      imagen_url: "",
      categoria: "",
    };

    // 1. Shopify — window.ShopifyAnalytics
    try {
      var sa = window.ShopifyAnalytics;
      if (sa && sa.meta && sa.meta.product) {
        var sp = sa.meta.product;
        product.nombre = sp.title || product.nombre;
        product.precio =
          sp.price != null ? (sp.price / 100).toFixed(2) : product.precio;
        if (sp.images && sp.images.length > 0) product.imagen_url = sp.images[0];
        product.categoria = sp.type || product.categoria;
      }
    } catch (_) {}

    // 2. JSON-LD Product schema
    if (!product.nombre) {
      try {
        var scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < scripts.length; i++) {
          var json = JSON.parse(scripts[i].textContent || "{}");
          var entry = json["@type"] === "Product" ? json : null;
          if (!entry && Array.isArray(json["@graph"])) {
            for (var g = 0; g < json["@graph"].length; g++) {
              if (json["@graph"][g]["@type"] === "Product") {
                entry = json["@graph"][g];
                break;
              }
            }
          }
          if (entry) {
            product.nombre = entry.name || product.nombre;
            if (entry.offers) {
              var offer = Array.isArray(entry.offers) ? entry.offers[0] : entry.offers;
              product.precio = offer.price != null ? String(offer.price) : product.precio;
            }
            if (entry.image) {
              product.imagen_url = Array.isArray(entry.image)
                ? entry.image[0]
                : typeof entry.image === "string"
                ? entry.image
                : (entry.image && entry.image.url) || product.imagen_url;
            }
            product.categoria = (entry.category && String(entry.category)) || product.categoria;
            break;
          }
        }
      } catch (_) {}
    }

    // 3. OG meta tags as last resort
    if (!product.nombre) {
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) product.nombre = ogTitle.getAttribute("content") || product.nombre;
    }
    if (!product.imagen_url) {
      var ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) product.imagen_url = ogImage.getAttribute("content") || product.imagen_url;
    }
    if (!product.precio) {
      var ogPrice = document.querySelector('meta[property="product:price:amount"]');
      if (ogPrice) product.precio = ogPrice.getAttribute("content") || product.precio;
    }

    return product;
  }

  function sync() {
    var product = extractProduct();
    if (!product.nombre) return; // Not a product page

    var payload = Object.assign({ clientId: clientId }, product);
    var payloadStr = JSON.stringify(payload);
    payload.hash = fnv1a(payloadStr);

    var sessionKey = "ferova_synced_" + payload.hash;
    try {
      if (sessionStorage.getItem(sessionKey)) return; // Already sent this exact version
    } catch (_) {}

    var sent = false;

    // sendBeacon is fire-and-forget, ideal for page unload too
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        sent = navigator.sendBeacon(endpoint, blob);
      } catch (_) {}
    }

    // Async fetch fallback
    if (!sent) {
      try {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(function () {});
      } catch (_) {}
    }

    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch (_) {}
  }

  // Run when the browser is idle to avoid blocking page render
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(sync, { timeout: 4000 });
  } else {
    setTimeout(sync, 1500);
  }
})();
