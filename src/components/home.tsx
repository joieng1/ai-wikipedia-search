"use client";
import React, { useState, CSSProperties, useEffect } from "react";
import { ClipLoader } from "react-spinners";

interface Step {
  href: string;
  text: string;
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
              const parsed = JSON.parse(update);
              console.log(parsed)
              // if path update, update the results
              if (parsed.path) {
                setResults((prev) => {
                  const newSteps = parsed.path.filter(
                    (step: Step) => !prev.some((s) => s.href === step.href)
                  );
                  return [...prev, ...newSteps];
                });
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
      alert("Not valid wikipedia article");
      setLoading(false);
    }
  }

  useEffect(() => {
    console.log("Updated results:", results);
  }, [results]);

  return (
    <div className="container mx-auto mt-5 text-2xl border-black border-2 p-2">
      <h1 className="text-center font-lg">WikiGame Path Generator</h1>
      <form className="flex flex-col" onSubmit={(e) => handleSubmit(e)}>
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
        <button
          className="m-auto my-5 h-12 w-48 relative bg-transparent cursor-pointer border-2 border-black overflow-hidden rounded-full text-black transition-all duration-500 ease-in-out hover:shadow-2xl hover:bg-black hover:text-white"
          type="submit"
        >
          Search
        </button>
      </form>
      {results && (
        <div className="mt-5 text-lg">
          <p>Path:</p>
          <ul>
            {results.map((step, index) => (
              <li key={index} className="inline">
                <a
                  href={`https://en.wikipedia.org/wiki/${encodeURIComponent(
                    step.href
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                >
                  {step.text || step.href}
                </a>
                {/* every element except the last element will render "->" */}
                {index < results.length - 1 && " -> "}
              </li>
            ))}
          </ul>
          <p>Path Length: {results.length}</p>
          <p>Time taken: {timeElapsed}s</p>
        </div>
        805-316-8578
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
