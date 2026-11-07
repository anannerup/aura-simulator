import Link from "next/link";
import { GAMES, UPCOMING_GAMES } from "@/games";
import styles from "./GamePicker.module.css";

/** `/`: the game picker, shown on every visit. Each game is its own site at `/<game>`. */
export default function GamePicker() {
  return (
    <main className={styles.picker}>
      <h1 className={styles.title}>Aura Simulator</h1>
      <p className={styles.lead}>Which game are you building auras for?</p>
      <ul className={styles.games} aria-label="Games">
        {GAMES.map((game) => (
          <li key={game.id}>
            <Link href={`/${game.id}`} className={styles.game}>
              <span className={styles.name}>{game.name}</span>
              <span className={styles.addon}>{game.addon.name}</span>
            </Link>
          </li>
        ))}
        {UPCOMING_GAMES.map((game) => (
          <li key={game.id}>
            <span className={styles.game} aria-disabled="true">
              <span className={styles.name}>{game.name}</span>
              <span className={styles.addon}>{game.addonName} · coming soon</span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
