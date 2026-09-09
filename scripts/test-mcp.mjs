import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const transport = new StdioClientTransport({
  command: "node", args: [resolve(__dirname, "dist", "index.js")], cwd: __dirname,
});
const client = new Client({ name: "test", version: "1.0" }, { capabilities: {} });

async function tool(name, args) {
  const r = await client.callTool({ name, arguments: args });
  for (const it of r.content) {
    if (it.type === "text" && it.text) return JSON.parse(it.text);
  }
  return null;
}

async function main() {
  await client.connect(transport);
  console.log("✅ Connected\n");

  // 东校中学 2025级 用户列表 (deptId=1061751754)
  const usersR = await tool("dingtalk_list_users", { deptId: 1061751754, includeDeactivated: false });
  let userIds = [];
  const nameMap = {};
  if (usersR && usersR.success && usersR.data && usersR.data.users) {
    for (const u of usersR.data.users) {
      userIds.push(u.userId);
      nameMap[u.userId] = u.name + " (" + (u.title || "教师") + ")";
    }
  }
  console.log(`东校中学 2025级 共 ${userIds.length} 人, 查询考勤...\n`);

  // Attendance
  const att = await tool("dingtalk_get_attendance", {
    userIds,
    workDate: "2026-09-09",
  });

  if (!att || !att.success) {
    console.log("FAIL:", JSON.stringify(att, null, 2));
    await client.close();
    return;
  }

  const records = att.data.records || [];
  console.log(`总打卡记录: ${records.length}\n`);

  // Group by user — find late ones
  const lateUsers = [];
  for (const r of records) {
    if (r.timeResult === "Late" && r.checkType === "OnDuty") {
      lateUsers.push(r);
    }
  }

  if (lateUsers.length > 0) {
    console.log(`⚠️ 今日迟到 ${lateUsers.length} 人:\n`);
    for (const r of lateUsers) {
      const name = nameMap[r.userId] || r.userId;
      console.log(`  ${name} | 计划 ${r.planCheckTime} | 实际 ${r.userCheckTime}`);
    }
  } else {
    console.log("✅ 东校中学 2025级 今日无迟到");

    // Show all check-in records
    console.log("\n打卡记录:");
    for (const r of records) {
      if (r.checkType === "OnDuty") {
        const name = nameMap[r.userId] || r.userId;
        console.log(`  ${name} | ${r.userCheckTime} | ${r.timeResult}`);
      }
    }
  }

  await client.close();
  console.log("\n✅ Done");
}

main().catch(function(e) { console.error("❌", e); process.exit(1); });