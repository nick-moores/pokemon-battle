# Pokemon Battle

A local family Pokemon battle simulator. Build teams, track HP, apply status conditions, and settle who's the best trainer — no internet account required.

---

## What it does

- **Team Builder** — search any Pokemon by name (including regional forms like "Hisuian Zoroark"), pick 6, assign 4 moves each
- **Live Battles** — pass-and-play turn-based battles with real damage calculation, type effectiveness, STAB, and crits
- **Status Conditions** — burn, poison, paralysis, sleep, freeze, and confusion all work as you'd expect
- **Type Chart** — shows effectiveness before you pick a move
- **Battle History** — keeps a log of past battles and winners
- **Export / Import** — save your teams to a JSON file and reload them on any machine

---

## Running it

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Battle rules

- All Pokemon battle at **level 50**
- Damage uses the standard formula: `((2L/5 + 2) × Power × Atk/Def) / 50 + 2`
- **STAB** (Same Type Attack Bonus): 1.5×
- **Type effectiveness**: standard Gen 9 chart (0×, 0.5×, 1×, 2×)
- **Critical hits**: 6.25% chance, 1.5× damage
- **Random factor**: 85–100% per hit
- **OHKO moves** (Fissure, Guillotine, etc.) deal full HP damage
- Status effects each turn:
  - Burn: −½ Attack, −⅛ HP/turn
  - Poison: −⅛ HP/turn
  - Badly Poisoned: damage increases each turn
  - Paralysis: 25% skip chance, −½ Speed
  - Sleep: skip 1–3 turns
  - Freeze: skip turns, 20% thaw chance each turn
  - Confusion: 33% chance to hurt itself

---

## Tech

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://zustand-demo.pmnd.rs/) for state (teams + battle)
- [PokeAPI](https://pokeapi.co/) for Pokemon data (sprites, stats, moves)
- `localStorage` for team persistence between sessions

---

## Tips

- **Saving teams**: teams auto-save in your browser. Use **Export Teams** in Manage Teams to download a backup JSON file — handy if you switch browsers or machines.
- **Regional forms**: search naturally — "hisuian zoroark", "galarian ponyta", "alolan raichu" all work
- **Missing a move?** Type its name in the move search box inside the move selector

---

## Ideas for later

- [ ] EVs and IVs — customize per-Pokemon effort and individual values
- [ ] Sound effects — hit sounds, faint sounds, move feedback
- [x] Music — drop your own `public/battle-music.mp3` (gitignored since it's your file)
- [ ] Animations — sprite shake on hit, move flash effects
- [ ] Older sprites — option to use Gen 4/5 pixel art instead of official artwork
- [ ] Weather effects (Sun, Rain, Sand, Hail)
- [ ] Held items
- [ ] Abilities
- [ ] Custom rules / house rules
