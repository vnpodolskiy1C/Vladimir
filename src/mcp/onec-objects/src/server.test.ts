import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { ServiceClient, ServiceRequest } from "./client.ts";
import { missingArg, notConnected, stringArg } from "./execute.ts";
import {
  CREATE_ANNOTATIONS,
  READ_ANNOTATIONS,
  RECORD_ANNOTATIONS,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
  createMcpServer,
} from "./server.ts";

const SPEC = readFileSync(
  fileURLToPath(
    new URL("../../../../docs/superpowers/specs/2026-10-29-onec-objects-mcp-design.md", import.meta.url),
  ),
  "utf8",
);

const NAMES = ["find_types", "describe_type", "find_objects", "read_object", "create_object"];

function fenceAfter(marker: string): string {
  const start = SPEC.indexOf(marker);
  assert.notEqual(start, -1, `в спецификации нет ${marker}`);
  const match = /```text\n([\s\S]*?)\n```/.exec(SPEC.slice(start + marker.length));
  assert.ok(match, `после ${marker} нет ограды`);
  return match[1]!;
}

function specInstruction(): string {
  return fenceAfter("Общая инструкция сервера");
}

function specDescription(name: string): string {
  const section = SPEC.slice(SPEC.indexOf("### Описания"));
  const marker = `\`${name}\`:\n`;
  assert.notEqual(section.indexOf(marker), -1, `в спецификации нет описания ${name}`);
  return fenceAfter(marker);
}

function specTitle(name: string): string {
  const row = new RegExp(`^\\| \`${name}\` \\| ([^|]+?) \\|`, "m").exec(SPEC);
  assert.ok(row, `в таблице нет ${name}`);
  return row[1]!;
}

const ARG_Q_TYPES = "Слово для поиска по техническому имени или синониму типа.";
const ARG_LIMIT =
  "Необязательный предел выдачи. Без аргумента сервис применяет свой предел. Переданное целое уходит в сервис как есть.";
const ARG_NAME = "Полное техническое имя типа в форме Вид.Имя.";
const ARG_TYPE = "Полное техническое имя типа в форме Вид.Имя.";
const ARG_Q_OBJECTS = "Строка поиска. У справочника это часть наименования, у документа — номер.";
const ARG_ID = "Идентификатор объекта из поиска или создания.";
const ARG_HEADER = "Шапка объекта. Состав полей берётся из описания типа.";
const ARG_TABLES = "Табличные части объекта. Состав берётся из описания типа.";

const ARGUMENTS: Record<string, Record<string, string>> = {
  find_types: { q: ARG_Q_TYPES, limit: ARG_LIMIT },
  describe_type: { name: ARG_NAME },
  find_objects: { type: ARG_TYPE, q: ARG_Q_OBJECTS, limit: ARG_LIMIT },
  read_object: { type: ARG_TYPE, id: ARG_ID },
  create_object: { type: ARG_TYPE, header: ARG_HEADER, tables: ARG_TABLES },
};

const REQUIRED: Record<string, string[]> = {
  find_types: ["q"],
  describe_type: ["name"],
  find_objects: ["type", "q"],
  read_object: ["type", "id"],
  create_object: ["type", "header", "tables"],
};

function fakeClient(text: string, isError = false) {
  const requests: ServiceRequest[] = [];
  const client: ServiceClient = {
    async request(input) {
      requests.push(input);
      return { text, isError };
    },
  };
  return { client, requests };
}

async function connect(service: ServiceClient) {
  const server = createMcpServer(service);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

test("сервер называется onec-objects и отдаёт инструкцию из спецификации", async () => {
  assert.equal(SERVER_NAME, "onec-objects");
  assert.equal(SERVER_VERSION, "1.0.0");
  assert.equal(SERVER_INSTRUCTIONS, specInstruction());
  const { client, close } = await connect(fakeClient("{}").client);
  try {
    assert.equal(client.getInstructions(), specInstruction());
    assert.equal(client.getServerVersion()?.name, "onec-objects");
  } finally {
    await close();
  }
});

test("объявляет пять инструментов объектов с дословными текстами и пометками", async () => {
  const { client, close } = await connect(fakeClient("{}").client);
  try {
    const { tools: all } = await client.listTools();
    const tools = all.filter((tool) => !REGISTER_NAMES.includes(tool.name));
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [...NAMES].sort());
    for (const tool of tools) {
      assert.equal(tool.title, specTitle(tool.name), `title ${tool.name}`);
      assert.equal(tool.description, specDescription(tool.name), `description ${tool.name}`);
      assert.equal(tool.outputSchema, undefined, `outputSchema ${tool.name}`);
      assert.deepEqual(
        tool.annotations,
        tool.name === "create_object" ? CREATE_ANNOTATIONS : READ_ANNOTATIONS,
        `annotations ${tool.name}`,
      );
      const properties = tool.inputSchema.properties as Record<string, { description?: string }>;
      const expected = ARGUMENTS[tool.name]!;
      assert.deepEqual(Object.keys(properties).sort(), Object.keys(expected).sort(), `аргументы ${tool.name}`);
      for (const [arg, description] of Object.entries(expected)) {
        assert.equal(properties[arg]!.description, description, `${tool.name}.${arg}`);
      }
      assert.deepEqual(
        [...(tool.inputSchema.required ?? [])].sort(),
        [...REQUIRED[tool.name]!].sort(),
        `required ${tool.name}`,
      );
    }
  } finally {
    await close();
  }
});

