import type { NextApiRequest, NextApiResponse } from "next";
import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { PriorityQueue } from "@/lib/PriorityQueue";

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);

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

async function compareTwoWords(word1: string, word2: string) {
  const output1 = await extractor(word1, { pooling: "mean", normalize: true });
  const output2 = await extractor(word2, { pooling: "mean", normalize: true });
  return cosineSimilarity(output1.data, output2.data);
}

async function getLinks(title: string) {
  try {
    const getResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=links&pllimit=max&format=json`
    );
    const data: wikipediaRes = await getResponse.json();

    const pageId: string = Object.keys(data.query.pages)[0];
    const page = data.query.pages[pageId];
    if (pageId === "-1" || page.missing !== undefined) {
      console.warn(`Page "${title}" is missing or does not exist.`);
      return [];
    }
    const links = page.links;
    const filteredLinks = links
      .filter((link) => link.ns === 0)
      .map((link) => link.title);

    return filteredLinks;
  } catch (error: any) {
    throw error;
  }
}

async function greedyBFS(
  startWord: string,
  targetWord: string,
): Promise<string[]> {
  const visited = new Set<string>(); // Set to keep track of visited pages
  const priorityQueue = new PriorityQueue<{ word: string; path: string[] }>();
  console.log(targetWord);
  priorityQueue.enqueue({ word: startWord, path: [startWord] }, 0);

  while (!priorityQueue.isEmpty()) {
    const { word: currentWord, path: currentPath } = priorityQueue.dequeue()!;
    if (visited.has(currentWord)) continue;
    
    visited.add(currentWord); // Marking the current page as visited
    console.log(`Current page: ${currentWord}`);

    if (currentWord.toLowerCase() === targetWord.toLowerCase()) {
      return currentPath;
    }
    
    const links = await getLinks(currentWord);
    for (const link of links) {
      if (visited.has(link)) continue; // Skip already visited links
      const similarity = await compareTwoWords(link, targetWord);
      
      const newPath = [...currentPath, link];
      priorityQueue.enqueue({ word: link, path: newPath }, similarity);
    }
  }

  throw new Error('No path to target page found. The target may not be reachable.');
}


export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title");
  const targetWord = req.nextUrl.searchParams.get("targetWord");
  if (title === null || targetWord === null) {
    return new NextResponse(JSON.stringify({ Error: "Title or target word missing" }), {
      status: 400,
    });
  }
  try {
    const result = await greedyBFS(title, targetWord);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error calling API", error);
    return NextResponse.json({
      message: "Failed to fetch data from Wikipedia",
    });
  }
}
