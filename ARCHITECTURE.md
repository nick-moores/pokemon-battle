# Architecture

A plain-English map of how Pokemon Family Battle is built. For how to play and run it, see [README.md](README.md).

---

## 1. Stack & Trade-offs

| Tool | Job here | Why it beat the obvious alternative |
|---|---|---|
| **React 18** | Draws every screen and re-draws when battle data changes | A battle changes many things at once (HP, status, PP, log). Describing the UI from state is far less error-prone than hand-editing the page. |
| **TypeScript** | Describes the shape of a Pokemon, move, team and battle in [src/types.ts](src/types.ts) | The battle engine passes the same objects through dozens of functions; types catch a missing field before the game runs. |
| **Zustand** | Holds the two shared data stores (teams, battle) | Lighter than Redux, and any screen can read just the slice it needs. React Context would re-render the whole battle screen on every change. |
| **Vite** | Dev server and production build | Instant reloads while editing. Create React App, the old default, is deprecated. |
| **Tailwind CSS** | Styling via class names in the components | No separate stylesheet to keep in sync; only used classes ship. |
| **PokeAPI** (free public API) | Pokemon stats, sprites, moves, abilities | No database to host. The cost is that the app depends on a third-party service being up. |
| **localStorage** (via Zustand `persist`) | Saves teams and battle history in the browser | No server, accounts or hosting cost. The cost is that data never leaves one browser on one device. |
| **Vercel** | Hosting | Every push to `main` on GitHub deploys automatically. The app is static files, so the free tier is plenty. |

**What's deliberately missing:** no backend, no database, no router library, no login. Screens switch through one `useState` in [src/App.tsx](src/App.tsx), which is enough for five screens and keeps navigation in one place.

---

## 2. End-to-End Data Flow

There are three kinds of data, living in three places:

1. **Pokemon facts** (base stats, sprites, move lists) come from PokeAPI. [src/hooks/usePokeAPI.ts](src/hooks/usePokeAPI.ts) fetches them and keeps an in-memory cache, so the same Pokemon is only downloaded once per page load.
2. **Your teams** live in `teamStore`, saved to localStorage under the key `pokemon-teams`. Each saved Pokemon is a full copy of its PokeAPI data plus your choices (moves, ability, item, shiny).
3. **The live battle** lives in `battleStore`. Only the *history* of finished battles is saved (key `pokemon-battle-state`); a battle in progress exists only in memory.

**Following one turn of a battle:**

1. **Start.** On the setup screen, `startBattle(team1, team2)` in `battleStore` copies both teams into battle form: stats scaled to level 50, full HP, full PP, no status.
2. **Player 1 picks a move.** The move button in `BattleScreen.tsx` calls `selectMove(1, move)`. The store just remembers the choice and changes the phase to `team2-move`. Nothing happens yet, so player 2 can't see what was picked.
3. **Player 2 picks a move.** `selectMove(2, move)` now has both choices and calls `runTurn`, which:
   - handles any switches first, then decides who moves first (Speed, Tailwind, Trick Room);
   - calls `runOneTurn` for each side, which calls `executeMove`. That handles accuracy, invulnerability (Fly/Dig), status moves, weather and screens, then asks [src/utils/damage.ts](src/utils/damage.ts) `calculateDamage` for the number;
   - applies end-of-turn effects (burn and poison ticks, weather chip, Leftovers, Future Sight);
   - checks for faints and decides the next phase: back to `team1-move`, a forced switch, or `game-over`.
4. **One write.** All of that is built up in local variables, then saved with a single `set({ battle: ... })` call, along with the new battle-log lines.
5. **Re-render.** React sees the new `battle` object; HP bars, the log box and move buttons update.
6. **Game over.** A `BattleRecord` is added to `history` (capped at 50), which is the only battle data that survives a refresh.

---

## 3. The Load-Bearing Files

| File | What it owns |
|---|---|
| [src/store/battleStore.ts](src/store/battleStore.ts) | **The rules engine.** Turn order, every move effect, status, weather, abilities, items, switching, fainting, win detection. About a quarter of all code in the app. |
| [src/utils/damage.ts](src/utils/damage.ts) | **The math.** The damage formula, STAB, type effectiveness, crits, stat stages, plus the breakdown shown under "?" in the battle log. Pure functions, no state. |
| [src/types.ts](src/types.ts) | **The data contract.** What a Pokemon, move, team and battle look like. Change a shape here and TypeScript points at every file that needs updating. |
| [src/hooks/usePokeAPI.ts](src/hooks/usePokeAPI.ts) | **The only door to the outside world.** Turns raw PokeAPI JSON into the app's own `BasePokemon` and `Move` shapes, handles name search, and resolves shiny sprites. |
| [src/screens/BattleScreen.tsx](src/screens/BattleScreen.tsx) | **The battle UI.** Reads `battle` from the store and draws it; button clicks call store actions. It holds no game rules of its own. |

---

## 4. Where to Touch What

| I want to... | Open |
|---|---|
| Change how a screen looks | `src/screens/<Name>Screen.tsx`. Shared pieces (HP bar, move button, type badge, battle log) are in `src/components/`. |
| Add a new screen | Add it to the `Screen` type and render list in `src/App.tsx`, then pass it an `onBack`. |
| Change the damage formula or a multiplier | `calculateDamage` in `src/utils/damage.ts` (and `getDamageBreakdown` so the "?" panel matches). |
| Add or fix a special move (e.g. a new weather, screen or status move) | `executeMove` in `src/store/battleStore.ts`. Status moves are handled by name near the top of the `move.damageClass === 'status'` block. |
| Change turn order, switching or end-of-turn effects | `runTurn` (inside `useBattleStore`) and `applyEndOfTurnStatus` / `applyEndOfTurnAbilities` in `battleStore.ts`. |
| Add a held item | `src/data/heldItems.ts` for the list; its effect goes in `damage.ts` (damage items) or `battleStore.ts` (everything else). |
| Change type matchups | `src/data/typeChart.ts`. |
| Pull new data from PokeAPI (e.g. a new field) | Add the field to `src/types.ts`, then parse it in `fetchPokemon` or `fetchMove` in `src/hooks/usePokeAPI.ts`. |
| Change what gets saved or how teams are edited | `src/store/teamStore.ts`. |
| Add a battle music track | Put the MP3 in `public/` and add a line to `TRACKS` in `src/utils/battleMusic.ts`. Give it a unique `id`. |
| Change how random teams are generated | `generateRandomTeam` in `src/screens/BattleSetupScreen.tsx`. |

---

## Known Fragile Spots

- **Saved teams have no versioning.** Each saved Pokemon is a frozen copy of the data shape from the day it was saved. When a field is added (as with shiny sprites), older teams in someone's browser are missing it, and the code must fall back gracefully. A shape change that isn't handled this way will break old teams silently. The fix, if it starts to bite, is the `version` and `migrate` options on Zustand's `persist`.
- **`battleStore.ts` is the bottleneck.** It's 1,300+ lines, and `runTurn` ends in about seven separate `set({ battle: { ...battle, ... } })` calls, one per outcome. Field-wide values like weather and Trick Room are worked out in local variables during the turn. Any new value of that kind has to be added to every one of those calls; missing one silently keeps last turn's value.
- **Refreshing mid-battle ends the battle.** Live battles aren't saved, by design.
- **PokeAPI is a single point of failure** for team building and random teams. Battles already in progress don't need it.
