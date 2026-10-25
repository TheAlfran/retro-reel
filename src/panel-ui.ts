import { HUD_ICONS, HUD_PALETTE } from './hud-icons';
import type { Progress, FishDefinition, RodDefinition, BaitDefinition, BoatDefinition, PanelName, SkillKey } from './main';
import './panels.css';
import { baitSprite, boatSprite, fishSprite, rodSprite } from './sprite-art';

const captainPortrait = new URL('./assets/starter-captain.png', import.meta.url).href;
const inventorySpriteSheet = new URL('./assets/inventory-icons-v3.png', import.meta.url).href;

type InventorySprite = 'bag' | 'fish' | 'rod' | 'bait' | 'boat' | 'star' | 'coin' | 'gear';

function inventorySprite(kind: InventorySprite): string {
  return `<i class="inventory-sprite sprite-${kind}" style="background-image:url('${inventorySpriteSheet}')" aria-hidden="true"></i>`;
}

type Icon = keyof typeof HUD_ICONS | 'fish' | 'bait' | 'coin' | SkillKey;
export const SKILLS: { key: SkillKey; name: string; detail: string; parent?: SkillKey }[] = [
  { key: 'focus', name: 'Steady hand', detail: '+3.5% catch-zone width per rank.' },
  { key: 'precision', name: 'Perfect timing', detail: 'Slows the timing marker by 5.5% per rank.', parent: 'focus' },
  { key: 'luck', name: 'Sea sense', detail: 'Increases the chance of finding rarer fish.' },
  { key: 'treasure', name: 'Treasure hunter', detail: '+7% catch value per rank.', parent: 'luck' },
  { key: 'automation', name: 'Deckhand', detail: 'Reduces the auto-cast cooldown by 0.35s per rank.' },
  { key: 'efficiency', name: 'Well-oiled reel', detail: '+4% auto-catch value per rank, up to full value.', parent: 'automation' },
  { key: 'endurance', name: 'Old sea soul', detail: '+8% experience per catch, per rank.' },
  { key: 'frugality', name: 'Careful packing', detail: '+1 bait in every purchased tin per rank.', parent: 'endurance' },
];

export interface PanelModel {
  progress: Progress; fish: FishDefinition[]; rods: RodDefinition[]; baits: BaitDefinition[]; boats: BoatDefinition[];
  autoFishing: boolean; streak: number;
}
export type PanelAction = { type: 'skill'; key: SkillKey }
  | { type: 'rod' | 'bait' | 'equip' | 'boat' | 'equip-rod' | 'equip-boat'; tier: number }
  | { type: 'auto' };

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
const titles: Record<PanelName, [string, string]> = {
  inventory: ['CATCH SATCHEL', 'Your haul, safely stowed'], shop: ['DOCKSIDE GOODS', 'Better tackle. Bigger stories.'],
  codex: ['FISH JOURNAL', 'Every catch has a story'], skills: ['CAPTAIN’S TALENTS', 'Chart your own course'],
  character: ['CAPTAIN’S LOG', 'A life on the water'], boat: ['THE SHIPYARD', 'Find your next horizon'],
  quests: ['CAPTAIN QUESTS', 'Voyages, milestones, and rewards'],
};

