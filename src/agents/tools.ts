/**
 * MCP tool registration for Agent SDK.
 *
 * Registers search and fetch tools as in-process MCP servers
 * that the Agent SDK can call during query(). Each tool catches
 * errors and returns them as text content rather than throwing.
 *
 * Ported from spike-yntk/src/tools/mcp-server.ts.
 * The actual search/fetch adapters are inlined here to avoid
 * cross-project dependencies.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";

// Re-export the McpServer type for use in runtime.ts
export type McpServer = ReturnType<typeof createSdkMcpServer>;

// ---------------------------------------------------------------------------
// Search adapter types
// ---------------------------------------------------------------------------

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
}

interface SearchResponse {
  source: "kagi" | "brave";
  query: string;
  results: SearchResult[];
}

interface FetchResponse {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Kagi Search adapter
// ---------------------------------------------------------------------------

async function kagiSearch(
  query: string,
  limit?: number,
): Promise<SearchResponse> {
  const apiKey = process.env.KAGI_API_KEY;
  if (!apiKey) {
    throw new Error("KAGI_API_KEY environment variable is not set.");
  }

  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set("limit", String(limit));

  const response = await fetch(
    `https://kagi.com/api/v0/search?${params.toString()}`,
    { headers: { Authorization: `Bot ${apiKey}` } },
  );

  if (!response.ok) {
    throw new Error(`Kagi API returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    meta: { api_balance?: number };
    data: Array<{
      t: number;
      url?: string;
      title?: string;
      snippet?: string;
      published?: string;
    }>;
    error?: Array<{ code: number; msg: string }> | null;
  };

  if (body.error && body.error.length > 0) {
    throw new Error(
      `Kagi API error: ${body.error.map((e) => `[${e.code}] ${e.msg}`).join("; ")}`,
    );
  }

  if (body.meta?.api_balance !== undefined) {
    console.log(`[kagi] API balance: $${body.meta.api_balance.toFixed(2)}`);
  }

  const results: SearchResult[] = (body.data || [])
    .filter((item) => item.t === 0 && item.url && item.title)
    .map((item) => ({
      title: item.title!,
      url: item.url!,
      snippet: item.snippet ?? "",
      ...(item.published ? { published: item.published } : {}),
    }));

  return { source: "kagi", query, results };
}

// ---------------------------------------------------------------------------
// Brave Search adapter
// ---------------------------------------------------------------------------

async function braveSearch(
  query: string,
  count?: number,
  freshness?: string,
): Promise<SearchResponse> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY environment variable is not set.");
  }

  const params = new URLSearchParams({ q: query });
  if (count !== undefined) params.set("count", String(count));
  if (freshness) params.set("freshness", freshness);

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
    {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    },
  );

  if (response.status === 429) {
    throw new Error("Brave API rate limit exceeded (429).");
  }
  if (!response.ok) {
    throw new Error(`Brave API returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string; page_age?: string }> };
  };

  const results: SearchResult[] = (body.web?.results || [])
    .filter((item) => item.url && item.title)
    .map((item) => ({
      title: item.title!,
      url: item.url!,
      snippet: item.description ?? "",
      ...(item.page_age ? { published: item.page_age } : {}),
    }));

  return { source: "brave", query, results };
}

// ---------------------------------------------------------------------------
// Page fetch adapter
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPage(
  url: string,
  maxLength: number = 8000,
): Promise<FetchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Fetch timed out after 10s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Fetch failed with HTTP ${response.status}: ${url}`);
  }

  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  let text = htmlToText(html);
  const truncated = text.length > maxLength;
  if (truncated) text = text.slice(0, maxLength);

  return { url, title, text, truncated };
}

// ---------------------------------------------------------------------------
// Parallel search
// ---------------------------------------------------------------------------

async function searchAll(
  query: string,
  limit?: number,
): Promise<SearchResponse[]> {
  const hasKagi = !!process.env.KAGI_API_KEY;
  const hasBrave = !!process.env.BRAVE_SEARCH_API_KEY;

  if (!hasKagi && !hasBrave) {
    console.warn("[searchAll] No search API keys set.");
    return [];
  }

  const tasks: Array<Promise<SearchResponse | null>> = [];

  if (hasKagi) {
    tasks.push(
      kagiSearch(query, limit).catch((err) => {
        console.error(`[searchAll] Kagi failed: ${(err as Error).message}`);
        return null;
      }),
    );
  }

  if (hasBrave) {
    tasks.push(
      braveSearch(query, limit).catch((err) => {
        console.error(`[searchAll] Brave failed: ${(err as Error).message}`);
        return null;
      }),
    );
  }

  const settled = await Promise.all(tasks);
  return settled.filter((r): r is SearchResponse => r !== null);
}

// ---------------------------------------------------------------------------
// MCP Tool Definitions
// ---------------------------------------------------------------------------

export const kagiSearchTool = tool(
  "kagi_search",
  "Search the web using Kagi. Returns ranked results with titles, URLs, and snippets. Costs $0.025/search.",
  {
    query: z.string().describe("Search query string"),
    limit: z.number().optional().describe("Max results to return"),
  },
  async (args) => {
    try {
      const response = await kagiSearch(args.query, args.limit);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `kagi_search error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

export const braveSearchTool = tool(
  "brave_search",
  "Search the web using Brave. Returns ranked results with titles, URLs, and snippets.",
  {
    query: z.string().describe("Search query string"),
    count: z.number().optional().describe("Number of results (default 10, max 20)"),
    freshness: z
      .string()
      .optional()
      .describe("Time filter: 'pd' (past day), 'pw' (past week), 'pm' (past month)"),
  },
  async (args) => {
    try {
      const response = await braveSearch(args.query, args.count, args.freshness);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `brave_search error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

export const fetchPageTool = tool(
  "fetch_page",
  "Fetch a URL and return its content as plain text. Strips HTML, respects a max character limit.",
  {
    url: z.string().describe("URL to fetch"),
    maxLength: z
      .number()
      .optional()
      .describe("Max characters to return (default 8000)"),
  },
  async (args) => {
    try {
      const response = await fetchPage(args.url, args.maxLength);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `fetch_page error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

export const searchAllTool = tool(
  "search_all",
  "Run all available search backends (Kagi + Brave) in parallel. Gracefully skips backends with missing API keys.",
  {
    query: z.string().describe("Search query string"),
    limit: z.number().optional().describe("Max results per backend"),
  },
  async (args) => {
    try {
      const responses = await searchAll(args.query, args.limit);
      return {
        content: [{ type: "text", text: JSON.stringify(responses, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `search_all error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Collected tools and MCP server factory
// ---------------------------------------------------------------------------

export const allTools = [
  kagiSearchTool,
  braveSearchTool,
  fetchPageTool,
  searchAllTool,
];

/** Create the MCP server instance for agent query() calls. */
export function createResearchServer(): McpServer {
  return createSdkMcpServer({
    name: "ontologies-research",
    version: "1.0.0",
    tools: allTools,
  });
}
