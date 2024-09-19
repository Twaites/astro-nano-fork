import { getCollection } from "astro:content";
import { remark } from "remark";
import strip from "strip-markdown";

async function getBlogAndProjectContent() {
  let count = -1;
  const blogSearchData = (await getCollection("blog")).filter(
    (content) => !content.data.draft
  );

  const projectSearchData = (await getCollection("projects")).filter(
    (content) => !content.data.draft
  );

  return [...blogSearchData, ...projectSearchData]
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .map((content) => ({
      id: (count += 1),
      type: content.collection,
      slug: content.slug,
      title: content.data.title,
      description: content.data.description,
      searchText:
        content.body + " " + content.data.description + " " + content.data.title
    }));
}

async function markDownCleaner(text: string) {
  const markdownFreeText = await remark().use(strip).process(text);
  const cleanedText = String(markdownFreeText)
    .replace(/[^\w\s]|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleanedText;
}

async function wordProcessor(searchText: string) {
  let uniqueWords = new Set<string>();
  if (searchText || searchText.length != 0) {
    const wordArr = searchText.split(" ");
    wordArr.map((word) => {
      const formatted_word = word.toLowerCase();
      if (!uniqueWords.has(formatted_word) && formatted_word.length > 2) {
        uniqueWords.add(formatted_word);
      }
    });
  }
  return uniqueWords;
}

function mapToJson(map: Map<string, Set<number>>): object {
  const obj: { [key: string]: number[] } = {};

  map.forEach((value, key) => {
    obj[key] = Array.from(value);
  });

  return obj;
}

async function getSearchJson() {
  const blogAndProjectData = await getBlogAndProjectContent();
  var wordMapping = new Map<string, Set<number>>();
  try {
    await Promise.all(
      blogAndProjectData.map(async (data) => {
        const cleanWordData = await markDownCleaner(data.searchText);
        const cleanWordArr = await wordProcessor(cleanWordData);

        for (const word of cleanWordArr) {
          if (!wordMapping.has(word)) {
            wordMapping.set(word, new Set<number>());
          }
          wordMapping.get(word)?.add(data.id);
        }
      })
    );

    return JSON.stringify({
      wordMap: mapToJson(wordMapping),
      content: blogAndProjectData.map((data) => ({
        i: data.id,
        c: data.type[0], // b - blog, p - project
        s: data.slug,
        t: data.title,
        d: data.description,
      }))
    });
  } catch (e) {
    //console.error(e);
    return;
  }
}

export async function GET({}) {
  return new Response(await getSearchJson(), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
