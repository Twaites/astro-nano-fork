import type { APIRoute } from "astro";
import { Search } from "@upstash/search";

/**
 * Type helper for Upstash document content.
 */
type SearchDocContent = {
  t?: string; // title
  d?: string; // description
  c?: string; // category/content type
  b?: string; // body/searchable text content
};

/**
 * Upstash Search client — using read-only token for safety
 */
const searchClient = new Search({
  url: import.meta.env.UPSTASH_SEARCH_REST_URL,
  token: import.meta.env.UPSTASH_SEARCH_REST_READONLY_TOKEN,
});

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const query = rawQuery.trim();

  // Early exit for empty or very short queries
  if (query.length < 2) {
    return jsonResponse({ results: [] });
  }

  try {
    const index = searchClient.index("content");
    const searchResults = await index.search({
      query,
      limit: 25,
    });

    if (!searchResults?.length) {
      return jsonResponse({ results: [] });
    }

    // STEP 1: Filter out very weak matches
    const validResults = searchResults.filter(
      (r) => typeof r.score === "number" && r.score >= 0.01
    );

    /**
     * Each parent slug accumulates all its chunk scores.
     */
    type AggregatedDoc = {
      id: string;
      totalScore: number;
      bestChunkScore: number;
      content: { t?: string; d?: string; c?: string };
      requiresParentFetch: boolean;
    };

    const aggregated = new Map<string, AggregatedDoc>();

    // STEP 2: Group and merge chunk data per slug
    for (const result of validResults) {
      const slug = result.id.split("#")[0];
      const score = result.score ?? 0;
      const content = result.content as SearchDocContent | undefined;

      if (!aggregated.has(slug)) {
        aggregated.set(slug, {
          id: slug,
          totalScore: 0,
          bestChunkScore: -Infinity,
          content: {},
          requiresParentFetch: true,
        });
      }

      const doc = aggregated.get(slug)!;
      doc.totalScore += score; // sum chunk scores

      // ✅ Update metadata from best scoring chunk
      if (score > doc.bestChunkScore) {
        doc.bestChunkScore = score;
        if (content?.t) doc.content.t = content.t;
        if (content?.d) doc.content.d = content.d;
        if (content?.c) doc.content.c = content.c;
      }

      // ✅ Skip parent fetch if title/description already present
      if (doc.content.t || doc.content.d) {
        doc.requiresParentFetch = false;
      }
    }

    // STEP 3: Fetch any missing parent metadata
    const slugsMissingParents = [...aggregated.entries()]
      .filter(([, doc]) => doc.requiresParentFetch)
      .map(([slug]) => slug);

    if (slugsMissingParents.length > 0) {
      const parentFetches = await Promise.allSettled(
        slugsMissingParents.map(async (slug) => {
          try {
            const res = await index.fetch([slug]);
            return { slug, content: res?.[0]?.content as SearchDocContent | null };
          } catch {
            return { slug, content: null };
          }
        })
      );

      for (const fetch of parentFetches) {
        if (fetch.status === "fulfilled" && fetch.value.content) {
          const parent = fetch.value.content;
          const doc = aggregated.get(fetch.value.slug);
          if (!doc) continue;

          doc.content.t ||= parent.t || "";
          doc.content.d ||= parent.d || "";
          doc.content.c ||= parent.c || doc.content.c || "";
        }
      }
    }

    // STEP 4: Build merged list and strip internal fields
    const finalResults = [...aggregated.values()]
      .map((doc) => ({
        id: doc.id,
        score: Number(doc.totalScore.toFixed(4)),
        content: {
          t: doc.content.t || "",
          d: doc.content.d || "",
          c: doc.content.c || "",
        },
      }))
      .sort((a, b) => b.score - a.score);

    return jsonResponse({ results: finalResults });
  } catch (err: any) {
    console.error("Smart Search API error:", err);
    return jsonResponse(
      {
        error: "Internal Server Error",
        details: err.message || String(err),
      },
      500
    );
  }
};

/**
 * Utility helper to keep responses consistent
 */
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
