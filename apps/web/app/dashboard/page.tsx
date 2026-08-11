import { redirect } from "next/navigation";

import { selectWeeklyEdition } from "@inkrelay/core";
import { dashboardSnapshot } from "@inkrelay/db";

import { RotateFeedKey } from "@/components/rotate-feed-key";
import { auth, signOut } from "@/lib/auth";
import { database } from "@/lib/runtime";

import { enqueueArticleAction, updateOverride } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const snapshot = await dashboardSnapshot(database());
  const newestEdition = snapshot.editions[0];
  const healthyWorkers = snapshot.heartbeats.filter(
    (beat) => Date.now() - beat.lastSeenAt.valueOf() < 90_000,
  ).length;
  const preview = editionPreview(snapshot.candidates);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="brand-mark">INKRELAY / CONTROL ROOM</p>
          <h1>Weekly edition desk</h1>
          <p>Review depth, shape the mix, and keep the Kindle pipeline honest.</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="button ghost" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <section className="metric-grid" aria-label="System overview">
        <Metric
          label="Candidates"
          value={String(snapshot.candidates.length)}
          note="latest review window"
        />
        <Metric
          label="Next edition"
          value={newestEdition?.id ?? "Not seeded"}
          note={newestEdition?.deliveryStatus ?? newestEdition?.status ?? "waiting for candidates"}
        />
        <Metric label="Workers" value={String(healthyWorkers)} note="heartbeats under 90 seconds" />
        <Metric label="Source policy" value="58 fixed" note="no automatic expansion" />
      </section>

      <section className="panel edition-panel">
        <div>
          <p className="eyebrow">Access control</p>
          <h2>Private publication access</h2>
          <p>
            Direct Kindle delivery sends one image-rich EPUB per selected article. Protected feeds
            and the combined EPUB remain available as reversible compatibility paths.
          </p>
        </div>
        <RotateFeedKey />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live preview</p>
            <h2>Provisional ten</h2>
          </div>
          <span className="quiet">Recomputed from current scores and overrides</span>
        </div>
        {preview.ok ? (
          <ol className="preview-grid">
            {preview.items.map((item) => (
              <li key={item.articleId}>
                <span>{item.category}</span>
                <strong>{item.title}</strong>
                <small>
                  {item.sourceName} · {item.score}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <div className="edition-alert">
            <strong>Edition would fail closed</strong>
            <span>{preview.reason}</span>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Candidate review</p>
            <h2>Editorial queue</h2>
          </div>
          <span className="quiet">One source per edition · normally three per category</span>
        </div>
        <div className="candidate-list">
          {snapshot.candidates.map((candidate) => (
            <article className="candidate" key={candidate.articleId}>
              <div className="candidate-score">
                <span>{candidate.score ?? "—"}</span>
                <small>score</small>
              </div>
              <div className="candidate-copy">
                <div className="candidate-kicker">
                  <span>{candidate.sourceCategory}</span>
                  <span>{candidate.sourceName}</span>
                  <span className={`status ${candidate.status}`}>{candidate.status}</span>
                </div>
                <h3>{candidate.title}</h3>
                <p>{candidate.explanation ?? "Awaiting evaluation."}</p>
              </div>
              <div className="candidate-actions">
                <form action={updateOverride}>
                  <input type="hidden" name="articleId" value={candidate.articleId} />
                  <label>
                    Editorial override
                    <select name="mode" defaultValue={candidate.override ?? "none"}>
                      <option value="none">Automatic</option>
                      <option value="promote">Promote</option>
                      <option value="lock">Lock</option>
                      <option value="suppress">Suppress</option>
                    </select>
                  </label>
                  <button className="button compact" type="submit">
                    Apply
                  </button>
                </form>
                <form action={enqueueArticleAction} className="job-actions">
                  <input type="hidden" name="articleId" value={candidate.articleId} />
                  <button name="job" value="extract-article" type="submit">
                    Retry extraction
                  </button>
                  <button name="job" value="evaluate-article" type="submit">
                    Re-evaluate
                  </button>
                  <button name="job" value="generate-cover" type="submit">
                    Regenerate cover
                  </button>
                </form>
              </div>
            </article>
          ))}
          {snapshot.candidates.length === 0 ? (
            <div className="empty-state">
              The first hourly ingestion run will populate this desk.
            </div>
          ) : null}
        </div>
      </section>

      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Edition history</h2>
          </div>
          <div className="timeline">
            {snapshot.editions.map((edition) => (
              <div key={edition.id}>
                <strong>{edition.id}</strong>
                <span>
                  {edition.status} · Kindle {edition.deliveryStatus ?? "not configured"}
                </span>
                <time>
                  {edition.scheduledAt.toLocaleString("en-US", { timeZone: "America/Santiago" })}
                </time>
                {edition.failureReason ? <p>{edition.failureReason}</p> : null}
                {edition.deliveryErrorCode ? <p>{edition.deliveryErrorCode}</p> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Audit trail</h2>
          </div>
          <div className="timeline audit">
            {snapshot.audit.map((event) => (
              <div key={event.id}>
                <strong>{event.action}</strong>
                <span>{event.actorLogin}</span>
                <time>{event.createdAt.toLocaleString("en-US")}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function editionPreview(candidates: Awaited<ReturnType<typeof dashboardSnapshot>>["candidates"]) {
  const eligible = candidates.filter(
    (candidate) => candidate.status === "complete" && candidate.score !== null,
  );
  try {
    const edition = selectWeeklyEdition(
      eligible.map((candidate) => ({
        articleId: candidate.articleId,
        sourceId: candidate.sourceId,
        category: candidate.sourceCategory,
        score: candidate.score as number,
        publishedAt: candidate.publishedAt?.toISOString() ?? new Date(0).toISOString(),
        duplicateKey: candidate.duplicateKey,
        override: candidate.override ?? "none",
      })),
      { editionId: "preview", publishedAt: new Date().toISOString() },
    );
    const lookup = new Map(candidates.map((candidate) => [candidate.articleId, candidate]));
    return {
      ok: true as const,
      items: edition.selections.map((selection) => ({
        ...selection,
        ...lookup.get(selection.articleId),
      })),
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : "Insufficient candidates",
    };
  }
}
