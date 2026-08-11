"use client";

import { useState } from "react";

export function RotateFeedKey() {
  const [key, setKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    if (
      !window.confirm("Rotate the private feed key? The previous key remains valid for 24 hours.")
    )
      return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/admin/rotate-feed-key", { method: "POST" });
    const body = (await response.json()) as { key?: string; error?: string };
    setPending(false);
    if (!response.ok || !body.key) {
      setError(body.error ?? "Rotation failed");
      return;
    }
    setKey(body.key);
  }

  return (
    <div className="key-rotation">
      <button className="button secondary" type="button" onClick={rotate} disabled={pending}>
        {pending ? "Rotating…" : "Rotate feed access"}
      </button>
      {error ? <p className="inline-error">{error}</p> : null}
      {key ? (
        <div className="one-time-key" role="status">
          <strong>Copy now — shown once</strong>
          <code>{key}</code>
          <span>The previous key stays valid for 24 hours.</span>
        </div>
      ) : null}
    </div>
  );
}
