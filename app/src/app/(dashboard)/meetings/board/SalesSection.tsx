"use client";

/**
 * ② 영업팀 — 새 계약을 가져오는 사람별로 목표 · 실적 · 할 일을 본다.
 *
 * 숫자는 /api/member-kpi(프로젝트 담당자 기준)에서 오고, 사람이 적는 건 월 목표 · 전주 실적(콜 수 · 신규 · 연장 · 메타신규)과 세 칸이다.
 * 영업팀이 아닌 사람도 담당 캠페인이 있으면 "다른 멤버"로 꺼내 칸을 열 수 있다.
 */

import { useState, useEffect } from "react";
import { fetchJson, saveErrorMessage } from "@/lib/fetch-json";
import type { MeetingMembers, MeetingMemberEntry, MeetingWeekStats } from "@/db/schema";
import { WEEK_STAT_KEYS, WEEK_STAT_LABELS } from "@/lib/meeting-sections";
import { C, SectionCard, EntryFields, Avatar, Empty, personColor, won, man, emptyEntry, type BoardContext, type PartSave } from "./shared";

interface MemberKpi { name: string; team: string | null; target: number | null; revenue: number; forecast: number; active: number; deals?: number }

/** /api/meeting-board/schedule 에서 쓰는 부분 — 프로젝트 일정 섹션과 같은 판정을 그대로 받는다 */
interface Campaign { person: string | null; type: string | null; amount: number }
interface ScheduleData { active: Campaign[]; thisWeek: Campaign[]; lastWeek: (Campaign & { renewal: unknown | null })[] }

/** 카드 아래 네 칸 — 지난달 마감 · 운영중 · 이번 주 종료 · 지난주 연장 */
interface MemberExtra {
  prev?: MemberKpi; prev2?: MemberKpi;
  guaranteed: number; managed: number;
  endCount: number; endAmount: number;
  renewed: number; ended: number;
}

const shiftMonth = (y: number, m: number, d: number) => {
  const t = new Date(y, m - 1 + d, 1);
  return { y: t.getFullYear(), m: t.getMonth() + 1 };
};

/** 목표 색 — 자동 집계(BRIEF_TONE.target)와 같은 보라 */
const TARGET = "#7048E8";

/** 영업관리팀은 따로 섹션이 있다 — 이름에 "영업"이 들어가도 여기서 뺀다 */
const isSalesTeam = (team: string | null) => !!team && team.startsWith("영업") && team !== "영업관리팀";

