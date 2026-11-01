import assert from "node:assert/strict";
import { test } from "node:test";

import type { ServiceClient, ServiceRequest, ToolResult } from "./client.ts";
import {
  executeTool,
  limitArg,
  missingArg,
  objectArg,
  stringArg,
  unknownTool,
} from "./execute.ts";

const OK_TEXT = '{"items":[],"hasMore":false}';

function fakeClient(): { client: ServiceClient; requests: ServiceRequest[] } {
  const requests: ServiceRequest[] = [];
  const client: ServiceClient = {
    async request(input): Promise<ToolResult> {
      requests.push(input);
      return { text: OK_TEXT, isError: false };
    },
  };
  return { client, requests };
}

test("передаёт целый limit как есть и не подставляет отсутствующий", async () => {
  const { client, requests } = fakeClient();

  const result = await executeTool("find_types", { q: "счет", limit: 0 }, client);
  assert.deepEqual(result, { text: OK_TEXT, isError: false });
  await executeTool("find_types", { q: "счет", limit: -3 }, client);
  await executeTool("find_types", { q: "счет" }, client);
  await executeTool("find_types", { q: "счет", лишний: "x", extra: 1 }, client);

  assert.equal(requests.length, 4);
  assert.equal(requests[0]!.method, "GET");
  assert.equal(requests[0]!.path, "/types");
  assert.deepEqual(requests[0]!.query, [
    ["q", "счет"],
    ["limit", "0"],
  ]);
  assert.deepEqual(requests[1]!.query, [
    ["q", "счет"],
    ["limit", "-3"],
  ]);
  assert.deepEqual(requests[2]!.query, [["q", "счет"]]);
  assert.deepEqual(requests[3]!.query, [["q", "счет"]]);
});

test("пустая строка q уходит в запрос", async () => {
  const { client, requests } = fakeClient();

  await executeTool("find_types", { q: "" }, client);

  assert.deepEqual(requests.map((request) => request.query), [[["q", ""]]]);
});

test("поиск объектов, описание и чтение собирают свои запросы", async () => {
  const { client, requests } = fakeClient();

  await executeTool(
    "find_objects",
    { limit: 5, q: "100", type: "Документ.Счет" },
    client,
  );
  await executeTool("describe_type", { name: "Справочник.Контрагенты" }, client);
  await executeTool(
    "read_object",
    { id: "abc", type: "Справочник.Контрагенты" },
    client,
  );

  assert.deepEqual(requests, [
    {
      method: "GET",
      path: "/search",
      query: [
        ["type", "Документ.Счет"],
        ["q", "100"],
        ["limit", "5"],
      ],
    },
    {
      method: "GET",
      path: "/type",
      query: [["name", "Справочник.Контрагенты"]],
    },
    {
      method: "GET",
      path: "/object",
      query: [
        ["type", "Справочник.Контрагенты"],
        ["id", "abc"],
      ],
    },
  ]);
});

test("создание объекта шлёт один POST, а повтор остаётся вторым запросом", async () => {
  const { client, requests } = fakeClient();
  const args = {
    tables: {},
    header: { "А": 1 },
    type: "Документ.Счет",
    лишний: "x",
  };

  const first = await executeTool("create_object", args, client);
  assert.deepEqual(first, { text: OK_TEXT, isError: false });
  assert.equal(requests.length, 1);

  await executeTool("create_object", args, client);
  assert.equal(requests.length, 2);

  const request = requests[0]!;
  assert.equal(request.method, "POST");
  assert.equal(request.path, "/object");
  assert.deepEqual(request.query, []);
  assert.equal(request.contentType, "application/json; charset=utf-8");
  assert.equal(
    request.body,
    JSON.stringify({ type: "Документ.Счет", header: { "А": 1 }, tables: {} }),
  );
  assert.deepEqual(Object.keys(JSON.parse(request.body!)), [
    "type",
    "header",
    "tables",
  ]);
  assert.deepEqual(requests[1], request);
});

const invalidCalls: Array<[string, string, unknown, string]> = [
  ["нет args", "find_types", undefined, missingArg("q")],
  ["нет q", "find_types", {}, missingArg("q")],
  ["q число", "find_types", { q: 5 }, stringArg("q")],
  ["limit строка", "find_types", { q: "a", limit: "20" }, limitArg()],
  ["limit дробь", "find_types", { q: "a", limit: 1.5 }, limitArg()],
  ["limit бесконечность", "find_types", { q: "a", limit: Infinity }, limitArg()],
  [
    "limit у find_objects",
    "find_objects",
    { type: "Т", q: "a", limit: "1" },
    limitArg(),
  ],
  [
    "header массив",
    "create_object",
    { type: "Т", header: [], tables: {} },
    objectArg("header"),
  ],
  [
    "tables null",
    "create_object",
    { type: "Т", header: {}, tables: null },
    objectArg("tables"),
  ],
  [
    "нет header",
    "create_object",
    { type: "Т", tables: {} },
    missingArg("header"),
  ],
  ["нет name", "describe_type", {}, missingArg("name")],
  ["нет id", "read_object", { type: "Т" }, missingArg("id")],
  ["неизвестное имя", "drop_object", { q: "a" }, unknownTool("drop_object")],
];

for (const [title, name, args, text] of invalidCalls) {
  test(`неверный вызов не уходит в сервис: ${title}`, async () => {
    const { client, requests } = fakeClient();

    const result = await executeTool(name, args, client);

    assert.deepEqual(result, { text, isError: true });
    assert.equal(requests.length, 0);
  });
}

test("фразы отказов совпадают с постановкой", () => {
  assert.equal(
    missingArg("q"),
    "Неверный вызов инструмента. Не передан аргумент q.",
  );
  assert.equal(
    stringArg("q"),
    "Неверный вызов инструмента. Аргумент q должен быть строкой.",
  );
  assert.equal(
    limitArg(),
    "Неверный вызов инструмента. Аргумент limit должен быть целым числом.",
  );
  assert.equal(
    objectArg("header"),
    "Неверный вызов инструмента. Аргумент header должен быть объектом.",
  );
  assert.equal(
    unknownTool("x"),
    "Неверный вызов инструмента. Неизвестный инструмент x.",
  );
});
