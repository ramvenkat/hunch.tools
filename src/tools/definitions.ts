import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

const RELATIVE_PATH_SCHEMA = {
  type: "string",
  minLength: 1,
  pattern: "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$)).+",
  description: "Relative path within the spike root.",
} as const;

const REQUIRED_STRING_SCHEMA = {
  type: "string",
  minLength: 1,
} as const;

export const toolDefinitions = [
  {
    name: "read_file",
    description: "Read a UTF-8 file from the current spike.",
    input_schema: {
      type: "object",
      properties: {
        path: RELATIVE_PATH_SCHEMA,
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description: "Write a UTF-8 file in the current spike.",
    input_schema: {
      type: "object",
      properties: {
        path: RELATIVE_PATH_SCHEMA,
        content: {
          type: "string",
          description: "Complete file contents.",
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_file",
    description: "Replace exactly one occurrence of text in a spike file.",
    input_schema: {
      type: "object",
      properties: {
        path: RELATIVE_PATH_SCHEMA,
        old_str: {
          type: "string",
          minLength: 1,
          description: "Text to replace. Must occur exactly once.",
        },
        new_str: {
          type: "string",
          description: "Replacement text.",
        },
      },
      required: ["path", "old_str", "new_str"],
      additionalProperties: false,
    },
  },
  {
    name: "list_files",
    description: "List files in the current spike.",
    input_schema: {
      type: "object",
      properties: {
        path: RELATIVE_PATH_SCHEMA,
        depth: {
          type: "integer",
          minimum: 0,
          maximum: 10,
          description: "Maximum directory depth to traverse.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "run_shell",
    description: "Run a narrowly allowlisted command in the current spike.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          minLength: 1,
          pattern: "^npm install$",
          description: "Allowlisted shell command to run.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "decide",
    description: "Log a meaningful UX decision with a one-sentence rationale.",
    input_schema: {
      type: "object",
      properties: {
        decision: {
          ...REQUIRED_STRING_SCHEMA,
          description: "The UX decision to log.",
        },
        rationale: {
          ...REQUIRED_STRING_SCHEMA,
          description: "One-sentence rationale for the decision.",
        },
      },
      required: ["decision", "rationale"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_seed_data",
    description: "Generate realistic demo content for the current spike.",
    input_schema: {
      type: "object",
      properties: {
        purpose: {
          ...REQUIRED_STRING_SCHEMA,
          description: "What the demo content should support.",
        },
      },
      required: ["purpose"],
      additionalProperties: false,
    },
  },
  {
    name: "push_back",
    description: "Classify whether a user request is in scope for the spike.",
    input_schema: {
      type: "object",
      properties: {
        request: {
          ...REQUIRED_STRING_SCHEMA,
          description: "The user request to classify.",
        },
      },
      required: ["request"],
      additionalProperties: false,
    },
  },
] satisfies Tool[];
