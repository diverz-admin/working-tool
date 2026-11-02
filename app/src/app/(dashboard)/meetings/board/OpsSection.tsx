"use client";

/**
 * ③ 영업관리팀 — 영업팀이 가져온 업체가 잘 운영되고 있는지 본다.
 *
 * 업체마다 지금 쓰는 리워드(매입 작업 내역) · 만족도 · 특이사항을 한 줄에 두고,
 * 캠페인 종료가 가까운 업체부터 읽는다 — 끝나기 전에 만족도를 확인해야 연장으로 이어진다.
 * 숫자는 /api/meeting-board/clients에서 오고, 사람이 적는 건 만족도·특이사항(/api/client-care)과 팀 세 칸뿐이다.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchJson, saveErrorMessage } from "@/lib/fetch-json";
import type { MeetingMemberEntry } from "@/db/schema";
import type { OpsBoardData, OpsClient, OpsReward, Satisfaction } from "@/app/api/meeting-board/clients/route";
import {
  C, TONE, SectionCard, Panel, Flag, Empty, EntryFields, Avatar, personColor,
  addDays, daysBetween, md, num, won, type BoardContext, type Tone,
} from "./shared";

const SAT_TONE: Record<Satisfaction, Tone> = { 만족: TONE.good, 보통: TONE.warn, 불만: TONE.bad };
const SAT_OPTIONS: (Satisfaction | null)[] = ["만족", "보통", "불만", null];

type ViewKey = "all" | "note" | "none" | "end";
const RW_LIMIT = 3;   // 업체 한 줄에 처음 보이는 리워드 수
const FOLD_LIMIT = 5; // 뒤쪽 기간 묶음이 처음 보이는 업체 수

export default function OpsSection({ ctx, notes, onNotes, prevTodo, onBadge }: {
  ctx: BoardContext;
  notes: MeetingMemberEntry;
  onNotes: (e: MeetingMemberEntry) => void;
  prevTodo?: string;
  onBadge?: (text: string) => void;
}) {
  // 응답에 요청 조건을 함께 담는다 — 회의 날짜를 바꾸면 이전 날짜의 표가 잠깐 보이는 일이 없다
  const key = `${ctx.asOf}|${ctx.weekStart}`;
  const [state, setState] = useState<{ key: string; data: OpsBoardData | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ asOf: ctx.asOf, weekStart: ctx.weekStart });
    fetchJson<OpsBoardData>(`/api/meeting-board/clients?${q}`)
      .then(d => { if (alive) setState({ key, data: d, error: null }); })
      .catch(e => { if (alive) setState({ key, data: null, error: e instanceof Error ? e.message : "업체 현황을 불러오지 못했습니다." }); });
    return () => { alive = false; };
  }, [key, ctx.asOf, ctx.weekStart, tick]);

  const current = state?.key === key ? state : null;
  const data = current?.data ?? null;
  const loadError = current?.error ?? null;

  /** 표의 한 업체만 고친다 — 낙관적 반영과 되돌리기에 같이 쓴다 */
  const patchClient = useCallback((id: string, patch: Partial<Pick<OpsClient, "satisfaction" | "note" | "checkedAt">>) => {
    setState(s => s?.data ? { ...s, data: { ...s.data, clients: s.data.clients.map(c => c.id === id ? { ...c, ...patch } : c) } } : s);
  }, []);

  const save = useCallback(async (c: OpsClient, patch: { satisfaction?: Satisfaction | null; note?: string }) => {
    const before = { satisfaction: c.satisfaction, note: c.note, checkedAt: c.checkedAt };
    patchClient(c.id, patch);
    setSaveError(null);
    const fail = (msg: string) => {
      patchClient(c.id, before);
      setSaveError(`${c.name} — ${msg}`);
    };
    try {
      const res = await fetch("/api/client-care", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: c.id, ...patch, updatedBy: ctx.userName || undefined }),
      });
      if (!res.ok) return fail(await saveErrorMessage(res));
      const saved = await res.json().catch(() => null) as { checkedAt?: string | null } | null;
      if (saved && "checkedAt" in saved) patchClient(c.id, { checkedAt: saved.checkedAt ?? null });
    } catch {
      fail("서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.");
    }
  }, [patchClient, ctx.userName]);

  // ── 요약 숫자 ──
  const stats = useMemo(() => {
    if (!data) return null;
    const cs = data.clients;
    const n = (s: Satisfaction) => cs.filter(c => c.satisfaction === s).length;
    return {
      total: cs.length,
      good: n("만족"), mid: n("보통"), bad: n("불만"),
      checked: cs.filter(c => c.satisfaction).length,
      noted: cs.filter(c => c.note.trim()).length,
      noReward: cs.filter(c => !c.rewards.length).length,
    };
  }, [data]);

  const badge = stats ? (stats.bad ? `불만 ${stats.bad}곳` : `만족도 ${stats.checked}/${stats.total}`) : null;
  useEffect(() => { if (badge) onBadge?.(badge); }, [badge, onBadge]);

  return (
    <SectionCard id="s-ops" no={3} title="영업관리팀"
      hint="영업팀이 가져온 업체가 잘 운영되고 있는지 · 어떤 리워드를 쓰는지 · 만족도와 특이사항">
      <OpsTop data={data} stats={stats} />

      {saveError && (
        <div role="alert" className="flex items-start gap-3 rounded-lg px-3.5 py-2.5 mb-3 text-[13px]"
          style={{ background: C.badSoft, color: C.bad, wordBreak: "keep-all" }}>
          <span className="min-w-0 flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="shrink-0 font-medium">닫기</button>
        </div>
      )}
      {data && !data.careReady && (
        <p className="rounded-lg px-3.5 py-2.5 mb-3 text-[13px]" style={{ background: C.soft, color: C.muted, wordBreak: "keep-all" }}>
          만족도·특이사항 저장 공간이 아직 DB에 만들어지지 않았습니다. 업체 현황은 그대로 볼 수 있고, DB 반영 후 기록할 수 있습니다.
        </p>
      )}

      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_280px]">
        {loadError ? (
          <Panel>
            <Empty>
              {loadError}
              <button type="button" onClick={() => setTick(t => t + 1)} className="block mx-auto mt-2 text-[13px] font-medium" style={{ color: C.accent }}>
                다시 불러오기
              </button>
            </Empty>
          </Panel>
        ) : !data ? (
          <Panel><Empty>업체 현황을 불러오는 중…</Empty></Panel>
        ) : (
          <ClientTable data={data} onSave={save} />
        )}
        <div className="grid gap-3.5 min-w-0 content-start">
          <RewardMix data={data} />
          <PendingPanel data={data} asOf={ctx.asOf} />
        </div>
      </div>

      <div className="mt-5">
        <EntryFields value={notes} onChange={onNotes} prevTodo={prevTodo}
          labels={{
            done:  { label: "전주 한 일", note: "결과 점검" },
            todo:  { label: "금주 할 일", note: "운영 계획" },
            issue: { label: "영업팀에 요청 · 이슈", placeholder: "연장 여부 회신, 광고주 자료 요청 등" },
          }} />
      </div>
    </SectionCard>
  );
}

