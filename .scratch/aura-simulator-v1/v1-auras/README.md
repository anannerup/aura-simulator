# v1 auras for the in-game check (ticket 17)

Each `.txt` file holds one import string. Open it, copy everything, and paste it into
Musca Auras' Import box. All five pass the addon's own check as "Fully usable in combat"
in the simulator.

| File | What it should do | Spell |
|---|---|---|
| `1a buff under 3 min.txt` | Arcane Intellect icon, shown only when the buff has less than 3 minutes left, desaturated; time text turns red under 10 s | 1459 Arcane Intellect |
| `1b buff missing.txt` | Arcane Intellect icon, shown desaturated and glowing while you don't have the buff | 1459 |
| `2 cooldown icon.txt` | Spell icon that desaturates while the spell is on cooldown | 2136 Fire Blast (a mage spell: change it in the Trigger tab to one of yours) |
| `3 target debuff bar.txt` | Bar with the time left of your Corruption on your target | 172 Corruption |
| `4 v1 group.txt` | One group with all four | |

Check in and out of combat. Note anything that differs from the simulator's game screen.
