import { createSignal, Show, For, onMount, createEffect, onCleanup } from "solid-js";

interface SearchResult {
  id: string;
  content: {
    t?: string; // title
    d?: string; // description
    c?: string; // content type (b/p)
  };
}

export default function SemanticSearch() {
  const [query, setQuery] = createSignal("");
  const [searchedQuery, setSearchedQuery] = createSignal(""); // Only updates when search is performed
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [hasSearched, setHasSearched] = createSignal(false);
  const [searchingDots, setSearchingDots] = createSignal(1);

  async function performSearch() {
    const q = query().trim();
    if (q.length < 2) {
      setResults([]);
      setError("Enter at least 2 characters to search.");
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    setSearchedQuery(q); // Store the query that was actually searched
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/search-api?q=" + encodeURIComponent(q));
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const grouped = new Map<string, SearchResult>();
      for (const r of data.results || []) {
        const baseId = r.id.split("#")[0];
        if (!grouped.has(baseId)) {
          grouped.set(baseId, r);
        } else {
          const existing = grouped.get(baseId)!;
          if (!existing.content.t && r.content.t) existing.content.t = r.content.t;
          if (!existing.content.d && r.content.d) existing.content.d = r.content.d;
        }
      }

      setResults([...grouped.values()]);
      updateURL(q);
    } catch (err) {
      console.error("Search error:", err);
      setError("Error fetching search results.");
    } finally {
      setLoading(false);
    }
  }

  function updateURL(q: string) {
    const url = new URL(window.location.href);
    if (q) {
      url.searchParams.set("", q);
    } else {
      url.searchParams.delete("");
    }
    window.history.replaceState({}, "", url.toString());
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    performSearch();
  }

  // Animate "Searching." -> "Searching.." -> "Searching..."
  createEffect(() => {
    if (!loading()) {
      setSearchingDots(1);
      return;
    }

    const interval = setInterval(() => {
      setSearchingDots((prev) => (prev >= 3 ? 1 : prev + 1));
    }, 300);
    
    onCleanup(() => clearInterval(interval));
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const searchQuery = params.get("")?.trim();
    if (searchQuery && searchQuery.length >= 2) {
      setQuery(searchQuery);
      performSearch();
    }
  });

  return (
    <div>
      <form onSubmit={handleSubmit} class="flex flex-row gap-2 items-center">
        <input
          id="search"
          name="search"
          type="search"
          placeholder="What are you looking for?"
          required
          minLength={2}
          maxLength={48}
          value={query()}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          class="w-full px-1.5 py-1 rounded outline-none text-black dark:text-white bg-slate-200/50 dark:bg-slate-400/15 border border-black/25 dark:border-white/30 focus:border-black focus:dark:border-white placeholder-gray-500 dark:placeholder-gray-300"
        />
        <button
          type="submit"
          class="px-4 py-1 rounded bg-black text-white dark:bg-white dark:text-black font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          Search
        </button>
      </form>

      <div>
        <Show when={loading()}>
          <p class="text-gray-500 dark:text-gray-400 mt-4">
            Searching{Array(searchingDots()).fill(".").join("")}
          </p>
        </Show>

        <Show when={error()}>
          <p class="text-red-600 dark:text-red-400 mt-4">{error()}</p>
        </Show>

        <Show when={hasSearched() && !loading() && searchedQuery().length >= 2}>
          <p class="flex flex-col mt-5">
            {`Search results for "${searchedQuery()}"`}
          </p>
        </Show>

        <Show when={hasSearched()}>
          <ul class="flex flex-col mt-6">
            <For each={results()}>
              {(r) => (
                <li>
                  <a
                    href={`/${r.content.c === "b" ? "blog" : "projects"}/${r.id.split("#")[0]}`}
                    class="relative group flex flex-nowrap py-3 px-4 pr-10 mb-4 rounded-lg border border-black/35 text-gray-700 dark:text-gray-200 dark:border-white/20 hover:bg-slate-900/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors duration-300 ease-in-out"
                  >
                    <div class="flex flex-col flex-1 truncate">
                      <div class="font-semibold">{r.content.t}</div>
                      <div class="text-sm">{r.content.d}</div>
                    </div>
                  </a>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={!loading() && hasSearched() && results().length === 0 && !error()}>
          <p class="text-gray-500 dark:text-gray-400 mt-4">No results found.</p>
        </Show>
      </div>
    </div>
  );
}
