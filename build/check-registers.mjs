import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync("src/tests/.env", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const base = env.OBJECT_SERVICE_URL;
const auth = env.OBJECT_SERVICE_AUTH;
if (!base || !auth) {
  console.log("missing env keys");
  process.exit(2);
}

async function get(path) {
  const res = await fetch(base + path, { headers: { Authorization: auth } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function code(result) {
  return result.body && result.body.error ? result.body.error.code : "";
}

const names = process.argv.slice(2);
const catalog = {
  registerTypes: "/types?q=" + encodeURIComponent("цен") + "&limit=100",
  pricesSchema: "/register?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры"),
  ratesSchema: "/register?name=" + encodeURIComponent("РегистрСведений.КурсыВалют"),
  workersSchema: "/register?name=" + encodeURIComponent("РегистрСведений._ДемоРаботникиОрганизаций"),
  nonperiodicSchema: "/register?name=" + encodeURIComponent("РегистрСведений._ДемоОтветственныеЛица"),
  subordinateSchema: "/register?name=" + encodeURIComponent("РегистрСведений.ОтветыНаВопросыАнкет"),
  subordinateTypes: "/types?q=" + encodeURIComponent("ОтветыНаВопросыАнкет"),
  catalogAsRegister: "/register?name=" + encodeURIComponent("Справочник._ДемоНоменклатура"),
  priceNow: "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры"),
  rateToday: "/register/slice?name=" + encodeURIComponent("РегистрСведений.КурсыВалют"),
  workerNow: "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоРаботникиОрганизаций"),
  sliceByResource: "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры") + "&" + encodeURIComponent("Цена") + "=1",
  nonperiodicSlice: "/register/slice?name=" + encodeURIComponent("РегистрСведений._ДемоОтветственныеЛица"),
  subordinateSlice: "/register/slice?name=" + encodeURIComponent("РегистрСведений.ОтветыНаВопросыАнкет"),
  sliceBadDate: "/register/slice?name=" + encodeURIComponent("РегистрСведений.КурсыВалют") + "&date=2026-13-01",
  priceHistory: "/register/history?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры"),
  historyWithDate: "/register/history?name=" + encodeURIComponent("РегистрСведений._ДемоЦеныНоменклатуры") + "&date=2026-01-01",
};

const selected = names.length > 0 ? names : Object.keys(catalog);
let failed = 0;
for (const name of selected) {
  const path = catalog[name];
  if (!path) {
    console.log(name + " unknown");
    failed++;
    continue;
  }
  try {
    const result = await get(path);
    let extra = "code=" + code(result);
    if (name.endsWith("Types") || name === "registerTypes") {
      const items = result.body && Array.isArray(result.body.items) ? result.body.items : [];
      extra = "count=" + items.length + " names=" + items.map((item) => item.name).join("|");
    } else if (result.status === 200 && result.body) {
      const periodicity = result.body.periodicity ?? "";
      const ops = result.body.operations
        ? Object.entries(result.body.operations)
            .map(([key, value]) => key + ":" + value.allowed)
            .join(",")
        : "";
      extra = "periodicity=" + periodicity + " ops=" + ops + " keys=" + Object.keys(result.body).join(",");
    }
    console.log(name + " status=" + result.status + " " + extra);
  } catch (error) {
    failed++;
    const message = String(error.message || error).split("\n")[0];
    console.log(name + " FAIL " + error.name + " " + message);
  }
}
process.exit(failed > 0 ? 1 : 0);
