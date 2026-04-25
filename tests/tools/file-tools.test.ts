import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  editFileTool,
  listFilesTool,
  readFileTool,
  writeFileTool,
} from "../../src/tools/file-tools.js";

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hunch-file-tools-test-"));
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(join(root, "app", "App.tsx"), "hello world", "utf8");
  return root;
}

async function makeOutsideFile(): Promise<string> {
  const outside = await mkdtemp(join(tmpdir(), "hunch-file-tools-outside-"));
  const outsideFile = join(outside, "secret.txt");
  await writeFile(outsideFile, "secret old", "utf8");
  return outsideFile;
}

describe("readFileTool", () => {
  it("reads UTF-8 files under the root", async () => {
    const root = await makeRoot();

    await expect(readFileTool(root, { path: "app/App.tsx" })).resolves.toBe(
      "hello world",
    );
  });

  it("rejects paths that escape the root", async () => {
    const root = await makeRoot();

    await expect(readFileTool(root, { path: "../secret" })).rejects.toThrow(
      /Path escapes/,
    );
  });

  it("rejects symlinked files that point outside the root", async () => {
    const root = await makeRoot();
    await symlink(await makeOutsideFile(), join(root, "link-to-outside-file"));

    await expect(
      readFileTool(root, { path: "link-to-outside-file" }),
    ).rejects.toThrow(/Symlinks are not allowed/);
  });

  it("rejects absolute paths", async () => {
    const root = await makeRoot();

    await expect(readFileTool(root, { path: join(root, "app", "App.tsx") }))
      .rejects.toThrow(/relative/);
  });
});

describe("writeFileTool", () => {
  it("writes UTF-8 files under the root and creates parent directories", async () => {
    const root = await makeRoot();

    await expect(
      writeFileTool(root, { path: "app/New.tsx", content: "new content" }),
    ).resolves.toBe("Wrote app/New.tsx");

    await expect(readFile(join(root, "app", "New.tsx"), "utf8")).resolves.toBe(
      "new content",
    );
  });

  it("rejects paths that escape the root", async () => {
    const root = await makeRoot();

    await expect(
      writeFileTool(root, { path: "../secret", content: "nope" }),
    ).rejects.toThrow(/Path escapes/);
  });

  it("rejects symlinked files that point outside the root", async () => {
    const root = await makeRoot();
    const outsideFile = await makeOutsideFile();
    await symlink(outsideFile, join(root, "link-to-outside-file"));

    await expect(
      writeFileTool(root, {
        path: "link-to-outside-file",
        content: "overwrite",
      }),
    ).rejects.toThrow(/Symlinks are not allowed/);

    await expect(readFile(outsideFile, "utf8")).resolves.toBe("secret old");
  });

  it("rejects symlinked parent directories that point outside the root", async () => {
    const root = await makeRoot();
    const outside = await mkdtemp(join(tmpdir(), "hunch-file-tools-outside-"));
    await symlink(outside, join(root, "link-dir"));

    await expect(
      writeFileTool(root, {
        path: "link-dir/file.tsx",
        content: "overwrite",
      }),
    ).rejects.toThrow(/Symlinks are not allowed/);
  });
});

describe("editFileTool", () => {
  it("replaces exactly one occurrence of old_str", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "app", "Edit.tsx"), "before old after", "utf8");

    await expect(
      editFileTool(root, {
        path: "app/Edit.tsx",
        old_str: "old",
        new_str: "new",
      }),
    ).resolves.toBe("Edited app/Edit.tsx");

    await expect(readFile(join(root, "app", "Edit.tsx"), "utf8")).resolves.toBe(
      "before new after",
    );
  });

  it("rejects non-unique old_str matches", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "app", "Edit.tsx"), "old and old", "utf8");

    await expect(
      editFileTool(root, {
        path: "app/Edit.tsx",
        old_str: "old",
        new_str: "new",
      }),
    ).rejects.toThrow(
      "edit_file expected exactly one match for old_str, found 2.",
    );
  });

  it("rejects paths that escape the root", async () => {
    const root = await makeRoot();

    await expect(
      editFileTool(root, {
        path: "../secret",
        old_str: "old",
        new_str: "new",
      }),
    ).rejects.toThrow(/Path escapes/);
  });

  it("rejects symlinked files that point outside the root", async () => {
    const root = await makeRoot();
    const outsideFile = await makeOutsideFile();
    await symlink(outsideFile, join(root, "link-to-outside-file"));

    await expect(
      editFileTool(root, {
        path: "link-to-outside-file",
        old_str: "old",
        new_str: "new",
      }),
    ).rejects.toThrow(/Symlinks are not allowed/);

    await expect(readFile(outsideFile, "utf8")).resolves.toBe("secret old");
  });
});

