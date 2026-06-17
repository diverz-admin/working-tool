import { NextResponse } from "next/server";
import { db } from "@/db";
import { clientUrls } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await db
      .select()
      .from(clientUrls)
      .where(eq(clientUrls.clientId, id))
      .orderBy(clientUrls.createdAt);
    return NextResponse.json({ urls: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch urls" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { urls } = await req.json() as {
      urls: { label: string; url: string }[];
    };

    await db.delete(clientUrls).where(eq(clientUrls.clientId, id));

    if (urls.length > 0) {
      await db.insert(clientUrls).values(
        urls.map((u) => ({
          clientId: id,
          label: u.label ?? "",
          url: u.url,
        }))
      );
    }

    const rows = await db.select().from(clientUrls).where(eq(clientUrls.clientId, id));
    return NextResponse.json({ urls: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save urls" }, { status: 500 });
  }
}
