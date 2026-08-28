export const HELD_ITEMS = [
  // Power boosters
  { slug: 'choice-band',    label: 'Choice Band',    desc: '+50% Atk, locked to one move' },
  { slug: 'choice-specs',   label: 'Choice Specs',   desc: '+50% SpAtk, locked to one move' },
  { slug: 'choice-scarf',   label: 'Choice Scarf',   desc: '+50% Speed, locked to one move' },
  { slug: 'life-orb',       label: 'Life Orb',       desc: '+30% damage, lose 10% HP per attack' },
  { slug: 'expert-belt',    label: 'Expert Belt',    desc: '+20% damage on super-effective hits' },
  { slug: 'muscle-band',    label: 'Muscle Band',    desc: '+10% physical move damage' },
  { slug: 'wise-glasses',   label: 'Wise Glasses',   desc: '+10% special move damage' },
  // Type enhancers
  { slug: 'charcoal',       label: 'Charcoal',       desc: '+20% Fire moves' },
  { slug: 'mystic-water',   label: 'Mystic Water',   desc: '+20% Water moves' },
  { slug: 'miracle-seed',   label: 'Miracle Seed',   desc: '+20% Grass moves' },
  { slug: 'magnet',         label: 'Magnet',         desc: '+20% Electric moves' },
  { slug: 'twisted-spoon',  label: 'Twisted Spoon',  desc: '+20% Psychic moves' },
  { slug: 'never-melt-ice', label: 'Never-Melt Ice', desc: '+20% Ice moves' },
  { slug: 'black-belt',     label: 'Black Belt',     desc: '+20% Fighting moves' },
  { slug: 'sharp-beak',     label: 'Sharp Beak',     desc: '+20% Flying moves' },
  { slug: 'poison-barb',    label: 'Poison Barb',    desc: '+20% Poison moves' },
  { slug: 'soft-sand',      label: 'Soft Sand',      desc: '+20% Ground moves' },
  { slug: 'hard-stone',     label: 'Hard Stone',     desc: '+20% Rock moves' },
  { slug: 'silver-powder',  label: 'Silver Powder',  desc: '+20% Bug moves' },
  { slug: 'spell-tag',      label: 'Spell Tag',      desc: '+20% Ghost moves' },
  { slug: 'metal-coat',     label: 'Metal Coat',     desc: '+20% Steel moves' },
  { slug: 'dragon-fang',    label: 'Dragon Fang',    desc: '+20% Dragon moves' },
  { slug: 'black-glasses',  label: 'Black Glasses',  desc: '+20% Dark moves' },
  { slug: 'silk-scarf',     label: 'Silk Scarf',     desc: '+20% Normal moves' },
  // Defensive / utility
  { slug: 'leftovers',      label: 'Leftovers',      desc: 'Restore 1/16 max HP each turn' },
  { slug: 'black-sludge',   label: 'Black Sludge',   desc: 'Heal 1/16 HP (Poison-type); else lose 1/8 HP' },
  { slug: 'eviolite',       label: 'Eviolite',       desc: '+50% Def and SpDef' },
  { slug: 'assault-vest',   label: 'Assault Vest',   desc: '+50% SpDef; status moves disabled' },
  { slug: 'rocky-helmet',   label: 'Rocky Helmet',   desc: 'Physical attacker takes 1/6 max HP damage' },
  { slug: 'focus-sash',     label: 'Focus Sash',     desc: 'Survive any OHKO at full HP (consumed)' },
  { slug: 'shell-bell',     label: 'Shell Bell',     desc: 'Restore 1/8 of damage dealt' },
  { slug: 'scope-lens',     label: 'Scope Lens',     desc: '+1 crit stage' },
  { slug: 'lum-berry',      label: 'Lum Berry',      desc: 'Cure any status condition (consumed)' },
  { slug: 'sitrus-berry',   label: 'Sitrus Berry',   desc: 'Restore 1/4 max HP when below 50% (consumed)' },
  { slug: 'flame-orb',      label: 'Flame Orb',      desc: 'Inflicts burn at end of turn' },
  { slug: 'toxic-orb',      label: 'Toxic Orb',      desc: 'Inflicts bad poison at end of turn' },
  { slug: 'light-clay',     label: 'Light Clay',     desc: 'Extends Light Screen and Reflect to 8 turns' },
] as const;

export type HeldItemSlug = typeof HELD_ITEMS[number]['slug'] | '';

export function formatItemName(slug: string): string {
  if (!slug) return '—';
  const entry = HELD_ITEMS.find(i => i.slug === slug);
  return entry ? entry.label : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
