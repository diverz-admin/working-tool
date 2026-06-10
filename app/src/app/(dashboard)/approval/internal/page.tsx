import { redirect } from "next/navigation";

export default function InternalPage() {
  redirect("/approval/internal/expense");
}
