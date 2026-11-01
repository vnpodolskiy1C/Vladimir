import { Agent, fetch } from "undici";

import type { Publication } from "./publication.ts";

export type ToolResult = { text: string; isError: boolean };

export type ServiceRequest = {
  method: "GET" | "POST";
  path:
    | "/types"
    | "/type"
    | "/search"
    | "/object"
    | "/register"
    | "/register/slice"
    | "/register/history"
    | "/register/record";
  query: Array<[string, string]>;
  body?: string;
  contentType?: string;
};

export type ServiceClient = {
  request(input: ServiceRequest): Promise<ToolResult>;
};

export const TIMEOUT_MS = 60_000;

const UNAVAILABLE = "Сервис объектов недоступен. ";

function unavailable(reason: string): ToolResult {
  return { text: `${UNAVAILABLE}${reason}`, isError: true };
}

function buildUrl(publication: Publication, input: ServiceRequest): string {
  const base = `${publication.url}${input.path}`;
  if (input.query.length === 0) {
    return base;
  }
  const query = input.query
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${base}?${query}`;
}

function decodeBody(bytes: Uint8Array): string | ToolResult {
  if (bytes.length === 0) {
    return unavailable("Пустой ответ.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return unavailable("Тело ответа не UTF-8.");
  }
  try {
    JSON.parse(text);
  } catch {
    return unavailable("Тело ответа не JSON.");
  }
  return text;
}

export function createServiceClient(
  publication: Publication,
  options: { timeoutMs?: number } = {},
): ServiceClient {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const dispatcher = new Agent();
  const authorization = `Basic ${Buffer.from(`${publication.user}:${publication.password}`, "utf8").toString("base64")}`;

  return {
    async request(input) {
      const headers: Record<string, string> = { Authorization: authorization };
      if (input.contentType !== undefined) {
        headers["Content-Type"] = input.contentType;
      }

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetch(buildUrl(publication, input), {
          method: input.method,
          headers,
          body:
            input.method === "POST" && input.body !== undefined
              ? Buffer.from(input.body, "utf8")
              : undefined,
          dispatcher,
          redirect: "manual",
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel().catch(() => undefined);
          return unavailable("Сервис прислал перенаправление.");
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const decoded = decodeBody(bytes);
        if (typeof decoded !== "string") {
          return decoded;
        }
        return {
          text: decoded,
          isError: response.status < 200 || response.status >= 300,
        };
      } catch {
        return unavailable(
          timedOut ? "Истекло время ожидания." : "Нет соединения.",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
