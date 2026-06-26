# Pokemon Family Battle

A pass-and-play Pokemon battle simulator built for the Moores family. Build teams, settle grudges, and find out who the real Pokemon master is.

**[▶ Play it live](https://pokemon-battle-phi.vercel.app)**

---

## Screenshots

### Home Screen
![Home Screen](screenshots/home.png)

### Team Builder
![Team Builder](screenshots/team-builder.png)

### Battle Screen
![Battle Screen](screenshots/battle.png)

### Game Over
![Game Over](screenshots/game-over.png)

> **To add screenshots:** drop `home.png`, `team-builder.png`, `battle.png`, and `game-over.png` into a `screenshots/` folder at the root of the repo.

---

## What it does

- **Quick Random Battle** — one tap generates two random teams and drops you straight into a fight
- **Team Builder** — search any Pokemon by name (including regional forms like "Hisuian Zoroark"), pick up to 6, assign 4 moves each
- **Random Teams** — roll random Gen 1–3 teams with random moves; re-roll or save ones you like
- **Live Battles** — pass-and-play turn-based battles with real damage calculation, type effectiveness, STAB, and crits
- **Switching** — voluntary switches cost a turn (Gen 2+ rules); knock-outs switch for free; pivot moves (U-turn, Volt Switch, Flip Turn) deal damage then switch
- **Status Conditions** — burn, poison, badly poisoned, paralysis, sleep, freeze, and confusion all behave as in the main games
- **Weather** — Sunny Day, Rain Dance, Sandstorm, and Hail with damage boosts, weaknesses, and end-of-turn chip
- **Type Chart** — shows effectiveness before you pick a move
- **Save After Battle** — if you loved your random team, save it right from the game-over screen
- **Battle History** — log of past battles and winners

---

## Running locally

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Battle rules

- All Pokemon battle at **level 50**
- Damage formula: `((2L/5 + 2) × Power × Atk/Def) / 50 + 2`
- **STAB**: 1.5×
- **Type effectiveness**: standard Gen 9 chart (0×, 0.5×, 1×, 2×)
- **Critical hits**: 6.25% base chance, 1.5× damage
- **Random factor**: 85–100% per hit
- **Switching costs a turn** — faster Pokemon switches first; KO switches are free
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
- [Zustand](https://zustand-demo.pmnd.rs/) for state
- [PokeAPI](https://pokeapi.co/) for Pokemon data
- `localStorage` for team persistence

---

## Built by

Nick, Danny, Bobby, Gloria, and Claude
