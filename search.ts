/**
 * Server-side web search tool.
 *
 * Default: DuckDuckGo Instant Answer API, no key required, limited results.
 * Optional: Tavily or Brave Search when API keys are provided.
 *
 * Environment:
 *   SEARCH_PROVIDER=duckduckgo | tavily | brave
 *   TAVILY_API_KEY=...
 *   BRAVE_SEARCH_API_KEY=...
 */

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

export type SearchResponse = {
  query: string;
  provider: "duckduckgo" | "tavily" | "brave";
  results: SearchResult[];
};

export async function runWebSearch(query: string, limit = 5): Promise<SearchResponse> {
  const cleaned = normalizeQuery(query);
  const provider = pickProvider();

  if (provider === "tavily") return tavilySearch(cleaned, limit);
  if (provider === "brave") return braveSearch(cleaned, limit);
  return duckDuckGoSearch(cleaned, limit);
}

export function looksLikeResearchRequest(text: string): boolean {
  return /\b(research|search|look up|lookup|find sources?|cite|citation|current|latest|news|compare|web|internet)\b/i.test(text);
}

export function extractSearchQuery(text: string): string {
  return normalizeQuery(
    text
      .replace(/\b(can you|please|could you|help me)\b/gi, " ")
      .replace(/\b(research|search|look up|lookup|find sources?|cite|citation|on the web|using the internet)\b/gi, " ")
  );
}

export function formatSearchAnswer(search: SearchResponse): string {
  if (search.results.length === 0) {
    return [
      `**Research mode** — I searched the web for: \`${search.query}\`.`,
      ``,
      `I did not find useful results from the configured provider (${search.provider}). Try a more specific query or set \`SEARCH_PROVIDER=tavily\` or \`SEARCH_PROVIDER=brave\` with an API key.`,
    ].join("\n");
  }

  const bullets = search.results.map((r, i) => {
    const snippet = r.snippet ? ` — ${r.snippet}` : "";
    return `${i + 1}. [${escapeMarkdown(r.title)}](${r.url})${snippet}`;
  });

  return [
    `**Research mode** — searched the web for: \`${search.query}\`.`,
    ``,
    `Top results from ${search.provider}:`,
    ``,
    ...bullets,
    ``,
    `Direct take: use these as starting sources, not final truth. If you want, ask me to turn these into a cited brief or comparison table.`,
  ].join("\n");
}

function pickProvider(): SearchResponse["provider"] {
  const requested = (process.env.SEARCH_PROVIDER ?? "").toLowerCase();
  if (requested === "tavily" && process.env.TAVILY_API_KEY) return "tavily";
  if (requested === "brave" && process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  return "duckduckgo";
}

function normalizeQuery(q: string): string {
  return (q ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300) || "general research";
}

async function tavilySearch(query: string, limit: number): Promise<SearchResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) throw new Error(`Tavily search failed: ${res.status}`);
  const data = (await res.json()) as any;
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    query,
    provider: "tavily",
    results: results.slice(0, limit).map((r: any) => ({
      title: String(r.title ?? r.url ?? "Untitled"),
      url: String(r.url ?? ""),
      snippet: String(r.content ?? ""),
      source: hostFromUrl(String(r.url ?? "")),
    })).filter((r: SearchResult) => r.url),
  };
}

async function braveSearch(query: string, limit: number): Promise<SearchResponse> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(limit, 10)));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? "",
    },
  });

  if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
  const data = (await res.json()) as any;
  const results = Array.isArray(data.web?.results) ? data.web.results : [];
  return {
    query,
    provider: "brave",
    results: results.slice(0, limit).map((r: any) => ({
      title: String(r.title ?? r.url ?? "Untitled"),
      url: String(r.url ?? ""),
      snippet: stripHtml(String(r.description ?? "")),
      source: hostFromUrl(String(r.url ?? "")),
    })).filter((r: SearchResult) => r.url),
  };
}

async function duckDuckGoSearch(query: string, limit: number): Promise<SearchResponse> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`DuckDuckGo search failed: ${res.status}`);
  const data = (await res.json()) as any;
  const results: SearchResult[] = [];

  if (data.AbstractURL && data.AbstractText) {
    results.push({
      title: String(data.Heading || data.AbstractSource || data.AbstractURL),
      url: String(data.AbstractURL),
      snippet: String(data.AbstractText),
      source: String(data.AbstractSource || hostFromUrl(data.AbstractURL)),
    });
  }

  for (const topic of flattenRelatedTopics(data.RelatedTopics ?? [])) {
    if (results.length >= limit) break;
    if (!topic.FirstURL || !topic.Text) continue;
    results.push({
      title: String(topic.Text).split(" - ")[0].slice(0, 100),
      url: String(topic.FirstURL),
      snippet: String(topic.Text),
      source: hostFromUrl(String(topic.FirstURL)),
    });
  }

  if (results.length < limit) {
    const htmlResults = await duckDuckGoHtmlSearch(query, limit - results.length);
    for (const result of htmlResults) {
      if (results.some((r) => r.url === result.url)) continue;
      results.push(result);
      if (results.length >= limit) break;
    }
  }

  return { query, provider: "duckduckgo", results: results.slice(0, limit) };
}

async function duckDuckGoHtmlSearch(query: string, limit: number): Promise<SearchResult[]> {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 CommandAgent/1.0",
      accept: "text/html",
    },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const results: SearchResult[] = [];
  const blocks = html.split(/<div class="result results_links[^"]*"/i).slice(1);

  for (const block of blocks) {
    if (results.length >= limit) break;
    const hrefMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!hrefMatch) continue;

    const url = decodeDuckDuckGoUrl(decodeHtml(hrefMatch[1]));
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = decodeHtml(stripHtml(snippetMatch?.[1] ?? snippetMatch?.[2] ?? ""));

    results.push({
      title: decodeHtml(stripHtml(hrefMatch[2])),
      url,
      snippet,
      source: hostFromUrl(url),
    });
  }

  return results;
}

function flattenRelatedTopics(items: any[]): any[] {
  const out: any[] = [];
  for (const item of items) {
    if (Array.isArray(item.Topics)) out.push(...flattenRelatedTopics(item.Topics));
    else out.push(item);
  }
  return out;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\[\]])/g, "\\$1");
}

function decodeDuckDuckGoUrl(url: string): string {
  try {
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    const parsed = new URL(normalized);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : normalized;
  } catch {
    return url;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
