// One-off asset generator. Run: node scripts/gen-icons.mjs
// Requires `sharp` (installed with --no-save; not a project dependency).
// Trims the transparent margins off the source art, then emits favicon,
// PWA maskable tiles, and a trimmed wordmark into public/.
import sharp from 'sharp'

const BRAND = new URL('../assets/brand/', import.meta.url).pathname
const MARK = `${BRAND}mark.png`
const WORDMARK = `${BRAND}wordmark.png`
const PUBLIC = new URL('../public/', import.meta.url).pathname

const TILE = { r: 15, g: 17, b: 21 } // #0f1115 — app theme background

// Favicon: trimmed mark, transparent, square (browsers downscale for the tab).
await sharp(MARK)
  .trim()
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(`${PUBLIC}favicon.png`)

// PWA maskable tiles: mark at ~80% (safe zone) centered on a solid tile.
async function tile(size) {
  const inner = Math.round(size * 0.8)
  const pad = Math.round((size - inner) / 2)
  await sharp(MARK)
    .trim()
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { ...TILE, alpha: 1 } })
    .flatten({ background: TILE })
    .png()
    .toFile(`${PUBLIC}icon-${size}.png`)
}
await tile(512)
await tile(192)

// Apple touch icon: opaque tile (iOS ignores transparency), 180px.
await sharp(`${PUBLIC}icon-512.png`).resize(180, 180).png().toFile(`${PUBLIC}apple-touch-icon.png`)

// Wordmark: just trim the transparent margins; keep transparency for the login screen.
await sharp(WORDMARK).trim().png().toFile(`${PUBLIC}momentum-wordmark.png`)

console.log('icons generated:', ['favicon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'momentum-wordmark.png'].join(', '))
