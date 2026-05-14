/**
 * Crop the AdsLab logo PNG to remove excess whitespace + make it
 * dark-mode friendly. Original JPG/PNG from designer has a lot of
 * padding around the actual mark + wordmark.
 */
import sharp from "sharp";

async function main() {
  const src = "public/adslab-logo.png";
  const dst = "public/adslab-logo.png";

  const buf = await sharp(src)
    // Trim white/near-white background
    .trim({ threshold: 20 })
    // Add a tiny breathing space (10px transparent padding)
    .extend({
      top: 10,
      bottom: 10,
      left: 10,
      right: 10,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    // Flatten removed — we want transparency for dark mode usability
    .png()
    .toBuffer();

  const { width, height } = await sharp(buf).metadata();
  await sharp(buf).toFile(dst);
  console.log(`✓ Cropped logo to ${width}×${height} (transparent bg)`);
}

main().catch(console.error);
