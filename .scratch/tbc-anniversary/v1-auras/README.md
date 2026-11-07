# TBC v1 auras (ticket 08; checked in game in ticket 09)

Each `.txt` holds one import string: open it, copy everything, paste it into WeakAuras' Import box on TBC
Anniversary. Each `.json` is the same aura as wago JSON (drop it on the simulator's page at `/tbc`). All of them pass
WeakAuras 5.22.1's own import and validation with no errors or warnings, and the simulator's situation evaluation
does what the table says (`tests/unit/tbc-v1-auras.test.ts`, which also checks these files; the documents are in
`src/games/tbc/examples.ts`, and `/tbc/docs/agents` shows them as worked examples).

| File | What it should do | Spell |
|---|---|---|
| `1a buff under 3 min` | Arcane Intellect icon, shown only while under 3 minutes are left, desaturated, glowing in its last 30 s; its time text turns red under 10 s | Arcane Intellect or Arcane Brilliance, any rank (matched by name) |
| `1b buff missing` | Arcane Intellect icon, desaturated and glowing, shown only while you have neither buff | same |
| `2 cooldown icon` | Fire Blast's icon, always shown, greyed out while on cooldown, with the game's countdown | Fire Blast (27079, rank 9; the trigger follows the highest rank you know). A mage spell: pick one of yours in the Trigger tab |
| `3 target debuff bar` | Bar with the time left of your own Corruption on your target, name left, time right, the time red under 5 s | Corruption (matched by name, own casts only) |
| `4 v1 group` | One group with all four | |

All of them use the regular Aura trigger (`aura2`) or the spell cooldown trigger: TBC Anniversary has no combat
restrictions, so they behave the same in and out of combat. Check in and out of combat anyway, and note anything that
differs from the simulator's game screen.
