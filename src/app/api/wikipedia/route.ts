import type { NextApiRequest, NextApiResponse } from "next";
import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";

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
      `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=links&pllimit=max&format=json`
    );
    const data: wikipediaRes = await getResponse.json();

    const pageId: string = Object.keys(data.query.pages)[0];
    //handle missing links
    const page = data.query.pages[pageId];
    if (pageId === "-1" || page.missing !== undefined) {
      // Page is missing or doesn't exist
      console.warn(`Page "${title}" is missing or does not exist.`);
      return [];
    }
    const links = data.query.pages[pageId].links;
    const filteredLinks = links
      .filter((link) => link.ns === 0)
      .map((link) => link.title);

    return filteredLinks;
  } catch (error: any) {
    throw error;
  }
}
