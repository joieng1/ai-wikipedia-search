"use client";
import React, { useState, CSSProperties } from "react";
import { ClipLoader } from "react-spinners";

interface SearchResult {
  path: string[];
  time: number;
  message?: string;
}

function SearchComponent() {
  const [start, setStart] = useState("Video Games");
  const [end, setEnd] = useState("Minecraft");
  const [results, setResults] = useState<SearchResult | null>(null);
  let [loading, setLoading] = useState(false);

  const override: CSSProperties = {
    display: "block",
    margin: "0 auto",
    borderColor: "black",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true)
    setResults(null);
    try {
      const response = await fetch(`/api/wikipedia?startWord=${start}&endWord=${end}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data.message) {
        alert("Not valid wikipedia article");
        setLoading(false);
        return;
      }
      setResults(data);
      setLoading(false)
    } catch (error) {
      alert("Not valid wikipedia article");
      setLoading(false);
      return;
    }
  }

  return (
    <div className="container mx-auto mt-5 text-2xl border-black border-2 p-2">
      <h1 className="text-center font-lg">WikiGame Path Generator</h1>
      <form className="flex flex-col" onSubmit={(e)=>handleSubmit(e)}>
        <input
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Start"
          className="m-5 border-2 border-black p-3 bg-white"
        />
        <input
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          placeholder="End"
          className="m-5 border-2 border-black p-3 bg-white"
        />
        <button className="m-auto my-5 h-12 w-48 relative bg-transparent cursor-pointer border-2 border-black overflow-hidden rounded-full text-black transition-all duration-500 ease-in-out hover:shadow-2xl hover:bg-black hover:text-white" type="submit">Search</button>
      </form>
      {results && (
        <div className="mt-5 text-lg">
          <p>Path: {results.path.join(" -> ")}</p>
          <p>Distance: {results.path.length} clicks</p>
          <p>Time: {results.time}</p>
        </div>
      )}
      {loading && (
        <ClipLoader
        className="m-auto mt-5"
        color={"#ffffff"}
        loading={loading}
        cssOverride={override}
        size={150}
        aria-label="Loading Spinner"
        data-testid="loader"
      />
      )}
    </div>
  );
}

export default SearchComponent;
