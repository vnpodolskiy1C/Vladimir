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

function pad(value) {
  return String(value).padStart(2, "0");
}
function day(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function stamp(date) {
  return `${day(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function call(method, path, body) {
  const res = await fetch(env.OBJECT_SERVICE_URL + path, {
    method,
    headers: {
      Authorization: env.OBJECT_SERVICE_AUTH,
      ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: payload };
}

const now = new Date();
const today = day(now);
const period = today + "T00:00:00";
const monthAgo = new Date(now);
monthAgo.setMonth(monthAgo.getMonth() - 1);
const product = env.REGISTER_PRODUCT;
const priceName = "РегистрСведений._ДемоЦеныНоменклатуры";
const priceQuery = "name=" + encodeURIComponent(priceName) + "&" + encodeURIComponent("Номенклатура") + "=" + encodeURIComponent(product);

const recorded = await call("POST", "/register/record", {
  name: priceName,
  period,
  dimensions: { Номенклатура: product },
  resources: { Цена: 1500 },
});
expect(recorded.status === 200, "priceRecord " + recorded.status + " " + JSON.stringify(recorded.body).slice(0, 600));
if (recorded.status === 200) {
  expect(recorded.body.period === period, "priceRecord period " + recorded.body.period);
  expect(recorded.body.resources?.Цена === 1500, "priceRecord price " + recorded.body.resources?.Цена);
  expect(recorded.body.replaced === false, "priceRecord replaced " + recorded.body.replaced);
  console.log("priceRecord period=" + recorded.body.period + " replaced=" + recorded.body.replaced + " price=" + recorded.body.resources?.Цена);
}

async function slice(date) {
  return call("GET", "/register/slice?" + priceQuery + "&date=" + encodeURIComponent(date));
}
const priceNow = await slice(stamp(now));
const priceToday = await slice(today);
const priceMonth = await slice(stamp(monthAgo));
for (const [label, result, present] of [["priceNow", priceNow, true], ["priceToday", priceToday, true], ["priceMonthAgo", priceMonth, false]]) {
  expect(result.status === 200, label + " status " + result.status + " " + JSON.stringify(result.body).slice(0, 300));
  const found = (result.body.items || []).some((item) => item.period === period && item.resources?.Цена === 1500);
  expect(found === present, label + " found=" + found);
  console.log(label + " date=" + result.body.date + " foundToday=" + found + " items=" + (result.body.items || []).length);
}
expect(priceToday.body.date === today + "T23:59:59", "priceToday date " + priceToday.body.date);

const history = await call("GET", "/register/history?" + priceQuery);
expect(history.status === 200, "history " + history.status);
const count = (history.body.items || []).length;
const first = history.body.items?.[0];
expect(first?.period === period && first?.resources?.Цена === 1500, "history first " + first?.period + " " + first?.resources?.Цена);
console.log("history count=" + count + " first=" + first?.period);

const again = await call("POST", "/register/record", {
  name: priceName,
  period,
  dimensions: { Номенклатура: product },
  resources: { Цена: 1500 },
});
expect(again.status === 200 && again.body.replaced === true, "repeat replaced " + again.status + " " + again.body.replaced + " " + JSON.stringify(again.body).slice(0, 300));
const historyAgain = await call("GET", "/register/history?" + priceQuery);
expect((historyAgain.body.items || []).length === count, "history grew " + historyAgain.body.items?.length + " from " + count);
console.log("repeat replaced=" + again.body.replaced + " history=" + historyAgain.body.items?.length);

const worker = await call(
  "GET",
  "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоРаботникиОрганизаций")
  + "&date=" + today
  + "&" + encodeURIComponent("Организация") + "=" + encodeURIComponent(env.REGISTER_ORGANIZATION)
  + "&" + encodeURIComponent("ФизическоеЛицо") + "=" + encodeURIComponent(env.REGISTER_PERSON),
);
expect(worker.status === 200 && worker.body.items?.length > 0, "workerNow " + worker.status);
const current = worker.body.items?.[0];
if (current) {
  const workerRecord = await call("POST", "/register/record", {
    name: "РегистрСведений._ДемоРаботникиОрганизаций",
    period: current.period,
    dimensions: { Организация: env.REGISTER_ORGANIZATION, ФизическоеЛицо: env.REGISTER_PERSON },
    resources: {
      ПодразделениеОрганизации: current.resources.ПодразделениеОрганизации,
      ЗанимаемыхСтавок: current.resources.ЗанимаемыхСтавок,
    },
  });
  expect(workerRecord.status === 200, "workerRecord " + workerRecord.status + " " + JSON.stringify(workerRecord.body).slice(0, 500));
  if (workerRecord.status === 200) {
    expect(workerRecord.body.replaced === true, "worker replaced " + workerRecord.body.replaced);
    expect(workerRecord.body.attributes?.ТабельныйНомер === current.attributes?.ТабельныйНомер, "badge " + JSON.stringify(workerRecord.body.attributes?.ТабельныйНомер) + " vs " + JSON.stringify(current.attributes?.ТабельныйНомер));
    console.log("workerRecord replaced=" + workerRecord.body.replaced + " badgeSame=" + (workerRecord.body.attributes?.ТабельныйНомер === current.attributes?.ТабельныйНомер));
  }
}

const missing = await call("POST", "/register/record", {
  name: priceName,
  period: today,
  dimensions: { Номенклатура: product },
  resources: {},
});
const missingPath = missing.body.error?.details?.map((item) => item.path).join(",");
expect(missing.status === 400 && missing.body.error?.code === "invalid_data", "missing " + missing.status + " " + missing.body.error?.code);
expect(missingPath?.includes("resources.Цена"), "missing path " + missingPath);
console.log("recordMissingResource path=" + missingPath);

const subordinate = await call("POST", "/register/record", {
  name: "РегистрСведений.ОтветыНаВопросыАнкет",
  period: today,
  dimensions: {},
  resources: {},
});
expect(subordinate.status === 422 && subordinate.body.error?.code === "unsupported_type", "subordinate " + subordinate.status + " " + subordinate.body.error?.code);
console.log("subordinateRecord code=" + subordinate.body.error?.code);

const routes = [
  ["GET", "/register?name=" + encodeURIComponent(priceName)],
  ["GET", "/register/slice?" + priceQuery],
  ["GET", "/register/history?" + priceQuery],
];
for (const [method, path] of routes) {
  const result = await call(method, path);
  expect(result.status !== 501, method + " " + path.split("?")[0] + " 501");
}
expect(recorded.status !== 501 && again.status !== 501, "record 501");

if (failures.length) {
  console.log("FAILURES");
  for (const failure of failures) console.log("- " + failure);
  process.exit(1);
}
console.log("task4 ok");
