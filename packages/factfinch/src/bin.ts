import { readFileSync } from "node:fs";
import { stdin, stdout, stderr } from "node:process";
import { createInterface } from "node:readline/promises";
import { cli } from "./cli.js";

// When output is piped into something that stops reading early (`| head`),
// exit quietly instead of crashing with EPIPE.
for (const stream of [stdout, stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw err;
  });
}

// One line iterator for the whole run: it buffers piped input correctly,
// unlike readline's question(), which drops lines that arrive early.
let rl: ReturnType<typeof createInterface> | undefined;
let lines: AsyncIterator<string> | undefined;

const code = await cli(process.argv.slice(2), {
  out: (line) => stdout.write(`${line}\n`),
  err: (line) => stderr.write(`${line}\n`),
  readFile: (path) => readFileSync(path, "utf8"),
  color: Boolean(stdout.isTTY) && !process.env.NO_COLOR,
  async readLine(prompt) {
    rl ??= createInterface({ input: stdin, terminal: stdin.isTTY });
    lines ??= rl[Symbol.asyncIterator]();
    stdout.write(prompt);
    const next = await lines.next();
    if (next.done) return undefined;
    // Echo piped answers so transcripts read naturally.
    if (!stdin.isTTY) stdout.write(`${next.value}\n`);
    return next.value;
  },
});

rl?.close();
process.exitCode = code;
