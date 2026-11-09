"use client";

/**
 * ⑦ 관리팀 — 회사 살림: 손익 · 결재 · 세금계산서 · 인사.
 *
 * 숫자는 /api/meeting-board/admin에서 온다. 사람이 적는 건 아래 세 칸뿐이다.
 * 손익은 화면의 매출 기준 선택과 무관하게 "캠페인 시작일 수주 · 작업시작일 매입"으로 본다.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import type { MeetingMemberEntry } from "@/db/schema";
import {
  C, TONE, SectionCard, Panel, KpiRow, Flag, Empty, EntryFields, Avatar, type PartSave,
  won, man, md, DOW, type BoardContext, type Tone,
} from "./shared";

interface PlRow { year: number; month: number; revenue: number; cost: number; margin: number; rate: number | null; inProgress: boolean }
interface Leave { requester: string; leaveType: string; startDate: string; endDate: string | null; leaveDays: number; status?: string }
interface AdminData {
  asOf: string;
  monthOver: boolean;
  focus: { year: number; month: number };
  owners: { name: string; position: string | null; team: string | null }[];
  pl: PlRow[];
  pending: {
    confirm: { count: number; oldestDays: number | null; oldestName: string | null; requesters: string[] };
    cost: { count: number; supply: number };
    payment: { count: number };
    leave: Leave[];
    expense: { count: number; amount: number; titles: string[] };
  };
  leaves: Leave[];
  fix: {
    unpaidRevenue: { count: number; supply: number; fromMonth: number };
    expenseNoAmount: { count: number; total: number; titles: string[] };
    invoiceMissing: { count: number; exempt: number; total: number };
  };
}

const rateTone = (r: number): Tone => (r >= 40 ? TONE.good : r >= 30 ? TONE.warn : TONE.bad);

/** "2026-12-02" → "12.2 (수)" */
const dayLabel = (iso: string) => `${md(iso)} (${DOW[new Date(`${iso}T00:00:00`).getDay()]})`;
const leaveRange = (l: Leave) =>
  l.endDate && l.endDate !== l.startDate ? `${dayLabel(l.startDate)} ~ ${dayLabel(l.endDate)}` : dayLabel(l.startDate);
const leaveText = (l: Leave) =>
  `${l.requester} · ${leaveRange(l)} ${l.leaveType}${l.leaveDays ? ` ${l.leaveDays}일` : ""}`;

export default function AdminSection({ ctx, notes, onNotes, prevTodo, onBadge, save }: {
  ctx: BoardContext;
  notes: MeetingMemberEntry;
  onNotes: (e: MeetingMemberEntry) => void;
  prevTodo?: string;
  onBadge?: (text: string) => void;
  save?: PartSave;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ year: String(ctx.year), month: String(ctx.month), asOf: ctx.asOf });
    fetchJson<AdminData>(`/api/meeting-board/admin?${q}`)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "관리팀 집계를 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [ctx.year, ctx.month, ctx.asOf, reloadKey]);

  const p = data?.pending;
  const waitTotal = p
    ? p.confirm.count + p.cost.count + p.payment.count + p.leave.length + p.expense.count
    : 0;

  useEffect(() => {
    if (!data) return;
    onBadge?.(waitTotal ? `결재 ${waitTotal}` : "결재 없음");
  }, [data, waitTotal, onBadge]);

  const owners = data?.owners ?? [];

  return (
    <SectionCard id="s-admin" no={7} title="관리팀" hint="손익 · 결재 · 세금계산서 · 인사 — 회사 살림">
      <div style={{ wordBreak: "keep-all" }}>
        {/* 담당 */}
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap mb-4">
          {owners.map(o => (
            <div key={o.name} className="flex items-center gap-2.5">
              <Avatar name={o.name} size={36} />
              <div>
                <p className="text-[15px] font-semibold" style={{ color: C.ink }}>
                  {o.name}
                  <span className="text-[12px] font-medium ml-1.5" style={{ color: C.faint }}>
                    {[o.team, o.position].filter(Boolean).join(" · ")}
                  </span>
                </p>
                <p className="text-[12px]" style={{ color: C.muted }}>결재 승인 · 회계 · 인사</p>
              </div>
            </div>
          ))}
          {data && owners.length === 0 && (
            <p className="text-[13px]" style={{ color: C.faint }}>경영팀 담당자가 없습니다.</p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[13px] mb-3" style={{ color: C.bad }}>
            {error}
            <button type="button" onClick={load} className="underline" style={{ color: C.accent }}>다시 시도</button>
          </div>
        )}
        {!data && !error && <Empty>관리팀 집계를 불러오는 중입니다.</Empty>}

        {data && <AdminBody data={data} waitTotal={waitTotal} />}

        <div className="mt-5">
          <EntryFields value={notes} onChange={onNotes} prevTodo={prevTodo} save={save} saveLabel="팀 기록 저장"
            labels={{
              done:  { label: "전주 한 일", note: "결과 점검", placeholder: "예) 10월 세금계산서 발행 마감 · 10월 급여 지급" },
              todo:  { label: "금주 할 일", placeholder: "예) 10월 손익 확정 · 부가세 자료 정리" },
              issue: { label: "공지 · 요청", placeholder: "예) 내부지출 요청 시 금액 꼭 입력" },
            }} />
        </div>
      </div>
    </SectionCard>
  );
}

