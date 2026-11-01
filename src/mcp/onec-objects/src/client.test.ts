import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, test } from "node:test";

import { createServiceClient } from "./client.ts";
import type { Publication } from "./publication.ts";

const PREFIX = "Сервис объектов недоступен. ";

type Seen = {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  seen: Seen,
) => void;

let server: http.Server;
let handler: Handler;
let seen: Seen[];
let connections: number;
let publication: Publication;

function setHandler(next: Handler): void {
  handler = next;
}

function reply(status: number, body: Buffer | string, headers = {}): Handler {
  return (_req, res) => {
    res.writeHead(status, headers);
    res.end(body);
  };
}

beforeEach(async () => {
  seen = [];
  connections = 0;
  handler = reply(200, "{}");
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const entry: Seen = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      seen.push(entry);
      handler(req, res, entry);
    });
  });
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  publication = {
    url: `http://127.0.0.1:${port}/hs/objects`,
    user: "Иван",
    password: "",
  };
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("createServiceClient", () => {
  test("сохраняет хвост одного JSON и отвергает два значения", async () => {
    const client = createServiceClient(publication);

    const text = '{"items":[{"id":"1"}],"hasMore":true}\n';
    setHandler(reply(200, text));
    const ok = await client.request({ method: "GET", path: "/types", query: [] });
    assert.deepEqual(ok, { text, isError: false });
    assert.equal(seen.length, 1);

    seen = [];
    setHandler(reply(200, '{"a":1}{"b":2}'));
    const bad = await client.request({ method: "GET", path: "/types", query: [] });
    assert.deepEqual(bad, {
      text: `${PREFIX}Тело ответа не JSON.`,
      isError: true,
    });
    assert.equal(seen.length, 1);
  });

  test("отличает JSON сервиса от недоступности", async () => {
    const client = createServiceClient(publication);

    const created = '{"number":"00-1"}\n';
    setHandler(reply(201, created));
    assert.deepEqual(
      await client.request({ method: "GET", path: "/object", query: [] }),
      { text: created, isError: false },
    );

    const failure = '{"error":{"code":"internal_error","message":"сбой"}}';
    setHandler(reply(500, failure));
    assert.deepEqual(
      await client.request({ method: "GET", path: "/object", query: [] }),
      { text: failure, isError: true },
    );

    setHandler(reply(200, ""));
    assert.deepEqual(
      await client.request({ method: "GET", path: "/object", query: [] }),
      { text: `${PREFIX}Пустой ответ.`, isError: true },
    );

    setHandler(reply(200, Buffer.from([0x7b, 0xff, 0x7d])));
    assert.deepEqual(
      await client.request({ method: "GET", path: "/object", query: [] }),
      { text: `${PREFIX}Тело ответа не UTF-8.`, isError: true },
    );
    assert.equal(seen.length, 4);
  });

  test("кодирует параметры один раз", async () => {
    const client = createServiceClient(publication);

    await client.request({
      method: "GET",
      path: "/types",
      query: [
        ["q", "а б&="],
        ["limit", "-3"],
      ],
    });
    assert.equal(seen.length, 1);
    assert.equal(
      seen[0].url,
      "/hs/objects/types?q=%D0%B0%20%D0%B1%26%3D&limit=-3",
    );

    seen = [];
    await client.request({ method: "GET", path: "/search", query: [] });
    assert.equal(seen[0].url, "/hs/objects/search");
  });

  test("ставит Basic пользователя и пароля в UTF-8", async () => {
    const client = createServiceClient(publication);
    const expected = `Basic ${Buffer.from("Иван:", "utf8").toString("base64")}`;

    await client.request({ method: "GET", path: "/types", query: [] });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].headers.authorization, expected);
    assert.equal(seen[0].body.length, 0);
    assert.equal(seen[0].method, "GET");

    seen = [];
    const body = '{"type":"Справочник.Номенклатура"}';
    await client.request({
      method: "POST",
      path: "/object",
      query: [],
      body,
      contentType: "application/json; charset=utf-8",
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "POST");
    assert.deepEqual(seen[0].body, Buffer.from(body, "utf8"));
    assert.equal(
      seen[0].headers["content-type"],
      "application/json; charset=utf-8",
    );

    seen = [];
    const withPassword = createServiceClient({ ...publication, password: "секрет" });
    await withPassword.request({ method: "GET", path: "/types", query: [] });
    assert.equal(
      seen[0].headers.authorization,
      `Basic ${Buffer.from("Иван:секрет", "utf8").toString("base64")}`,
    );
  });

  test("не идёт через прокси и не следует перенаправлению", async () => {
    const names = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
    ];
    const saved = names.map((name) => [name, process.env[name]] as const);
    for (const name of names) {
      process.env[name] = "http://127.0.0.1:9";
    }
    try {
      const client = createServiceClient(publication);
      const ok = await client.request({
        method: "GET",
        path: "/types",
        query: [],
      });
      assert.equal(ok.isError, false);
      assert.equal(seen.length, 1);

      seen = [];
      setHandler((req, res) => {
        if (req.url === "/secret") {
          res.writeHead(200);
          res.end("{}");
          return;
        }
        res.writeHead(302, { Location: "/secret" });
        res.end();
      });
      const redirected = await client.request({
        method: "GET",
        path: "/types",
        query: [],
      });
      assert.deepEqual(redirected, {
        text: `${PREFIX}Сервис прислал перенаправление.`,
        isError: true,
      });
      assert.equal(seen.length, 1);
      assert.equal(
        seen.some((entry) => entry.url === "/secret"),
        false,
      );
      assert.equal(redirected.text.includes("/secret"), false);
      assert.equal(redirected.text.includes(publication.url), false);
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });

  test("обрыв и таймаут — один запрос", async () => {
    setHandler(() => {
      // ответа нет
    });
    const client = createServiceClient(publication, { timeoutMs: 50 });
    const result = await client.request({
      method: "GET",
      path: "/types",
      query: [],
    });
    assert.deepEqual(result, {
      text: `${PREFIX}Истекло время ожидания.`,
      isError: true,
    });
    assert.equal(seen.length, 1);
    assert.equal(connections, 1);

    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const offline = createServiceClient({
      ...publication,
      url: `http://127.0.0.1:${port}/hs/objects`,
    });
    assert.deepEqual(
      await offline.request({ method: "GET", path: "/types", query: [] }),
      { text: `${PREFIX}Нет соединения.`, isError: true },
    );
  });

  test("за вызов ничего не пишет в console", async () => {
    const calls: unknown[][] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => void calls.push(args);
    console.error = (...args: unknown[]) => void calls.push(args);
    try {
      const client = createServiceClient(publication);
      await client.request({ method: "GET", path: "/types", query: [] });
      setHandler(reply(500, "не json"));
      await client.request({ method: "GET", path: "/types", query: [] });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    assert.deepEqual(calls, []);
  });
});