// ─── 머리: 담당 멤버 + 요약 숫자 ───────────────────────────────

function OpsTop({ data, stats }: {
  data: OpsBoardData | null;
  stats: { total: number; good: number; mid: number; bad: number; checked: number; noted: number; noReward: number } | null;
}) {
  const lead = data?.members[0]?.name;
  const stripe = lead ? personColor(lead) : C.line;
  const pct = (n: number) => (stats?.total ? (n / stats.total) * 100 : 0);
  const g = data?.guaranteed;
  const gSub = g
    ? g.total === 0 ? "운영중인 보장형 없음"
      : [g.outside ? `5위 밖 ${g.outside}` : "", g.unchecked ? `순위 확인 안 됨 ${g.unchecked}` : ""].filter(Boolean).join(" · ") || "모두 5위 이내"
    : "";

  return (
    <div className="relative overflow-hidden rounded-2xl px-4 py-4 md:px-5 mb-4 flex flex-wrap items-center justify-between gap-4"
      style={{ background: C.soft }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: stripe }} />
      <div className="min-w-0">
        {!data ? (
          <p className="text-[13px]" style={{ color: C.faint }}>불러오는 중…</p>
        ) : data.members.length ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(() => { const m = data.members[0]; return (
              <div className="flex items-center gap-3">
                <Avatar name={m.name} size={40} />
                <div>
                  <p className="text-[16px] font-semibold" style={{ color: C.ink }}>
                    {m.name}
                    <span className="ml-1.5 text-[12px] font-medium" style={{ color: C.faint }}>
                      영업관리팀{m.position ? ` · ${m.position}` : ""}
                    </span>
                  </p>
                  <CountLine data={data} />
                </div>
              </div>
            ); })()}
            {data.members.slice(1).map(m => (
              <span key={m.name} className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: C.body }}>
                <Avatar name={m.name} size={28} />{m.name}
                {m.position && <span className="font-normal" style={{ color: C.faint }}>{m.position}</span>}
              </span>
            ))}
          </div>
        ) : (
          <div>
            <p className="text-[13px]" style={{ color: C.faint, wordBreak: "keep-all" }}>
              영업관리팀 소속 멤버가 없습니다 — 멤버 관리에서 팀을 지정하세요
            </p>
            <CountLine data={data} />
          </div>
        )}
      </div>

      {stats && g && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(4,auto)] md:gap-7 w-full md:w-auto">
          <div className="min-w-0">
            <p className="text-[12px] font-medium" style={{ color: C.muted }}>만족도 확인</p>
            <p className="text-[20px] font-bold tabular-nums" style={{ color: C.ink }}>
              {stats.checked}<span className="text-[14px] font-medium" style={{ color: C.faint }}> / {stats.total}곳</span>
            </p>
            <div className="flex h-1.5 rounded-full overflow-hidden my-1.5 w-full max-w-[150px]" style={{ background: C.track }}
              role="img" aria-label={`만족 ${stats.good}, 보통 ${stats.mid}, 불만 ${stats.bad}`}>
              <i className="block h-full" style={{ width: `${pct(stats.good)}%`, background: C.good }} />
              <i className="block h-full" style={{ width: `${pct(stats.mid)}%`, background: C.warn }} />
              <i className="block h-full" style={{ width: `${pct(stats.bad)}%`, background: C.bad }} />
            </div>
            <p className="text-[12px]" style={{ color: C.faint }}>
              만족 {stats.good} · 보통 {stats.mid} · <span style={{ color: stats.bad ? C.bad : C.faint }}>불만 {stats.bad}</span>
            </p>
          </div>
          <Stat label="특이사항" value={`${stats.noted}곳`} sub="이번 회의에서 볼 것" />
          <Stat label="리워드 미등록" value={`${stats.noReward}곳`} sub="매입 작업 내역이 없음" color={stats.noReward ? C.warn : undefined} />
          <Stat label="보장형 5위 이내" value={`${g.inside} / ${g.total}`} sub={gSub} />
        </div>
      )}
    </div>
  );
}

