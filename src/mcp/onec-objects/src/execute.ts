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

export function filterValueArg(key: string): string {
  return `${PREFIX}Значение отбора ${key} должно быть строкой, числом, булевым или объектом.`;
}

export function filterKeyArg(key: string): string {
  return `${PREFIX}Ключ отбора ${key} совпадает с параметром запроса.`;
}

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

function filterQueryValue(key: string, value: unknown): string | { error: string } {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (isPlainObject(value)) {
    return JSON.stringify(value);
  }
  return { error: filterValueArg(key) };
}

function buildRegisterGet(
  path: "/register" | "/register/slice" | "/register/history",
  args: Args,
  withDate: boolean,
  withFilter: boolean,
): Built {
  if (!has(args, "name")) {
    return { error: missingArg("name") };
  }
  const name = args.name;
  if (typeof name !== "string") {
    return { error: stringArg("name") };
  }
  const query: Array<[string, string]> = [["name", name]];
  if (withDate && has(args, "date")) {
    const date = args.date;
    if (typeof date !== "string") {
      return { error: stringArg("date") };
    }
    query.push(["date", date]);
  }
  if (withFilter && has(args, "filter")) {
    const filter = args.filter;
    if (!isPlainObject(filter)) {
      return { error: objectArg("filter") };
    }
    for (const [key, value] of Object.entries(filter)) {
      if (key === "name" || key === "date") {
        return { error: filterKeyArg(key) };
      }
      const encoded = filterQueryValue(key, value);
      if (typeof encoded !== "string") {
        return encoded;
      }
      query.push([key, encoded]);
    }
  }
  return { request: { method: "GET", path, query } };
}

function buildRecord(args: Args): Built {
  if (!has(args, "name")) {
    return { error: missingArg("name") };
  }
  const name = args.name;
  if (typeof name !== "string") {
    return { error: stringArg("name") };
  }
  if (!has(args, "period")) {
    return { error: missingArg("period") };
  }
  const period = args.period;
  if (typeof period !== "string") {
    return { error: stringArg("period") };
  }
  if (!has(args, "dimensions")) {
    return { error: missingArg("dimensions") };
  }
  const dimensions = args.dimensions;
  if (!isPlainObject(dimensions)) {
    return { error: objectArg("dimensions") };
  }
  if (!has(args, "resources")) {
    return { error: missingArg("resources") };
  }
  const resources = args.resources;
  if (!isPlainObject(resources)) {
    return { error: objectArg("resources") };
  }
  return {
    request: {
      method: "POST",
      path: "/register/record",
      query: [],
      body: JSON.stringify({ name, period, dimensions, resources }),
      contentType: "application/json; charset=utf-8",
    },
  };
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
  } else if (name === "describe_register") {
    built = buildRegisterGet("/register", input, false, false);
  } else if (name === "read_register_slice") {
    built = buildRegisterGet("/register/slice", input, true, true);
  } else if (name === "read_register_history") {
    built = buildRegisterGet("/register/history", input, false, true);
  } else if (name === "write_register_record") {
    built = buildRecord(input);
  } else {
    built = { error: unknownTool(name) };
  }
  if ("error" in built) {
    return { text: built.error, isError: true };
  }
  return client.request(built.request);
}