export default function SalesSection({ ctx, members, onMembers, prevMembers, onBadge, saveOf }: {
  ctx: BoardContext;
  members: MeetingMembers;
  onMembers: (m: MeetingMembers) => void;
  prevMembers?: MeetingMembers;
  onBadge?: (text: string) => void;
  /** 멤버 한 명의 칸만 따로 저장 */
  saveOf?: (name: string) => PartSave;
}) {
  const [kpi, setKpi] = useState<MemberKpi[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>([]);

  const [reloadKey, setReloadKey] = useState(0);
  const [prevKpi, setPrevKpi] = useState<{ prev: MemberKpi[]; prev2: MemberKpi[] } | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [extraError, setExtraError] = useState(false);
  const p1 = shiftMonth(ctx.year, ctx.month, -1), p2 = shiftMonth(ctx.year, ctx.month, -2);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ year: String(ctx.year), month: String(ctx.month), team: "전체", criteria: ctx.criteria, asOf: ctx.asOf });
    fetchJson<{ members: MemberKpi[] }>(`/api/member-kpi?${q}`)
      .then(d => { if (alive) { setKpi(d.members); setError(null); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "멤버별 집계를 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [ctx.year, ctx.month, ctx.criteria, ctx.asOf, reloadKey]);

  // 지난 두 달 마감과 캠페인 일정 — 실패해도 카드는 그대로 두고 네 칸만 비운다
  useEffect(() => {
    let alive = true;
    const kpiOf = (t: { y: number; m: number }) =>
      fetchJson<{ members: MemberKpi[] }>(`/api/member-kpi?${new URLSearchParams({
        year: String(t.y), month: String(t.m), team: "전체", criteria: ctx.criteria, asOf: ctx.asOf,
      })}`).then(d => d.members);
    const sq = new URLSearchParams({ year: String(ctx.year), month: String(ctx.month), asOf: ctx.asOf, weekStart: ctx.weekStart });
    Promise.all([kpiOf(shiftMonth(ctx.year, ctx.month, -1)), kpiOf(shiftMonth(ctx.year, ctx.month, -2)),
      fetchJson<ScheduleData>(`/api/meeting-board/schedule?${sq}`)])
      .then(([prev, prev2, sch]) => { if (alive) { setPrevKpi({ prev, prev2 }); setSchedule(sch); setExtraError(false); } })
      .catch(() => { if (alive) setExtraError(true); });
    return () => { alive = false; };
  }, [ctx.year, ctx.month, ctx.criteria, ctx.asOf, ctx.weekStart]);

  const extraOf = (name: string): MemberExtra | null => {
    if (!prevKpi || !schedule) return null;
    const mine = <T extends Campaign>(list: T[]) => list.filter(c => c.person === name);
    const active = mine(schedule.active), ending = mine(schedule.thisWeek), ended = mine(schedule.lastWeek);
    return {
      prev: prevKpi.prev.find(k => k.name === name), prev2: prevKpi.prev2.find(k => k.name === name),
      guaranteed: active.filter(c => c.type === "보장형").length,
      managed: active.filter(c => c.type !== "보장형").length,
      endCount: ending.length, endAmount: ending.reduce((s, c) => s + c.amount, 0),
      renewed: ended.filter(c => c.renewal).length, ended: ended.length,
    };
  };

  // 기록이 있는 사람은 영업팀이 아니어도 칸을 연다 — 적어 둔 내용이 화면에서 사라지면 안 된다
  const shown = (kpi ?? []).filter(m => isSalesTeam(m.team) || opened.includes(m.name) || members[m.name] || prevMembers?.[m.name]?.todo.trim());
  const others = (kpi ?? []).filter(m => !shown.includes(m) && m.team !== "영업관리팀");

  const sum = (f: (m: MemberKpi) => number) => shown.reduce((s, m) => s + f(m), 0);
  const totalTarget = sum(m => m.target ?? 0), totalRevenue = sum(m => m.revenue);

  useEffect(() => {
    if (!kpi) return;
    onBadge?.(totalTarget ? `${Math.round((totalRevenue / totalTarget) * 100)}%` : `${shown.length}명`);
  }, [kpi, totalTarget, totalRevenue, shown.length, onBadge]);

  async function saveTarget(member: string, target: number) {
    setError(null);
    const res = await fetch("/api/member-kpi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: ctx.year, month: ctx.month, member, target }),
    });
    if (!res.ok) { setError(await saveErrorMessage(res)); return; }
    setReloadKey(k => k + 1);
  }

  const setEntry = (name: string, e: MeetingMemberEntry) => onMembers({ ...members, [name]: e });

  // 전주 실적 합계 — 화면에 보이는 멤버 것만 더한다. 아무도 안 적었으면 줄을 숨긴다
  const statTotals = WEEK_STAT_KEYS.map(k => {
    const vals = shown.map(m => members[m.name]?.stats?.[k]).filter((v): v is number => v !== undefined);
    return { k, value: vals.length ? vals.reduce((a, b) => a + b, 0) : null };
  });
  const hasStats = statTotals.some(t => t.value !== null);

  return (
    <SectionCard id="s-sales" no={2} title="영업팀"
      hint="새 계약을 가져오는 팀 · 멤버별 매출은 프로젝트 담당자 기준 · 지난 회의의 '할 일'을 '한 일' 칸으로 가져올 수 있습니다">
      {error && <p className="text-[13px] mb-3" style={{ color: C.bad }}>{error}</p>}
      {!kpi && !error && <Empty>멤버별 집계를 불러오는 중입니다.</Empty>}
      {kpi && shown.length === 0 && <Empty>영업팀 멤버가 없습니다.</Empty>}

      {hasStats && (
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mb-4 px-4 py-3 rounded-xl text-[14px]"
          style={{ background: C.soft, color: C.muted }}>
          <span className="font-semibold" style={{ color: C.body }}>팀 전주 실적</span>
          {statTotals.map(t => (
            <span key={t.k}>
              {WEEK_STAT_LABELS[t.k]}{" "}
              <span className="font-bold tabular-nums" style={{ color: t.value === null ? C.faint : C.ink }}>
                {t.value === null ? "–" : `${t.value.toLocaleString("ko-KR")}${t.k === "calls" ? "콜" : "건"}`}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2 items-start" style={{ wordBreak: "keep-all" }}>
        {shown.map(m => (
          <MemberCard key={m.name} m={m} month={ctx.month} prevMonth={p1.m} prev2Month={p2.m}
            extra={extraOf(m.name)} extraError={extraError}
            entry={members[m.name] ?? emptyEntry()} onEntry={e => setEntry(m.name, e)}
            prevTodo={prevMembers?.[m.name]?.todo} save={saveOf?.(m.name)}
            onTarget={v => saveTarget(m.name, v)} />
        ))}
      </div>

      {others.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-4 text-[13px]" style={{ color: C.muted }}>
          다른 멤버
          {others.map(m => (
            <button key={m.name} type="button" onClick={() => setOpened(o => [...o, m.name])}
              className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 transition-colors hover:bg-[#F2F4F6]"
              style={{ border: `1px solid ${C.line}`, color: C.body }}>
              <Avatar name={m.name} size={20} />{m.name}
              {m.active > 0 && <span style={{ color: C.faint }}>· 운영중 {m.active}건</span>}
            </button>
          ))}
          <span style={{ color: C.faint }}>누르면 그 사람의 칸이 열립니다</span>
        </div>
      )}
    </SectionCard>
  );
}

function MemberCard({ m, month, prevMonth, prev2Month, extra, extraError, entry, onEntry, prevTodo, onTarget, save }: {
  m: MemberKpi; month: number; prevMonth: number; prev2Month: number;
  extra: MemberExtra | null; extraError: boolean;
  entry: MeetingMemberEntry; onEntry: (e: MeetingMemberEntry) => void;
  prevTodo?: string; onTarget: (v: number) => void; save?: PartSave;
}) {
  const color = personColor(m.name);
  const rate = m.target ? (m.revenue / m.target) * 100 : null;
  const dash = extraError ? "–" : "…";
  return (
    <div className="rounded-2xl overflow-hidden min-w-0" style={{ border: `1px solid ${C.line}` }}>
      <div className="h-1" style={{ background: color }} />
      <div className="p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <Ring rate={rate} color={color} />
          <div className="min-w-0">
            <p className="text-[20px] font-bold" style={{ color: C.ink }}>
              {m.name}{m.team && <span className="text-[13px] font-medium ml-1.5" style={{ color: C.faint }}>{m.team}</span>}
            </p>
            <p className="text-[14px] font-medium mt-0.5" style={{ color: C.muted }}>
              {month}월 실적 <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{won(m.revenue)}</span>
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[12px] font-semibold mb-1" style={{ color: TARGET }}>{month}월 목표</p>
            <TargetInput key={`${m.name}-${m.target ?? 0}`} value={m.target} onCommit={onTarget} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mt-5 rounded-xl overflow-hidden"
          style={{ background: C.line, border: `1px solid ${C.line}` }}>
          <Box label={`${prevMonth}월 마감`} value={extra ? man(extra.prev?.revenue ?? 0) : dash}
            sub={extra ? `${extra.prev?.deals ?? 0}건 · ${prev2Month}월 ${man(extra.prev2?.revenue ?? 0)}` : undefined} />
          <Box label="운영중" value={`${m.active}건`}
            sub={extra ? `보장 ${extra.guaranteed} · 관리 ${extra.managed}` : undefined} />
          <Box label="이번 주 종료" value={extra ? `${extra.endCount}건` : dash}
            color={extra && extra.endCount > 0 ? C.warn : undefined}
            sub={extra && extra.endCount > 0 ? `${man(extra.endAmount)}원` : undefined} />
          <Box label="지난주 연장" value={extra ? (extra.ended ? `${extra.renewed}/${extra.ended}` : "–") : dash}
            sub="종료 건 중 재계약" />
        </div>
      </div>

      <div className="p-5" style={{ borderTop: `1px solid ${C.line}` }}>
        <StatsInputs value={entry.stats} onChange={stats => onEntry({ ...entry, stats })} />
        <EntryFields value={entry} onChange={onEntry} prevTodo={prevTodo} stacked rows={7}
          save={save} saveLabel={`${m.name} 저장`}
          labels={{
            done:  { label: "전주 한 일", note: "결과 점검" },
            todo:  { label: "금주 할 일", note: "목표를 채울 계획" },
            issue: { label: "이슈 · 지원 요청" },
          }} />
      </div>
    </div>
  );
}

/** 전주 실적 네 칸 — 콜 수 · 계약 신규 / 연장 / 메타신규. 숫자만 받고, 비우면 "안 적음"으로 둔다 */
function StatsInputs({ value, onChange }: { value?: MeetingWeekStats; onChange: (v: MeetingWeekStats | undefined) => void }) {
  const set = (k: keyof MeetingWeekStats, text: string) => {
    const digits = text.replace(/[^0-9]/g, "");
    const next: MeetingWeekStats = { ...value };
    if (digits) next[k] = Number(digits); else delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="mb-5">
      <p className="text-[13px] font-semibold mb-1.5" style={{ color: C.body }}>
        전주 실적<span className="font-normal ml-1.5" style={{ color: C.faint }}>콜 수 · 계약 건수</span>
      </p>
      <div className="grid grid-cols-4 gap-px rounded-xl overflow-hidden" style={{ background: C.line, border: `1px solid ${C.line}` }}>
        {WEEK_STAT_KEYS.map((k, i) => (
          <label key={k} className="px-3 py-2.5 min-w-0 cursor-text focus-within:bg-white transition-colors" style={{ background: C.soft }}>
            <span className="block text-[12px] font-medium" style={{ color: C.muted }}>
              {i > 0 && <span style={{ color: C.faint }}>계약 </span>}{WEEK_STAT_LABELS[k]}
            </span>
            <span className="flex items-baseline gap-1 mt-0.5">
              <input value={value?.[k]?.toString() ?? ""} inputMode="numeric" placeholder="0" aria-label={`전주 ${WEEK_STAT_LABELS[k]}`}
                onChange={e => set(k, e.target.value)}
                className="w-full min-w-0 bg-transparent outline-none text-[18px] font-bold tabular-nums placeholder:font-normal placeholder:text-[#C5CBD3]"
                style={{ color: C.ink }} />
              <span className="text-[12px] shrink-0" style={{ color: C.faint }}>{k === "calls" ? "콜" : "건"}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Box({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="px-4 py-3 min-w-0" style={{ background: C.soft }}>
      <p className="text-[12px]" style={{ color: C.muted }}>{label}</p>
      <p className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: color ?? C.ink }}>{value}</p>
      {sub && <p className="text-[12px] mt-0.5" style={{ color: C.faint }}>{sub}</p>}
    </div>
  );
}

/** 목표 달성률 원 — 목표가 없으면 회색 고리에 "목표 없음" */
function Ring({ rate, color }: { rate: number | null; color: string }) {
  const r = 31, len = 2 * Math.PI * r, p = Math.min(100, rate ?? 0) / 100;
  const done = (rate ?? 0) >= 100;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={rate === null ? "목표 없음" : `달성률 ${rate.toFixed(1)}%`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke={C.track} strokeWidth="7" />
      {rate !== null && (
        <circle cx="38" cy="38" r={r} fill="none" stroke={done ? C.good : color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${len * p} ${len}`} transform="rotate(-90 38 38)" />
      )}
      <text x="38" y="43" textAnchor="middle" fontSize={rate === null ? 11 : 15} fontWeight={600}
        fill={rate === null ? C.faint : C.ink}>{rate === null ? "목표 없음" : `${rate.toFixed(1)}%`}</text>
    </svg>
  );
}

/** 목표 금액 입력 — 쉼표를 붙여 보여주고, 칸을 벗어나거나 Enter를 누르면 저장한다 */
function TargetInput({ value, onCommit }: { value: number | null; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value ? value.toLocaleString() : "");
  const commit = () => {
    const n = parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;
    if (n !== (value ?? 0)) onCommit(n);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input value={text} inputMode="numeric" placeholder="목표 입력" aria-label="월 목표"
        onChange={e => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          setText(digits ? Number(digits).toLocaleString() : "");
        }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-40 h-11 px-3 text-right text-[17px] font-semibold tabular-nums rounded-xl outline-none border transition-colors focus:border-[#7048E8] placeholder:text-[14px] placeholder:font-normal placeholder:text-[#8B95A1]"
        style={{ borderColor: C.line, color: C.ink, background: "#F5F2FF" }} />
      <span className="text-[13px]" style={{ color: C.faint }}>원</span>
    </span>
  );
}
