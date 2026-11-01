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
function format(date, withTime) {
  const text = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return text;
  return `${text}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

function detail(body) {
  return body.error && body.error.details && body.error.details[0];
}

const now = new Date();
const monthAgo = new Date(now);
monthAgo.setMonth(monthAgo.getMonth() - 1);
const product = env.REGISTER_PRODUCT;
const priceNow = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры")
  + "&date=" + encodeURIComponent(format(now, true))
  + "&" + encodeURIComponent("Номенклатура") + "=" + encodeURIComponent(product),
);
expect(priceNow.status === 200, "priceNow status " + priceNow.status + " " + JSON.stringify(priceNow.body).slice(0, 400));
if (priceNow.status === 200) {
  expect(priceNow.body.name === "РегистрСведений._ДемоЦеныНоменклатуры", "priceNow name");
  expect(priceNow.body.date === format(now, true), "priceNow date " + priceNow.body.date);
  expect(priceNow.body.hasMore === false, "priceNow hasMore");
  expect(Array.isArray(priceNow.body.items), "priceNow items");
  for (const item of priceNow.body.items) {
    expect(String(item.dimensions?.Номенклатура).toLowerCase() === product.toLowerCase(), "priceNow product");
    expect(typeof item.resources?.Цена === "number", "priceNow price " + typeof item.resources?.Цена);
    expect(typeof item.period === "string", "priceNow period");
  }
  console.log("priceNow items=" + priceNow.body.items.length + " date=" + priceNow.body.date);
}

const priceMonth = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры")
  + "&date=" + encodeURIComponent(format(monthAgo, true))
  + "&" + encodeURIComponent("Номенклатура") + "=" + encodeURIComponent(product),
);
expect(priceMonth.status === 200, "priceMonth status " + priceMonth.status + " " + JSON.stringify(priceMonth.body).slice(0, 400));
if (priceMonth.status === 200) {
  expect(priceMonth.body.hasMore === false, "priceMonth hasMore");
  for (const item of priceMonth.body.items) {
    expect(String(item.dimensions?.Номенклатура).toLowerCase() === product.toLowerCase(), "priceMonth product");
    expect(typeof item.resources?.Цена === "number", "priceMonth price");
  }
  console.log("priceMonth items=" + priceMonth.body.items.length + " date=" + priceMonth.body.date);
}

const today = format(now, false);
const rate = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений.КурсыВалют")
  + "&date=" + today
  + "&" + encodeURIComponent("Валюта") + "=" + encodeURIComponent(env.REGISTER_CURRENCY),
);
expect(rate.status === 200, "rate status " + rate.status + " " + JSON.stringify(rate.body).slice(0, 400));
if (rate.status === 200) {
  expect(rate.body.date === today + "T23:59:59", "rate date " + rate.body.date);
  expect(rate.body.items.length > 0, "rate empty");
  const item = rate.body.items[0];
  if (item) {
    expect(typeof item.resources?.Курс === "number", "rate kurs");
    expect(typeof item.resources?.Кратность === "number", "rate multiplicity");
  }
  console.log("rate date=" + rate.body.date + " items=" + rate.body.items.length);
}

const worker = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоРаботникиОрганизаций")
  + "&date=" + today
  + "&" + encodeURIComponent("Организация") + "=" + encodeURIComponent(env.REGISTER_ORGANIZATION)
  + "&" + encodeURIComponent("ФизическоеЛицо") + "=" + encodeURIComponent(env.REGISTER_PERSON),
);
expect(worker.status === 200, "worker status " + worker.status + " " + JSON.stringify(worker.body).slice(0, 500));
if (worker.status === 200) {
  expect(worker.body.items.length > 0, "worker empty");
  const item = worker.body.items[0];
  if (item) {
    expect("ПодразделениеОрганизации" in (item.resources || {}), "worker department");
    expect("ТабельныйНомер" in (item.attributes || {}), "worker badge");
    console.log("worker period=" + item.period + " badge=" + JSON.stringify(item.attributes.ТабельныйНомер) + " deptType=" + typeof item.resources.ПодразделениеОрганизации);
  }
}

const byResource = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры") + "&" + encodeURIComponent("Цена") + "=1",
);
const byResourceDetail = detail(byResource.body);
expect(byResource.status === 400, "sliceByResource status " + byResource.status);
expect(byResource.body.error?.code === "invalid_parameter", "sliceByResource code");
expect(byResourceDetail?.path === "Цена", "sliceByResource path " + byResourceDetail?.path);
console.log("sliceByResource path=" + byResourceDetail?.path);

const badDate = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений.КурсыВалют") + "&date=2026-13-01",
);
const badDateDetail = detail(badDate.body);
expect(badDate.status === 400 && badDate.body.error?.code === "invalid_parameter", "sliceBadDate " + badDate.status);
expect(badDateDetail?.path === "date", "sliceBadDate path " + badDateDetail?.path);
console.log("sliceBadDate path=" + badDateDetail?.path);

const nonperiodic = await get("/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоОтветственныеЛица"));
expect(nonperiodic.status === 422 && nonperiodic.body.error?.code === "unsupported_operation", "nonperiodicSlice " + nonperiodic.status + " " + nonperiodic.body.error?.code);
console.log("nonperiodicSlice code=" + nonperiodic.body.error?.code);

const subordinate = await get("/register/slice?name=" + encodeURIComponent("РегистрСведений.ОтветыНаВопросыАнкет"));
expect(subordinate.status === 422 && subordinate.body.error?.code === "unsupported_type", "subordinateSlice " + subordinate.status);
console.log("subordinateSlice code=" + subordinate.body.error?.code);

if (failures.length) {
  console.log("FAILURES");
  for (const failure of failures) console.log("- " + failure);
  process.exit(1);
}
console.log("task2 ok");
