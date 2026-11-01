import type { ServiceClient, ServiceRequest, ToolResult } from "./client.ts";

const PREFIX = "Неверный вызов инструмента. ";

export function missingArg(name: string): string {
  return `${PREFIX}Не передан аргумент ${name}.`;
}

export function stringArg(name: string): string {
  return `${PREFIX}Аргумент ${name} должен быть строкой.`;
}

export function limitArg(): string {
  return `${PREFIX}Аргумент limit должен быть целым числом.`;
}

export function objectArg(name: string): string {
  return `${PREFIX}Аргумент ${name} должен быть объектом.`;
}

export function unknownTool(name: string): string {
  return `${PREFIX}Неизвестный инструмент ${name}.`;
}

export function notConnected(name: string): string {
  return `Инструмент ${name} ещё не подключён к сервису объектов.`;
}

// Инструменты регистров объявлены, но маршруты сервиса для них ещё не готовы.
const REGISTER_TOOLS = [
  "describe_register",
  "read_register_slice",
  "read_register_history",
  "write_register_record",
];

type Args = Record<string, unknown>;
type Built = { request: ServiceRequest } | { error: string };

type GetSpec = {
  path: "/types" | "/type" | "/search" | "/object";
  strings: string[];
  withLimit: boolean;
};

const GET_TOOLS: Record<string, GetSpec> = {
  find_types: { path: "/types", strings: ["q"], withLimit: true },
  describe_type: { path: "/type", strings: ["name"], withLimit: false },
  find_objects: { path: "/search", strings: ["type", "q"], withLimit: true },
  read_object: { path: "/object", strings: ["type", "id"], withLimit: false },
};

function asArgs(args: unknown): Args {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Args)
    : {};
}

function has(args: Args, name: string): boolean {
  return Object.hasOwn(args, name);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildGet(spec: GetSpec, args: Args): Built {
  const query: Array<[string, string]> = [];
  for (const name of spec.strings) {
    if (!has(args, name)) {
      return { error: missingArg(name) };
    }
    const value = args[name];
    if (typeof value !== "string") {
      return { error: stringArg(name) };
    }
    query.push([name, value]);
  }
  if (spec.withLimit && has(args, "limit")) {
    const limit = args.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit)) {
      return { error: limitArg() };
    }
    query.push(["limit", String(limit)]);
  }
  return { request: { method: "GET", path: spec.path, query } };
}

function buildCreate(args: Args): Built {
  if (!has(args, "type")) {
    return { error: missingArg("type") };
  }
  const type = args.type;
  if (typeof type !== "string") {
    return { error: stringArg("type") };
  }
  const parts: Record<string, unknown> = { type };
  for (const name of ["header", "tables"]) {
    if (!has(args, name)) {
      return { error: missingArg(name) };
    }
    const value = args[name];
    if (!isPlainObject(value)) {
      return { error: objectArg(name) };
    }
    parts[name] = value;
  }
  return {
    request: {
      method: "POST",
      path: "/object",
      query: [],
      body: JSON.stringify(parts),
      contentType: "application/json; charset=utf-8",
    },
  };
}

export async function executeTool(
  name: string,
  args: unknown,
  client: ServiceClient,
): Promise<ToolResult> {
  const input = asArgs(args);
  let built: Built;
  if (Object.hasOwn(GET_TOOLS, name)) {
    built = buildGet(GET_TOOLS[name]!, input);
  } else if (name === "create_object") {
    built = buildCreate(input);
  } else if (REGISTER_TOOLS.includes(name)) {
    return { text: notConnected(name), isError: true };
  } else {
    built = { error: unknownTool(name) };
  }
  if ("error" in built) {
    return { text: built.error, isError: true };
  }
  return client.request(built.request);
}
