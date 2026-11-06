import { Suspense } from "react";
import Link from "next/link";
import { EXAMPLES } from "@/render/examples";
import { Lab } from "./Lab";
import styles from "../page.module.css";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** The situation lab: example auras with the situation controls, no addon loading needed. */
export default function LabPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Situation lab</h1>
        <nav aria-label="Examples" style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14 }}>
          {Object.keys(EXAMPLES).map((key) => (
            <Link key={key} href={`/lab?example=${key}`}>
              {key}
            </Link>
          ))}
        </nav>
      </header>
      <Suspense fallback={<p className={styles.status}>Loading…</p>}>
        <Example searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Example({ searchParams }: { searchParams: SearchParams }) {
  const requested = (await searchParams).example;
  const name = typeof requested === "string" && requested in EXAMPLES ? requested : Object.keys(EXAMPLES)[0];
  return <Lab key={name} name={name} />;
}
