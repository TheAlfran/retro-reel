/// <reference types="vite/client" />
const fishImages = import.meta.glob(['./assets/fish/*.png', '!./assets/fish/atlas.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function fishSpriteUrl(id: string): string {
  return fishImages[`./assets/fish/${id}.png`] ?? fishImages['./assets/fish/harbor_herring.png'];
}

export function fishSprite(id: string, hidden = false): string {
  return `<img class="pixel-sprite fish-sprite${hidden ? ' fish-silhouette' : ''}" src="${fishSpriteUrl(id)}" alt="" aria-hidden="true">`;
}
const baitImages = import.meta.glob(['./assets/bait/*.png', '!./assets/bait/atlas.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function baitSpriteUrl(tier: number): string {
  return baitImages[`./assets/bait/tier-${tier}.png`] ?? baitImages['./assets/bait/tier-1.png'];
}

export function baitSprite(tier: number): string {
  return `<img class="pixel-sprite bait-sprite" src="${baitSpriteUrl(tier)}" alt="" aria-hidden="true">`;
}

const rodImages = import.meta.glob(['./assets/rods/*.png', '!./assets/rods/atlas.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function rodSpriteUrl(tier: number): string {
  return rodImages[`./assets/rods/tier-${tier}.png`] ?? rodImages['./assets/rods/tier-1.png'];
}

export function rodSprite(tier: number): string {
  return `<img class="pixel-sprite rod-sprite" src="${rodSpriteUrl(tier)}" alt="" aria-hidden="true">`;
}

const boatImages = import.meta.glob(['./assets/boats/*.png', '!./assets/boats/atlas.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function boatSpriteUrl(tier: number): string {
  return boatImages[`./assets/boats/tier-${tier}.png`] ?? boatImages['./assets/boats/tier-1.png'];
}

export function boatSprite(tier: number, preview = false): string {
  return `<img class="pixel-sprite boat-sprite${preview ? ' ship-preview' : ''}" src="${boatSpriteUrl(tier)}" alt="" aria-hidden="true">`;
}
