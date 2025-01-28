import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { PriorityQueue } from "@/lib/PriorityQueue";
import { getLinks, Link } from "@/lib/db";

interface WikiPage {
  pageid: number;
  ns: number;
  title: string;
}

interface WikiResponse {
  query: {
    pages: {
      [key: string]: WikiPage;
    };
  };
}

enum Model {
  MiniLM = "Xenova/all-MiniLM-L6-v2",
  GIST = "Xenova/GIST-small-Embedding-v0",
  MedEmbed = "Romelianism/MedEmbed-small-v0.1",
}

const maxDuration = 60;
const linkCache = new Map();

async function createExtractor(model: Model) {
  return await pipeline("feature-extraction", model);
}

// cachces all embeddings and returns the cachced result
async function getEmbedding(
  word: string,
  extractor: any,
  embeddingCache: Map<string, number[]>
) {
  if (embeddingCache.has(word)) {
    return embeddingCache.get(word);
  }
  // use xenova pipeline to compute the embedding
  const output = await extractor(word, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data as number[]);
  embeddingCache.set(word, vector);

  return vector;
}

// convert an async iterator to a readable stream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        // close controller once iteration is complete
        controller.close();
      } else {
        // send JSON-serialized object as text chunk with newline delimiter
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
async function compareTwoWords(
  word1: string,
  word2: string,
  extractor: any,
  embeddingCache: Map<string, number[]>
) {
  const vec1 = await getEmbedding(word1, extractor, embeddingCache);
  const vec2 = await getEmbedding(word2, extractor, embeddingCache);

  if (!vec1 || !vec2) {
    throw new Error("Embedding not found for one or both words");
  }

  return cosineSimilarity(vec1, vec2);
}

// extract links from local database
async function getLinksFromDB(title: string) {
  if (linkCache.get(title) != null) {
    return linkCache.get(title);
  }

  // retrieve links from database
  const links = await getLinks(title);
  if (links.length === 0) {
    console.error("No links found for:", title);
    return null;
  }

  const formattedLinks = links.map((link) => ({
    href: link.to_page,
    text: link.anchor,
    origin: title,
  }));

  //cache and track total DB fetch time
  linkCache.set(title, formattedLinks);

  return formattedLinks;
}

// Utility function to capitalize the first letter of a string
function capitalizeFirstLetter(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// async generator function to find the path between two words
async function* pathFinderIterator(
  startWord: string,
  endWord: string,
  extractor: any,
  embeddingCache: Map<string, number[]>
) {
  // check start and target titles to make sure they exist
  startWord = capitalizeFirstLetter(startWord);
  endWord = capitalizeFirstLetter(endWord);

  // First, get the redirected URLs
  const response1 = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      startWord
    )}&redirects=true&format=json`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    }
  );
  const response2 = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      endWord
    )}&redirects=true&format=json`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    }
  );

  const data1 = (await response1.json()) as WikiResponse;
  const data2 = (await response2.json()) as WikiResponse;

  // extract the normalized/redirected titles
  const pages1 = data1.query.pages;
  const pages2 = data2.query.pages;

  // Wikipedia API uses -1 as key for missing pages
  const isPage1Missing = Object.keys(pages1)[0] === "-1";
  const isPage2Missing = Object.keys(pages2)[0] === "-1";

  // check if valid pages
  if (isPage1Missing || isPage2Missing) {
    yield JSON.stringify({
      error: `Invalid Wikipedia title${
        isPage1Missing && isPage2Missing ? "s" : ""
      }: ${isPage1Missing ? startWord : ""}${
        isPage1Missing && isPage2Missing ? " and " : ""
      }${isPage2Missing ? endWord : ""}`,
    });
    return;
  }

  // set start and end word to be normalized/redirected titles
  startWord = Object.values(pages1)[0]?.title || "";
  endWord = Object.values(pages2)[0]?.title || "";

  console.log(startWord, " ", endWord);

  // keep track of visited pages to avoid loops
  const visited = new Set<string>();

  // priority queue ordered by similarity score, initialize with start word
  const priorityQueue = new PriorityQueue<{
    word: string;
    path: { href: string; text: string; origin: string }[];
  }>();
  priorityQueue.enqueue(
    {
      word: startWord,
      path: [{ href: startWord, text: startWord, origin: "" }],
    },
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

    // yield current path to client as partial progress (may remove)
    yield JSON.stringify({ path: currentPath, time: elapsedTime });
    visited.add(currentWord);

    if (currentWord.toLowerCase() === endWord.toLowerCase()) {
      yield JSON.stringify({
        path: currentPath,
        time: elapsedTime,
        finished: true,
      });
      return;
    }

    const links = await getLinksFromDB(currentWord);

    if (links !== null) {
      for (const linkObj of links) {
        const { href, text } = linkObj;
        if (visited.has(href)) continue;

        const similarity = await compareTwoWords(href, endWord, extractor, embeddingCache);
        const newPath = [...currentPath, { href, text, origin: currentWord }];

        // clean the path to remove redundant origins
        const cleanedPath = cleanPath(newPath);
        priorityQueue.enqueue({ word: href, path: cleanedPath }, similarity);
      }
    }
  }

  throw new Error(
    "No path to target page found. The target may not be reachable."
  );
}