function icon(kind: Icon, color = '#e9b95b', hidden = false): string {
  let art = '';
  if (kind in HUD_ICONS) {
    const rows = HUD_ICONS[kind as keyof typeof HUD_ICONS];
    rows.forEach((row, y) => [...row].forEach((key, x) => {
      if (key !== '.') art += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(HUD_PALETTE[key])}"/>`;
    }));
  } else {
    const paths: Partial<Record<Icon, string>> = {
      fish: 'M1 5h3v2h2V5h3V3h4v2h2v6h-2v2H9v-2H6V9H4v2H1z',
      bait: 'M3 2h5v2H5v3h5v2h3v4h-2v2H6v-2h4v-2H6V9H3z',
      coin: 'M5 1h6v2h3v3h1v5h-2v3H4v-2H2V5h1V3h2z',
      focus: 'M1 6h2V4h3V3h4v1h3v2h2v4h-2v2h-3v1H6v-1H3v-2H1z',
      precision: 'M7 0h2v3h4v4h3v2h-3v4H9v3H7v-3H3V9H0V7h3V3h4z',
      luck: 'M3 1h3v2h4V1h3v2h2v3h-2v4h2v3h-3v-2h-2v4H7v-4H5v2H2v-3h2V6H1V3h2z',
      treasure: 'M2 4h12v2h1v8H1V6h1z M4 1h8v2H4z',
      automation: 'M6 0h4v3h3V2h2v4h-2v4h2v4h-3v-2h-2v4H6v-3H3v1H1v-4h2V6H1V2h3v1h2z',
      efficiency: 'M8 0h5l-4 6h5L5 16l2-7H2z',
      endurance: 'M2 2h4v2h4V2h4v2h2v5h-2v2h-2v2h-2v2H6v-2H4v-2H2V9H0V4h2z',
      frugality: 'M5 1h6v3H5z M4 5h8v2h2v7h-2v1H4v-1H2V7h2z',
    };
    art = `<path d="${paths[kind]}" fill="${hidden ? '#52605c' : color}" stroke="#302f30" stroke-width="1"/>`;
    if (kind === 'fish') art += '<path d="M10 6h2v2h-2z" fill="#faf1d0"/><path d="M11 6h1v1h-1z" fill="#242d30"/>';
    if (['focus', 'precision', 'automation'].includes(kind)) art += '<path d="M6 6h4v4H6z" fill="#233844"/><path d="M7 7h2v2H7z" fill="#fff0bc"/>';
    if (kind === 'treasure' || kind === 'coin') art += '<path d="M7 5h2v6H7z" fill="#fff0bc"/>';
  }
  return `<svg class="pixel-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${art}</svg>`;
}

export class PanelUI {
  private overlay: HTMLDivElement;
  private panel: PanelName = 'inventory';
  private model!: PanelModel;
  private selected = '';
  private category: 'rods' | 'bait' = 'rods';
  private previousFocus: HTMLElement | null = null;

