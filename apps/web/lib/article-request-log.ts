import { hashIdentifier } from "@inkrelay/core";

export function buildArticleRequestLog(articleAccessId: string, userAgent: string | null) {
  return {
    event: "article.render",
    route: "article",
    articleHash: hashIdentifier(articleAccessId),
    userAgentHash: userAgent ? hashIdentifier(userAgent) : null,
    userAgentClass: classifyUserAgent(userAgent),
  };
}

function classifyUserAgent(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  if (/ktool/iu.test(userAgent)) return "ktool";
  if (/bot|crawler|spider/iu.test(userAgent)) return "crawler";
  if (/undici|axios|node/iu.test(userAgent)) return "server";
  if (/chrome|safari|firefox|edg/iu.test(userAgent)) return "browser";
  return "other";
}
