import { appendFile, readFile } from "node:fs/promises";

import { HunchError } from "../utils/errors.js";
import type { SessionEvent } from "./types.js";

export async function appendSessionEvent(
  file: string,
  event: SessionEvent,
): Promise<void> {
  await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readRecentSession(
  file: string,
  limit = 20,
): Promise<SessionEvent[]> {
  let contents: string;

  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const events = contents
    .split("\n")
    .flatMap((line, index) => {
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        return [];
      }

      return [parseSessionLine(trimmed, index + 1)];
    });

  return events.slice(-limit);
}

function parseSessionLine(line: string, lineNumber: number): SessionEvent {
  try {
    return JSON.parse(line) as SessionEvent;
  } catch (error) {
    const message =
      error instanceof Error ? ` ${error.message}` : " Unknown parse error.";
    throw new HunchError(
      `Malformed session JSON on line ${lineNumber}.${message}`,
    );
  }
}