  constructor(private action: (action: PanelAction) => string | void, private close: () => void) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'panel-overlay';
    this.overlay.hidden = true;
    document.querySelector('.game-shell')!.append(this.overlay);
    this.overlay.addEventListener('click', event => this.onClick(event));
    this.overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    this.overlay.addEventListener('keyup', event => event.stopPropagation());
  }

  show(panel: PanelName, model: PanelModel, category: 'rods' | 'bait'): void {
    this.panel = panel; this.model = model; this.category = category; this.selected = '';
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.overlay.hidden = false;
    this.render();
    this.overlay.querySelector<HTMLElement>('.pixel-panel')?.focus();
  }

  hide(): void { this.overlay.hidden = true; this.overlay.replaceChildren(); this.previousFocus?.focus(); }
  destroy(): void { this.overlay.remove(); this.previousFocus = null; }
  refresh(model: PanelModel): void { this.model = model; if (!this.overlay.hidden) this.render(); }

  private button(label: string, action: string, disabled = false, extra = ''): string {
    return `<button class="pixel-button ${extra}" data-action="${action}" ${disabled ? 'disabled' : ''}>${escape(label)}</button>`;
  }

  private slot(id: string, art: string, name: string, badge = '', state = ''): string {
    return `<button class="item-slot ${this.selected === id ? 'selected' : ''} ${state}" data-select="${id}" aria-label="${escape(name)}" aria-pressed="${this.selected === id}" title="${escape(name)}">${art}<span class="slot-count">${escape(badge)}</span></button>`;
  }

  private detail(art: string, tag: string, title: string, description: string, footer: string): string {
    return `<aside class="item-detail"><div class="detail-art">${art}</div><span class="eyebrow">${escape(tag)}</span><h3>${escape(title)}</h3><p>${escape(description)}</p>${footer}</aside>`;
  }

  private render(): void {
    const activeElement = this.overlay.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focus = activeElement instanceof HTMLButtonElement ? activeElement.dataset : undefined;
    const panelHadFocus = activeElement?.classList.contains('pixel-panel') ?? false;
    const scroll = this.overlay.querySelector('.panel-body')?.scrollTop ?? 0;
    const content = this.panel === 'skills' ? this.skills() : this.panel === 'shop' ? this.shop()
      : this.panel === 'character' ? this.profile() : this.panel === 'boat' ? this.boat()
        : this.panel === 'quests' ? this.quests() : this.collection();
    const [title, subtitle] = titles[this.panel];
    const panelIcon = this.panel === 'quests' ? 'codex' : this.panel;
    this.overlay.innerHTML = `<section class="pixel-panel ${this.panel === 'skills' ? 'talent-panel' : ''}" role="dialog" aria-modal="true" aria-labelledby="panel-title" data-panel="${this.panel}" tabindex="-1">
      <header class="panel-header"><div class="panel-title-icon">${icon(panelIcon)}</div><div><h2 id="panel-title">${title}</h2><p>${subtitle}</p></div><button class="panel-close" data-action="close" aria-label="Close panel">×</button></header>
      <div class="panel-body">${content}</div>
    </section>`;
    const body = this.overlay.querySelector('.panel-body'); if (body) body.scrollTop = scroll;
    if (focus) {
      const candidates = [...this.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      (candidates.find(button => focus.action ? button.dataset.action === focus.action : focus.select ? button.dataset.select === focus.select : false) ?? candidates[0])?.focus({ preventScroll: true });
    } else if (panelHadFocus) this.overlay.querySelector<HTMLElement>('.pixel-panel')?.focus({ preventScroll: true });
  }

  private collection(): string {
    const { progress: p, fish } = this.model;
    const journal = this.panel === 'codex';
    const caught = fish.filter(f => (p.fishInventory[f.id] ?? 0) > 0);
    if (!journal) return this.inventory(caught);
    const source = journal ? fish : caught;
    if (!source.some(f => f.id === this.selected)) this.selected = source[0]?.id ?? '';
    const selected = source.find(f => f.id === this.selected);
    const total = Object.values(p.fishInventory).reduce((sum, count) => sum + count, 0);
    const slots = source.map(f => {
      const found = (p.fishInventory[f.id] ?? 0) > 0;
      return this.slot(f.id, fishSprite(f.id, !found), found ? f.name : 'Undiscovered fish', found ? `×${p.fishInventory[f.id]}` : '?', found ? '' : 'undiscovered');
    });
    const capacity = Math.max(20, Math.ceil(slots.length / 10) * 10);
    while (slots.length < capacity) slots.push('<div class="item-slot empty" aria-hidden="true"><span></span></div>');
    const found = selected && (p.fishInventory[selected.id] ?? 0) > 0;
    const details = selected ? this.detail(fishSprite(selected.id, !found), found ? selected.rarity : 'Uncharted waters', found ? selected.name : 'Unknown species',
      found ? `Caught ${p.fishInventory[selected.id]} times. A permanent entry in your fishing journal.` : 'Equip the right tackle and boat to discover this fish.',
      `<dl class="detail-stats"><div><dt>Base value</dt><dd>${found ? selected.value + ' coins' : '???'}</dd></div><div><dt>Experience</dt><dd>${found ? selected.xp + ' XP' : '???'}</dd></div></dl><div class="requirements"><span>ROD ${selected.minRod}</span><span>BOAT ${selected.minBoat}</span><span>BAIT ${selected.minBait}</span></div>${selected.requirement ? `<p class="special-note">${escape(selected.requirement)}</p>` : ''}`)
      : this.detail(icon('inventory'), 'Ready for adventure', 'An empty satchel', 'Your first catch belongs here. Close the satchel and cast a line to start your collection.', '<span class="small-note">Caught fish stay in your collection.</span>');
    return `<div class="panel-toolbar collection-summary"><span><strong>${caught.length}</strong> / ${fish.length} SPECIES</span><span><strong>${journal ? fish.length - caught.length : total}</strong> ${journal ? 'LEFT TO FIND' : 'FISH STORED'}</span></div>
      <div class="collection-layout ${journal ? 'journal-layout' : 'inventory-layout'}">
        <section class="storage-frame" aria-label="${journal ? 'Fish journal' : 'Fish storage'}">
          <h3 class="frame-label">${journal ? 'FIELD NOTES' : 'CATCH STORAGE'}</h3>
          <div class="item-grid">${slots.join('')}</div>
          <p class="grid-caption">${journal ? 'Silhouettes mark species still waiting beyond the harbor.' : 'Every catch is kept safe in your captain’s satchel.'}</p>
        </section>
        <section class="detail-frame" aria-label="Selected catch details">
          <h3 class="frame-label">${selected ? 'CATCH DETAILS' : 'SATCHEL NOTES'}</h3>
          ${details}
        </section>
      </div>`;
  }

  private inventory(caught: FishDefinition[]): string {
    const { progress: p, fish, rods, baits, boats } = this.model;
    if (!caught.some(item => item.id === this.selected)) this.selected = caught[0]?.id ?? '';
    const selected = caught.find(item => item.id === this.selected);
    const total = Object.values(p.fishInventory).reduce((sum, count) => sum + count, 0);
    const slots = caught.map(item => this.slot(
      item.id,
      fishSprite(item.id),
      item.name,
      `×${p.fishInventory[item.id]}`,
    ));
    while (slots.length < 30) slots.push('<div class="item-slot empty" aria-hidden="true"></div>');

    const equipped = [
      ['rod', 'Rod', rods[p.equippedRod - 1]?.name ?? 'Starter rod'],
      ['bait', 'Bait', baits[p.selectedBait]?.name ?? 'No bait'],
      ['boat', 'Boat', boats[p.equippedBoat - 1]?.name ?? 'Starter boat'],
      ['bag', 'Bag', `${total} / 30`],
    ] as Array<[InventorySprite, string, string]>;
    const statItems: Array<[InventorySprite, string, number]> = [
      ['gear', 'Focus', p.focus + p.equippedRod],
      ['rod', 'Fishing', p.equippedRod * 3],
      ['star', 'Luck', p.luck + 1],
      ['gear', 'Speed', p.efficiency + p.automation + 1],
      ['boat', 'Hull', p.equippedBoat * 2],
    ];
    const details = selected
      ? `<header class="catch-card-header"><span>SELECTED CATCH</span><strong>${escape(selected.rarity.replace(/\s+[IVX]+$/, ''))}</strong></header><div class="inventory-detail-body"><div class="inventory-detail-art">${fishSprite(selected.id)}<span>×${p.fishInventory[selected.id]}</span></div><div class="inventory-detail-copy"><h3>${escape(selected.name)}</h3><p class="catch-summary">A dependable harbor catch, safely stored and ready to sell.</p><div class="catch-metrics"><span><small>TOTAL CAUGHT</small><strong>${p.fishInventory[selected.id]}</strong></span><span><small>SELL VALUE</small><strong>${selected.value}<em> COINS</em></strong></span><span><small>EXPERIENCE</small><strong>${selected.xp}<em> XP</em></strong></span></div></div></div>`
      : `<div class="inventory-detail-art">${inventorySprite('bag')}</div><div class="inventory-detail-copy"><span>EMPTY SATCHEL</span><h3>Your first catch awaits</h3><p>Close the inventory and cast a line to fill these slots.</p></div>`;

    return `<div class="inventory-tabs" aria-label="Inventory sections"><span class="active">${inventorySprite('bag')} INVENTORY</span><span>${inventorySprite('gear')} EQUIPMENT</span><span>${inventorySprite('star')} TALENTS</span><span class="inventory-coins">${inventorySprite('coin')} <strong>${p.coins}</strong></span></div>
      <div class="inventory-workbench">
        <section class="inventory-bag" aria-label="Catch inventory">
          <div class="inventory-categories"><span class="active">${inventorySprite('fish')} ALL</span><span>${inventorySprite('rod')} RODS</span><span>${inventorySprite('bait')} BAIT</span><span>${inventorySprite('boat')} GEAR</span></div>
          <div class="item-grid">${slots.join('')}</div>
          <div class="inventory-capacity"><span>${caught.length} / ${fish.length} SPECIES</span><span>${total} FISH STORED</span></div>
        </section>
        <section class="inventory-character" aria-label="Captain equipment and stats">
          <h3 class="inventory-section-title"><span>CAPTAIN</span><small>LOADOUT &amp; PROFILE</small></h3>
          <div class="character-loadout">
            <div class="loadout-slots">${equipped.slice(0, 2).map(([kind,label,name]) => `<div class="loadout-slot">${kind === 'rod' ? rodSprite(p.equippedRod) : kind === 'bait' ? baitSprite(p.selectedBait + 1) : inventorySprite(kind)}<span>${label}</span><small>${escape(name)}</small></div>`).join('')}</div>
            <div class="inventory-portrait"><img src="${captainPortrait}" alt=""><strong>${escape(p.captainName || 'Captain')}</strong><span>LEVEL ${p.level}</span></div>
            <div class="loadout-slots">${equipped.slice(2).map(([kind,label,name]) => `<div class="loadout-slot">${kind === 'boat' ? boatSprite(p.equippedBoat) : inventorySprite(kind)}<span>${label}</span><small>${escape(name)}</small></div>`).join('')}</div>
          </div>
          <h3 class="inventory-section-title stats-title"><span>STATS</span><small>CORE ATTRIBUTES</small></h3>
          <div class="inventory-stats">${statItems.map(([kind,label,value]) => `<div>${inventorySprite(kind)}<span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
          <article class="inventory-selected${selected ? ' has-catch' : ''}">${details}</article>
        </section>
      </div>`;
  }

  private shop(): string {
    const { progress: p, rods, baits } = this.model;
    const source = this.category === 'rods' ? rods : baits;
    if (!source.some(item => `${this.category}-${item.tier}` === this.selected)) this.selected = `${this.category}-${this.category === 'rods' ? Math.min(p.rodLevel + 1, rods.length) : p.selectedBait + 1}`;
    const item = source.find(item => `${this.category}-${item.tier}` === this.selected)!;
    const rod = this.category === 'rods';
    const owned = rod && item.tier <= p.rodLevel;
    const locked = rod && item.tier > p.rodLevel + 1;
    const equipped = rod ? p.equippedRod === item.tier : p.selectedBait === item.tier - 1;
    const stock = p.baitStock[item.tier - 1] ?? 0;
    const slots = source.map(item => this.slot(`${this.category}-${item.tier}`, rod ? rodSprite(item.tier) : baitSprite(item.tier), item.name,
      rod ? item.tier === p.equippedRod ? 'E' : item.tier <= p.rodLevel ? '✓' : `T${item.tier}` : `×${p.baitStock[item.tier - 1] ?? 0}`,
      rod && item.tier > p.rodLevel + 1 ? 'locked-slot' : ''));
    while (slots.length < 15) slots.push('<div class="item-slot empty" aria-hidden="true"><span>·</span></div>');
    const purchase = rod
      ? this.button(equipped ? 'EQUIPPED' : owned ? 'EQUIP ROD' : locked ? 'PREVIOUS ROD REQUIRED' : `BUY · ${item.cost} COINS`, owned ? `equip-rod-${item.tier}` : `buy-${item.tier}`, equipped || locked || (!owned && p.coins < item.cost))
      : this.button(`BUY · ${item.cost} COINS`, `buy-${item.tier}`, p.coins < item.cost);
    return `<div class="panel-toolbar"><div class="panel-tabs">${this.button('RODS', 'tab-rods', false, rod ? 'active' : '')}${this.button('BAIT', 'tab-bait', false, !rod ? 'active' : '')}</div><span class="wallet">${inventorySprite('coin')} ${p.coins}</span></div>
      <div class="collection-layout"><div><div class="item-grid">${slots.join('')}</div><div class="grid-caption">${rod ? 'Upgrade rods in order, then re-equip any rod you own.' : `Every tin contains ${3 + p.frugality} bait.`}</div></div>
      ${this.detail(rod ? rodSprite(item.tier) : baitSprite(item.tier), `${item.rarity} / TIER ${item.tier}`, item.name,
        rod ? `Unlocks fish requiring a tier ${item.tier} rod. Each rod also widens the catch zone.` : `Tier ${item.tier} bait attracts new species. One bait is used per cast.`,
        `<dl class="detail-stats"><div><dt>${rod ? 'Status' : 'In your bag'}</dt><dd>${rod ? equipped ? 'Equipped' : owned ? 'Owned' : locked ? 'Locked' : 'Available' : stock}</dd></div><div><dt>${rod ? 'Cost' : 'Per tin'}</dt><dd>${rod ? item.cost + ' coins' : (3 + p.frugality) + ' bait'}</dd></div></dl><div class="detail-actions">${purchase}${!rod ? this.button(equipped ? 'EQUIPPED' : 'EQUIP BAIT', `equip-${item.tier}`, equipped || stock === 0, 'secondary') : ''}</div>${!owned && !locked && p.coins < item.cost ? '<p class="small-note">Catch more fish to earn the remaining coins.</p>' : ''}`)}
      </div>`;
  }

  private skills(): string {
    const p = this.model.progress;
    if (!SKILLS.some(s => s.key === this.selected)) this.selected = 'focus';
    const selected = SKILLS.find(s => s.key === this.selected)!;
    const unlocked = !selected.parent || p[selected.parent] > 0;
    const rank = p[selected.key];
    const positions: Record<SkillKey, [number, number]> = { focus: [50,82], precision: [50,218], luck: [150,82], treasure: [150,218], automation: [250,82], efficiency: [250,218], endurance: [350,82], frugality: [350,218] };
    const connections = SKILLS.map(skill => {
      const start = skill.parent ? positions[skill.parent] : [positions[skill.key][0], 18];
      const end = positions[skill.key];
      return `<path class="${p[skill.key] ? 'learned-path' : !skill.parent || p[skill.parent] ? 'available-path' : ''}" d="M${start[0]} ${start[1]}L${end[0]} ${end[1]}"/>`;
    }).join('');
    const nodes = SKILLS.map(skill => {
      const unlocked = !skill.parent || p[skill.parent] > 0;
      const rank = p[skill.key];
      return `<button class="talent-node talent-${skill.key} ${this.selected === skill.key ? 'selected' : ''} ${rank ? 'learned' : unlocked ? 'available' : 'locked'}" data-select="${skill.key}" aria-pressed="${this.selected === skill.key}" aria-label="${skill.name}, ${unlocked ? 'rank ' + rank + ' of 5' : 'locked'}" title="${skill.name}"><span class="talent-diamond">${icon(skill.key, unlocked ? '#f2c66d' : '#71807e')}</span><span class="talent-rank">${unlocked ? rank + '/5' : '×'}</span></button>`;
    }).join('');
    return `<div class="skill-tabs" aria-label="Talent schools"><span class="active">${icon('cast')} FISHING</span><span>${icon('luck')} FORTUNE</span><span>${icon('automation')} CRAFT</span><span>${icon('endurance')} SURVIVAL</span><span class="skill-points">${p.skillPoints} POINT${p.skillPoints === 1 ? '' : 'S'}</span></div>
      <div class="talent-layout"><div class="talent-chart"><div class="talent-tier tier-one"><strong>TIER 1</strong><span>BEGINNER</span></div><div class="talent-tier tier-two"><strong>TIER 2</strong><span>SKILLED</span></div><svg class="talent-paths" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">${connections}</svg>${nodes}<span class="chart-label chart-north">CORE TALENTS</span><span class="chart-label chart-south">SPECIALIZATIONS</span></div>
      ${this.detail(icon(selected.key), unlocked ? rank === 5 ? 'MASTERED' : 'AVAILABLE TALENT' : 'LOCKED TALENT', selected.name, selected.detail,
        `<div class="rank-pips" aria-label="Rank ${rank} of 5">${Array.from({length:5}, (_, i) => `<span class="${i < rank ? 'filled' : ''}"></span>`).join('')}</div><p class="small-note">${!unlocked ? `Learn ${SKILLS.find(s => s.key === selected.parent)!.name} first.` : rank === 5 ? 'You have mastered every rank of this talent.' : 'Each upgrade costs 1 talent point.'}</p>${this.button(rank === 5 ? 'MASTERED' : !unlocked ? 'LOCKED' : p.skillPoints === 0 ? 'NO POINTS AVAILABLE' : `LEARN RANK ${rank + 1} · 1 PT`, 'learn', !unlocked || rank >= 5 || p.skillPoints <= 0)}`)}
      </div><div class="talent-legend"><span>◆ Learned</span><span>◇ Available</span><span>× Locked branch</span></div>`;
  }

  private quests(): string {
    const { progress: p, fish } = this.model;
    const discovered = fish.filter(item => (p.fishInventory[item.id] ?? 0) > 0).length;
    const quests = [
      { icon: 'fish' as InventorySprite, eyebrow: 'FISHING MILESTONE', name: 'Seasoned Angler', detail: 'Land 25 catches on any voyage.', value: p.catches, goal: 25 },
      { icon: 'star' as InventorySprite, eyebrow: 'DISCOVERY MILESTONE', name: 'Field Research', detail: 'Record 10 different species in your journal.', value: discovered, goal: 10 },
      { icon: 'boat' as InventorySprite, eyebrow: 'FLEET MILESTONE', name: 'Master Shipwright', detail: 'Commission all seven boats in the shipyard.', value: p.hullLevel, goal: 7 },
    ];
    const completed = quests.filter(quest => quest.value >= quest.goal).length;
    const cards = quests.map(quest => {
      const done = quest.value >= quest.goal;
      const current = Math.min(quest.value, quest.goal);
      const percentage = Math.round(current / quest.goal * 100);
      return `<article class="quest-card ${done ? 'completed' : ''}">
        <div class="quest-icon">${inventorySprite(quest.icon)}${done ? '<span class="quest-check">✓</span>' : ''}</div>
        <div class="quest-copy"><span class="eyebrow">${quest.eyebrow}</span><h3>${quest.name}</h3><p>${quest.detail}</p>
          <div class="quest-meter" role="progressbar" aria-label="${quest.name}" aria-valuemin="0" aria-valuemax="${quest.goal}" aria-valuenow="${current}"><span style="width:${percentage}%"></span></div>
          <div class="quest-count"><strong>${current} / ${quest.goal}</strong><span>${done ? 'VOYAGE COMPLETE' : percentage + '% COMPLETE'}</span></div>
        </div>
      </article>`;
    }).join('');
    const totalProgress = Math.round(quests.reduce((sum, quest) => sum + Math.min(quest.value / quest.goal, 1), 0) / quests.length * 100);
    return `<div class="panel-toolbar quest-toolbar"><span>VOYAGE BOARD · ${quests.length - completed} ACTIVE</span><span><strong>${completed}</strong> / ${quests.length} COMPLETE</span></div>
      <div class="quest-layout"><section class="quest-board" aria-label="Captain quests">${cards}</section>
        <aside class="quest-ledger"><div class="quest-ledger-icon">${inventorySprite('star')}</div><span class="eyebrow">CAPTAIN'S LEDGER</span><h3>${totalProgress}% COMPLETE</h3>
          <p>Milestones update automatically as you fish, discover species, and expand your fleet.</p>
          <dl class="detail-stats"><div><dt>Finished</dt><dd>${completed} quests</dd></div><div><dt>In progress</dt><dd>${quests.length - completed} quests</dd></div></dl>
          <div class="quest-overall"><span style="width:${totalProgress}%"></span></div><small>Complete every voyage to finish this captain's chapter.</small>
        </aside>
      </div>`;
  }

  private profile(): string {
    const { progress: p, streak, autoFishing, fish, rods, baits, boats } = this.model;
    const discovered = fish.filter(f => (p.fishInventory[f.id] ?? 0) > 0).length;
    return `<div class="captain-banner"><div class="portrait-slot"><img src="${captainPortrait}" alt=""></div><div><span class="eyebrow">LEVEL ${p.level} CAPTAIN</span><h3>${escape(p.captainName || 'Captain')}</h3><label class="xp-label" for="captain-xp">${p.xp} / ${p.level * 100} XP</label><progress id="captain-xp" max="${p.level * 100}" value="${p.xp}"></progress></div></div>
      <div class="stat-grid">${[['COINS',p.coins],['CATCHES',p.catches],['COLLECTION',`${discovered}/${fish.length}`],['STREAK',streak],['BEST STREAK',p.bestStreak],['TALENT POINTS',p.skillPoints]].map(([label,value]) => `<div class="stat-tile"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
      <h4 class="section-label">EQUIPPED FOR THE VOYAGE</h4><div class="equipment-grid">${[
        ['rod', rods[p.equippedRod - 1].name, `TIER ${p.equippedRod} ROD`], ['bait', baits[p.selectedBait].name, `${p.baitStock[p.selectedBait]} REMAINING`], ['boat', boats[p.equippedBoat - 1].name, `TIER ${p.equippedBoat} BOAT`],
      ].map(([kind,name,label]) => `<div class="equipment-card">${kind === 'rod' ? rodSprite(p.equippedRod) : kind === 'bait' ? baitSprite(p.selectedBait + 1) : boatSprite(p.equippedBoat)}<div><strong>${escape(name)}</strong><span>${label}</span></div></div>`).join('')}</div>
      <div class="auto-setting"><div><strong>Auto fishing</strong><p>Keep casting while you watch the waves.</p></div><button class="pixel-button auto-switch ${autoFishing ? 'active' : ''}" data-action="auto" role="switch" aria-checked="${autoFishing}">${autoFishing ? 'ON' : 'OFF'}</button></div>`;
  }

  private boat(): string {
    const { progress: p, boats } = this.model;
    if (!boats.some(b => String(b.tier) === this.selected)) this.selected = String(Math.min(p.hullLevel + 1, boats.length));
    const boat = boats.find(b => String(b.tier) === this.selected)!;
    const owned = boat.tier <= p.hullLevel;
    const locked = boat.tier > p.hullLevel + 1;
    const equipped = boat.tier === p.equippedBoat;
    const hull = boatSprite(boat.tier, true);
    const action = owned ? `equip-boat-${boat.tier}` : `buy-boat-${boat.tier}`;
    return `<div class="panel-toolbar"><span>FLEET · ${p.hullLevel} / ${boats.length}</span><span class="wallet">${inventorySprite('coin')} ${p.coins}</span></div><div class="collection-layout"><div><div class="ship-display">${hull}<span>${escape(boat.name)}</span></div><div class="boat-slots">${boats.map(b => this.slot(String(b.tier), boatSprite(b.tier), b.name, b.tier === p.equippedBoat ? 'E' : `T${b.tier}`, b.tier > p.hullLevel + 1 ? 'locked-slot' : '')).join('')}</div><div class="grid-caption">Purchase vessels in order, then re-equip any boat in your fleet.</div></div>${this.detail(boatSprite(boat.tier), `TIER ${boat.tier} / ${equipped ? 'EQUIPPED' : owned ? 'OWNED' : locked ? 'LOCKED' : 'NEXT UPGRADE'}`, boat.name, boat.bonus,
      `<dl class="detail-stats"><div><dt>Upgrade cost</dt><dd>${boat.cost} coins</dd></div><div><dt>Your vessel</dt><dd>${escape(boats[p.equippedBoat - 1].name)}</dd></div></dl>${this.button(equipped ? 'CURRENT VESSEL' : owned ? 'EQUIP VESSEL' : locked ? 'PREVIOUS BOAT REQUIRED' : 'UPGRADE VESSEL', action, equipped || locked || (!owned && p.coins < boat.cost))}${!owned && !locked && p.coins < boat.cost ? '<p class="small-note">Earn more coins to commission this vessel.</p>' : ''}`)}</div>`;
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!target || target.disabled) return;
    if (target.dataset.select) { this.selected = target.dataset.select; this.render(); return; }
    const command = target.dataset.action;
    if (command === 'close') { this.close(); return; }
    if (command?.startsWith('tab-')) { this.category = command === 'tab-rods' ? 'rods' : 'bait'; this.selected = ''; this.render(); return; }
    let action: PanelAction | undefined;
    if (command === 'learn') action = { type: 'skill', key: this.selected as SkillKey };
    if (command === 'auto') action = { type: 'auto' };
    if (command?.startsWith('buy-boat-')) action = { type: 'boat', tier: Number(command.slice(9)) };
    if (command?.startsWith('equip-boat-')) action = { type: 'equip-boat', tier: Number(command.slice(11)) };
    if (command?.startsWith('equip-rod-')) action = { type: 'equip-rod', tier: Number(command.slice(10)) };
    if (command?.startsWith('buy-') && !command.startsWith('buy-boat-')) action = { type: this.category === 'rods' ? 'rod' : 'bait', tier: Number(command.slice(4)) };
    if (command?.startsWith('equip-') && !command.startsWith('equip-boat-') && !command.startsWith('equip-rod-')) action = { type: 'equip', tier: Number(command.slice(6)) };
    if (action) {
      this.action(action);
      if (action.type === 'auto') this.model.autoFishing = !this.model.autoFishing;
      this.render();
    }
  }
}
