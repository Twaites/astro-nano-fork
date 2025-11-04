import { readFile, readdir } from "fs/promises";
import { execSync } from "child_process";
import matter from "gray-matter";
import { Search } from "@upstash/search";

// Constants
export const MAX_TOTAL = 4096;
export const SAFETY_BUFFER = 8;
export const CONTENT_DIRS = {
  BLOG: "./src/content/blog",
  PROJECTS: "./src/content/projects",
};

// Document schema:
// id: unique slug or slug#chunk
// content: {
//   t: Title (first chunk only)
//   d: Description (first chunk only)
//   c: Content type ("b" = blog, "p" = project)
//   b: Body/searchable text content
// }

/**
 * Initialize Upstash Search client and indexes
 */
export function initUpstashClient() {
  const client = new Search({
    url: process.env.UPSTASH_SEARCH_REST_URL,
    token: process.env.UPSTASH_SEARCH_REST_TOKEN,
  });

  return {
    client,
    searchIndex: client.index("content"),
    metaIndex: client.index("meta"),
  };
}

/**
 * Get the last git change timestamp for a file
 */
export function getLastGitChange(filePath) {
  try {
    return Number(execSync(`git log -1 --format="%ct" -- ${filePath}`).toString().trim());
  } catch {
    return 0;
  }
}

/**
 * Clean markdown text by removing code blocks, syntax, and normalizing whitespace
 */
export function cleanText(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[`*_#>~\-]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate the dynamic body limit for a chunk based on JSON overhead
 * @param {string} id - The actual document ID that will be used
 * @param {string} t - Title (empty for subsequent chunks)
 * @param {string} d - Description (empty for subsequent chunks)
 * @param {string} c - Content type ("b" or "p")
 */
export function calcDynamicBodyLimit({ id, t, d, c }) {
  const sample = {
    id,
    content: { t, d, c, b: "" },
  };
  const jsonOverhead = JSON.stringify(sample).length;
  return MAX_TOTAL - jsonOverhead - SAFETY_BUFFER;
}

/**
 * Split text into chunks by word boundaries
 * Ensures no words are broken across chunks
 */
export function splitIntoDynamicChunksByWords(text, firstChunkLimit, regularLimit) {
  const words = text.split(" ");
  const chunks = [];
  let currentChunk = "";
  let currentLimit = firstChunkLimit;

  for (const word of words) {
    // Check if adding this word would exceed the limit
    const wouldExceed = (currentChunk.length + word.length + 1) > currentLimit;
    
    if (wouldExceed && currentChunk.trim().length > 0) {
      // Push current chunk (without the word that would overflow)
      chunks.push(currentChunk.trim());
      // Start new chunk with this word
      currentChunk = word + " ";
      currentLimit = regularLimit;
    } else {
      // Add word to current chunk
      currentChunk += word + " ";
    }
  }
  // Push the last chunk if it has content
  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Create document objects from chunks for a markdown file
 */
export function createDocumentsFromChunks({ slug, title, description, contentType, chunks }) {
  return chunks.map((chunk, i) => {
    const body = chunk.trim();
    
    const doc = {
      id: i === 0 ? slug : `${slug}#${i + 1}`,
      content: {
        t: i === 0 ? title || "" : "",
        d: i === 0 ? description || "" : "",
        c: contentType,
        b: body,
      },
    };

    // Enforce byte-safe limit after serialization
    // If we exceed, trim by words to avoid breaking words
    const jsonLen = JSON.stringify(doc).length;
    if (jsonLen > MAX_TOTAL) {
      const overBy = jsonLen - MAX_TOTAL;
      const targetLength = Math.max(0, doc.content.b.length - overBy - SAFETY_BUFFER);
      
      // Trim by words, not characters, to avoid breaking words
      if (targetLength < doc.content.b.length) {
        const words = doc.content.b.split(" ");
        let trimmedBody = "";
        for (const word of words) {
          if ((trimmedBody.length + word.length + 1) <= targetLength) {
            trimmedBody += (trimmedBody ? " " : "") + word;
          } else {
            break;
          }
        }
        doc.content.b = trimmedBody.trim();
      }
    }

    return doc;
  });
}

