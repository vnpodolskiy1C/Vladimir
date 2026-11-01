import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { StartupError } from "./publication.ts";
import { start } from "./start.ts";

try {
  await start({
    env: process.env,
    connect: (server) => server.connect(new StdioServerTransport()),
  });
} catch (error) {
  if (error instanceof StartupError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