function CountLine({ data }: { data: OpsBoardData }) {
  return (
    <p className="text-[13px] mt-0.5" style={{ color: C.muted }}>
      진행중 업체 <b className="font-semibold tabular-nums" style={{ color: C.ink }}>{num(data.clients.length)}곳</b>
      {" · "}캠페인 <span className="tabular-nums">{num(data.campaignCount)}건</span>
    </p>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium" style={{ color: C.muted }}>{label}</p>
      <p className="text-[20px] font-bold tabular-nums" style={{ color: color ?? C.ink }}>{value}</p>
      {sub && <p className="text-[12px]" style={{ color: C.faint, wordBreak: "keep-all" }}>{sub}</p>}
    </div>
  );
}

// ─── 업체 표 ──────────────────────────────────────────────────

function ClientTable({ data, onSave }: {
  data: OpsBoardData;
  onSave: (c: OpsClient, patch: { satisfaction?: Satisfaction | null; note?: string }) => void;
}) {
  const [view, setView] = useState<ViewKey>("all");
  const [owner, setOwner] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [satOpen, setSatOpen] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [rwOpen, setRwOpen] = useState<Set<string>>(new Set());

  const asOf = data.asOf;
  const weekEnd = addDays(data.weekStart, 6);
  const nextEnd = addDays(data.weekStart, 13);
  const [y, m] = asOf.split("-").map(Number);
  const monthEnd = `${asOf.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const VIEWS: [ViewKey, string, (c: OpsClient) => boolean][] = [
    ["all", "전체", () => true],
    ["note", "특이사항", c => !!c.note.trim()],
    ["none", "리워드 미등록", c => !c.rewards.length],
    ["end", "이번 주 종료", c => !!c.endDate && c.endDate <= weekEnd],
  ];

  const owners = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of data.clients) for (const o of c.owners) count.set(o, (count.get(o) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([o]) => o);
  }, [data.clients]);

  const byOwner = (c: OpsClient) => !owner || c.owners.includes(owner);
  const viewFn = VIEWS.find(v => v[0] === view)![2];
  const list = data.clients.filter(c => viewFn(c) && byOwner(c)); // API가 종료일 순으로 준다

  // 종료가 가까운 업체부터 기간별로 끊는다. 뒤쪽 묶음은 길어서 처음엔 일부만 보인다
  const buckets: { key: string; label: string; range: string; tone: Tone; fits: (c: OpsClient) => boolean }[] = [
    { key: "week", label: "이번 주 종료", range: `${md(asOf)} – ${md(weekEnd)}`, tone: TONE.bad,
      fits: c => !!c.endDate && c.endDate <= weekEnd },
    { key: "next", label: "다음 주 종료", range: `${md(addDays(weekEnd, 1))} – ${md(nextEnd)}`, tone: TONE.warn,
      fits: c => !!c.endDate && c.endDate <= nextEnd },
    { key: "month", label: `${m}월 안에 종료`, range: `${md(addDays(nextEnd, 1))} – ${md(monthEnd)}`, tone: TONE.accent,
      fits: c => !!c.endDate && c.endDate <= monthEnd },
    { key: "later", label: "그 이후 · 장기 계약", range: "다음 달 이후 · 종료일 없음", tone: TONE.muted, fits: () => true },
  ];
  let rest = list;
  const groups = buckets.map((b, i) => {
    const rows = rest.filter(b.fits);
    rest = rest.filter(c => !b.fits(c));
    const folded = i >= 2 && !expanded.has(b.key) && rows.length > FOLD_LIMIT;
    return { ...b, rows, folded };
  }).filter(g => g.rows.length);

  // 만족도 메뉴는 바깥을 누르면 닫는다
  useEffect(() => {
    if (!satOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.(`[data-satpick="${satOpen}"]`)) setSatOpen(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSatOpen(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [satOpen]);

  const toggle = (set: Set<string>, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };

  return (
    <div className="rounded-xl min-w-0" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <p className="text-[15px] font-semibold mr-1" style={{ color: C.ink }}>업체별 운영 현황</p>
        <Tabs label="보기">
          {VIEWS.map(([k, l, fn]) => (
            <TabButton key={k} pressed={view === k} onClick={() => { setView(k); setExpanded(new Set()); }}>
              {l}<span className="ml-1 tabular-nums" style={{ color: view === k ? C.accent : C.faint }}>
                {data.clients.filter(c => fn(c) && byOwner(c)).length}
              </span>
            </TabButton>
          ))}
        </Tabs>
        {owners.length > 1 && (
          <span className="lg:ml-auto">
            <Tabs label="영업 담당">
              <TabButton pressed={!owner} onClick={() => setOwner("")}>모든 담당</TabButton>
              {owners.map(o => <TabButton key={o} pressed={owner === o} onClick={() => setOwner(o)}>{o}</TabButton>)}
            </Tabs>
          </span>
        )}
      </div>

      <div className="hidden lg:grid lg:grid-cols-[minmax(150px,0.95fr)_minmax(220px,1.5fr)_96px_minmax(0,1.2fr)] px-4 py-2 text-[12px] font-medium"
        style={{ color: C.faint, background: C.soft, borderBottom: `1px solid ${C.line}` }}>
        <div className="pr-3">업체</div><div className="pr-3">사용 중인 리워드</div><div className="pr-3">만족도</div><div>특이사항</div>
      </div>

      {groups.length === 0 && <Empty>해당하는 업체가 없습니다</Empty>}
      {groups.map((g, gi) => (
        <div key={g.key}>
          <div className="flex items-center gap-2.5 px-4 py-2.5"
            style={{ background: g.tone.bg, borderTop: gi ? `2px solid ${g.tone.fg}` : undefined,
              boxShadow: gi ? undefined : `inset 0 2px 0 ${g.tone.fg}`, borderBottom: `1px solid ${C.line}` }}>
            <span className="text-[14px] font-semibold" style={{ color: g.tone.fg }}>{g.label}</span>
            <span className="text-[12px] tabular-nums" style={{ color: C.muted }}>{g.range}</span>
            <span className="ml-auto text-[12px] font-semibold rounded-full px-2.5 py-0.5 bg-white tabular-nums" style={{ color: g.tone.fg }}>
              {g.rows.length}곳
            </span>
          </div>
          {(g.folded ? g.rows.slice(0, FOLD_LIMIT) : g.rows).map(c => (
            <ClientRow key={c.id} c={c} asOf={asOf}
              satOpen={satOpen === c.id} onSatToggle={() => setSatOpen(s => s === c.id ? null : c.id)}
              onSat={v => { setSatOpen(null); if (v !== c.satisfaction) onSave(c, { satisfaction: v }); }}
              noteOpen={noteOpen === c.id} onNoteOpen={() => { setSatOpen(null); setNoteOpen(c.id); }}
              onNoteClose={v => { setNoteOpen(null); if (v !== null && v !== c.note.trim()) onSave(c, { note: v }); }}
              rwAll={rwOpen.has(c.id)} onRwToggle={() => setRwOpen(s => toggle(s, c.id))}
              canEdit={data.careReady} />
          ))}
          {g.folded && (
            <button type="button" onClick={() => setExpanded(s => toggle(s, g.key))}
              className="w-full px-4 py-3 text-[13px] font-medium text-left hover:bg-[#F7F8FA]"
              style={{ color: C.accent, borderBottom: `1px solid ${C.line}` }}>
              {g.rows.length - FOLD_LIMIT}곳 더 보기
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Tabs({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-[10px] p-[3px]" style={{ background: C.soft }}>
      {children}
    </div>
  );
}

function TabButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={`text-[13px] rounded-lg px-2.5 py-1 whitespace-nowrap transition-colors ${pressed ? "font-semibold bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "font-medium"}`}
      style={{ color: pressed ? C.ink : C.muted }}>
      {children}
    </button>
  );
}