/**
 * Process a single markdown file and return documents ready for indexing
 */
export async function processMarkdownFile(filePath, type) {
  const { data, content } = matter(await readFile(filePath, "utf8"));
  
  if (data.draft) {
    return null;
  }

  const cleaned = cleanText(content);
  const contentType = type === "blog" ? "b" : "p";
  const slug = data.slug;

  // Calculate limit for first chunk using actual slug ID
  const firstChunkId = slug;
  const firstChunkLimit = calcDynamicBodyLimit({
    id: firstChunkId,
    t: data.title || "",
    d: data.description || "",
    c: contentType,
  });

  // Calculate limit for subsequent chunks using first subsequent chunk ID format (slug#2)
  // IDs like slug#2, slug#3, slug#10 are all same or shorter length, so this is safe
  const subsequentChunkId = `${slug}#2`;
  const regularLimit = calcDynamicBodyLimit({
    id: subsequentChunkId,
    t: "",
    d: "",
    c: contentType,
  });

  const chunks = splitIntoDynamicChunksByWords(cleaned, firstChunkLimit, regularLimit);

  const docs = createDocumentsFromChunks({
    slug: data.slug,
    title: data.title || "",
    description: data.description || "",
    contentType,
    chunks,
  });

  return {
    file: filePath.split("/").pop(),
    slug: data.slug,
    chunks: chunks.length,
    documents: docs,
  };
}

/**
 * Get meta cache from Upstash
 */
export async function getMetaCache(metaIndex) {
  try {
    const res = await metaIndex.fetch(["__cache__"]);
    return res?.[0]?.metadata?.cache || {};
  } catch {
    return {};
  }
}

/**
 * Set meta cache in Upstash
 */
export async function setMetaCache(metaIndex, cache) {
  await metaIndex.upsert([
    {
      id: "__cache__",
      content: { updatedAt: Date.now() },
      metadata: { cache },
    },
  ]);
}

/**
 * Check if a file is a markdown file
 * @param {string} file - Filename to check
 * @returns {boolean} True if file is markdown
 */
export function isMarkdownFile(file) {
  return file.endsWith(".md") || file.endsWith(".mdx");
}

/**
 * Extract parent slug from document ID (removes chunk number suffix like #2, #3, etc.)
 * @param {string} docId - Document ID (e.g., "slug" or "slug#2")
 * @returns {string} Parent slug without chunk number
 */
export function getParentSlug(docId) {
  const hashIndex = docId.indexOf("#");
  return hashIndex === -1 ? docId : docId.substring(0, hashIndex);
}

/**
 * Build a cache object from already processed documents
 * Maps document IDs to their git commit timestamps
 * @param {Array} processedFiles - Array of { filePath, documents } objects
 * @returns {Object} Cache object with parent slug-> git timestamp mapping
 */
export function buildCacheFromProcessedFiles(processedFiles) {
  const cache = {};
  for (const { filePath, documents } of processedFiles) {
    const lastGitChange = getLastGitChange(filePath);
    // Only store the parent slug (first document is always the parent)
    if (documents.length > 0) {
      const parentSlug = getParentSlug(documents[0].id);
      cache[parentSlug] = lastGitChange;
    }
  }
  return cache;
}

/**
 * Build a cache object mapping parent slugs to their git commit timestamps
 * @param {string} dir - Directory path to process
 * @param {string} type - Content type ("blog" or "project")
 * @returns {Promise<Object>} Cache object with parent slug -> git timestamp mapping
 */
export async function buildCacheFromFiles(dir, type) {
  const cache = {};
  const files = await readdir(dir);

  for (const file of files) {
    if (!isMarkdownFile(file)) continue;

    const filePath = `${dir}/${file}`;
    const lastGitChange = getLastGitChange(filePath);
    const result = await processMarkdownFile(filePath, type);
    
    if (!result) continue; // Skip drafts

    // Only store the parent slug (first document is always the parent)
    if (result.documents.length > 0) {
      const parentSlug = getParentSlug(result.documents[0].id);
      cache[parentSlug] = lastGitChange;
    }
  }

  return cache;
}

