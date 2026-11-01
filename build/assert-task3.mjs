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
function format(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function get(path) {
  const res = await fetch(env.OBJECT_SERVICE_URL + path, {
    headers: { Authorization: env.OBJECT_SERVICE_AUTH },
  });
  const body = await res.json();
  return { status: res.status, body };
}

const product = env.REGISTER_PRODUCT;
const now = format(new Date());
const slice = await get(
  "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры")
  + "&date=" + encodeURIComponent(now)
  + "&" + encodeURIComponent("Номенклатура") + "=" + encodeURIComponent(product),
);
const history = await get(
  "/register/history?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры")
  + "&" + encodeURIComponent("Номенклатура") + "=" + encodeURIComponent(product),
);
expect(history.status === 200, "history status " + history.status + " " + JSON.stringify(history.body).slice(0, 400));
if (history.status === 200) {
  const items = history.body.items;
  let previous = null;
  for (const item of items) {
    expect(String(item.dimensions?.Номенклатура).toLowerCase() === product.toLowerCase(), "history product");
    if (previous !== null) expect(item.period <= previous, "history order " + previous + " then " + item.period);
    previous = item.period;
  }
  const sliceItem = slice.body.items && slice.body.items[0];
  const future = items.some((item) => item.period > now);
  if (sliceItem && !future) {
    expect(JSON.stringify(items[0]) === JSON.stringify(sliceItem), "history first != slice");
  }
  console.log("history items=" + items.length + " sliceItems=" + (slice.body.items || []).length + " future=" + future);
}

const withDate = await get(
  "/register/history?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры") + "&date=2026-01-01",
);
const path = withDate.body.error?.details?.[0]?.path;
expect(withDate.status === 400 && withDate.body.error?.code === "invalid_parameter", "historyWithDate " + withDate.status);
expect(path === "date", "historyWithDate path " + path);
console.log("historyWithDate path=" + path + " code=" + withDate.body.error?.code);

if (failures.length) {
  console.log("FAILURES");
  for (const failure of failures) console.log("- " + failure);
  process.exit(1);
}
console.log("task3 ok");
