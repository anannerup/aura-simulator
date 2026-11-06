import Link from "next/link";
import { Workbench } from "./Workbench";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Aura Simulator</h1>
        <p>
          Preview Musca Auras auras and copy their import string. Agents: <Link href="/docs/agents">docs</Link>.
        </p>
      </header>
      <Workbench />
    </main>
  );
}
