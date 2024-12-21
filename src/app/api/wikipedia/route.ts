import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { PriorityQueue } from "@/lib/PriorityQueue";
import * as cheerio from "cheerio";
export const maxDuration = 60

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);
const embeddingCache = new Map();
const linkCache = new Map();

interface wikipediaRes {
  batchcomplete: string;
  query: {
    normalized: { from: string | null; to: string }[];
    pages: {
      [key: string]: {
        missing?: undefined;
        pageid: number;
        ns: number;
        title: string;
        links: {
          ns: number;
          title: string;
        }[];
      };
    };
  };
  limits: {
    links: number;
  };
}

// cachces all embeddings and returns the cachced result
async function getEmbedding(word : string) {
  if (embeddingCache.has(word)) {
    return embeddingCache.get(word);
  }
  const output = await extractor(word, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);
  embeddingCache.set(word, vector);
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
  return dotProduct / (magnitude1 * magnitude2);
}

// compares 2 words using the feature extraction pipeline and cosine similarity
async function compareTwoWords(word1: string, word2: string) {
  const vec1 = await getEmbedding(word1);
  const vec2 = await getEmbedding(word2);
  return cosineSimilarity(vec1, vec2);
}

// extract links from the HTML content of a Wikipedia page
async function getLinksFromHTML(title: string) {
  if (linkCache.get(title) != null) {
    return linkCache.get(title);
  }
  try {
    // extract the HTML content from wikipedia
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
        title
      )}&format=json&origin=*`
    );
    const data = await response.json();

    if (data.error) {
      console.error("Error fetching the page:", data.error);
      return null;
    }
    const htmlContent: string = data.parse.text["*"];

    //use cheerio to parse html and collect links up until references
    const $ = cheerio.load(htmlContent);
    const wikiLinks: { href: string; text: string }[] = [];
    let reachedReferences = false;

    $("*").each((index, element) => {
      if (
        $(element).is("h2") &&
        $(element).attr("id") == "References" 
      ) {
        reachedReferences = true;
        return false;
      }

      if (!reachedReferences) {
        let href = $(element).attr("href");
        const text = $(element).text();
        if (
          href &&
          !href.startsWith("/wiki/File:") &&
          !href.startsWith("/wiki/Portal:") &&
          !href.startsWith("/wiki/Category:") &&
          !href.startsWith("/wiki/Wikipedia:") && 
          !href.startsWith("/wiki/Special:") && 
          !href.startsWith("/wiki/Help:") && 
          !href.startsWith("/wiki/Template:") && 
          href.startsWith("/wiki")
        ) {
          // store href and the inner text of the <a> tag
          wikiLinks.push({
            href: decodeURIComponent(href.replace(/_/g, " ").substring(6)), // Cleaning up href
            text: text.trim() // removestext between <a> and </a>
          });
        }
      }
    });

    linkCache.set(title, wikiLinks);
    return wikiLinks;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

// async generator function to find the path between two words
async function* pathFinderIterator(startWord : string, endWord : string) {
  // check start and target titles to make sure they exist
  const link1 = await fetch(`https://en.wikipedia.org/wiki/${startWord}`);
  const link2 = await fetch(`https://en.wikipedia.org/wiki/${endWord}`);

  if (!link1.ok || !link2.ok) {
    yield JSON.stringify({ error: "Given one or more invalid wikipedia title"});
    return;
  }

  const visited = new Set<string>();
  const priorityQueue = new PriorityQueue<{ word: string; path: { href: string, text: string }[] }>();
  priorityQueue.enqueue(
    { word: startWord, path: [{ href: startWord, text: startWord }] },
    0
  );

  const startTime = Date.now();

  while (!priorityQueue.isEmpty()) {
    const { word: currentWord, path: currentPath } = priorityQueue.dequeue()!;
    if (visited.has(currentWord)) continue;
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    // check if the elapsed time exceeds maxDuration
    if (parseFloat(elapsedTime) > maxDuration) {
      yield JSON.stringify({ error: "Exceeded maximum duration" });
      return;
    }

    // stream current path when updated
    yield JSON.stringify({ path: currentPath, time: elapsedTime});

    visited.add(currentWord);

    if (currentWord.toLowerCase() === endWord.toLowerCase()) {
      return;
    }

    const links = await getLinksFromHTML(currentWord);

    if (links !== null) {
      for (const linkObj of links) {
        const { href, text } = linkObj;
        if (visited.has(href)) continue;
        const similarity = await compareTwoWords(href, endWord);

        const newPath = [...currentPath, {href,text}];
        priorityQueue.enqueue({ word: href, path: newPath }, similarity);
      }
    }
  }

  throw new Error(
    "No path to target page found. The target may not be reachable."
  );
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
