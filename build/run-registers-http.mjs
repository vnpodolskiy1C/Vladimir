import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync("src/tests/.env", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const responses = {};

function pad(value) {
  return String(value).padStart(2, "0");
}
function format(date, pattern) {
  const map = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token]);
}

function expand(text) {
  return text.replace(/\{\{([^}]+)\}\}/g, (_all, expr) => {
    const source = expr.trim();
    const dotenv = /^\$dotenv\s+([A-Z0-9_]+)$/.exec(source);
    if (dotenv) return env[dotenv[1]] ?? "";
    const datetime = /^\$datetime\s+"([^"]+)"(?:\s+-1\s+M)?$/.exec(source);
    if (datetime) {
      const date = new Date();
      if (/-1\s+M$/.test(source)) date.setMonth(date.getMonth() - 1);
      return format(date, datetime[1]);
    }
    const ref = /^(\w+)\.response\.body\.\$\.(.+)$/.exec(source);
    if (ref) {
      let value = responses[ref[1]];
      for (const part of ref[2].split(".")) {
        const index = /^(\w+)\[(\d+)\]$/.exec(part);
        const key = /^(\w+)\['(.+)'\]$/.exec(part);
        if (index) value = value[index[1]][Number(index[2])];
        else if (key) value = value[key[1]][key[2]];
        else value = value[part];
      }
      return String(value);
    }
    throw new Error("unexpanded " + source);
  });
}

const file = readFileSync("src/tests/registers.http", "utf8");
const blocks = file.split(/^### /m).slice(1);
let failed = 0;
for (const block of blocks) {
  const name = /@name\s+(\S+)/.exec(block)?.[1] ?? block.slice(0, 24);
  const lines = block.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  const requestLine = lines.find((line) => /^(GET|POST)\s+/.test(line));
  const method = requestLine.slice(0, requestLine.indexOf(" "));
  const rawUrl = requestLine.slice(method.length).trim();
  const headerLines = lines.filter((line) => /^[A-Za-z-]+:\s+/.test(line) && !line.startsWith(method));
  const bodyStart = block.indexOf("\n\n{");
  const rawBody = bodyStart === -1 ? undefined : block.slice(bodyStart).trim();
  const url = expand(rawUrl);
  const headers = {};
  for (const header of headerLines) {
    const split = header.indexOf(":");
    headers[header.slice(0, split).trim()] = expand(header.slice(split + 1).trim());
  }
  const body = rawBody === undefined ? undefined : expand(rawBody);
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  responses[name] = payload;
  const code = payload?.error?.code ?? "";
  const hint = payload?.periodicity
    ? payload.periodicity
    : payload?.replaced !== undefined
      ? "replaced=" + payload.replaced
      : Array.isArray(payload?.items)
        ? "items=" + payload.items.length
        : code;
  if (res.status === 501) failed++;
  console.log(name + " status=" + res.status + " " + hint);
}
if (failed) {
  console.log("501 count=" + failed);
  process.exit(1);
}
console.log("registers.http ok");
