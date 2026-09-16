import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const transport = new StdioClientTransport({
  command: "node", args: [resolve(__dirname, "dist", "index.js")], cwd: __dirname,
});
const client = new Client({ name: "test-new-tools", version: "1.0" }, { capabilities: {} });

async function tool(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  for (const it of r.content) {
    if (it.type === "text" && it.text) {
      try { return JSON.parse(it.text); } catch { return it.text; }
    }
  }
  return null;
}

function ok(label, cond, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? " | " + extra : ""}`);
  return cond;
}

async function main() {
  await client.connect(transport);
  console.log("✅ MCP connected\n");

  const all = await client.listTools();
  console.log(`工具总数: ${all.tools.length}\n`);

  // ---- 通讯录 ----
  console.log("########## 通讯录 ##########");

  const subIds = await tool("dingtalk_list_sub_department_ids", { deptId: 1 });
  ok("dingtalk_list_sub_department_ids", subIds?.success && subIds.data.total > 0,
     `子部门 ${subIds?.data?.total} 个: ${JSON.stringify(subIds?.data?.deptIds)}`);

  const userIds = await tool("dingtalk_list_department_user_ids", { deptId: 1 });
  ok("dingtalk_list_department_user_ids", userIds?.success && userIds.data.total > 0,
     `根部门直属 ${userIds?.data?.total} 人`);

  const byMobile = await tool("dingtalk_get_user_by_mobile", { mobile: "15256592124" });
  ok("dingtalk_get_user_by_mobile", byMobile?.success, `${byMobile?.data?.name} (${byMobile?.data?.userId})`);

  const byUnion = await tool("dingtalk_get_user_by_unionid", { unionId: "FPJncDiPSrqdMpJD7ep3stgiEiE" });
  ok("dingtalk_get_user_by_unionid", byUnion?.success, `${byUnion?.data?.name} (${byUnion?.data?.userId})`);

  const sUsers = await tool("dingtalk_search_users", { queryWord: "张", size: 3 });
  ok("dingtalk_search_users", sUsers?.success && sUsers.data.total > 0,
     `命中 ${sUsers?.data?.total} 人, 补全 ${sUsers?.data?.users?.length} 条`);
  if (sUsers?.success) for (const u of sUsers.data.users) console.log(`     - ${u.name} | ${u.title || "—"} | ${u.userId}`);

  const sDepts = await tool("dingtalk_search_departments", { queryWord: "东校", size: 3 });
  ok("dingtalk_search_departments", sDepts?.success && sDepts.data.total > 0,
     `命中 ${sDepts?.data?.total} 个, 补全 ${sDepts?.data?.departments?.length} 条`);
  if (sDepts?.success) for (const d of sDepts.data.departments) console.log(`     - ${d.name} | deptId=${d.id} | parent=${d.parentId}`);

  // 模糊部门名定位（复合名）
  const fd = await tool("dingtalk_find_department", { query: "东校中学2025级", limit: 3 });
  ok("dingtalk_find_department", fd?.success && fd.data.total > 0,
     `命中 ${fd?.data?.total} 个 (${fd.__ms}ms)`);
  if (fd?.success) for (const m of fd.data.matches) console.log(`     - ${m.path} (id=${m.id})`);

  // 模糊人名 + 部门线索
  const fu1 = await tool("dingtalk_find_user", { name: "夏", deptHint: "东校中学2025级" });
  ok("dingtalk_find_user(带部门线索)", fu1?.success && fu1.data.users.length > 0,
     `${fu1?.data?.users?.length} 人 | 部门=${fu1?.data?.dept?.path}`);
  if (fu1?.success) for (const u of fu1.data.users) console.log(`     - ${u.name} | ${u.title || "—"} | ${u.userId}`);

  const fu2 = await tool("dingtalk_find_user", { name: "张思杰" });
  ok("dingtalk_find_user(仅姓名)", fu2?.success && fu2.data.users.length > 0,
     `${fu2?.data?.users?.length} 人: ${fu2?.data?.users?.map((u) => u.name).join(", ")}`);

  const fu3 = await tool("dingtalk_find_user", { name: "张", deptHint: "不存在的部门xyz" });
  ok("dingtalk_find_user(无效部门线索)", fu3?.success && fu3.data.hint,
     fu3?.data?.hint?.slice(0, 50));

  // ---- 考勤 ----
  console.log("\n########## 考勤 ##########");

  const groups = await tool("dingtalk_list_attendance_groups", { size: 3 });
  ok("dingtalk_list_attendance_groups", groups?.success && groups.data.total > 0,
     `${groups?.data?.total} 个考勤组`);
  if (groups?.success) for (const g of groups.data.groups.slice(0, 3)) {
    console.log(`     - ${g.groupName} (id=${g.groupId}) | 班次: ${g.classesList.join(" / ").slice(0, 40)}...`);
  }

  const sched = await tool("dingtalk_list_attendance_schedule", { workDate: "2026-09-09", size: 3 });
  ok("dingtalk_list_attendance_schedule", sched?.success && sched.data.total > 0,
     `今日排班 ${sched?.data?.total} 条, hasMore=${sched?.data?.hasMore}`);
  if (sched?.success) for (const s of sched.data.schedules.slice(0, 3)) {
    console.log(`     - ${s.userId} | ${s.planCheckTime} | ${s.checkType}`);
  }

  const gd = await tool("dingtalk_get_attendance_group_details", { size: 3 });
  ok("dingtalk_get_attendance_group_details", gd?.success && gd.data.groups.length > 0,
     `${gd?.data?.groups?.length} 个, hasMore=${gd?.data?.hasMore}`);
  if (gd?.success) for (const g of gd.data.groups) {
    console.log(`     - ${g.groupName || "(无名)"} (id=${g.groupId}) | type=${g.type} | 成员 ${g.memberCount}`);
  }

  await client.close();
  console.log("\n✅ Done");
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