// remove loops from a path by cutting off repeated origins
function cleanPath(path: { href: string; text: string; origin: string }[]) {
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
      // record first occurence of this origin
      visitedOrigins.set(node.origin, cleanedPath.length);

      // Add the current node to the cleaned path
      cleanedPath.push(node);
    }
  }

  // if no repeated origin, keep entire path
  return cleanedPath;
}

// runs pathFinderIterator both ways, yields fastest path to return
async function* biDirectionalPathFinder(
  startWord: string,
  endWord: string,
  extractor: any,
  embeddingCache: Map<string, number[]>
) {
  const forward = pathFinderIterator(
    startWord,
    endWord,
    extractor,
    embeddingCache
  );
  const backward = pathFinderIterator(
    endWord,
    startWord,
    extractor,
    embeddingCache
  );
  let forwardFinished = false;
  let backwardFinished = false;

  while (true) {
    // Run both updates concurrently
    const [forwardResult, backwardResult] = await Promise.all([
      forward.next(),
      backward.next(),
    ]);

    // get forward update
    if (!forwardResult.done) {
      const forwardData = JSON.parse(forwardResult.value);
      yield JSON.stringify({
        direction: "forward",
        ...forwardData,
      });

      if (forwardData.finished) {
        forwardFinished = true;
      }
    }

    // get backward update
    if (!backwardResult.done) {
      const backwardData = JSON.parse(backwardResult.value);
      yield JSON.stringify({
        direction: "backward",
        ...backwardData,
      });

      if (backwardData.finished) {
        backwardFinished = true;
      }
    }

    if (backwardFinished && forwardFinished) {
      return;
    }
    // both sides ended without finding a path
    if (forwardResult.done && backwardResult.done) {
      throw new Error("No path found.");
    }
  }
}

// GET endpoint to run bidirectional path finder and streams response back
export async function GET(req: NextRequest) {
  const startWord = req.nextUrl.searchParams.get("startWord");
  const endWord = req.nextUrl.searchParams.get("endWord");
  const modelParam = req.nextUrl.searchParams.get("model");
  let model: Model | null = null;

  switch (modelParam) {
    case "0":
      model = Model.MiniLM;
      break;
    case "1":
      model = Model.GIST;
      break;
    case "2":
      model = Model.MedEmbed;
      break;
    default:
      return new NextResponse(
        JSON.stringify({ error: "Invalid model parameter" }),
        {
          status: 400,
        }
      );
  }

  if (startWord === null || endWord === null) {
    return new NextResponse(
      JSON.stringify({ Error: "Title or target word missing" }),
      {
        status: 400,
      }
    );
  }
  const embeddingCache = new Map<string, number[]>();

  try {
    const extractor = await createExtractor(model);
    const iterator = biDirectionalPathFinder(startWord, endWord, extractor,embeddingCache);
    const stream = iteratorToStream(iterator);

    // return streamed response
    return new Response(stream, {
      headers: {
        // "Content-Type": "application/json",
        // use this to prevent cloudflare tunnel from buffering response
        "Content-Type": "text/event-stream",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Error calling API", error);
    return NextResponse.json({
      message: "Failed to fetch data from Wikipedia",
    });
  }
}
