import Fuse from "fuse.js";
// @ts-ignore
import DOMPurify from "dompurify";
import { createEffect, createSignal, onMount } from "solid-js";

export default function SearchLogic() {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<ContentItem[]>([]);

  interface ContentItem {
    i: number;
    c: string;
    s: string;
    t: string;
    d: string;
  }

  interface WordMap {
    [key: string]: number[];
  }

  interface SearchData {
    wordMap: WordMap;
    content: ContentItem[];
  }

  interface FuzzyData {
    word: string;
    id: number[];
  }

  let FUSE_SEARCH: Fuse<FuzzyData> | null = null;
  let FUZZY_SEARCH_DATA: FuzzyData[];
  let SEARCH_DATA: SearchData = {
    wordMap: {},
    content: [],
  };

  const options = {
    keys: [{ name: "word"}],
    includeScore: true,
    threshold: 0.2
  };

  function getMapValue(m: Map<number, number>, k: number): number {
    return m.get(k) || 0;
  }

  async function searchContent(query: string): Promise<ContentItem[]> {
    if (!FUSE_SEARCH) {
      FUSE_SEARCH = new Fuse(FUZZY_SEARCH_DATA, options);
    }
    const words = query.split(" ");
    const idCount = new Map<number, number>();

    for (const word of words) {
      const matchedIds = SEARCH_DATA.wordMap[word.toLowerCase()];
      if (matchedIds) {
        matchedIds.forEach((id) =>
          idCount.set(id, getMapValue(idCount, id) + 1)
        );
      } else {
        const fuzzyResults = FUSE_SEARCH.search(word, { limit: 2 });
        fuzzyResults.forEach((res) => {
          res.item.id.forEach((id) => {
            idCount.set(id, getMapValue(idCount, id) + (res?.score || 0));
          });
        });
      }
    }

    const sortedIds = Array.from(idCount.entries()).sort((a, b) => b[1] - a[1]);

    return sortedIds.map(([id]) => SEARCH_DATA.content[id]);
  }

  async function fetchSearchResults(
    searchText: string
  ): Promise<ContentItem[]> {
    try {
      if (SEARCH_DATA.content.length === 0) {
        const res = await fetch("/search.json");
        if (!res.ok) return [];

        SEARCH_DATA = await res.json();
        FUZZY_SEARCH_DATA = Object.entries(SEARCH_DATA.wordMap).map(
          ([word, id]) => ({
            word,
            id,
          })
        );
      }

      if (searchText.length > 2) {
        return await searchContent(searchText);
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  createEffect(async () => {
    if (searchQuery().length < 2) {
      setSearchResults([]);
    } else {
      setSearchResults(await fetchSearchResults(searchQuery()));
    }
  });

  function updateSearchResults(queryText: string) {
    const searchText = DOMPurify.sanitize(queryText);
    setSearchQuery(searchText);
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const searchText = params.get("") || "";
    if (searchText) {
      updateSearchResults(searchText);
    }
  });

  const onInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    updateSearchResults(target.value);
  };

  const onResultClick = (searchText: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("", searchText);
    window.history.pushState({}, '', url);
  };

  return (
    <div>
      <div>
        <input
          id="search"
          name="search"
          type="search"
          placeholder="What are you looking for?"
          required
          min="2"
          max="48"
          value={searchQuery()}
          onInput={onInput}
          class="w-full px-1.5 py-1 rounded outline-none text-black dark:text-white bg-slate-200/50 dark:bg-slate-400/15 border border-black/25 dark:border-white/30 focus:border-black focus:dark:border-white placeholder-gray-500 dark:placeholder-gray-300"
        />
      </div>
      <div>
        <p class="flex flex-col mt-5">
          {searchQuery().length === 0
            ? ""
            : searchQuery().length > 0 && searchQuery().length < 3
            ? "Enter at least 3 letters for the search."
            : `Search results for "${searchQuery()}"`}
        </p>
        <ul class="flex flex-col mt-6">
          {searchQuery().length > 2 && searchResults().length === 0 ? (
            <li>No results found.</li>
          ) : (
            searchResults().map((result) => (
              <li>
                <a
                  href={`/${result.c === "b" ? "blog" : "projects"}/${result.s}`}
                  class="relative group flex flex-nowrap py-3 px-4 pr-10 mb-4 rounded-lg border border-black/35 text-gray-700 dark:text-gray-200 dark:border-white/20 hover:bg-slate-900/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors duration-300 ease-in-out"
                  onClick={() => onResultClick(searchQuery())}
                >
                  <div class="flex flex-col flex-1 truncate">
                    <div class="font-semibold">{result.t}</div>
                    <div class="text-sm">{result.d}</div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    class="absolute top-1/2 right-2 -translate-y-1/2 size-5 stroke-2 fill-none stroke-current"
                  >
                    <line
                      x1="5"
                      y1="12"
                      x2="19"
                      y2="12"
                      class="translate-x-3 group-hover:translate-x-0 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ease-in-out"
                    />
                    <polyline
                      points="12 5 19 12 12 19"
                      class="-translate-x-1 group-hover:translate-x-0 transition-transform duration-300 ease-in-out"
                    />
                  </svg>
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
