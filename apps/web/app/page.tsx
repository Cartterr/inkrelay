import Link from "next/link";

import { auth, signIn } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <span className="brand-mark">INKRELAY</span>
        <a href="/health/live" className="system-link">
          System status
        </a>
      </nav>
      <section className="landing-hero">
        <p className="eyebrow">A PRIVATE EDITORIAL RELAY</p>
        <h1>Deep technical reading, composed for ink.</h1>
        <p className="landing-deck">
          Fifty-eight trusted sources. Ten distinct voices each week. Monochrome covers and
          complete, readable articles delivered through KTool to Kindle.
        </p>
        <div className="landing-actions">
          {session?.user ? (
            <Link className="button primary" href="/dashboard">
              Open control room
            </Link>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <button className="button primary" type="submit">
                Continue with GitHub
              </button>
            </form>
          )}
          <span>Restricted to the Cartterr GitHub account.</span>
        </div>
      </section>
      <section className="landing-principles">
        <div>
          <strong>58</strong>
          <span>fixed sources</span>
        </div>
        <div>
          <strong>10</strong>
          <span>articles weekly</span>
        </div>
        <div>
          <strong>3:4</strong>
          <span>Kindle cover ratio</span>
        </div>
        <div>
          <strong>90d</strong>
          <span>body retention</span>
        </div>
      </section>
    </main>
  );
}
