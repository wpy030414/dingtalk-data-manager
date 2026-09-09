import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const transport = new StdioClientTransport({
  command: "node", args: [resolve(__dirname, "dist", "index.js")], cwd: __dirname,
});
const client = new Client({ name: "audit", version: "1.0" }, { capabilities: {} });

await client.connect(transport);

const serverInfo = client.getServerVersion();
const caps = client.getServerCapabilities();
console.log("=== Server ===");
console.log(JSON.stringify({ serverInfo, caps }, null, 2));

const all = await client.listTools();
console.log(`\n=== Tools (${all.tools.length}) ===`);
let missingDesc = 0;
for (const t of all.tools) {
  const props = t.inputSchema?.properties ?? {};
  const required = t.inputSchema?.required ?? [];
  // minimal output
}
console.log(`\ndescriptions: ${missingDesc} missing`);

// ── 实测：formUuid + userId 自动补全 ──
const steps = [];
async function T(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  for (const c of r.content) { if (c.type === "text") return JSON.parse(c.text); }
  return null;
}
function OK(s) { steps.push(s); }

T("dingtalk_yida_list_apps").then(apps => {
  const appName = apps?.data?.[0]?.name;
  OK("1) list_apps → " + appName);
  return T("dingtalk_yida_get_form_fields", { appName });
}).then(fields => {
  OK(`2) get_form_fields (只传 appName) → ${fields?.data?.length} 个字段`);
  return T("dingtalk_yida_query_form_data", { appName: "学生外出参赛申请", pageSize: 1 });
}).then(data => {
  OK(`3) query_form_data (只传 appName) → total=${data?.data?.total} items=${data?.data?.items?.length}`);
  const item = data?.data?.items?.[0];
  OK(`   首条: ${item?.formInstanceId} | 字段数=${Object.keys(item?.formData ?? {}).length}`);
  return T("dingtalk_yida_list_process_instances", { appName: "学生外出参赛申请", pageSize: 2 });
}).then(procs => {
  OK(`4) list_process_instances (只传 appName) → total=${procs?.data?.total}`);
  return OK("---");
}).catch(e => OK("ERR: " + (e?.message || e))).then(() => {
  for (const s of steps) console.log(s);
  return client.close().then(() => process.exit(0));
});

// Resources / prompts — does the agent get any extra context?
const res = await client.listResources().catch((e) => ({ error: String(e) }));
const prompts = await client.listPrompts().catch((e) => ({ error: String(e) }));
console.log(`\n=== Resources === ${JSON.stringify(res).slice(0, 300)}`);
console.log(`=== Prompts === ${JSON.stringify(prompts).slice(0, 300)}`);

await client.close();
