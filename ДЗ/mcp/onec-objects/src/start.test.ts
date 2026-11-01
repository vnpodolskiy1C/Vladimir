import assert from "node:assert/strict";
import test from "node:test";

import { StartupError } from "./publication.ts";
import { start } from "./start.ts";

test("без переменных окружения не вызывает connect", async () => {
  let connectCalls = 0;
  await assert.rejects(
    start({
      env: {},
      connect: async () => {
        connectCalls += 1;
      },
    }),
    StartupError,
  );
  assert.equal(connectCalls, 0);
});

test("с переменными окружения вызывает connect один раз", async () => {
  const connected: unknown[] = [];
  await start({
    env: { OBJECT_SERVICE_URL: "http://127.0.0.1:9", OBJECT_SERVICE_USER: "Иван" },
    connect: async (server) => {
      connected.push(server);
    },
  });
  assert.equal(connected.length, 1);
});