function AdminBody({ data, waitTotal }: { data: AdminData; waitTotal: number }) {
  const { pl, pending: p, fix, focus } = data;

  // 마진 KPI — 끝난 달(focus)과 그 전 달
  const fi = pl.findIndex(r => r.year === focus.year && r.month === focus.month);
  const fRow = pl[fi];
  const prevRow = fi > 0 ? pl[fi - 1] : undefined;
  const pct = (r?: PlRow) => (r?.rate == null ? "–" : `${r.rate.toFixed(1)}%`);

  const nextLeave = data.leaves[0];
  const waitParts = [
    `입금확인 ${p.confirm.count}`, `매입 ${p.cost.count}`, `휴가 ${p.leave.length}`, `내부지출 ${p.expense.count}`,
    ...(p.payment.count ? [`입금요청 ${p.payment.count}`] : []),
  ];

  return (
    <>
      <KpiRow items={[
        {
          label: `${focus.month}월 마진`,
          value: fRow ? won(fRow.margin) : "–",
          sub: `마진율 ${pct(fRow)}${prevRow ? ` · ${prevRow.month}월 ${pct(prevRow)}` : ""}`,
          color: fRow && fRow.margin < 0 ? C.bad : undefined,
        },
        { label: "결재 대기", value: `${waitTotal}건`, sub: waitParts.join(" · "), color: waitTotal ? C.warn : undefined },
        {
          label: "입금일 미기록 매출",
          value: fix.unpaidRevenue.count ? man(fix.unpaidRevenue.supply) : "0",
          sub: `${fix.unpaidRevenue.fromMonth}월 이후 시작분 ${fix.unpaidRevenue.count}행`,
          color: fix.unpaidRevenue.count ? C.bad : undefined,
        },
        {
          label: "다가오는 휴가",
          value: `${data.leaves.length}건`,
          sub: nextLeave
            ? `${nextLeave.requester} ${md(nextLeave.startDate)} ${nextLeave.leaveType} · ${nextLeave.status === "대기" ? "승인 대기" : "승인됨"}`
            : "예정된 휴가 없음",
        },
      ]} />

      <div className="grid gap-3.5 mt-4 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <Panel title="월별 손익" sub="매출 = 입금확인 완료 수주 공급가(시작월) · 매입 = 승인된 매입 공급가(작업시작월)"
          right={<Link href="/projects/report" className="text-[12px] font-medium" style={{ color: C.accent }}>리포트</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["월", "매출", "매입", "마진", "마진율"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[12px] font-medium whitespace-nowrap ${i ? "text-right" : "text-left"}`}
                      style={{ color: C.faint, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pl.map((r, i) => {
                  const dim = r.inProgress;
                  const td = `px-4 py-2.5 whitespace-nowrap text-right`;
                  const border = i < pl.length - 1 ? `1px solid ${C.lineSoft}` : undefined;
                  return (
                    <tr key={`${r.year}-${r.month}`} style={{ color: dim ? C.faint : C.body }}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-left" style={{ borderBottom: border }}>
                        {r.year !== pl[pl.length - 1].year ? `${String(r.year).slice(2)}년 ` : ""}{r.month}월{dim && " (진행 중)"}
                      </td>
                      <td className={td} style={{ borderBottom: border }}>{won(r.revenue)}</td>
                      <td className={td} style={{ borderBottom: border }}>{won(r.cost)}</td>
                      <td className={`${td} font-semibold`} style={{ borderBottom: border, color: dim ? C.faint : r.margin < 0 ? C.bad : C.ink }}>
                        {won(r.margin)}
                      </td>
                      <td className={td} style={{ borderBottom: border }}>
                        {dim || r.rate == null ? "–" : (
                          <span className="inline-block min-w-[48px] text-center text-[12px] font-semibold rounded-md px-1.5 py-0.5"
                            style={{ color: rateTone(r.rate).fg, background: rateTone(r.rate).bg }}>{r.rate.toFixed(1)}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-3.5 min-w-0">
          <Panel title="결재 대기" sub="결재 화면에서 처리합니다">
            <Row href="/approval/confirm" title={`입금확인 요청 ${p.confirm.count}건`}
              sub={p.confirm.count
                ? `${p.confirm.oldestName ?? ""}${p.confirm.oldestDays != null ? ` ${p.confirm.oldestDays}일째` : ""}`
                  + (p.confirm.requesters.length ? ` · ${p.confirm.requesters.length === 1 ? `모두 ${p.confirm.requesters[0]}` : p.confirm.requesters.join(", ")}` : "")
                : "대기 중인 요청 없음"}
              flag={p.confirm.count
                ? [(p.confirm.oldestDays ?? 0) >= 3 ? TONE.bad : TONE.warn, p.confirm.oldestDays != null ? `${p.confirm.oldestDays}일째` : "확인 필요"]
                : [TONE.good, "없음"]} />
            <Row href="/approval/request" title={`매입 승인 ${p.cost.count}건`}
              sub={p.cost.count ? `공급가 ${won(p.cost.supply)}${p.payment.count ? ` · 입금요청 대기 ${p.payment.count}건` : ""}`
                : p.payment.count ? `입금요청 대기 ${p.payment.count}건` : "손익 기간 미승인 매입 없음"}
              flag={p.cost.count || p.payment.count ? [TONE.warn, "승인 필요"] : [TONE.good, "없음"]} />
            <Row href="/approval/internal/leave-confirm" title={`휴가 ${p.leave.length}건`}
              sub={p.leave.length ? p.leave.slice(0, 2).map(leaveText).join(" / ") + (p.leave.length > 2 ? ` 외 ${p.leave.length - 2}건` : "") : "승인 대기 없음"}
              flag={p.leave.length ? [TONE.warn, "승인 필요"] : [TONE.good, "없음"]} />
            <Row href="/approval/internal/confirm" title={`내부지출 ${p.expense.count}건`}
              sub={p.expense.count
                ? `${p.expense.amount ? `${won(p.expense.amount)} · ` : ""}${p.expense.titles.join(", ")}`
                : `${focus.month}월 요청 ${fix.expenseNoAmount.total}건 모두 처리됨`}
              flag={p.expense.count ? [TONE.warn, "승인 필요"] : [TONE.good, "없음"]} />
          </Panel>

          <Panel title="정리가 필요한 데이터" sub="비어 있으면 손익과 세금 신고가 어긋납니다">
            <Row href="/projects" title={`입금일이 빈 매출 ${fix.unpaidRevenue.count}행`}
              sub={fix.unpaidRevenue.count
                ? `${fix.unpaidRevenue.fromMonth}월 이후 시작 프로젝트 · 공급가 ${won(fix.unpaidRevenue.supply)} — 미수금인지 입력 누락인지 확인`
                : `${fix.unpaidRevenue.fromMonth}월 이후 시작분 모두 입금일 기록됨`}
              flag={fix.unpaidRevenue.count ? [TONE.bad, "확인"] : [TONE.good, "정상"]} />
            <Row href="/approval/internal/confirm" title={`금액 없는 내부지출 ${fix.expenseNoAmount.count}건`}
              sub={`${focus.month}월 요청 ${fix.expenseNoAmount.total}건 중${fix.expenseNoAmount.titles.length ? ` · ${fix.expenseNoAmount.titles.join(", ")}` : ""}`}
              flag={fix.expenseNoAmount.count ? [TONE.warn, "입력"] : [TONE.good, "정상"]} />
            <Row href="/approval/confirm" title={`계산서 발행일 없음 ${fix.invoiceMissing.count}건`}
              sub={`${focus.month}월 입금확인 ${fix.invoiceMissing.total}건 중${fix.invoiceMissing.exempt ? ` · 면세 ${fix.invoiceMissing.exempt}건은 제외` : ""}`}
              flag={fix.invoiceMissing.count ? [TONE.warn, "확인"] : [TONE.good, "정상"]} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({ href, title, sub, flag }: { href: string; title: string; sub: string; flag: [Tone, string] }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 border-t first-of-type:border-t-0 transition-colors hover:bg-[#F9FAFB]"
      style={{ borderColor: C.lineSoft }}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold" style={{ color: C.ink }}>{title}</p>
        <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: C.muted }}>{sub}</p>
      </div>
      <Flag tone={flag[0]}>{flag[1]}</Flag>
    </Link>
  );
}
