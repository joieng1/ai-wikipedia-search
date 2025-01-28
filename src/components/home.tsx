"use client";
import Link from "next/link";
import React, { useState, CSSProperties, useEffect } from "react";
import ClipLoader from "react-spinners/ClipLoader";

interface Step {
  href: string;
  text: string;
  origin: string;
}

function SearchComponent() {
  const [start, setStart] = useState("Video Games");
  const [end, setEnd] = useState("Chemical engineer");
  const [model, setModel] = useState("0");
  const [pathForward, setPathForward] = useState<Step[]>([]);
  const [pathBackward, setPathBackward] = useState<Step[]>([]);
  const [forwardTime, setForwardTime] = useState<number>(0);
  const [backwardTime, setBackwardTime] = useState<number>(0);
  const [forwardFinished, setForwardFinished] = useState<boolean>(false);
  const [backFinished, setBackFinished] = useState<boolean>(false);
  let [loading, setLoading] = useState(false);

  const override: CSSProperties = {
    display: "block",
    margin: "0 auto",
    borderColor: "white",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setPathForward([]);
    setPathBackward([]);
    setForwardTime(0);
    setBackwardTime(0);
    setBackFinished(false);
    setForwardFinished(false);

    try {
      const response = await fetch(
        `/api/wikipedia?startWord=${start}&endWord=${end}&model=${model}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // no longer yielding results until complete, so may remove in future
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

              // handle directional updates
              if (parsed.direction === "forward") {
                setForwardTime(parsed.time || 0);
                if (parsed.finished) {
                  setPathForward(parsed.path);
                  setForwardFinished(true);
                } else {
                  setPathForward(parsed.path);
                }
              } else if (parsed.direction === "backward") {
                setBackwardTime(parsed.time || 0);
                if (parsed.finished) {
                  setPathBackward(parsed.path);
                  setBackFinished(true);
                } else {
                  setPathBackward(parsed.path);
                }
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

  return (
    <div className="w-full mx-auto bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] min-h-screen p-8 text-white font-sans">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold">WikiPath Solver</h1>
        <p className="text-[#b3b3b3] mt-2 text-lg">
          AI-Powered Wikipedia Navigation
        </p>
      </header>

      <div className="bg-[#2d2d2d] p-8 rounded-xl shadow-lg mb-8">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
            <input
              className="flex-1 p-4 bg-[#383838] border-2 border-[#4d4d4d] rounded-lg text-white focus:outline-none focus:border-[#00ff9d] focus:shadow-[0_0_12px_rgba(0,255,157,0.2)]"
              type="text"
              placeholder="Start word"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <svg className="w-8 h-8 fill-[#b3b3b3]" viewBox="0 0 24 24">
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
          <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
            <label className="text-white">Select Model:</label>
            <select
              className="flex-1 p-4 bg-[#383838] border-2 border-[#4d4d4d] rounded-lg text-white focus:outline-none focus:border-[#00ff9d] focus:shadow-[0_0_12px_rgba(0,255,157,0.2)]"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="0">Xenova/all-MiniLM-L6-v2</option>
              <option value="1">XENOVA/GIST-small-Embedding-v0</option>
              <option value="2">Romelianism/MedEmbed-small-v0.1</option>
            </select>
          </div>
          {loading ? (
            <div className="flex justify-center">
              <ClipLoader
                color="#00ff9d"
                loading={loading}
                cssOverride={override}
                size={35}
              />
            </div>
          ) : (
            <button
              type="submit"
              className="w-full p-4 bg-[#00ff9d] rounded-lg text-[#1a1a1a] font-semibold uppercase tracking-wide hover:shadow-[0_0_16px_rgba(0,255,157,0.4)] transition-all"
            >
              Start Challenge
            </button>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        <div className="flex flex-col bg-[#2d2d2d] p-6 rounded-lg font-mono text-lg whitespace-pre-wrap h-full">
          <h3 className="text-[#00ff9d] mb-4">
            Forward Path {forwardFinished && "Done!"}
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-[#2d2d2d] p-6 rounded-lg text-center">
              <span className="block text-[#b3b3b3] text-sm">Time Elapsed</span>
              <div
                id="timer"
                className="text-2xl font-semibold text-[#00ff9d] mt-2"
              >
                {forwardTime}
              </div>
            </div>
            <div className="bg-[#2d2d2d] p-6 rounded-lg text-center">
              <span className="block text-[#b3b3b3] text-sm">Path Length</span>
              <div
                id="stepsCounter"
                className="text-2xl font-semibold text-[#00ff9d] mt-2"
              >
                {pathForward.length}
              </div>
            </div>
          </div>
          {pathForward.map((step, i) => (
            <div key={i}>
              <a
                key={i}
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(
                  step.href
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                {step.text}
              </a>
            </div>
          ))}
        </div>

        <div className="flex flex-col bg-[#2d2d2d] p-6 rounded-lg font-mono text-lg whitespace-pre-wrap h-full">
          <h3 className="text-[#00ff9d] mb-4">
            Backwards Path {backFinished && "Done!"}
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-[#2d2d2d] p-6 rounded-lg text-center">
              <span className="block text-[#b3b3b3] text-sm">Time Elapsed</span>
              <div
                id="timer"
                className="text-2xl font-semibold text-[#00ff9d] mt-2"
              >
                {backwardTime}
              </div>
            </div>
            <div className="bg-[#2d2d2d] p-6 rounded-lg text-center">
              <span className="block text-[#b3b3b3] text-sm">Path Length</span>
              <div
                id="stepsCounter"
                className="text-2xl font-semibold text-[#00ff9d] mt-2"
              >
                {pathBackward.length}
              </div>
            </div>
          </div>
          {pathBackward.map((step, i) => (
            <div key={i}>
              <a
                key={i}
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(
                  step.href
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                {step.text}
              </a>
            </div>
          ))}
        </div>
      </div>
      <div className="my-4 text-red-400 text-center">
        <h1 className="">Disclaimer!</h1>
        <p>
          The paths generated are only as good as the heuristic generated from
          the sentence embedding model.
        </p>
      </div>
    </div>
  );
}

export default SearchComponent;
