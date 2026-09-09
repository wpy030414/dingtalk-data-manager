import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, writeFileSync } from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const LOG = resolve(__dirname, "simulate-agent.log");
writeFileSync(LOG, "");

const transport = new StdioClientTransport({
  command: "node", args: [resolve(__dirname, "dist", "index.js")], cwd: __dirname,
});
const client = new Client({ name: "vague-agent-sim", version: "1.0" }, { capabilities: {} });

let calls = 0;
async function tool(name, args = {}) {
  calls++;
  const t0 = Date.now();
  const r = await client.callTool({ name, arguments: args });
  const ms = Date.now() - t0;
  for (const it of r.content) {
    if (it.type === "text" && it.text) {
      try { return { __ms: ms, ...JSON.parse(it.text) }; } catch { return { __ms: ms, raw: it.text }; }
    }
  }
  return { __ms: ms };
}

const TODAY = "2026-09-09";
const log = (...a) => { const s = a.map(String).join(" "); console.log(s); appendFileSync(LOG, s + "\n"); };

async function main() {
  await client.connect(transport);

  // ── 先确认 Agent 能看到什么 ──
  const instr = client.getInstructions();
  log(`服务器 instructions: ${instr ? `✅ 有（${instr.length} 字符）` : "❌ 无"}`);
  const res = await client.listResources().catch(() => ({ resources: [] }));
  log(`Resources: ${res.resources?.length ? res.resources.map((r) => r.uri).join(", ") : "（无）"}`);
  const tools = await client.listTools();
  log(`Tools: ${tools.tools.length} 个`);

  // ══════════════════════════════════════════════════════════════
  // 场景 A：用户说「张思杰今天迟到了吗」——只有姓名，没有 userId
  // ══════════════════════════════════════════════════════════════
  log("\n" + "═".repeat(70));
  log("场景 A｜用户输入：「张思杰今天迟到了吗」");
  log("═".repeat(70));
  const startA = calls;
  try {
    // 1. 模糊/精确搜人
    let s = await tool("dingtalk_search_users", { queryWord: "张思杰", size: 5 });
    log(`  1) search_users("张思杰") → 命中 ${s?.data?.total}, 补全 ${s?.data?.users?.length}`);
    let target = s?.data?.users?.find((u) => u.name === "张思杰");
    if (!target) {
      log("     ⚠️ 补全列表里没有精确匹配，改用 fullMatchField=0");
      s = await tool("dingtalk_search_users", { queryWord: "张思杰", fullMatchField: 0, size: 5 });
      target = s?.data?.users?.find((u) => u.name === "张思杰");
    }
    if (!target) throw new Error("无法定位用户");
    log(`     定位到 userId=${target.userId} | ${target.name}`);

    // 2. 查考勤
    const att = await tool("dingtalk_get_attendance", { userIds: [target.userId], workDate: TODAY });
    const rec = att?.data?.records?.find((r) => r.checkType === "OnDuty");
    log(`  2) get_attendance → ${rec ? `${rec.timeResult} | 计划 ${rec.planCheckTime} | 实际 ${rec.userCheckTime}` : "无打卡记录"}`);
    log(`  ✅ 场景 A 完成（${calls - startA} 次工具调用）`);
  } catch (e) { log("  ❌ 场景 A 失败:", e.message); }

  // ══════════════════════════════════════════════════════════════
  // 场景 B：用户说「东校中学2025级今天谁迟到了」——模糊部门名
  // ══════════════════════════════════════════════════════════════
  log("\n" + "═".repeat(70));
  log("场景 B｜用户输入：「东校中学2025级今天谁迟到了」");
  log("═".repeat(70));
  const startB = calls;
  try {
    // 1. 模糊部门名定位（复合名，原生搜索会 0 命中）
    const fd = await tool("dingtalk_find_department", { query: "东校中学2025级", limit: 5 });
    log(`  1) find_department("东校中学2025级") → ${fd?.data?.total} 个候选 (${fd.__ms}ms)`);
    for (const m of fd?.data?.matches ?? []) log(`     - ${m.path} (id=${m.id})`);
    const dept = fd?.data?.matches?.[0];
    if (!dept) throw new Error("未找到部门");

    // 2. 取成员 ID
    const ids = await tool("dingtalk_list_department_user_ids", { deptId: dept.id });
    log(`  2) list_department_user_ids(${dept.id}) → ${ids?.data?.total} 人 (${ids.__ms}ms)`);

    // 3. 批量查考勤（模拟器只取前 12 人以免太慢）
    const batch = ids.data.userIds.slice(0, 12);
    const att = await tool("dingtalk_get_attendance", { userIds: batch, workDate: TODAY });
    log(`  3) get_attendance(${batch.length} 人) → ${att?.data?.total} 条记录 (${att.__ms}ms)`);
    const late = (att?.data?.records ?? []).filter((r) => r.timeResult === "Late" && r.checkType === "OnDuty");
    log(`     迟到 ${late.length} 人`);
    for (const r of late) {
      const u = await tool("dingtalk_get_user", { userId: r.userId });
      log(`     - ${u?.data?.name} | ${r.planCheckTime} → ${r.userCheckTime}`);
    }
    log(`  ✅ 场景 B 完成（${calls - startB} 次工具调用）`);
  } catch (e) { log("  ❌ 场景 B 失败:", e.message); }

  // ══════════════════════════════════════════════════════════════
  // 场景 C：用户说「上次去天津参赛那个申请，审批到哪了」——只有内容片段
  // ══════════════════════════════════════════════════════════════
  log("\n" + "═".repeat(70));
  log("场景 C｜用户输入：「上次去天津参赛那个申请，审批到哪了」");
  log("═".repeat(70));
  const startC = calls;
  try {
    // 1. 有哪些宜搭应用
    const apps = await tool("dingtalk_yida_list_apps");
    log(`  1) yida_list_apps → ${apps?.data?.length} 个应用: ${apps?.data?.map((a) => a.name).join(", ")}`);
    const appName = apps?.data?.[0]?.name;

    // 2. 应用下有哪些表单
    const forms = await tool("dingtalk_yida_list_forms", { appName });
    log(`  2) yida_list_forms("${appName}") → ${forms?.data?.length} 个表单: ${forms?.data?.map((f) => f.title).join(", ")}`);
    const formUuid = forms?.data?.[0]?.formUuid;

    // 3. 先拿字段定义（否则不知道「外出地点」对应哪个 fieldId）
    const fields = await tool("dingtalk_yida_get_form_fields", { appName, formUuid });
    log(`  3) yida_get_form_fields → ${fields?.data?.length} 个字段`);
    const placeField = fields?.data?.find((f) => f.label.includes("地点"));
    log(`     找到「外出地点」→ fieldId=${placeField?.fieldId}`);

    // 4. 用模糊值搜表单数据
    const searchFieldJson = JSON.stringify({ [placeField.fieldId]: "天津" });
    const data = await tool("dingtalk_yida_search_form_data", { appName, formUuid, searchFieldJson, pageSize: 5 });
    log(`  4) yida_search_form_data(searchFieldJson={"${placeField.fieldId}":"天津"}) → 命中 ${data?.data?.total} 条`);
    const inst = data?.data?.items?.[0];
    if (!inst) throw new Error("没搜到记录");
    log(`     formInstanceId=${inst.formInstanceId}`);

    // 5. 找对应的流程实例
    const procs = await tool("dingtalk_yida_list_process_instances", { appName, formUuid, pageSize: 50 });
    const proc = procs?.data?.items?.find((p) => p.processInstanceId === inst.formInstanceId);
    log(`  5) yida_list_process_instances → ${procs?.data?.total} 个实例, 匹配到=${proc ? "是" : "否"}`);

    // 6. 审批记录
    const pid = proc?.processInstanceId ?? inst.formInstanceId;
    const records = await tool("dingtalk_yida_get_operation_records", { appName, processInstanceId: pid });
    log(`  6) yida_get_operation_records → ${records?.data?.length} 条`);
    for (const r of records?.data ?? []) {
      log(`     - ${r.operateTimeGMT} | ${r.operatorName} | ${r.showName}`);
    }
    log(`  ✅ 场景 C 完成（${calls - startC} 次工具调用）`);
  } catch (e) { log("  ❌ 场景 C 失败:", e.message); }

  log(`\n总计工具调用次数: ${calls}`);
  await client.close();
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
