import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync("src/tests/.env", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}
const bodies = {
  priceRecord: { name: "РегистрСведений._ДемоЦеныНоменклатуры", period: "2026-11-01T00:00:00", dimensions: { Номенклатура: env.REGISTER_PRODUCT }, resources: { Цена: 1500 } },
  workerRecord: { name: "РегистрСведений._ДемоРаботникиОрганизаций", period: "2015-01-20T00:00:00", dimensions: {}, resources: {} },
  recordMissingResource: { name: "РегистрСведений._ДемоЦеныНоменклатуры", period: "2026-11-01", dimensions: { Номенклатура: env.REGISTER_PRODUCT }, resources: {} },
  subordinateRecord: { name: "РегистрСведений.ОтветыНаВопросыАнкет", period: "2026-11-01", dimensions: {}, resources: {} },
};
for (const [name, body] of Object.entries(bodies)) {
  const res = await fetch(env.OBJECT_SERVICE_URL + "/register/record", {
    method: "POST",
    headers: { Authorization: env.OBJECT_SERVICE_AUTH, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  console.log(name + " status=" + res.status + " code=" + (payload.error && payload.error.code));
}
