import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync("src/tests/.env", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const failures = [];
function expect(condition, message) {
  if (!condition) failures.push(message);
}

async function get(path) {
  const res = await fetch(env.OBJECT_SERVICE_URL + path, {
    headers: { Authorization: env.OBJECT_SERVICE_AUTH },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: res.status, body };
}

function fieldBrief(field) {
  const types = (field.types || []).map((type) => {
    const extra = [];
    if (type.kind === "number") extra.push(`${type.digits}.${type.fractionDigits}`, type.nonnegative ? "nonneg" : "any");
    if (type.kind === "string") extra.push(`len=${type.length}`, type.fixedLength ? "fixed" : "var");
    if (type.targetType) extra.push(type.targetType);
    return `${type.name}/${type.kind}${extra.length ? "(" + extra.join(",") + ")" : ""}`;
  });
  return `${field.name} required=${field.required} writable=${field.writable} types=${types.join("|")}`;
}

const types = await get("/types?q=" + encodeURIComponent("цен") + "&limit=100");
expect(types.status === 200, "registerTypes status " + types.status);
const priceType = (types.body.items || []).find((item) => item.name === "РегистрСведений._ДемоЦеныНоменклатуры");
expect(!!priceType, "registerTypes missing price register");
if (priceType) {
  expect(priceType.kind === "register", "price kind " + priceType.kind);
  expect(priceType.title === "Демо: Цены номенклатуры", "price title " + priceType.title);
  const opKeys = Object.keys(priceType.operations || {}).sort().join(",");
  expect(opKeys === "history,record,slice", "price ops " + opKeys);
  console.log("registerTypes price ok title=" + priceType.title);
}

const subTypes = await get("/types?q=" + encodeURIComponent("ОтветыНаВопросыАнкет"));
expect(subTypes.status === 200, "subordinateTypes status " + subTypes.status);
const subNames = (subTypes.body.items || []).map((item) => item.name);
expect(!subNames.includes("РегистрСведений.ОтветыНаВопросыАнкет"), "subordinate listed " + subNames.join("|"));
console.log("subordinateTypes count=" + subNames.length);

const expected = {
  pricesSchema: {
    name: "РегистрСведений._ДемоЦеныНоменклатуры",
    periodicity: "second",
    dimensions: ["Номенклатура"],
    resources: ["Цена"],
    attributes: [],
    required: { Номенклатура: true, Цена: false },
  },
  ratesSchema: {
    name: "РегистрСведений.КурсыВалют",
    periodicity: "day",
    dimensions: ["Валюта"],
    resources: ["Курс", "Кратность"],
    attributes: [],
    required: { Валюта: true, Курс: true, Кратность: true },
  },
  workersSchema: {
    name: "РегистрСведений._ДемоРаботникиОрганизаций",
    periodicity: "day",
    dimensions: ["Организация", "ФизическоеЛицо"],
    resources: ["ПодразделениеОрганизации", "ЗанимаемыхСтавок"],
    attributes: ["ТабельныйНомер"],
    required: { Организация: true, ФизическоеЛицо: true, ПодразделениеОрганизации: false, ЗанимаемыхСтавок: false, ТабельныйНомер: false },
  },
};

for (const [label, spec] of Object.entries(expected)) {
  const result = await get("/register?name=" + encodeURIComponent(spec.name));
  expect(result.status === 200, label + " status " + result.status);
  const body = result.body;
  if (result.status !== 200) {
    console.log(label + " status=" + result.status + " code=" + (body.error && body.error.code));
    continue;
  }
  expect(body.periodicity === spec.periodicity, label + " periodicity " + body.periodicity);
  const names = (list) => (list || []).map((field) => field.name).join(",");
  expect(names(body.dimensions) === spec.dimensions.join(","), label + " dimensions " + names(body.dimensions));
  expect(names(body.resources) === spec.resources.join(","), label + " resources " + names(body.resources));
  expect(names(body.attributes) === spec.attributes.join(","), label + " attributes " + names(body.attributes));
  for (const field of [...body.dimensions, ...body.resources, ...body.attributes]) {
    if (spec.required[field.name] !== undefined) {
      expect(field.required === spec.required[field.name], label + " " + field.name + " required=" + field.required);
    }
    console.log(label + " " + fieldBrief(field) + " reason=" + field.reason);
  }
  const template = body.exchange && body.exchange.recordTemplate;
  const templateKeys = template ? Object.keys(template).sort().join(",") : "";
  expect(templateKeys === "dimensions,name,period,resources", label + " template " + templateKeys);
  expect(typeof body.exchange.periodRule === "string" && body.exchange.periodRule.length > 0, label + " periodRule");
  expect(typeof body.exchange.filterRule === "string" && body.exchange.filterRule.length > 0, label + " filterRule");
  const rules = (body.rules || []).join(" | ");
  expect(/период/i.test(rules) && /ключ/i.test(rules), label + " rules replace");
  expect(/реквизит/i.test(rules) && /сохран/i.test(rules), label + " rules attributes");
  expect(/удален/i.test(rules), label + " rules delete");
  expect(/измерен/i.test(rules), label + " rules filter");
  expect(/100/.test(rules) && /hasMore/.test(rules), label + " rules limit");
  console.log(label + " periodicity=" + body.periodicity + " rules=" + body.rules.length);
}

const nonperiodic = await get("/register?name=" + encodeURIComponent("РегистрСведений._ДемоОтветственныеЛица"));
expect(nonperiodic.status === 200, "nonperiodic status " + nonperiodic.status);
expect(nonperiodic.body.periodicity === "nonperiodic", "nonperiodic periodicity " + nonperiodic.body.periodicity);
const allowed = ["slice", "history", "record"].map((key) => nonperiodic.body.operations?.[key]?.allowed);
expect(allowed.every((value) => value === false), "nonperiodic allowed " + allowed.join(","));
console.log("nonperiodic ops=" + ["slice", "history", "record"].map((key) => key + ":" + nonperiodic.body.operations?.[key]?.allowed).join(","));

async function expectUnsupported(label, name, includes) {
  const result = await get("/register?name=" + encodeURIComponent(name));
  const detail = result.body.error && result.body.error.details && result.body.error.details[0];
  const message = detail ? detail.message : "";
  expect(result.status === 422, label + " status " + result.status);
  expect(result.body.error && result.body.error.code === "unsupported_type", label + " code");
  expect(detail && detail.path === "name", label + " path " + (detail && detail.path));
  expect(message.includes(includes), label + " message " + message);
  console.log(label + " status=" + result.status + " path=" + (detail && detail.path) + " message=" + message);
}

await expectUnsupported("subordinateSchema", "РегистрСведений.ОтветыНаВопросыАнкет", "подчинён регистратору");
await expectUnsupported("catalogAsRegister", "Справочник._ДемоНоменклатура", "Поддерживаются только независимые регистры сведений");

const worker = (await get("/register?name=" + encodeURIComponent("РегистрСведений._ДемоРаботникиОрганизаций"))).body;
const badge = (worker.attributes || []).find((field) => field.name === "ТабельныйНомер");
expect(badge && badge.writable === false, "ТабельныйНомер writable");

if (failures.length) {
  console.log("FAILURES");
  for (const failure of failures) console.log("- " + failure);
  process.exit(1);
}
console.log("task1 ok");
