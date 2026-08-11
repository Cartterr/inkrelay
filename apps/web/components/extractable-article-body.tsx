import Image from "next/image";

export function ExtractableArticleBody({
  articleHtml,
  assetAccessId,
  title,
}: {
  articleHtml: string;
  assetAccessId: string;
  title: string;
}) {
  return (
    <div className="reader-body">
      {/* Keeping the cover inside the body ensures server-side readers retain it. */}
      <Image
        className="reader-cover"
        src={`/assets/${encodeURIComponent(assetAccessId)}`}
        alt={`Editorial cover for ${title}`}
        width={1200}
        height={1600}
        priority
        unoptimized
      />
      <div
        className="reader-content"
        // This HTML passed Mozilla Readability and InkRelay's strict sanitize-html allowlist.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendering the already-sanitized article body is the purpose of this component.
        dangerouslySetInnerHTML={{ __html: articleHtml }}
      />
    </div>
  );
}
