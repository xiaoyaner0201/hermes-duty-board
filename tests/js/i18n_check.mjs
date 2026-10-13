import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../dashboard/dist/index.js", import.meta.url), "utf8");
const start = source.indexOf("/* i18n:start */");
const end = source.indexOf("/* i18n:end */");
if (start < 0 || end < start) throw new Error("i18n markers not found");
const literal = source.slice(source.indexOf("const MESSAGES =", start) + "const MESSAGES =".length, end).replace(/;\s*$/, "");
const messages = vm.runInNewContext("(" + literal + ")");
const locales = Object.keys(messages);
if (locales.length !== 4 || !["en", "zh", "zh-hant", "ja"].every((locale) => locales.includes(locale))) {
  throw new Error(`expected en/zh/zh-hant/ja, got ${locales.join(",")}`);
}
const flatten = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return child && typeof child === "object" ? flatten(child, path) : [path];
}).sort();
const expected = flatten(messages.en);
for (const locale of locales) {
  const keys = flatten(messages[locale]);
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`${locale} keys differ from en`);
}
console.log(`i18n catalogs OK: ${locales.join(", ")}; ${expected.length} keys`);
