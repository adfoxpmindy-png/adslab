/**
 * Crop the AdsLab logo PNG: trim outer whitespace AND chroma-key the
 * interior white background to alpha so dark mode `invert` doesn't turn
 * the whole image into a solid white rectangle.
 */
import sharp from "sharp";

async function main() {
  const src = "public/adslab-logo.png";
  const dst = "public/adslab-logo.png";

  // Step 1: trim outer near-white border.
  const trimmed = await sharp(src).trim({ threshold: 20 }).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });

  // Step 2: chroma-key near-white pixels to alpha 0.
  // Anything where R+G+B are all > 235 is treated as background.
  const { data, info } = trimmed;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 235 && g > 235 && b > 235) {
      data[i + 3] = 0; // alpha
    }
  }

  // Step 3: re-encode and pad with 10px transparent breathing room.
  const keyed = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extend({
      top: 10,
      bottom: 10,
      left: 10,
      right: 10,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();

  const meta = await keyed.clone().metadata();
  await keyed.toFile(dst);
  console.log(`✓ Cropped + alpha-keyed logo to ${meta.width}×${meta.height}`);
}

main().catch(console.error);