describe("listFilesTool", () => {
  it("lists files in deterministic order and skips generated directories", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "app", "nested"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "README.md"), "readme", "utf8");
    await writeFile(join(root, "app", "nested", "Deep.tsx"), "deep", "utf8");
    await writeFile(join(root, "node_modules", "pkg", "index.js"), "pkg", "utf8");
    await writeFile(join(root, "dist", "bundle.js"), "bundle", "utf8");

    await expect(listFilesTool(root, { depth: 3 })).resolves.toEqual([
      "README.md",
      "app/App.tsx",
      "app/nested/Deep.tsx",
    ]);
  });

  it("respects the requested path and depth", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "app", "nested"), { recursive: true });
    await writeFile(join(root, "app", "Top.tsx"), "top", "utf8");
    await writeFile(join(root, "app", "nested", "Deep.tsx"), "deep", "utf8");

    await expect(
      listFilesTool(root, { path: "app", depth: 1 }),
    ).resolves.toEqual(["app/App.tsx", "app/Top.tsx"]);
  });

  it("defaults to a safe depth of 2", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "app", "nested"), { recursive: true });
    await writeFile(join(root, "app", "nested", "Deep.tsx"), "deep", "utf8");

    await expect(listFilesTool(root, {})).resolves.toEqual(["app/App.tsx"]);
  });

  it("rejects negative or fractional depths", async () => {
    const root = await makeRoot();

    await expect(listFilesTool(root, { depth: -1 })).rejects.toThrow(
      /depth must be a non-negative integer/,
    );
    await expect(listFilesTool(root, { depth: 1.5 })).rejects.toThrow(
      /depth must be a non-negative integer/,
    );
  });

  it("rejects depths above the runtime maximum", async () => {
    const root = await makeRoot();

    await expect(listFilesTool(root, { depth: 11 })).rejects.toThrow(
      /depth must be 10 or less/,
    );
  });

  it("rejects list paths that escape the root", async () => {
    const root = await makeRoot();

    await expect(listFilesTool(root, { path: "../secret" })).rejects.toThrow(
      /Path escapes/,
    );
  });

  it("does not follow symlink directories", async () => {
    const root = await makeRoot();
    const outside = await mkdtemp(join(tmpdir(), "hunch-file-tools-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret", "utf8");
    await symlink(outside, join(root, "linked"));

    await expect(listFilesTool(root, {})).resolves.toEqual(["app/App.tsx"]);
  });

  it("rejects a symlink directory as the requested list path", async () => {
    const root = await makeRoot();
    const outside = await mkdtemp(join(tmpdir(), "hunch-file-tools-outside-"));
    await symlink(outside, join(root, "link-dir"));

    await expect(listFilesTool(root, { path: "link-dir" })).rejects.toThrow(
      /Symlinks are not allowed/,
    );
  });

  it("rejects listings that exceed the entry cap", async () => {
    const root = await makeRoot();

    await Promise.all(
      Array.from({ length: 1001 }, (_, index) =>
        writeFile(join(root, `file-${index}.txt`), "x", "utf8"),
      ),
    );

    await expect(listFilesTool(root, { depth: 1 })).rejects.toThrow(
      /list_files exceeded/,
    );
  });
});
