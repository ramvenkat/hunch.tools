export const toolDefinitions = [
  {
    name: "read_file",
    description: "Read a UTF-8 file from the current spike.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to read, relative to the spike root.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a UTF-8 file in the current spike.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to write, relative to the spike root.",
        },
        content: {
          type: "string",
          description: "Complete file contents.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace exactly one occurrence of text in a spike file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to edit, relative to the spike root.",
        },
        old_str: {
          type: "string",
          description: "Text to replace. Must occur exactly once.",
        },
        new_str: {
          type: "string",
          description: "Replacement text.",
        },
      },
      required: ["path", "old_str", "new_str"],
    },
  },
  {
    name: "list_files",
    description: "List files in the current spike.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory to list, relative to the spike root.",
        },
        depth: {
          type: "number",
          description: "Maximum directory depth to traverse.",
        },
      },
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
          description: "Allowlisted shell command to run.",
        },
      },
      required: ["command"],
    },
  },
] as const;
