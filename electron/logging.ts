/**
 * Copies console output, including the in-process Next.js server's logs, to
 * <userData>/logs/main.log. The file rotates at 5 MB; one older file
 * (main.log.1) is kept.
 */
import fs from "node:fs";
import path from "node:path";
import { format } from "node:util";

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

export interface FileLogger {
  /** Absolute path of the active log file. */
  readonly file: string;
  write(level: string, message: string): void;
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function installFileLogging(logsDir: string): FileLogger {
  fs.mkdirSync(logsDir, { recursive: true });
  const file = path.join(logsDir, "main.log");
  const previous = path.join(logsDir, "main.log.1");
  let size = fileSize(file);

  const write = (level: string, message: string): void => {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    const bytes = Buffer.byteLength(line);
    try {
      if (size > 0 && size + bytes > MAX_LOG_BYTES) {
        fs.renameSync(file, previous);
        size = 0;
      }
      fs.appendFileSync(file, line);
      size += bytes;
    } catch {
      // A full disk or a locked file must not take the app down.
    }
  };

  for (const method of CONSOLE_METHODS) {
    const original = console[method].bind(console);
    const level = method === "log" ? "info" : method;
    console[method] = (...args: unknown[]): void => {
      write(level, format(...args));
      try {
        original(...args);
      } catch {
        // stdout/stderr may be closed when the app was not started from a terminal.
      }
    };
  }
  // Writing to a closed pipe surfaces later as an 'error' event; ignore it.
  process.stdout.on("error", () => undefined);
  process.stderr.on("error", () => undefined);

  write("info", `log opened (pid ${process.pid})`);
  return { file, write };
}
