import { NextResponse } from "next/server";
import { db } from "@/db";
import { clientAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.clientId, id))
      .orderBy(clientAccounts.createdAt);
    return NextResponse.json({ accounts: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

// 계정 목록 전체를 교체 (기존 삭제 후 새로 삽입)
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { accounts } = await req.json() as {
      accounts: { platform: string; username?: string; password?: string }[];
    };

    await db.delete(clientAccounts).where(eq(clientAccounts.clientId, id));

    if (accounts.length > 0) {
      await db.insert(clientAccounts).values(
        accounts.map((a) => ({
          clientId: id,
          platform: a.platform,
          username: a.username || null,
          password: a.password || null,
        }))
      );
    }

    const rows = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.clientId, id));

    return NextResponse.json({ accounts: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save accounts" }, { status: 500 });
  }
}
