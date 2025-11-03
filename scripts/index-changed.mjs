/**
 * Incremental Indexing Script
 * 
 * This script indexes only markdown files that have changed since the last run.
 * It uses git timestamps to detect changes and skips files that haven't been modified.
 * More efficient than full reindexing for regular updates.
 */

import "dotenv/config";
import { readdir } from "fs/promises";
import {
  initUpstashClient,
  getLastGitChange,
  getMetaCache,
  setMetaCache,
  processMarkdownFile,
  isMarkdownFile,
} from "./indexing-utils.mjs";

// Initialize Upstash Search client and indexes
const { searchIndex, metaIndex } = initUpstashClient();

/**
 * Process a directory of markdown files and index only changed files
 * @param {string} dir - Directory path to process
 * @param {string} type - Content type ("blog" or "project")
 * @param {Object} metaCache - Current cache of document ID timestamps
 * @param {Object} newCache - Cache to update with new timestamps
 */
async function processDir(dir, type, metaCache, newCache) {
  const files = await readdir(dir);

  for (const file of files) {
    if (!isMarkdownFile(file)) continue;

    const filePath = `${dir}/${file}`;
    const lastGitChange = getLastGitChange(filePath);
    const result = await processMarkdownFile(filePath, type);
    
    if (!result) {
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    // Check if any document ID from this file has changed
    // Compare git timestamp with the cached timestamp for the first document ID (slug)
    const firstDocId = result.documents[0].id;
    const lastIndexed = metaCache[firstDocId] || -1;

    // Skip if file hasn't changed since last indexing
    if (lastGitChange <= lastIndexed) {
      console.log(`No changes in ${file}`);
      // Still copy existing cache entries for this file's document IDs
      for (const doc of result.documents) {
        if (metaCache[doc.id]) {
          newCache[doc.id] = metaCache[doc.id];
        }
      }
      continue;
    }

    console.log(`Indexing ${result.file} (${result.chunks} chunk${result.chunks > 1 ? "s" : ""})`);
    
    // Batch upload all documents for this file
    await searchIndex.upsert(result.documents);
    
    // Update cache with git timestamp for each document ID
    for (const doc of result.documents) {
      newCache[doc.id] = lastGitChange;
    }
  }
}

/**
 * Main execution: Incremental indexing workflow
 */
(async () => {
  console.log("Starting incremental indexing...");

  // Load the existing cache of file timestamps
  const metaCache = await getMetaCache(metaIndex);
  // Create a new cache object, copying existing timestamps
  const newCache = { ...metaCache };

  // Process blog and project directories
  await processDir("./src/content/blog", "blog", metaCache, newCache);
  await processDir("./src/content/projects", "project", metaCache, newCache);

  // Save the updated cache back to Upstash
  await setMetaCache(metaIndex, newCache);
  console.log("Incremental indexing complete.");
})();
