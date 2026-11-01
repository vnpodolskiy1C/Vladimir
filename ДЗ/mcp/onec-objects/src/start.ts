import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createServiceClient } from "./client.ts";
import { loadPublication } from "./publication.ts";
import { createMcpServer } from "./server.ts";

export type StartOptions = {
  env: NodeJS.ProcessEnv;
  connect: (server: McpServer) => Promise<void>;
};

export async function start(options: StartOptions): Promise<void> {
  const publication = loadPublication(options.env);
  const client = createServiceClient(publication);
  const server = createMcpServer(client);
  await options.connect(server);
}
