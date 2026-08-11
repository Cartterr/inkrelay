export function ExtractableArticleBody({
  articleHtml,
  coverUrl,
  heroCoverUrl,
  title,
}: {
  articleHtml: string;
  coverUrl: string;
  heroCoverUrl: string;
  title: string;
}) {
  const coverLabel = `Editorial cover for ${title}`;
  const coverMarkup = [
    `<img class="reader-cover-sentinel" src="${escapeHtml(heroCoverUrl)}" alt="" width="1200" height="1600" aria-hidden="true">`,
    '<figure class="reader-cover-figure">',
    `<img class="reader-cover" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(coverLabel)}" width="1200" height="1600">`,
    `<figcaption class="reader-cover-caption">${escapeHtml(coverLabel)}</figcaption>`,
    "</figure>",
  ].join("");

  return (
    <div className="reader-body">
      <div className="reader-content">
        <div
          className="reader-article-content"
          // This HTML passed Mozilla Readability and InkRelay's strict sanitize-html allowlist.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendering the already-sanitized article body is the purpose of this component.
          dangerouslySetInnerHTML={{ __html: `${coverMarkup}${articleHtml}` }}
        />
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
