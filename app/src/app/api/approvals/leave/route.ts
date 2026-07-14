import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { internalLeaveRequests } from "@/db/schema";
import { desc } from "drizzle-orm";
import { calcLeaveDays, LEAVE_TYPES, type LeaveItem, type LeaveType } from "@/lib/leave";
import { ensureLeaveSchema, loadLeaveBalances } from "@/lib/leaveDb";

export async function GET() {
  await ensureLeaveSchema();

  const items = (await db
    .select()
    .from(internalLeaveRequests)
    .orderBy(desc(internalLeaveRequests.createdAt))) as unknown as LeaveItem[];

  const balances = await loadLeaveBalances(items);
  return NextResponse.json({ items, balances });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const leaveType = body.leaveType as LeaveType;
  const startDate = String(body.startDate ?? "");
  const endDate   = body.endDate ? String(body.endDate) : null;

  if (!LEAVE_TYPES.includes(leaveType)) {
    return NextResponse.json({ error: "휴가 종류를 선택해주세요." }, { status: 400 });
  }
  if (!startDate) {
    return NextResponse.json({ error: "시작일을 입력해주세요." }, { status: 400 });
  }
  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
  }

  await ensureLeaveSchema();

  const [item] = await db
    .insert(internalLeaveRequests)
    .values({
      title:       body.title?.trim() || "",
      leaveType,
      requester:   body.requester ?? "",
      startDate,
      endDate,
      requestedAt: body.requestedAt ?? new Date().toISOString().slice(0, 10),
      leaveDays:   calcLeaveDays(leaveType, startDate, endDate),
      note:        body.note || null,
      status:      "대기",
    })
    .returning();

  return NextResponse.json({ item }, { status: 201 });
}
