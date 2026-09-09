import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const transport = new StdioClientTransport({
  command: "node", args: [resolve(__dirname, "dist", "index.js")], cwd: __dirname,
});
const client = new Client({ name: "test-yida", version: "1.0" }, { capabilities: {} });

async function tool(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  for (const it of r.content) {
    if (it.type === "text" && it.text) {
      try { return JSON.parse(it.text); } catch { return it.text; }
    }
  }
  return null;
}

const APP = "学生外出参赛申请";
const FORM = "FORM-0DA2AFB49FAD4632ACE261A2861424F25DMO";

async function main() {
  await client.connect(transport);
  console.log("✅ MCP connected\n");

  // 1. List apps
  const apps = await tool("dingtalk_yida_list_apps");
  console.log("1️⃣ 宜搭应用列表:", apps.success ? `${apps.data.length} 个` : JSON.stringify(apps));
  if (apps.success) for (const a of apps.data) console.log(`   - ${a.name} (${a.appId})`);

  // 2. List forms
  const forms = await tool("dingtalk_yida_list_forms", { appName: APP });
  console.log("\n2️⃣ 表单列表:", forms.success ? `${forms.data.length} 个` : JSON.stringify(forms));
  if (forms.success) for (const f of forms.data) console.log(`   - ${f.title} | ${f.formUuid} | type=${f.formType}`);

  // 3. Form fields
  const fields = await tool("dingtalk_yida_get_form_fields", { appName: APP, formUuid: FORM });
  console.log("\n3️⃣ 表单字段:", fields.success ? `${fields.data.length} 个` : JSON.stringify(fields));
  if (fields.success) for (const f of fields.data.slice(0, 12)) {
    console.log(`   - ${f.fieldId} | ${f.label} | ${f.componentName}`);
  }

  // 4. Query form data
  const data = await tool("dingtalk_yida_query_form_data", { appName: APP, formUuid: FORM, pageSize: 3 });
  console.log("\n4️⃣ 表单数据:", data.success ? `total=${data.data.total}` : JSON.stringify(data));
  if (data.success) for (const d of data.data.items) {
    console.log(`   - ${d.formInstanceId} | ${d.createTimeGMT} | 字段数=${Object.keys(d.formData).length}`);
  }

  // 5. Search form data
  const search = await tool("dingtalk_yida_search_form_data", { appName: APP, formUuid: FORM, pageSize: 2 });
  console.log("\n5️⃣ 搜索表单数据:", search.success ? `total=${search.data.total}` : JSON.stringify(search));

  // 6. List process instances
  const procs = await tool("dingtalk_yida_list_process_instances", { appName: APP, formUuid: FORM, pageSize: 3 });
  console.log("\n6️⃣ 流程实例:", procs.success ? `total=${procs.data.total}` : JSON.stringify(procs));
  let pid = null;
  if (procs.success) for (const p of procs.data.items) {
    console.log(`   - ${p.processInstanceId} | ${p.approvedResult} | 发起人=${p.originatorUserId}`);
    if (!pid) pid = p.processInstanceId;
  }

  if (pid) {
    // 7. Process instance detail
    const detail = await tool("dingtalk_yida_get_process_instance", { appName: APP, processInstanceId: pid });
    console.log("\n7️⃣ 流程实例详情:", detail.success ? `title=${detail.data.title} status=${detail.data.instanceStatus}` : JSON.stringify(detail));

    // 8. Operation records
    const records = await tool("dingtalk_yida_get_operation_records", { appName: APP, processInstanceId: pid });
    console.log("\n8️⃣ 审批记录:", records.success ? `${records.data.length} 条` : JSON.stringify(records));
    if (records.success) for (const r of records.data) {
      console.log(`   - ${r.operateTimeGMT} | ${r.operatorName} | ${r.showName} (${r.operateType})`);
    }
  }

  await client.close();
  console.log("\n✅ Done");
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
