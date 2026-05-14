/**
 * Image generation abstraction. Currently uses pollinations.ai (free,
 * no API key) — good enough for AdsLab Campaign Builder previews.
 *
 * To swap in a real provider (DALL-E 3, Gemini Imagen, Flux), add a new
 * branch in `generateCreativeImage()` that checks an env var.
 *
 * Pollinations returns a stable image URL that resolves to the image
 * — the actual generation happens server-side at pollinations.ai when
 * the URL is first fetched. This is async-friendly for Next.js Image.
 */

export type ImagePromptInput = {
  /** Headline / caption shown on the ad */
  headline: string;
  /** Visual description (what to show in the image) */
  description: string;
  /** "image" or "video" — square aspect for image, 9:16 for video */
  type: "image" | "video";
  /** Brand product context — helps quality */
  productContext?: string;
  /** Optional seed for reproducibility */
  seed?: number;
};

export type GeneratedImage = {
  url: string;
  width: number;
  height: number;
};

/**
 * Generate a creative preview image for an ad. Returns a public URL.
 * For the placeholder provider (pollinations.ai), the URL is generated
 * synchronously but the image is fetched lazily by the browser.
 */
export function generateCreativeImage(input: ImagePromptInput): GeneratedImage {
  const isVideo = input.type === "video";
  const width = isVideo ? 720 : 1024;
  const height = isVideo ? 1280 : 1024;

  // Compose an English-translated prompt (pollinations doesn't handle Thai well)
  const promptParts = [
    "professional Thai advertising photography",
    input.description || input.headline,
    input.productContext ?? "",
    "high quality, studio lighting, vibrant colors, commercial photography",
    "no text, no watermark",
  ].filter(Boolean);
  const prompt = promptParts.join(", ");

  const seed = input.seed ?? hashString(input.headline + input.description);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

  return { url, width, height };
}

/** Stable seed from a string (deterministic across runs) */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
