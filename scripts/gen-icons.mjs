// One-off asset generator. Run: node scripts/gen-icons.mjs
// Requires `sharp` (installed with --no-save; not a project dependency).
// Trims the source art, then emits favicon, PWA maskable tiles, apple-touch icon,
// and the light/dark wordmarks into public/.
import sharp from 'sharp'

const BRAND = new URL('../assets/brand/', import.meta.url).pathname
const MARK = `${BRAND}mark.png` // green→cyan→blue "M", near-white background
const WORDMARK_LIGHT = `${BRAND}wordmark-light.png` // black text (for light surfaces)
const WORDMARK_DARK = `${BRAND}wordmark-dark.png` // white text (for dark surfaces)
const PUBLIC = new URL('../public/', import.meta.url).pathname

const TILE = { r: 255, g: 255, b: 255 } // white — the mark is designed on white

// Favicon: trimmed mark on a white square (browsers downscale for the tab).
await sharp(MARK)
  .trim()
  .resize(512, 512, { fit: 'contain', background: { ...TILE, alpha: 1 } })
  .flatten({ background: TILE })
  .png()
  .toFile(`${PUBLIC}favicon.png`)

// PWA maskable tiles: mark at ~80% (safe zone) centered on a white tile.
async function tile(size) {
  const inner = Math.round(size * 0.8)
  const pad = Math.round((size - inner) / 2)
  await sharp(MARK)
    .trim()
    .resize(inner, inner, { fit: 'contain', background: { ...TILE, alpha: 1 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { ...TILE, alpha: 1 } })
    .flatten({ background: TILE })
    .png()
    .toFile(`${PUBLIC}icon-${size}.png`)
}
await tile(512)
await tile(192)

// "Any"-purpose tiles: tight mark filling the square (less padding than the
// maskable tiles, which look over-padded in non-masked contexts like the
// install dialog and app list).
async function anyTile(size) {
  await sharp(MARK)
    .trim()
    .resize(size, size, { fit: 'contain', background: { ...TILE, alpha: 1 } })
    .flatten({ background: TILE })
    .png()
    .toFile(`${PUBLIC}icon-any-${size}.png`)
}
await anyTile(512)
await anyTile(192)

// Apple touch icon: opaque white tile, 180px.
await sharp(`${PUBLIC}icon-512.png`).resize(180, 180).png().toFile(`${PUBLIC}apple-touch-icon.png`)

// PWA install-dialog screenshots (branded title cards). Wide = desktop,
// narrow = mobile. Placeholders — swap with real in-app captures anytime.
async function screenshot(name, w, h, markW) {
  const wm = await sharp(WORDMARK_DARK).trim().resize({ width: markW }).toBuffer()
  const { height: wmH } = await sharp(wm).metadata()
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <radialGradient id="g" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stop-color="#0c6aa6" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#0f1115" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="#0f1115"/>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <text x="50%" y="${Math.round(h * 0.42 + wmH * 0.5 + 64)}" text-anchor="middle"
        font-family="Inter Tight, Arial, sans-serif" font-size="${Math.round(w * 0.028)}"
        fill="#94a3b8">Hypertrophy training, tracked.</text>
    </svg>`,
  )
  await sharp(bg)
    .composite([{ input: wm, left: Math.round((w - markW) / 2), top: Math.round(h * 0.42 - wmH / 2) }])
    .png()
    .toFile(`${PUBLIC}${name}`)
}
await screenshot('screenshot-wide.png', 1280, 800, 560)
await screenshot('screenshot-narrow.png', 1080, 1920, 760)

// Wordmarks: trim margins, keep each one's own background (light has white, dark is transparent).
await sharp(WORDMARK_LIGHT).trim().png().toFile(`${PUBLIC}momentum-wordmark-light.png`)
await sharp(WORDMARK_DARK).trim().png().toFile(`${PUBLIC}momentum-wordmark-dark.png`)

console.log('icons generated:', [
  'favicon.png', 'icon-192.png', 'icon-512.png',
  'icon-any-192.png', 'icon-any-512.png', 'apple-touch-icon.png',
  'screenshot-wide.png', 'screenshot-narrow.png',
  'momentum-wordmark-light.png', 'momentum-wordmark-dark.png',
].join(', '))
