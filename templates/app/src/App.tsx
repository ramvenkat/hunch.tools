import { ArrowRight } from "lucide-react";
import { demoPrompts } from "./lib/demo-data";

export default function App() {
  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#15211b]">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-10">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6a56]">Hunch spike</p>
        <h1 className="max-w-3xl font-display text-5xl leading-tight md:text-7xl">
          A rough prototype for learning fast.
        </h1>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {demoPrompts.map((prompt) => (
            <button
              key={prompt.title}
              className="group rounded-md border border-[#d8d0bd] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9c8f70]"
            >
              <span className="flex items-center justify-between gap-4 font-semibold">
                {prompt.title}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
              <span className="mt-3 block text-sm leading-6 text-[#5f665f]">{prompt.body}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
