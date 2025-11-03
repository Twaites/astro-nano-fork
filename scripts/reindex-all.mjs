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
  buildCacheFromProcessedFiles,
  processMarkdownFile,
  isMarkdownFile,
  CONTENT_DIRS,
} from "./indexing-utils.mjs";

// Initialize Upstash Search client and indexes
const { searchIndex, metaIndex } = initUpstashClient();

/**
 * Gather all documents from a directory for indexing
 * @param {string} dir - Directory path to process
 * @param {string} type - Content type ("blog" or "project")
 * @returns {Promise<Object>} Object with documents array and processedFiles array for cache building
 */
async function gatherDocs(dir, type) {
  const allDocs = [];
  const processedFiles = [];
  const files = await readdir(dir);

  for (const file of files) {
    if (!isMarkdownFile(file)) continue;

    const filePath = `${dir}/${file}`;
    const result = await processMarkdownFile(filePath, type);
    
    if (!result) {
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    console.log(`Prepared ${result.file} (${result.chunks} chunk${result.chunks > 1 ? "s" : ""})`);
    
    // Add all document chunks to the collection
    allDocs.push(...result.documents);
    
    // Store for cache building (avoid re-processing files)
    processedFiles.push({
      filePath,
      documents: result.documents,
    });
  }

  return { documents: allDocs, processedFiles };
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
  const blogData = await gatherDocs(CONTENT_DIRS.BLOG, "blog");
  const projectData = await gatherDocs(CONTENT_DIRS.PROJECTS, "project");
  
  const allDocs = [...blogData.documents, ...projectData.documents];
  const allProcessedFiles = [...blogData.processedFiles, ...projectData.processedFiles];

  // Upload all documents in a single batch operation
  console.log(`Total chunks to index: ${allDocs.length}`);
  await searchIndex.upsert(allDocs);

  // Rebuild the meta cache from already processed files (no re-processing needed!)
  const cache = buildCacheFromProcessedFiles(allProcessedFiles);

  // Save the new cache to Upstash
  await setMetaCache(metaIndex, cache);
  console.log("Full reindex complete.");
}

// Run the full reindex process
runFullReindex().catch((err) => console.error("Error:", err));