test("пометки соответствуют ограничениям", () => {
  assert.deepEqual(READ_ANNOTATIONS, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(CREATE_ANNOTATIONS, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
});

test("тексты сервера входят в спецификацию дословно", async () => {
  assert.ok(SPEC.includes(SERVER_INSTRUCTIONS));
  const { client, close } = await connect(fakeClient("{}").client);
  try {
    const { tools } = await client.listTools();
    for (const tool of tools.filter((item) => !REGISTER_NAMES.includes(item.name))) {
      assert.ok(SPEC.includes(tool.description!), `описание ${tool.name}`);
      const properties = tool.inputSchema.properties as Record<string, { description: string }>;
      for (const [arg, schema] of Object.entries(properties)) {
        assert.ok(SPEC.includes(`«${schema.description}»`), `${tool.name}.${arg}`);
      }
    }
  } finally {
    await close();
  }
});

const REGISTER_NAMES = [
  "describe_register",
  "read_register_slice",
  "read_register_history",
  "write_register_record",
];

test("инструменты регистров объявлены, запись помечена как изменяющая", async () => {
  const { client, close } = await connect(fakeClient("{}").client);
  try {
    const { tools } = await client.listTools();
    const registers = tools.filter((tool) => REGISTER_NAMES.includes(tool.name));
    assert.deepEqual(registers.map((tool) => tool.name).sort(), [...REGISTER_NAMES].sort());
    for (const tool of registers) {
      assert.deepEqual(
        tool.annotations,
        tool.name === "write_register_record" ? RECORD_ANNOTATIONS : READ_ANNOTATIONS,
        `annotations ${tool.name}`,
      );
    }
    assert.equal(RECORD_ANNOTATIONS.destructiveHint, true);
  } finally {
    await close();
  }
});

test("инструмент регистра пока отвечает заглушкой и не ходит в сервис", async () => {
  const { client: service, requests } = fakeClient("{}");
  const { client, close } = await connect(service);
  try {
    const result = await client.callTool({
      name: "describe_register",
      arguments: { name: "РегистрСведений.КурсыВалют" },
    });
    assert.deepEqual(result.content, [{ type: "text", text: notConnected("describe_register") }]);
    assert.equal(result.isError, true);
    assert.equal(requests.length, 0);
  } finally {
    await close();
  }
});

test("вызов find_types отдаёт текст клиента сервиса", async () => {
  const { client: service, requests } = fakeClient('{"items":[],"hasMore":true}');
  const { client, close } = await connect(service);
  try {
    const result = await client.callTool({ name: "find_types", arguments: { q: "счет" } });
    assert.deepEqual(result.content, [{ type: "text", text: '{"items":[],"hasMore":true}' }]);
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.equal(requests.length, 1);
  } finally {
    await close();
  }
});

test("вызов без q отдаёт ровно missingArg и не ходит в сервис", async () => {
  const { client: service, requests } = fakeClient("{}");
  const { client, close } = await connect(service);
  try {
    const result = await client.callTool({ name: "find_types", arguments: {} });
    assert.deepEqual(result.content, [{ type: "text", text: missingArg("q") }]);
    assert.equal(result.isError, true);
    assert.equal(requests.length, 0);
  } finally {
    await close();
  }
});

test("create_object с пустыми по допустимости аргументами доходит одним запросом", async () => {
  const { client: service, requests } = fakeClient('{"number":"1"}');
  const { client, close } = await connect(service);
  try {
    const result = await client.callTool({
      name: "create_object",
      arguments: { type: "", header: {}, tables: {} },
    });
    assert.deepEqual(result.content, [{ type: "text", text: '{"number":"1"}' }]);
    assert.notEqual(result.isError, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.method, "POST");
    assert.equal(requests[0]!.body, JSON.stringify({ type: "", header: {}, tables: {} }));
  } finally {
    await close();
  }
});

test("неуспех сервиса помечается неуспехом инструмента", async () => {
  const { client: service } = fakeClient('{"error":"validation_failed"}', true);
  const { client, close } = await connect(service);
  try {
    const result = await client.callTool({ name: "read_object", arguments: { type: "А.Б", id: "1" } });
    assert.deepEqual(result.content, [{ type: "text", text: '{"error":"validation_failed"}' }]);
    assert.equal(result.isError, true);
  } finally {
    await close();
  }
});

test("меню показывает промпт «Выставить счёт» с аргументами покупателя, товара, количества и цены", async () => {
  const { client: service, requests } = fakeClient("{}");
  const { client, close } = await connect(service);
  try {
    const { prompts } = await client.listPrompts();
    assert.equal(prompts.length, 1);
    const prompt = prompts[0]!;
    assert.equal(prompt.name, "Выставить счёт");
    assert.equal(prompt.title, "Выставить счёт");
    assert.equal(prompt.description, "Шаблон просьбы выставить непроведённый счёт на оплату.");
    assert.deepEqual(
      prompt.arguments?.map((argument) => [argument.name, argument.description, argument.required]),
      [
        ["покупатель", "Кому выставить счёт.", true],
        ["товар", "Какой товар включить в счёт.", true],
        ["количество", "Сколько единиц товара.", true],
        ["цена", "Цена за единицу.", true],
      ],
    );
    assert.equal(requests.length, 0);
  } finally {
    await close();
  }
});

test("заполненный промпт подставляет аргументы в просьбу и не обращается к сервису", async () => {
  const { client: service, requests } = fakeClient("{}");
  const { client, close } = await connect(service);
  try {
    const result = await client.getPrompt({
      name: "Выставить счёт",
      arguments: {
        покупатель: "Ромашка",
        товар: "Кабель",
        количество: "2",
        цена: "150",
      },
    });
    assert.deepEqual(result.messages, [
      {
        role: "user",
        content: {
          type: "text",
          text: "Выстави непроведённый счёт на оплату. Покупатель: Ромашка. Товар: Кабель. Количество: 2. Цена: 150.",
        },
      },
    ]);
    assert.equal(requests.length, 0);
  } finally {
    await close();
  }
});

const TYPES_BODY =
  '{"items":[{"name":"Документ._ДемоСчетНаОплатуПокупателю"}],"hasMore":true}';
const TYPES_DESCRIPTION =
  "Список типов справочников и документов из сервиса объектов для контекста приложения. Это ответ сервиса без переработки: поиск по точке в полном имени, предел 100. hasMore true значит, что типов больше.";

test("ресурс «Типы объектов 1С» при чтении отдаёт список типов заглушки", async () => {
  const { client: service, requests } = fakeClient(TYPES_BODY);
  const { client, close } = await connect(service);
  try {
    const { resources } = await client.listResources();
    assert.equal(requests.length, 0);
    assert.equal(resources.length, 1);
    const resource = resources[0]!;
    assert.equal(resource.name, "Типы объектов 1С");
    assert.equal(resource.title, "Типы объектов 1С");
    assert.equal(resource.uri, "onec-objects://types");
    assert.equal(resource.mimeType, "application/json");
    assert.equal(resource.description, TYPES_DESCRIPTION);

    const read = await client.readResource({ uri: "onec-objects://types" });
    assert.deepEqual(read.contents, [
      { uri: "onec-objects://types", mimeType: "application/json", text: TYPES_BODY },
    ]);
    assert.deepEqual(requests, [
      {
        method: "GET",
        path: "/types",
        query: [
          ["q", "."],
          ["limit", "100"],
        ],
      },
    ]);
  } finally {
    await close();
  }
});

test("отказ сервиса не становится списком типов", async () => {
  const { client: service, requests } = fakeClient('{"error":"invalid_parameter"}', true);
  const { client, close } = await connect(service);
  try {
    await assert.rejects(
      () => client.readResource({ uri: "onec-objects://types" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /invalid_parameter/);
        return true;
      },
    );
    assert.equal(requests.length, 1);
  } finally {
    await close();
  }
});

test("неверный тип аргумента отдаёт фразу executeTool и не ходит в сервис", async () => {
  const { client: service, requests } = fakeClient("{}");
  const { client, close } = await connect(service);
  try {
    const result = await client.callTool({ name: "find_types", arguments: { q: 1 } });
    assert.deepEqual(result.content, [{ type: "text", text: stringArg("q") }]);
    assert.equal(result.isError, true);
    assert.equal(requests.length, 0);
  } finally {
    await close();
  }
});
