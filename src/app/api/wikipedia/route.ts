import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { PriorityQueue } from "@/lib/PriorityQueue";
import { getLinks , Link } from "@/lib/db";

const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const maxDuration = 60
const embeddingCache = new Map();
const linkCache = new Map();
let embeddingTime = 0;
let cosineTime = 0;
let compareTwoWordsTime = 0;
let getLinksFromHTMLTime = 0;
let cleanPathTime = 0

// cachces all embeddings and returns the cachced result
async function getEmbedding(word : string) {
  const startTime = Date.now();
  
  if (embeddingCache.has(word)) {
    return embeddingCache.get(word);
  }
  const output = await extractor(word, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);
  embeddingCache.set(word, vector);
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  embeddingTime += parseFloat(elapsedTime);
  return vector;
}

// convert an async iterator to a readable stream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        const jsonObject = JSON.stringify(value);
        controller.enqueue(new TextEncoder().encode(jsonObject + "\n"));
      }
    },
  });
}

// calculate the cosine similarity between two vectors
function cosineSimilarity(vec1: number[], vec2: number[]) {
  const startTime = Date.now();
  const dotProduct = vec1.reduce(
    (sum: any, val: any, i: any) => sum + val * vec2[i],
    0
  );
  const magnitude1 = Math.sqrt(
    vec1.reduce((sum: any, val: any) => sum + val * val, 0)
  );
  const magnitude2 = Math.sqrt(
    vec2.reduce((sum: any, val: any) => sum + val * val, 0)
  );
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  cosineTime += parseFloat(elapsedTime);
  return dotProduct / (magnitude1 * magnitude2);
}

// compares 2 words using the feature extraction pipeline and cosine similarity
async function compareTwoWords(word1: string, word2: string) {
  const startTime = Date.now();
  const vec1 = await getEmbedding(word1);
  const vec2 = await getEmbedding(word2);
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  compareTwoWordsTime += parseFloat(elapsedTime);
  return cosineSimilarity(vec1, vec2);
}

// extract links from local database
async function getLinksFromDB(title: string) {
  const startTime = Date.now();

  if (linkCache.get(title) != null) {
      return linkCache.get(title);
  }

  const links  = getLinks(title);
  if (links.length === 0) {
      console.error('No links found for:', title);
      return null;
  }

  const formattedLinks = links.map(link => ({
      href: link.to_page,
      text: link.anchor,
      origin: title
  }));

  linkCache.set(title, formattedLinks);
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  getLinksFromHTMLTime += parseFloat(elapsedTime);
  return formattedLinks;
}

// Utility function to capitalize the first letter of a string
function capitalizeFirstLetter(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}


// async generator function to find the path between two words
async function* pathFinderIterator(startWord : string, endWord : string) {
  // check start and target titles to make sure they exist
  startWord = capitalizeFirstLetter(startWord);
  endWord = capitalizeFirstLetter(endWord);
  
  const link1 = await fetch(`https://en.wikipedia.org/wiki/${startWord}`);
  const link2 = await fetch(`https://en.wikipedia.org/wiki/${endWord}`);

  if (!link1.ok || !link2.ok) {
    yield JSON.stringify({ error: "Given one or more invalid wikipedia title"});
    return;
  }

  const visited = new Set<string>();

  const priorityQueue = new PriorityQueue<{ word: string; path: { href: string, text: string, origin: string }[]}>();
  priorityQueue.enqueue(
    { word: startWord, path: [{ href: startWord, text: startWord, origin: ""}]},
    0
  );

  const startTime = Date.now();

  while (!priorityQueue.isEmpty()) {
    const { word: currentWord, path: currentPath } = priorityQueue.dequeue()!;
    if (visited.has(currentWord)) continue;
  
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    if (parseFloat(elapsedTime) > maxDuration) {
      yield JSON.stringify({ error: "Exceeded maximum duration" });
      return;
    }
  
    yield JSON.stringify({ path: currentPath, time: elapsedTime });
  
    visited.add(currentWord);
  
    if (currentWord.toLowerCase() === endWord.toLowerCase()) {
      console.log("All times\nEmbedding time: " + embeddingTime + " seconds\nCosine similarity time: " + cosineTime + " seconds\nCompare two words time: " + compareTwoWordsTime + " seconds\nGet links from HTML time: " + getLinksFromHTMLTime + " seconds\nClean path time: " + cleanPathTime + " seconds");
      return;
    }
  
    const links = await getLinksFromDB(currentWord);
  
    if (links !== null) {
      for (const linkObj of links) {
        const { href, text } = linkObj;
        if (visited.has(href)) continue;
      
        const similarity = await compareTwoWords(href, endWord);
        const newPath = [...currentPath, { href, text, origin: currentWord }];
        const cleanedPath = cleanPath(newPath); // clean the path to remove redundant origins
        priorityQueue.enqueue({ word: href, path: cleanedPath }, similarity);
      }
    }
  }

  throw new Error(
    "No path to target page found. The target may not be reachable."
  );
}

function cleanPath(path: { href: string; text: string; origin: string }[]) {
  const startTime = Date.now();
  const visitedOrigins = new Map<string, number>();
  const cleanedPath: { href: string; text: string; origin: string }[] = [];

  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    if (visitedOrigins.has(node.origin)) {
      // Remove all nodes between the first occurrence and now
      const startIndex = visitedOrigins.get(node.origin)!;
      // Keep all nodes up to the first occurrence of the repeated origin
      return path.slice(0, startIndex + 1);
    } else {
      visitedOrigins.set(node.origin, cleanedPath.length);
      cleanedPath.push(node); // Add the current node to the cleaned path
    }
  }
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  cleanPathTime += parseFloat(elapsedTime);
  return cleanedPath;
}


export async function GET(req: NextRequest) {
  const startWord = req.nextUrl.searchParams.get("startWord");
  const endWord = req.nextUrl.searchParams.get("endWord");
  if (startWord === null || endWord === null) {
    return new NextResponse(
      JSON.stringify({ Error: "Title or target word missing" }),
      {
        status: 400,
      }
    );
  }
  try {
    const iterator = pathFinderIterator(startWord, endWord);
    const stream = iteratorToStream(iterator);
    return new Response(stream, {
      headers: {
        // "Content-Type": "application/json",
        // use this to prevent cloudflare tunnel from buffering response
        "Content-Type": "text/event-stream", 
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Error calling API", error);
    return NextResponse.json({
      message: "Failed to fetch data from Wikipedia",
    });
  }
}