function ClientRow({ c, asOf, satOpen, onSatToggle, onSat, noteOpen, onNoteOpen, onNoteClose, rwAll, onRwToggle, canEdit }: {
  c: OpsClient; asOf: string;
  satOpen: boolean; onSatToggle: () => void; onSat: (v: Satisfaction | null) => void;
  noteOpen: boolean; onNoteOpen: () => void; onNoteClose: (v: string | null) => void;
  rwAll: boolean; onRwToggle: () => void; canEdit: boolean;
}) {
  const d = c.endDate ? daysBetween(asOf, c.endDate) : null;
  const edge = c.satisfaction === "불만" ? C.bad : c.satisfaction === "보통" ? C.warn : null;
  const rws = rwAll ? c.rewards : c.rewards.slice(0, RW_LIMIT);
  const showCampaigns = c.campaigns.length > 1 || (c.campaigns[0] && c.campaigns[0] !== c.name);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2.5 lg:gap-y-0 lg:grid-cols-[minmax(150px,0.95fr)_minmax(220px,1.5fr)_96px_minmax(0,1.2fr)] items-start px-4 py-3.5 hover:bg-[#FAFBFC]"
      style={{ borderBottom: `1px solid ${C.lineSoft}`, boxShadow: edge ? `inset 3px 0 0 ${edge}` : undefined }}>
      {/* 만족도 — 좁은 화면에서는 업체 이름 오른쪽에 붙는다 */}
      <div className="row-start-1 col-start-2 lg:col-start-3 pl-3 lg:pl-0 lg:pr-3 relative" data-satpick={c.id}>
        <SatButton value={c.satisfaction} open={satOpen} onClick={onSatToggle} disabled={!canEdit} />
        {satOpen && (
          <div role="menu" className="absolute z-20 top-[calc(100%+4px)] right-0 lg:right-auto lg:left-0 grid min-w-[112px] rounded-xl bg-white p-1"
            style={{ border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
            {SAT_OPTIONS.map(s => (
              <button key={s ?? "none"} type="button" role="menuitem" onClick={() => onSat(s)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-left hover:bg-[#F7F8FA]"
                style={{ color: C.body, fontWeight: s === c.satisfaction ? 600 : 400 }}>
                <i className="w-2 h-2 rounded-full" style={{ background: s ? SAT_TONE[s].fg : C.line }} />
                {s ?? "미확인"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="row-start-1 col-start-1 min-w-0 lg:pr-3.5">
        <p className="text-[14px] font-semibold leading-snug" style={{ color: C.ink, wordBreak: "keep-all" }}>
          {c.name}
          {c.campaigns.length > 1 && <span className="ml-1 text-[12px] font-medium tabular-nums" style={{ color: C.faint }}>{c.campaigns.length}건</span>}
        </p>
        {showCampaigns && (
          <p className="text-[12px] mt-0.5" style={{ color: C.faint, wordBreak: "keep-all" }}>{c.campaigns.join(" · ")}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[12px] leading-normal" style={{ color: C.muted }}>
          <Flag tone={c.guaranteed ? TONE.accent : TONE.muted}>{c.guaranteed ? "보장" : "관리"}</Flag>
          {c.owner && (
            <span className="inline-flex items-center gap-1">
              <i className="w-1.5 h-1.5 rounded-full" style={{ background: personColor(c.owner) }} />{c.owner}
              {c.owners.length > 1 && <span style={{ color: C.faint }}>외 {c.owners.length - 1}</span>}
            </span>
          )}
          <span className="tabular-nums">
            {c.endDate ? <>
              {d !== null && d >= 0 && d <= 6 && <span className="font-semibold mr-1" style={{ color: C.warn }}>D-{d}</span>}
              {md(c.endDate)} 종료
            </> : "종료일 없음"}
          </span>
        </div>
        {c.rank && <RankLine rank={c.rank} />}
      </div>

      <div className="col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 min-w-0 lg:pr-3.5">
        {c.rewards.length ? (
          <ul className="grid gap-2">
            {rws.map((r, i) => <RewardLine key={i} r={r} />)}
            {c.rewards.length > RW_LIMIT && (
              <li>
                <button type="button" onClick={onRwToggle} className="text-[12px] font-medium" style={{ color: C.accent }}>
                  {rwAll ? "접기" : `+${c.rewards.length - RW_LIMIT}개 더`}
                </button>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-[13px]" style={{ color: C.warn }}>세팅된 리워드 없음</p>
        )}
      </div>

      <div className="col-span-2 lg:col-span-1 lg:col-start-4 lg:row-start-1 min-w-0">
        <NoteCell note={c.note} open={noteOpen} onOpen={onNoteOpen} onClose={onNoteClose} canEdit={canEdit} />
      </div>
    </div>
  );
}

function SatButton({ value, open, onClick, disabled }: { value: Satisfaction | null; open: boolean; onClick: () => void; disabled: boolean }) {
  const tone = value ? SAT_TONE[value] : null;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-haspopup="menu" aria-expanded={open}
      title={disabled ? "DB 반영 후 기록할 수 있습니다" : "만족도 고르기"}
      className="inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[13px] font-medium whitespace-nowrap disabled:opacity-60"
      style={{
        color: tone?.fg ?? C.muted, background: tone?.bg ?? "#fff",
        border: `1px solid ${tone ? "transparent" : C.line}`,
      }}>
      <i className="w-2 h-2 rounded-full" style={{ background: tone?.fg ?? C.line }} />
      {value ?? "미확인"}
    </button>
  );
}

function RankLine({ rank }: { rank: NonNullable<OpsClient["rank"]> }) {
  const kw = rank.keyword ? `'${rank.keyword}' ` : "";
  if (!rank.checked) return <p className="text-[12px] mt-1" style={{ color: C.faint }}>순위 확인 안 됨</p>;
  if (rank.rank === null) return <p className="text-[12px] mt-1" style={{ color: C.bad, wordBreak: "keep-all" }}>{kw}순위 밖</p>;
  const inside = rank.rank <= 5;
  return (
    <p className="text-[12px] mt-1 tabular-nums" style={{ color: inside ? C.good : C.bad, wordBreak: "keep-all" }}>
      {kw}{rank.rank}위{inside ? "" : " · 5위 밖"}
    </p>
  );
}

/** 리워드 한 개 = 두 줄. 윗줄 상품 · 수량, 아랫줄 매입처 · 기간. 넘치면 말줄임 */
function RewardLine({ r }: { r: OpsReward }) {
  // 상품명 앞에 매입처 이름이 붙어 있으면 뗀다 — 아랫줄에 매입처가 따로 보인다
  const product = r.vendor && r.product.startsWith(`${r.vendor} `) ? r.product.slice(r.vendor.length + 1) : r.product;
  const dim = r.done;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 leading-snug">
      <span className="truncate text-[13px]" title={r.product} style={{ color: dim ? C.faint : C.ink }}>{product}</span>
      <span className="text-[13px] text-right tabular-nums" style={{ color: dim ? C.faint : C.body }}>
        {r.quantity ? `${num(r.quantity)}개` : ""}
      </span>
      <span className="truncate text-[12px]" style={{ color: C.faint }}>{r.isPackage ? "패키지" : r.vendor ?? "매입처 없음"}</span>
      <span className="text-[12px] text-right tabular-nums whitespace-nowrap" style={{ color: C.faint }}>
        {r.done ? "작업 마감" : r.end ? `${md(r.end)}까지` : ""}
      </span>
    </li>
  );
}

/** 특이사항 — 평소엔 글, 누르면 입력 칸. 칸을 벗어나거나 Ctrl+Enter로 저장, Esc는 취소 */
function NoteCell({ note, open, onOpen, onClose, canEdit }: {
  note: string; open: boolean; onOpen: () => void; onClose: (v: string | null) => void; canEdit: boolean;
}) {
  if (open) return <NoteEditor initial={note} onClose={onClose} />;
  if (note.trim()) {
    return (
      <button type="button" onClick={onOpen} disabled={!canEdit} title="눌러서 고치기"
        className="block w-full text-left text-[13px] leading-relaxed rounded-lg -mx-2 -my-1 px-2 py-1 whitespace-pre-wrap hover:bg-white hover:shadow-[inset_0_0_0_1px_#E5E8EB] disabled:hover:bg-transparent disabled:hover:shadow-none"
        style={{ color: C.body, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
        {note}
      </button>
    );
  }
  if (!canEdit) return <span className="text-[13px]" style={{ color: C.faint }}>—</span>;
  return (
    <button type="button" onClick={onOpen} className="text-[13px] hover:text-[#3182F6]" style={{ color: C.faint }}>
      + 특이사항 적기
    </button>
  );
}

function NoteEditor({ initial, onClose }: { initial: string; onClose: (v: string | null) => void }) {
  const [draft, setDraft] = useState(initial);
  const [cancelled, setCancelled] = useState(false);
  return (
    <textarea autoFocus rows={3} value={draft} onChange={e => setDraft(e.target.value)}
      placeholder="요청 · 불만 · 연장 의향 · 작업 변경 등"
      aria-label="특이사항"
      onFocus={e => { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); }}
      onBlur={() => onClose(cancelled ? null : draft.trim())}
      onKeyDown={e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.blur(); }
        else if (e.key === "Escape") { e.preventDefault(); setCancelled(true); const t = e.currentTarget; setTimeout(() => t.blur()); }
      }}
      className="w-full rounded-[9px] px-2.5 py-2 text-[13px] leading-relaxed outline-none"
      style={{ border: `1px solid ${C.accent}`, boxShadow: `0 0 0 3px ${C.accentSoft}`, color: C.ink, resize: "vertical" }} />
  );
}

// ─── 옆 상자 ──────────────────────────────────────────────────

function RewardMix({ data }: { data: OpsBoardData | null }) {
  const rows = data?.rewardMix.slice(0, 10) ?? [];
  const max = rows[0]?.clients ?? 1;
  return (
    <Panel title="지금 쓰는 리워드" sub="진행중인 작업 기준 · 쓰는 업체 수">
      {!data ? <Empty>불러오는 중…</Empty> : !rows.length ? <Empty>지금 돌고 있는 리워드 작업이 없습니다</Empty> : (
        <div className="grid gap-2.5 px-4 pt-2.5 pb-3.5">
          {rows.map(r => {
            const product = r.product.startsWith(`${r.vendor} `) ? r.product.slice(r.vendor.length + 1) : r.product;
            return (
              <div key={`${r.vendor}|${r.product}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 items-baseline">
                <p className="text-[13px] font-medium truncate" style={{ color: C.ink }} title={`${r.product} · ${r.vendor}`}>
                  {product}<span className="ml-1.5 text-[12px] font-normal" style={{ color: C.faint }}>{r.vendor}</span>
                </p>
                <span className="text-[12px] tabular-nums" style={{ color: C.muted }}>{r.clients}곳</span>
                <div className="col-span-2 h-[5px] rounded-full overflow-hidden" style={{ background: C.track }}>
                  <i className="block h-full rounded-full" style={{ width: `${(r.clients / max) * 100}%`, background: C.accent }} />
                </div>
              </div>
            );
          })}
          {data.rewardMix.length > rows.length && (
            <p className="text-[12px]" style={{ color: C.faint }}>외 {data.rewardMix.length - rows.length}개 리워드</p>
          )}
        </div>
      )}
    </Panel>
  );
}

function PendingPanel({ data, asOf }: { data: OpsBoardData | null; asOf: string }) {
  const p = data?.pending;
  const waited = p?.confirm.oldestDate ? Math.max(0, daysBetween(p.confirm.oldestDate, asOf)) : null;
  const confirmSub = p && p.confirm.count
    ? [p.confirm.oldestName && waited !== null ? `${p.confirm.oldestName} ${waited}일째` : "",
       p.confirm.requesters.length === 1 ? `모두 ${p.confirm.requesters[0]}` : p.confirm.requesters.join(" · ")]
        .filter(Boolean).join(" · ")
    : "대기 중인 요청 없음";
  return (
    <Panel title="처리 대기" sub="결재 화면에서 처리합니다">
      {!p ? <Empty>불러오는 중…</Empty> : (
        <>
          <PendingRow title={`입금확인 대기 ${p.confirm.count}건`}
            sub={p.confirm.count ? `${confirmSub}${p.confirm.amount ? ` · ${won(p.confirm.amount)}` : ""}` : confirmSub}
            flag={p.confirm.count ? <Flag tone={TONE.bad}>확인 필요</Flag> : <Flag tone={TONE.good}>없음</Flag>} />
          <PendingRow title={`매입 미승인 ${p.costs.count}건`}
            sub={p.costs.count ? `진행중 캠페인 · 공급가 ${won(p.costs.supply)}` : "진행중 캠페인 기준 없음"}
            flag={p.costs.count ? <Flag tone={TONE.warn}>승인 필요</Flag> : <Flag tone={TONE.good}>없음</Flag>}
            divider />
        </>
      )}
    </Panel>
  );
}

function PendingRow({ title, sub, flag, divider }: { title: string; sub: string; flag: React.ReactNode; divider?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-center px-4 py-2.5"
      style={{ borderTop: divider ? `1px solid ${C.lineSoft}` : undefined }}>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold tabular-nums" style={{ color: C.ink }}>{title}</p>
        <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: C.muted, wordBreak: "keep-all" }}>{sub}</p>
      </div>
      {flag}
    </div>
  );
}
