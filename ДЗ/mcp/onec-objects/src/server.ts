import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ServiceClient } from "./client.ts";
import {
  ARGUMENT_DESCRIPTIONS,
  CREATE_ANNOTATIONS,
  DESCRIPTIONS,
  INVOICE_ARGUMENT_DESCRIPTIONS,
  INVOICE_PROMPT_DESCRIPTION,
  INVOICE_PROMPT_NAME,
  READ_ANNOTATIONS,
  RECORD_ANNOTATIONS,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
  TITLES,
  TYPES_RESOURCE_DESCRIPTION,
  TYPES_RESOURCE_NAME,
  TYPES_RESOURCE_URI,
  invoicePromptText,
} from "./copy.ts";
import { executeTool, limitArg, missingArg, objectArg, stringArg } from "./execute.ts";

export {
  CREATE_ANNOTATIONS,
  READ_ANNOTATIONS,
  RECORD_ANNOTATIONS,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
};

function text(name: string, description: string) {
  return z
    .string({ required_error: missingArg(name), invalid_type_error: stringArg(name) })
    .describe(description);
}

function object(name: string, description: string) {
  return z
    .record(z.unknown(), { required_error: missingArg(name), invalid_type_error: objectArg(name) })
    .describe(description);
}

function optionalText(name: string, description: string) {
  return text(name, description).optional();
}

function optionalObject(name: string, description: string) {
  return object(name, description).optional();
}

function limit() {
  return z
    .number({ invalid_type_error: limitArg() })
    .int(limitArg())
    .optional()
    .describe(ARGUMENT_DESCRIPTIONS.limit);
}

const TOOL_NAMES: string[] = Object.keys(TITLES);

export function createMcpServer(client: ServiceClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  const handler =
    (name: string) =>
    async (args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> => {
      const result = await executeTool(name, args, client);
      return result.isError
        ? { content: [{ type: "text", text: result.text }], isError: true }
        : { content: [{ type: "text", text: result.text }] };
    };

  server.registerResource(
    TYPES_RESOURCE_NAME,
    TYPES_RESOURCE_URI,
    {
      title: TYPES_RESOURCE_NAME,
      description: TYPES_RESOURCE_DESCRIPTION,
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await client.request({
        method: "GET",
        path: "/types",
        query: [
          ["q", "."],
          ["limit", "100"],
        ],
      });
      if (result.isError) {
        throw new McpError(ErrorCode.InternalError, result.text);
      }
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: result.text }],
      };
    },
  );

  server.registerTool(
    "find_types",
    {
      title: TITLES.find_types,
      description: DESCRIPTIONS.find_types,
      annotations: READ_ANNOTATIONS,
      inputSchema: { q: text("q", ARGUMENT_DESCRIPTIONS.findTypesQ), limit: limit() },
    },
    handler("find_types"),
  );
  server.registerTool(
    "describe_type",
    {
      title: TITLES.describe_type,
      description: DESCRIPTIONS.describe_type,
      annotations: READ_ANNOTATIONS,
      inputSchema: { name: text("name", ARGUMENT_DESCRIPTIONS.name) },
    },
    handler("describe_type"),
  );
  server.registerTool(
    "find_objects",
    {
      title: TITLES.find_objects,
      description: DESCRIPTIONS.find_objects,
      annotations: READ_ANNOTATIONS,
      inputSchema: {
        type: text("type", ARGUMENT_DESCRIPTIONS.type),
        q: text("q", ARGUMENT_DESCRIPTIONS.findObjectsQ),
        limit: limit(),
      },
    },
    handler("find_objects"),
  );
  server.registerTool(
    "read_object",
    {
      title: TITLES.read_object,
      description: DESCRIPTIONS.read_object,
      annotations: READ_ANNOTATIONS,
      inputSchema: {
        type: text("type", ARGUMENT_DESCRIPTIONS.type),
        id: text("id", ARGUMENT_DESCRIPTIONS.id),
      },
    },
    handler("read_object"),
  );
  server.registerTool(
    "create_object",
    {
      title: TITLES.create_object,
      description: DESCRIPTIONS.create_object,
      annotations: CREATE_ANNOTATIONS,
      inputSchema: {
        type: text("type", ARGUMENT_DESCRIPTIONS.type),
        header: object("header", ARGUMENT_DESCRIPTIONS.header),
        tables: object("tables", ARGUMENT_DESCRIPTIONS.tables),
      },
    },
    handler("create_object"),
  );

  server.registerTool(
    "describe_register",
    {
      title: TITLES.describe_register,
      description: DESCRIPTIONS.describe_register,
      annotations: READ_ANNOTATIONS,
      inputSchema: { name: text("name", ARGUMENT_DESCRIPTIONS.register) },
    },
    handler("describe_register"),
  );
  server.registerTool(
    "read_register_slice",
    {
      title: TITLES.read_register_slice,
      description: DESCRIPTIONS.read_register_slice,
      annotations: READ_ANNOTATIONS,
      inputSchema: {
        name: text("name", ARGUMENT_DESCRIPTIONS.register),
        date: optionalText("date", ARGUMENT_DESCRIPTIONS.date),
        filter: optionalObject("filter", ARGUMENT_DESCRIPTIONS.filter),
      },
    },
    handler("read_register_slice"),
  );
  server.registerTool(
    "read_register_history",
    {
      title: TITLES.read_register_history,
      description: DESCRIPTIONS.read_register_history,
      annotations: READ_ANNOTATIONS,
      inputSchema: {
        name: text("name", ARGUMENT_DESCRIPTIONS.register),
        filter: optionalObject("filter", ARGUMENT_DESCRIPTIONS.filter),
      },
    },
    handler("read_register_history"),
  );
  server.registerTool(
    "write_register_record",
    {
      title: TITLES.write_register_record,
      description: DESCRIPTIONS.write_register_record,
      annotations: RECORD_ANNOTATIONS,
      inputSchema: {
        name: text("name", ARGUMENT_DESCRIPTIONS.register),
        period: text("period", ARGUMENT_DESCRIPTIONS.period),
        dimensions: object("dimensions", ARGUMENT_DESCRIPTIONS.dimensions),
        resources: object("resources", ARGUMENT_DESCRIPTIONS.resources),
      },
    },
    handler("write_register_record"),
  );

  server.registerPrompt(
    INVOICE_PROMPT_NAME,
    {
      title: INVOICE_PROMPT_NAME,
      description: INVOICE_PROMPT_DESCRIPTION,
      argsSchema: {
        покупатель: z.string().describe(INVOICE_ARGUMENT_DESCRIPTIONS.покупатель),
        товар: z.string().describe(INVOICE_ARGUMENT_DESCRIPTIONS.товар),
        количество: z.string().describe(INVOICE_ARGUMENT_DESCRIPTIONS.количество),
        цена: z.string().describe(INVOICE_ARGUMENT_DESCRIPTIONS.цена),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: invoicePromptText(args) },
        },
      ],
    }),
  );

  // SDK оборачивает отказ Zod в свой текст, а наружу должна выйти ровно
  // фраза executeTool. Схемы остаются для списка инструментов, а вызов
  // проверяет executeTool: запрос при неверном вызове не уходит.
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!TOOL_NAMES.includes(name)) {
      throw new McpError(ErrorCode.InvalidParams, `Tool ${name} not found`);
    }
    return handler(name)(args);
  });

  return server;
}
