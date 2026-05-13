import type { Platform } from "./types";

/**
 * Classify a destination URL into a recognizable platform so the
 * journey map can show the right brand icon. Heuristic only — uses
 * domain + path patterns. We can wire a manual override table later
 * if users want to correct misclassifications.
 *
 * Returns the platform code; if nothing matches we fall back to
 * "generic" (renders as a globe icon with the domain label).
 */
export function classifyUrl(rawUrl: string): {
  platform: Platform;
  hostname: string;
  faviconUrl: string | null;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { platform: "generic", hostname: rawUrl.slice(0, 80), faviconUrl: null };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;

  // Social platforms — direct match by domain
  if (host.includes("instagram.com")) return { platform: "instagram", hostname: host, faviconUrl };
  if (host.includes("facebook.com")) return { platform: "facebook", hostname: host, faviconUrl };
  if (host.includes("tiktok.com")) return { platform: "tiktok", hostname: host, faviconUrl };
  if (host.includes("youtube.com") || host.includes("youtu.be"))
    return { platform: "youtube", hostname: host, faviconUrl };
  if (host.includes("line.me") || host.includes("liff.line"))
    return { platform: "line", hostname: host, faviconUrl };
  if (host.includes("linktr.ee") || host.includes("linktree"))
    return { platform: "linktree", hostname: host, faviconUrl };

  // E-commerce platforms — domain + path heuristics
  //
  // Shopify: most stores live on `<store>.myshopify.com` but custom
  // domains exist. Check path for shopify-specific routes too.
  if (host.endsWith(".myshopify.com") || path.includes("/cart") && path.includes("/products"))
    return { platform: "shopify", hostname: host, faviconUrl };

  // WooCommerce: WordPress at heart. Check for /shop/ or /product-category/
  // which are WooCommerce defaults. Better signal would be HTML metadata
  // but we don't fetch the page here.
  if (
    path.includes("/shop/") ||
    path.includes("/product-category/") ||
    path.includes("/cart/") ||
    path.includes("/checkout/")
  ) {
    // Could be Woo or any generic shop — bias toward Woo since it's the
    // most common WP commerce plugin. False positives are fine for v1.
    return { platform: "woocommerce", hostname: host, faviconUrl };
  }

  // WordPress: hard to detect without HTML check; default to generic
  // unless we see obvious /wp-admin or /wp-content paths.
  if (path.includes("/wp-") || host.endsWith(".wordpress.com")) {
    return { platform: "wordpress", hostname: host, faviconUrl };
  }

  return { platform: "generic", hostname: host, faviconUrl };
}
