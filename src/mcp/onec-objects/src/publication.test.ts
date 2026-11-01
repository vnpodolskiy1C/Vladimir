import assert from "node:assert/strict";
import test from "node:test";

import { loadPublication, StartupError } from "./publication.ts";

test("берёт адрес, пользователя и пароль из окружения", () => {
  assert.deepEqual(
    loadPublication({
      OBJECT_SERVICE_URL: " http://127.0.0.1:9/demo/hs/objects/ ",
      OBJECT_SERVICE_USER: "Иван",
      OBJECT_SERVICE_PASSWORD: "секрет",
    }),
    { url: "http://127.0.0.1:9/demo/hs/objects", user: "Иван", password: "секрет" },
  );
});

test("пароль необязателен", () => {
  assert.equal(
    loadPublication({ OBJECT_SERVICE_URL: "http://127.0.0.1:9", OBJECT_SERVICE_USER: "Иван" })
      .password,
    "",
  );
});

test("без адреса и пользователя называет переменные и не раскрывает пароль", () => {
  assert.throws(
    () => loadPublication({ OBJECT_SERVICE_PASSWORD: "секрет" }),
    (error: unknown) => {
      assert.ok(error instanceof StartupError);
      assert.equal(
        error.message,
        "Не заданы переменные окружения: OBJECT_SERVICE_URL, OBJECT_SERVICE_USER.",
      );
      return true;
    },
  );
});
