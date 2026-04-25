import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

const RELATIVE_PATH_SCHEMA = {
  type: "string",
  minLength: 1,
  pattern: "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$)).+",
  description: "Relative path within the spike root.",
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
          pattern:
            "^(npm install|npm run [a-zA-Z0-9:_-]+|npx shadcn(@[a-zA-Z0-9._-]+)? add [a-zA-Z0-9:_-]+)$",
          description: "Allowlisted shell command to run.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
] satisfies Tool[];
