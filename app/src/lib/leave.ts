export type LeaveStatus = "대기" | "승인" | "반려";
export type LeaveType   = "연차" | "반차" | "병가" | "기타";

export const LEAVE_TYPES: LeaveType[] = ["연차", "반차", "병가", "기타"];

export interface LeaveItem {
  id:           string;
  title:        string;
  leaveType:    LeaveType;
  requester:    string;
  startDate:    string;
  endDate:      string | null;
  requestedAt:  string;
  leaveDays:    number;
  note:         string | null;
  status:       LeaveStatus;
  rejectReason: string | null;
  createdAt:    string;
}

export interface LeaveBalance {
  granted:   number;  // 연간 부여 연차
  used:      number;  // 승인된 차감 일수 (당해 연도)
  remaining: number;
}

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

function toUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

/** 시작일~종료일 사이의 평일(토·일 제외) 수 */
export function countWeekdays(startDate: string, endDate: string): number {
  const start = toUTC(startDate);
  const end   = toUTC(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  if ((end - start) / DAY_MS > MAX_RANGE_DAYS) return 0;

  let days = 0;
  for (let t = start; t <= end; t += DAY_MS) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** 휴가 종류별 연차 차감 일수 — 연차는 평일 수, 반차는 0.5일, 병가·기타는 차감 없음 */
export function calcLeaveDays(leaveType: LeaveType, startDate: string, endDate?: string | null): number {
  if (leaveType === "반차") return 0.5;
  if (leaveType !== "연차") return 0;
  return countWeekdays(startDate, endDate || startDate);
}

export function fmtDays(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function fmtPeriod(startDate: string, endDate?: string | null): string {
  return endDate && endDate !== startDate ? `${startDate} ~ ${endDate}` : startDate;
}
