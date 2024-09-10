import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";
import { PriorityQueue } from "@/lib/PriorityQueue";
import * as cheerio from "cheerio";
export const maxDuration = 60

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
  const vec1 = Array.from(output1.data);
  const vec2 = Array.from(output2.data);
  return cosineSimilarity(vec1, vec2);
}

async function getLinksFromHTML(title: string) {
  try {
    // Extract the HTML content from wikipedia
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
          href.startsWith("/wiki")
        ) {
          // store href and the inner text of the <a> tag
          wikiLinks.push({
            href: decodeURIComponent(href.replace(/_/g, " ").substring(6)), // Cleaning up href
            text: text.trim() // The text between <a> and </a>
          });
        }
      }
    });

    return wikiLinks;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function greedyBFS(
  startWord: string,
  endWord: string
): Promise<{ href: string, text: string }[]> {
  const visited = new Set<string>();
  const priorityQueue = new PriorityQueue<{ word: string; path: { href: string, text: string }[] }>();
  priorityQueue.enqueue(
    { word: startWord, path: [{ href: startWord, text: startWord }] },
    0
  );

  while (!priorityQueue.isEmpty()) {
    const { word: currentWord, path: currentPath } = priorityQueue.dequeue()!;
    if (visited.has(currentWord)) continue;

    visited.add(currentWord);
    if (currentWord.toLowerCase() === endWord.toLowerCase()) {
      return currentPath;
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
  const startTime = new Date().getTime();
  try {
    //check start and target titles to make sure they exist
    const link1 = await fetch(`https://en.wikipedia.org/wiki/${startWord}`);
    const link2 = await fetch(`https://en.wikipedia.org/wiki/${endWord}`);

    if (!link1.ok || !link2.ok) {
      return NextResponse.json({ message: "Error", status: 404 });
    }

    const result = await greedyBFS(startWord, endWord);
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;
    return NextResponse.json({ path: result, time: duration });
  } catch (error: unknown) {
    console.error("Error calling API", error);
    return NextResponse.json({
      message: "Failed to fetch data from Wikipedia",
    });
  }
}
