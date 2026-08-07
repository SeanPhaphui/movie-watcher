// One-off: rasterizes the app icon SVG into the PNG sizes the manifest needs.
// Run with: npm run icons
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

// Marquee sign: dark card, gold frame studded with "bulbs", play wedge center.
// Pure geometry — no fonts, so it renders identically everywhere.
function iconSvg({ pad = 0, bg = '#0d0b0e' } = {}) {
  const bulbs = []
  const positions = []
  for (let i = 0; i < 7; i++) positions.push([136 + i * 40, 116], [136 + i * 40, 396])
  for (let i = 0; i < 5; i++) positions.push([136, 156 + i * 48], [376, 156 + i * 48])
  for (const [x, y] of positions) {
    bulbs.push(`<circle cx="${x}" cy="${y}" r="9" fill="#f6b74a"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="${bg}"/>
  <rect x="96" y="76" width="320" height="360" rx="28" fill="none" stroke="#f6b74a" stroke-width="10"/>
  ${bulbs.join('\n  ')}
  <path d="M 216 196 L 216 316 L 320 256 Z" fill="#f6b74a"/>
</svg>`
}

await mkdir('public/icons', { recursive: true })

const standard = Buffer.from(iconSvg())
const maskable = Buffer.from(iconSvg({ pad: 1 })) // full-bleed square for maskable

await sharp(standard).resize(192, 192).png().toFile('public/icons/pwa-192.png')
await sharp(standard).resize(512, 512).png().toFile('public/icons/pwa-512.png')
await sharp(maskable).resize(512, 512).png().toFile('public/icons/maskable-512.png')
await sharp(maskable).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')

console.log('icons written to public/icons/')
