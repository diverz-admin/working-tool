"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ─── 타입 ────────────────────────────────────────────────────
export type Status     = "할 일" | "진행중" | "검토중" | "완료";
export type Priority   = "높음" | "보통" | "낮음";
export type EventColor = "blue" | "purple" | "green" | "orange" | "red" | "indigo";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  assignee: string;
  tag?: string;
  startDate?: string;     // 기간 시작일 (없으면 dueDate와 동일)
  dueDate?: string;       // 기간 종료일 (캘린더에 자동 표시)
}

export interface CalEvent {
  id: string;
  date: string;
  title: string;
  color: EventColor;
  team?: string;
  linkedTaskId?: string;  // 보드 업무와 연결된 경우
}

interface Ctx {
  tasks: Task[];
  calEvents: CalEvent[];
  addTask: (t: Omit<Task, "id">) => string;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addCalEvent: (e: Omit<CalEvent, "id">, linkTask?: Omit<Task, "id"> | null) => void;
  deleteCalEvent: (id: string) => void;
}

// ─── 초기 데이터 ─────────────────────────────────────────────
const INIT_TASKS: Task[] = [
  // 6월 1일
  { id: "t01", title: "레브나이블럭 제안서",              assignee: "하늘", status: "할 일", priority: "높음", tag: "제안서",  dueDate: "2026-06-01" },
  { id: "t02", title: "여름업체 타겟 프로모션",           assignee: "하늘", status: "할 일", priority: "보통", tag: "마케팅",  dueDate: "2026-06-01" },
  { id: "t03", title: "여름 프로모션",                    assignee: "지훈", status: "할 일", priority: "보통", tag: "마케팅",  dueDate: "2026-06-01" },
  { id: "t04", title: "ERP 레이아웃 완성",                assignee: "한알", status: "할 일", priority: "높음", tag: "개발",    dueDate: "2026-06-01" },
  // 6월 4일
  { id: "t05", title: "블로그 자동화 셋팅",               assignee: "지훈", status: "할 일", priority: "보통", tag: "개발",    dueDate: "2026-06-04" },
  // 6월 5일
  { id: "t06", title: "SNS 기획안",                       assignee: "하늘", status: "할 일", priority: "보통", tag: "기획",    dueDate: "2026-06-05" },
  // 6월 8일
  { id: "t07", title: "홈페이지",                         assignee: "하늘", status: "할 일", priority: "높음", tag: "개발",    dueDate: "2026-06-08" },
  { id: "t08", title: "홈페이지",                         assignee: "한알", status: "할 일", priority: "높음", tag: "개발",    dueDate: "2026-06-08" },
  { id: "t09", title: "ERP 완료",                         assignee: "한알", status: "할 일", priority: "높음", tag: "개발",    dueDate: "2026-06-08" },
  { id: "t10", title: "META 콘텐츠 제작",                 assignee: "하늘", status: "할 일", priority: "보통", tag: "콘텐츠",  dueDate: "2026-06-08" },
  // 6월 9일
  { id: "t11", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-09" },
  // 6월 10일
  { id: "t12", title: "인스타그램 콘텐츠 제작 (일주일치)", assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",    dueDate: "2026-06-10" },
  // 6월 11일
  { id: "t13", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-11" },
  // 6월 14일
  { id: "t14", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-14" },
  // 6월 15일
  { id: "t15", title: "회사소개서",                       assignee: "하늘", status: "할 일", priority: "보통", tag: "문서",    dueDate: "2026-06-15" },
  { id: "t16", title: "ERP 내부 적용 1차",                assignee: "한알", status: "할 일", priority: "높음", tag: "개발",    dueDate: "2026-06-15" },
  { id: "t17", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-15" },
  // 6월 16일
  { id: "t18", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-16" },
  // 6월 17일
  { id: "t19", title: "인스타그램 콘텐츠 제작 (일주일치)", assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",    dueDate: "2026-06-17" },
  { id: "t20", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-17" },
  // 6월 18일
  { id: "t21", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-18" },
  // 6월 19일
  { id: "t22", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-19" },
  // 6월 21일
  { id: "t23", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-21" },
  // 6월 22일
  { id: "t24", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-22" },
  // 6월 23일
  { id: "t25", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-23" },
  // 6월 24일
  { id: "t26", title: "인스타그램 콘텐츠 제작 (일주일치)", assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",    dueDate: "2026-06-24" },
  { id: "t27", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-24" },
  // 6월 25일
  { id: "t28", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-25" },
  // 6월 26일
  { id: "t29", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-26" },
  // 6월 28일
  { id: "t30", title: "블로그 발행",                      assignee: "지훈", status: "할 일", priority: "보통", tag: "블로그",  dueDate: "2026-06-28" },
  // 6월 29일
  { id: "t31", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-06-29" },
  // 7월 1일
  { id: "t32", title: "인스타그램 발행",                  assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",     dueDate: "2026-07-01" },
  { id: "t33", title: "인스타그램 콘텐츠 제작 (일주일치)", assignee: "하늘", status: "할 일", priority: "보통", tag: "SNS",    dueDate: "2026-07-01" },
  // 기간 있는 업무 예시
  { id: "t34", title: "홈페이지 개편 프로젝트",           assignee: "한알", status: "진행중", priority: "높음", tag: "개발",   startDate: "2026-06-08", dueDate: "2026-06-19" },
  { id: "t35", title: "6월 SNS 콘텐츠 캘린더 운영",      assignee: "하늘", status: "진행중", priority: "보통", tag: "SNS",    startDate: "2026-06-01", dueDate: "2026-06-30" },
];

const INIT_EVENTS: CalEvent[] = [];

// ─── Context ─────────────────────────────────────────────────
const MarketingContext = createContext<Ctx | null>(null);

export function MarketingProvider({ children }: { children: ReactNode }) {
  const [tasks,     setTasks]     = useState<Task[]>(INIT_TASKS);
  const [calEvents, setCalEvents] = useState<CalEvent[]>(INIT_EVENTS);

  const addTask = useCallback((t: Omit<Task, "id">): string => {
    const id = `t${Date.now()}`;
    setTasks((prev) => [...prev, { ...t, id }]);
    return id;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    // 연결된 캘린더 이벤트도 제거
    setCalEvents((prev) => prev.filter((e) => e.linkedTaskId !== id));
  }, []);

  const addCalEvent = useCallback((e: Omit<CalEvent, "id">, linkTask?: Omit<Task, "id"> | null) => {
    const eventId = `e${Date.now()}`;
    let taskId: string | undefined;

    if (linkTask) {
      taskId = `t${Date.now() + 1}`;
      setTasks((prev) => [...prev, { ...linkTask, id: taskId! }]);
    }

    setCalEvents((prev) => [...prev, { ...e, id: eventId, linkedTaskId: taskId }]);
  }, []);

  const deleteCalEvent = useCallback((id: string) => {
    setCalEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return (
    <MarketingContext.Provider value={{ tasks, calEvents, addTask, updateTask, deleteTask, addCalEvent, deleteCalEvent }}>
      {children}
    </MarketingContext.Provider>
  );
}

export function useMarketing() {
  const ctx = useContext(MarketingContext);
  if (!ctx) throw new Error("useMarketing must be inside MarketingProvider");
  return ctx;
}

// ─── 공통 상수 ──────────────────────────────────────────────
export const ASSIGNEES = ["하늘", "지훈", "한알"];

export const AVATAR_COLORS: Record<string, string> = {
  하늘: "#8B5CF6",
  지훈: "#10B981",
  한알: "#F59E0B",
};

export const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  "할 일":  { bg: "#F8FAFC",              color: "#64748B", border: "#E2E8F0" },
  "진행중": { bg: "rgba(49,130,246,0.07)", color: "#2462D8", border: "rgba(49,130,246,0.2)" },
  "검토중": { bg: "rgba(245,158,11,0.07)", color: "#B45309", border: "rgba(245,158,11,0.25)" },
  "완료":   { bg: "rgba(16,185,129,0.07)", color: "#059669", border: "rgba(16,185,129,0.25)" },
};

export const PRIORITY_STYLE: Record<Priority, { color: string }> = {
  높음: { color: "#EF4444" },
  보통: { color: "#F59E0B" },
  낮음: { color: "#94A3B8" },
};

export const EVENT_COLOR_MAP: Record<EventColor, { bg: string; text: string; dot: string }> = {
  blue:   { bg: "rgba(49,130,246,0.12)",  text: "#2462D8", dot: "#3182F6" },
  purple: { bg: "rgba(99,102,241,0.12)",  text: "#4F46E5", dot: "#6366F1" },
  green:  { bg: "rgba(16,185,129,0.12)",  text: "#059669", dot: "#10B981" },
  orange: { bg: "rgba(245,158,11,0.12)",  text: "#B45309", dot: "#F59E0B" },
  red:    { bg: "rgba(239,68,68,0.12)",   text: "#DC2626", dot: "#EF4444" },
  indigo: { bg: "rgba(99,102,241,0.12)",  text: "#4F46E5", dot: "#6366F1" },
};

export const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  콘텐츠: { bg: "rgba(99,102,241,0.1)",  color: "#6366F1" },
  광고:   { bg: "rgba(239,68,68,0.1)",   color: "#EF4444" },
  리포트: { bg: "rgba(16,185,129,0.1)",  color: "#10B981" },
  분석:   { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B" },
  영상:   { bg: "rgba(236,72,153,0.1)",  color: "#EC4899" },
  SEO:    { bg: "rgba(20,184,166,0.1)",  color: "#14B8A6" },
  기획:   { bg: "rgba(139,92,246,0.1)",  color: "#8B5CF6" },
  이메일: { bg: "rgba(59,130,246,0.1)",  color: "#3B82F6" },
  메시지: { bg: "rgba(249,115,22,0.1)",  color: "#F97316" },
  제안서: { bg: "rgba(139,92,246,0.12)", color: "#7C3AED" },
  마케팅: { bg: "rgba(236,72,153,0.1)",  color: "#DB2777" },
  개발:   { bg: "rgba(20,184,166,0.1)",  color: "#0D9488" },
  블로그: { bg: "rgba(16,185,129,0.1)",  color: "#059669" },
  SNS:    { bg: "rgba(49,130,246,0.1)",  color: "#2462D8" },
  문서:   { bg: "rgba(100,116,139,0.1)", color: "#475569" },
};
