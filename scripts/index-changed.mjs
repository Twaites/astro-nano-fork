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
} from "./indexing-utils.mjs";

// Initialize Upstash Search client and indexes
const { searchIndex, metaIndex } = initUpstashClient();

/**
 * Process a directory of markdown files and index only changed files
 * @param {string} dir - Directory path to process
 * @param {string} type - Content type ("blog" or "project")
 * @param {Object} metaCache - Current cache of file timestamps
 * @param {Object} newCache - Cache to update with new timestamps
 */
async function processDir(dir, type, metaCache, newCache) {
  const files = await readdir(dir);

  for (const file of files) {
    // Only process markdown files
    if (!file.endsWith(".md") && !file.endsWith(".mdx")) continue;

    const filePath = `${dir}/${file}`;
    
    // Get the last git commit timestamp for this file
    const lastGitChange = getLastGitChange(filePath);
    // Get the timestamp when this file was last indexed (from cache)
    const lastIndexed = metaCache[file] || -1;

    // Skip if file hasn't changed since last indexing
    if (lastGitChange <= lastIndexed) {
      console.log(`No changes in ${file}`);
      continue;
    }

    // Process the markdown file (parse, clean, chunk, create documents)
    const result = await processMarkdownFile(filePath, type);
    if (!result) {
      // File is a draft, skip it
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    console.log(`Indexing ${result.file} (${result.chunks} chunk${result.chunks > 1 ? "s" : ""})`);
    
    // Upload each document chunk to Upstash Search
    for (const doc of result.documents) {
      await searchIndex.upsert([doc]);
    }

    // Update cache with the new timestamp for this file
    newCache[file] = lastGitChange;
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
