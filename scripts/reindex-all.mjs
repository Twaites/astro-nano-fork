/**
 * Full Reindex Script
 * 
 * This script performs a complete reindex of all markdown files.
 * It clears the existing search index and rebuilds it from scratch.
 * Use this when you need to reset the index or after major changes.
 */

import "dotenv/config";
import { readdir } from "fs/promises";
import {
  initUpstashClient,
  setMetaCache,
  processMarkdownFile,
} from "./indexing-utils.mjs";

// Initialize Upstash Search client and indexes
const { searchIndex, metaIndex } = initUpstashClient();

/**
 * Gather all documents from a directory for indexing
 * @param {string} dir - Directory path to process
 * @param {string} type - Content type ("blog" or "project")
 * @returns {Promise<Array>} Array of all document objects ready for indexing
 */
async function gatherDocs(dir, type) {
  const allDocs = [];
  const files = await readdir(dir);

  for (const file of files) {
    // Only process markdown files
    if (!file.endsWith(".md") && !file.endsWith(".mdx")) continue;

    const filePath = `${dir}/${file}`;
    
    // Process the markdown file (parse, clean, chunk, create documents)
    const result = await processMarkdownFile(filePath, type);
    
    if (!result) {
      // File is a draft, skip it
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    console.log(`Prepared ${result.file} (${result.chunks} chunk${result.chunks > 1 ? "s" : ""})`);
    
    // Add all document chunks to the collection
    allDocs.push(...result.documents);
  }

  return allDocs;
}

/**
 * Perform a full reindex of all content
 */
async function runFullReindex() {
  console.log("Starting full reindex...");

  // Clear the existing search index
  try {
    console.log("Clearing existing index...");
    await searchIndex.reset();
  } catch (err) {
    console.warn("Reset not supported, continuing...");
  }

  // Gather all documents from both blog and project directories
  const allDocs = [
    ...(await gatherDocs("./src/content/blog", "blog")),
    ...(await gatherDocs("./src/content/projects", "project")),
  ];

  // Upload all documents in a single batch operation
  console.log(`Total chunks to index: ${allDocs.length}`);
  await searchIndex.upsert(allDocs);

  // Rebuild the meta cache with all document IDs and current timestamp
  const cache = {};
  for (const doc of allDocs) {
    cache[doc.id] = Date.now();
  }

  // Save the new cache to Upstash
  await setMetaCache(metaIndex, cache);
  console.log("Full reindex complete.");
}

// Run the full reindex process
runFullReindex().catch((err) => console.error("Error:", err));
