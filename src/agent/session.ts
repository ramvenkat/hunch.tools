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

      return [parseSessionLine(file, trimmed, index + 1)];
    });

  return trimLeadingToolEvents(events.slice(-limit));
}

function trimLeadingToolEvents(events: SessionEvent[]): SessionEvent[] {
  const firstNonTool = events.findIndex((event) => event.role !== "tool");
  if (firstNonTool === -1) {
    return [];
  }

  return events.slice(firstNonTool);
}

function parseSessionLine(
  file: string,
  line: string,
  lineNumber: number,
): SessionEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch (error) {
    const message =
      error instanceof Error ? ` ${error.message}` : " Unknown parse error.";
    throw new HunchError(
      `Malformed session JSON on line ${lineNumber}.${message}`,
    );
  }

  return validateSessionEvent(file, lineNumber, parsed);
}

function validateSessionEvent(
  file: string,
  lineNumber: number,
  event: unknown,
): SessionEvent {
  if (!isRecord(event)) {
    throw invalidSessionEvent(file, lineNumber, "event must be an object");
  }

  if (!isSessionRole(event.role)) {
    throw invalidSessionEvent(
      file,
      lineNumber,
      "role must be user|assistant|tool",
    );
  }

  if (typeof event.content !== "string") {
    throw invalidSessionEvent(file, lineNumber, "content must be a string");
  }

  if (typeof event.ts !== "string") {
    throw invalidSessionEvent(file, lineNumber, "ts must be a string");
  }

  if ("toolName" in event && typeof event.toolName !== "string") {
    throw invalidSessionEvent(
      file,
      lineNumber,
      "toolName must be a string when present",
    );
  }

  if ("toolUseId" in event && typeof event.toolUseId !== "string") {
    throw invalidSessionEvent(
      file,
      lineNumber,
      "toolUseId must be a string when present",
    );
  }

  if ("isError" in event && typeof event.isError !== "boolean") {
    throw invalidSessionEvent(
      file,
      lineNumber,
      "isError must be a boolean when present",
    );
  }

  return event as unknown as SessionEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionRole(value: unknown): value is SessionEvent["role"] {
  return value === "user" || value === "assistant" || value === "tool";
}

function invalidSessionEvent(
  file: string,
  lineNumber: number,
  reason: string,
): HunchError {
  return new HunchError(
    `Invalid session event in ${file} on line ${lineNumber}: ${reason}.`,
  );
}
