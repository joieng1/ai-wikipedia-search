"use client";
import React, { useState, CSSProperties, useEffect } from "react";
import { ClipLoader } from "react-spinners";

interface Step {
  href: string;
  text: string;
  origin: string;
}

function SearchComponent() {
  const [start, setStart] = useState("Video Games");
  const [end, setEnd] = useState("Chemical engineer");
  const [results, setResults] = useState<Step[]>([]);
  const [timeElapsed, setTimeElapsed] = useState<String>("0");
  let [loading, setLoading] = useState(false);

  const override: CSSProperties = {
    display: "block",
    margin: "0 auto",
    borderColor: "black",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResults([]);
    setTimeElapsed("0");

    try {
      const response = await fetch(
        `/api/wikipedia?startWord=${start}&endWord=${end}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) throw new Error("No response body from server");

      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value);

          // remove newlines and leading/trailing whitespaces
          const updates = chunk
            .split("\n")
            .filter((line) => line.trim().length > 0);

          // process each update received from the server
          updates.forEach((update) => {
            try {
              // parse twice to get json object
              const parsed = JSON.parse(JSON.parse(update));

              // if error, handle the error
              if (parsed.error) {
                console.error(parsed.error);
                alert(parsed.error);
                setLoading(false);
                return;
              }

              // if path update, update the results
              if (parsed.path) {
                setResults(parsed.path);
              }

              if (parsed.time) {
                setTimeElapsed(parsed.time);
              }
            } catch (error) {
              console.error("Error parsing updates", error);
            }
          });
        }
      }
      setLoading(false);
    } catch (error) {
      console.log(error);
      alert("Error occured while fetching or processing the update.");
      setLoading(false);
    }
  }

  useEffect(() => {
    console.log("Updated results:", results);
  }, [results]);

// ...existing code...
return (
  <div className="w-full mx-auto bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] min-h-screen p-8 text-white font-sans">
    <header className="text-center mb-8">
      <h1 className="text-3xl font-bold">WikiPath Solver</h1>
      <p className="text-[#b3b3b3] mt-2 text-lg">AI-Powered Wikipedia Navigation</p>
    </header>

    <div className="bg-[#2d2d2d] p-8 rounded-xl shadow-lg mb-8">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-4 items-center mb-6">
          <input
            className="flex-1 p-4 bg-[#383838] border-2 border-[#4d4d4d] rounded-lg text-white focus:outline-none focus:border-[#00ff9d] focus:shadow-[0_0_12px_rgba(0,255,157,0.2)]"
            type="text"
            placeholder="Start word"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <svg
            className="w-8 h-8 fill-[#b3b3b3]"
            viewBox="0 0 24 24"
          >
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
          <input
            className="flex-1 p-4 bg-[#383838] border-2 border-[#4d4d4d] rounded-lg text-white focus:outline-none focus:border-[#00ff9d] focus:shadow-[0_0_12px_rgba(0,255,157,0.2)]"
            type="text"
            placeholder="End word"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="w-full p-4 bg-[#00ff9d] rounded-lg text-[#1a1a1a] font-semibold uppercase tracking-wide hover:shadow-[0_0_16px_rgba(0,255,157,0.4)] transition-all"
        >
          Start Challenge
        </button>
      </form>
    </div>

    <div className="grid grid-cols-2 gap-4 mb-8">
      <div className="bg-[#2d2d2d] p-6 rounded-lg text-center">
        <span className="block text-[#b3b3b3] text-sm">Time Elapsed</span>
        <div id="timer" className="text-2xl font-semibold text-[#00ff9d] mt-2">
          {timeElapsed}
        </div>
      </div>
      <div className="bg-[#2d2d2d] p-6 rounded-lg text-center">
        <span className="block text-[#b3b3b3] text-sm">Path Length</span>
        <div id="stepsCounter" className="text-2xl font-semibold text-[#00ff9d] mt-2">
          {results.length}
        </div>
      </div>
    </div>

    <div
      id="pathDisplay"
      className="bg-[#2d2d2d] p-6 rounded-lg mb-8 min-h-[100px] font-mono text-lg whitespace-pre-wrap"
    >
      {results.map((step, i) => (
        <div key={i}>{step.text}</div>
      ))}
    </div>
    <div id="progressTracker" className="flex gap-2 flex-wrap"></div>
    <div id="errorBox" className="bg-[#4a0000] text-[#ff4d4d] p-4 rounded-lg mt-4 hidden"></div>
  </div>
);
}

export default SearchComponent;
