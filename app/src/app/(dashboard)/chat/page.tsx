"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── 타입 ────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface Message {
  id: string;
  channelId: string;
  authorName: string;
  authorTeam: string | null;
  content: string;
  createdAt: string;
}

interface Profile {
  name: string;
  team: string;
}

interface MentionNotification {
  id: string;
  channelId: string;
  mentionedName: string;
  fromName: string;
  preview: string;
  isRead: boolean;
  createdAt: string;
}

interface UserOption {
  id: string;
  name: string;
  team: string | null;
}

interface MessageGroup {
  authorName: string;
  authorTeam: string | null;
  firstTime: string;
  messages: { id: string; content: string; createdAt: string }[];
}

interface FileAttachment {
  __type: "file";
  url: string;
  name: string;
  size: number;
  mimeType: string;
  caption: string;
}

function parseContent(content: string): { kind: "text" } | { kind: "file"; data: FileAttachment } {
  if (content.startsWith('{"__type":"file"')) {
    try {
      const d = JSON.parse(content) as FileAttachment;
      if (d.__type === "file") return { kind: "file", data: d };
    } catch { /* fall through */ }
  }
  return { kind: "text" };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const COLORS = ["#3182F6", "#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];

function authorColor(name: string) {
  let h = 0;
  for (const c of name) h = (c.charCodeAt(0) + h * 31) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name: string) {
  return name.trim().slice(0, 2);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  if (isToday) return time;
  if (isYesterday) return `어제 ${time}`;
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) + " " + time;
}

function formatDateSep(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "오늘";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "어제";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.authorName === msg.authorName) {
      const prev = last.messages[last.messages.length - 1];
      const diff = new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime();
      if (diff < 5 * 60 * 1000) {
        last.messages.push({ id: msg.id, content: msg.content, createdAt: msg.createdAt });
        continue;
      }
    }
    groups.push({
      authorName: msg.authorName,
      authorTeam: msg.authorTeam,
      firstTime: msg.createdAt,
      messages: [{ id: msg.id, content: msg.content, createdAt: msg.createdAt }],
    });
  }
  return groups;
}

async function fetchProfile(): Promise<Profile | null> {
  try {
    // API에서 먼저 시도 (세션 기반 인증)
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      if (data?.user?.name) return { name: data.user.name, team: data.user.team ?? "" };
    }
  } catch { /* fallthrough */ }
  // localStorage 폴백
  try {
    const name = localStorage.getItem("diverz_user_name");
    const team = localStorage.getItem("diverz_user_team") ?? "";
    if (name) return { name, team };
  } catch { /* ignore */ }
  return null;
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@([^\s@#]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

function renderWithMentions(text: string, myName: string) {
  const parts = text.split(/(@[^\s@#]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const name = part.slice(1);
      const isMe = name === myName;
      return (
        <span key={i} className="font-semibold rounded px-0.5"
          style={{ background: isMe ? "rgba(29,155,209,0.2)" : "rgba(99,102,241,0.12)",
                   color: isMe ? "#1D9BD1" : "#6366F1" }}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── 채널 추가 모달 ───────────────────────────────────────

function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ch: Channel) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
    });
    const { channel } = await res.json();
    onCreated(channel);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: "#E9EBEF" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: "#1D1C1D" }}>채널 만들기</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <p className="text-sm mt-1" style={{ color: "#616061" }}>채널은 특정 주제를 중심으로 대화가 이루어지는 공간입니다.</p>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: "#1D1C1D" }}>채널 이름</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "#616061" }}>#</span>
              <input autoFocus type="text" value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="예: 마케팅-전략"
                className="w-full pl-8 pr-3 py-2.5 text-sm rounded-lg outline-none border-2 focus:border-[#1D9BD1] transition-colors"
                style={{ borderColor: "#D6D0D0", color: "#1D1C1D" }} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: "#1D1C1D" }}>설명 <span className="font-normal" style={{ color: "#616061" }}>(선택)</span></label>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="이 채널의 목적을 설명해주세요."
              className="w-full px-3 py-2.5 text-sm rounded-lg outline-none border-2 focus:border-[#1D9BD1] transition-colors"
              style={{ borderColor: "#D6D0D0", color: "#1D1C1D" }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-bold rounded-lg border-2 transition-colors hover:bg-slate-50"
              style={{ borderColor: "#D6D0D0", color: "#616061" }}>취소</button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 py-2.5 text-sm font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
              {saving ? "생성 중..." : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 파일 메시지 렌더러 ───────────────────────────────────

function FileMessage({ data }: { data: FileAttachment }) {
  const isImage = data.mimeType.startsWith("image/");
  const isPdf   = data.mimeType === "application/pdf";

  return (
    <div className="mt-1 space-y-1.5" style={{ maxWidth: 360 }}>
      {isImage ? (
        <a href={data.url} download={data.name} target="_blank" rel="noopener noreferrer">
          <img src={data.url} alt={data.name}
            className="rounded-lg border object-cover"
            style={{ borderColor: "#D6D0D0", cursor: "pointer", maxHeight: 300, maxWidth: "100%" }} />
        </a>
      ) : isPdf ? (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#D6D0D0" }}>
          <iframe src={data.url} title={data.name} className="w-full" style={{ height: 200 }} />
        </div>
      ) : (
        <a href={data.url} download={data.name}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors hover:bg-slate-50"
          style={{ borderColor: "#D6D0D0", background: "#F8F8F8", textDecoration: "none" }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(29,155,209,0.12)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D9BD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#1D1C1D" }}>{data.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "#616061" }}>{formatFileSize(data.size)}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#616061" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      )}
      {data.caption && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "#1D1C1D" }}>
          {data.caption}
        </p>
      )}
    </div>
  );
}

// ─── 날짜 구분선 ──────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 my-5 px-6">
      <div className="flex-1 h-px" style={{ background: "#D6D0D0" }} />
      <span className="text-xs font-semibold px-3 py-1 rounded-full border"
        style={{ color: "#616061", borderColor: "#D6D0D0", background: "#FFFFFF" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "#D6D0D0" }} />
    </div>
  );
}

// ─── 메시지 액션 타입 ─────────────────────────────────────

interface MessageActions {
  editingId: string | null;
  editValue: string;
  onEdit: (id: string, currentContent: string) => void;
  onEditChange: (val: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onDelete: (id: string) => void;
}

// ─── 메시지 그룹 ──────────────────────────────────────────

function MessageGroupItem({
  group, isMe, myName, actions,
}: {
  group: MessageGroup;
  isMe: boolean;
  myName: string;
  actions: MessageActions;
}) {
  const color = authorColor(group.authorName);
  const editAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (actions.editingId && group.messages.some((m) => m.id === actions.editingId)) {
      editAreaRef.current?.focus();
      const len = editAreaRef.current?.value.length ?? 0;
      editAreaRef.current?.setSelectionRange(len, len);
    }
  }, [actions.editingId, group.messages]);

  return (
    <div className="group flex gap-3 px-6 py-1.5 transition-colors"
      style={{ background: "transparent" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#F8F8F8")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

      {/* 아바타 */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
        style={{ background: color }}>
        {initials(group.authorName)}
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        {/* 헤더 */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-bold hover:underline cursor-pointer" style={{ color: isMe ? "#1264A3" : "#1D1C1D" }}>
            {group.authorName}
            {isMe && <span className="ml-1 text-xs font-normal" style={{ color: "#616061" }}>(나)</span>}
          </span>
          {group.authorTeam && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ background: "rgba(29,155,209,0.1)", color: "#1264A3" }}>
              {group.authorTeam}
            </span>
          )}
          <span className="text-xs" style={{ color: "#97979C" }}>{formatTime(group.firstTime)}</span>
        </div>

        {/* 메시지들 */}
        <div className="space-y-0.5">
          {group.messages.map((m, i) => {
            const parsed = parseContent(m.content);
            const isEditing = actions.editingId === m.id;
            const isFile = parsed.kind === "file";

            return (
              <div key={m.id} className="relative group/msg flex items-start gap-1">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <textarea
                        ref={editAreaRef}
                        value={actions.editValue}
                        onChange={(e) => {
                          actions.onEditChange(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); actions.onEditSave(m.id); }
                          if (e.key === "Escape") actions.onEditCancel();
                        }}
                        rows={1}
                        className="w-full px-3 py-2 text-sm rounded-lg outline-none resize-none border-2 focus:border-[#1D9BD1] leading-relaxed"
                        style={{ borderColor: "#D6D0D0", color: "#1D1C1D", maxHeight: 200 }}
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={() => actions.onEditSave(m.id)}
                          className="px-3 py-1 text-xs font-bold rounded-lg text-white"
                          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>저장</button>
                        <button onClick={actions.onEditCancel}
                          className="px-3 py-1 text-xs font-bold rounded-lg border"
                          style={{ color: "#616061", borderColor: "#D6D0D0" }}>취소</button>
                        <span className="text-xs" style={{ color: "#97979C" }}>Enter 저장 · Esc 취소</span>
                      </div>
                    </div>
                  ) : isFile ? (
                    <FileMessage data={(parsed as { kind: "file"; data: FileAttachment }).data} />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "#1D1C1D" }}>
                      {renderWithMentions(m.content, myName)}
                    </p>
                  )}
                </div>

                {/* 시간 (두 번째~ 메시지) */}
                {i > 0 && !isEditing && (
                  <span className="text-xs opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0 mt-0.5"
                    style={{ color: "#97979C" }}>
                    {new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}

                {/* 수정/삭제 버튼 */}
                {isMe && !isEditing && !isFile && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0 mt-0.5">
                    <button onClick={() => actions.onEdit(m.id, m.content)}
                      className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-slate-200"
                      title="수정">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#616061" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={() => actions.onDelete(m.id)}
                      className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-red-50"
                      title="삭제">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E01E5A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 메시지 목록 ──────────────────────────────────────────

function MessageList({ messages, profile, actions }: {
  messages: Message[];
  profile: Profile;
  actions: MessageActions;
}) {
  const groups = groupMessages(messages);
  let lastDate = "";

  return (
    <div className="py-2">
      {groups.map((g) => {
        const dateStr = g.firstTime.slice(0, 10);
        const showSep = dateStr !== lastDate;
        // eslint-disable-next-line react-hooks/immutability
        if (showSep) lastDate = dateStr;
        const isMe = g.authorName === profile.name;
        return (
          <div key={g.firstTime + g.authorName}>
            {showSep && <DateSeparator label={formatDateSep(g.firstTime)} />}
            <MessageGroupItem group={g} isMe={isMe} myName={profile.name} actions={actions} />
          </div>
        );
      })}
    </div>
  );
}

// ─── 입력창 (Slack 스타일) ─────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function MessageInput({ channelName, onSend, disabled, users }: {
  channelName: string;
  onSend: (content: string) => void;
  disabled: boolean;
  users: UserOption[];
}) {
  const [value, setValue]               = useState("");
  const [pendingFile, setPendingFile]   = useState<Omit<FileAttachment, "__type" | "caption"> | null>(null);
  const [fileError, setFileError]       = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx]     = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, users]);

  function detectMention(text: string, cursorPos: number) {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@([^\s@#]*)$/);
    if (match) { setMentionQuery(match[1]); setMentionIdx(0); }
    else setMentionQuery(null);
  }

  function insertMention(name: string) {
    const el = textareaRef.current;
    if (!el) return;
    const before = value.slice(0, el.selectionStart);
    const after  = value.slice(el.selectionStart);
    const replaced = before.replace(/@([^\s@#]*)$/, `@${name} `);
    setValue(replaced + after);
    setMentionQuery(null);
    setTimeout(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionCandidates.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionCandidates[mentionIdx].name); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { setFileError("5MB 이하 파일만 첨부할 수 있습니다."); return; }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingFile({ url: ev.target!.result as string, name: file.name, size: file.size, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function send() {
    if (disabled) return;
    if (pendingFile) {
      const content = JSON.stringify({
        __type: "file", url: pendingFile.url, name: pendingFile.name,
        size: pendingFile.size, mimeType: pendingFile.mimeType, caption: value.trim(),
      } satisfies FileAttachment);
      onSend(content);
      setPendingFile(null);
      setValue("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    detectMention(e.target.value, e.target.selectionStart);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const canSend = !disabled && (!!pendingFile || !!value.trim());
  const isImage = pendingFile?.mimeType.startsWith("image/");

  return (
    <div className="px-4 pb-4 pt-1">
      {/* @ 멘션 드롭다운 */}
      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <div className="mb-2 rounded-xl border-2 overflow-hidden shadow-xl"
          style={{ background: "#FFFFFF", borderColor: "#D6D0D0" }}>
          <div className="px-3 py-1.5 border-b" style={{ borderColor: "#ECECEC", background: "#F8F8F8" }}>
            <span className="text-xs font-bold" style={{ color: "#616061" }}>멤버 선택</span>
          </div>
          {mentionCandidates.map((u, i) => (
            <button key={u.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(u.name); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              style={{ background: i === mentionIdx ? "rgba(29,155,209,0.08)" : "transparent" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: authorColor(u.name) }}>
                {initials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold" style={{ color: "#1D1C1D" }}>{u.name}</span>
                {u.team && <span className="ml-1.5 text-xs" style={{ color: "#97979C" }}>{u.team}</span>}
              </div>
              <span className="text-xs font-medium" style={{ color: "#1264A3" }}>@{u.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 파일 미리보기 */}
      {pendingFile && (
        <div className="mb-2 flex items-center gap-3 px-3 py-2.5 rounded-xl border-2"
          style={{ borderColor: "#D6D0D0", background: "#F8F8F8" }}>
          {isImage ? (
            <img src={pendingFile.url} alt={pendingFile.name}
              className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(29,155,209,0.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9BD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#1D1C1D" }}>{pendingFile.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "#97979C" }}>{formatFileSize(pendingFile.size)}</p>
          </div>
          <button onClick={() => setPendingFile(null)}
            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E01E5A" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
      {fileError && <p className="mb-2 text-xs px-1" style={{ color: "#E01E5A" }}>{fileError}</p>}

      {/* Slack 스타일 입력 박스 */}
      <div className="rounded-xl border-2 transition-colors focus-within:border-[#1264A3] overflow-hidden"
        style={{ borderColor: "#C8C8C8", background: "#FFFFFF" }}>
        {/* 텍스트 영역 */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={pendingFile ? "캡션을 입력하세요 (선택)" : `#${channelName} 채널에 메시지 보내기`}
          rows={1}
          disabled={disabled}
          className="w-full px-4 pt-3 pb-1 text-sm outline-none resize-none leading-relaxed"
          style={{ background: "transparent", color: "#1D1C1D", maxHeight: 160, minHeight: 42 }}
        />

        {/* 하단 툴바 */}
        <div className="flex items-center gap-0.5 px-3 pb-2.5 pt-1">
          {/* 서식 버튼 그룹 */}
          <button type="button" title="굵게" disabled={disabled}
            className="w-7 h-7 flex items-center justify-center rounded text-xs font-black transition-colors hover:bg-slate-100 disabled:opacity-30"
            style={{ color: "#616061" }}>B</button>
          <button type="button" title="기울임" disabled={disabled}
            className="w-7 h-7 flex items-center justify-center rounded text-xs italic font-bold transition-colors hover:bg-slate-100 disabled:opacity-30"
            style={{ color: "#616061", fontFamily: "Georgia, serif" }}>i</button>
          <button type="button" title="취소선" disabled={disabled}
            className="w-7 h-7 flex items-center justify-center rounded text-xs font-bold line-through transition-colors hover:bg-slate-100 disabled:opacity-30"
            style={{ color: "#616061" }}>S</button>

          {/* 구분선 */}
          <div className="w-px h-4 mx-1" style={{ background: "#D6D0D0" }} />

          {/* @ 멘션 버튼 */}
          <button type="button" title="멘션" disabled={disabled}
            onClick={() => {
              const el = textareaRef.current;
              if (!el) return;
              const pos = el.selectionStart;
              const newVal = value.slice(0, pos) + "@" + value.slice(pos);
              setValue(newVal);
              detectMention(newVal, pos + 1);
              setTimeout(() => { el.focus(); el.setSelectionRange(pos + 1, pos + 1); }, 0);
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm font-bold transition-colors hover:bg-slate-100 disabled:opacity-30"
            style={{ color: "#616061" }}>@</button>

          {/* 파일 첨부 버튼 */}
          <button type="button" title="파일 첨부 (최대 5MB)" disabled={disabled}
            onClick={() => { setFileError(null); fileInputRef.current?.click(); }}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-slate-100 disabled:opacity-30"
            style={{ color: "#616061" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          {/* 이모지 (UI only) */}
          <button type="button" title="이모지" disabled={disabled}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-slate-100 disabled:opacity-30 text-base"
            style={{ color: "#616061" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>

          <div className="flex-1" />

          {/* 전송 버튼 */}
          <button onClick={send} disabled={!canSend}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-30"
            title="전송 (Enter)"
            style={{ background: canSend ? "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" : "#E9EBEF" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={canSend ? "#FFFFFF" : "#97979C"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv" />

      <p className="text-xs mt-1.5 px-1" style={{ color: "#97979C" }}>
        <span className="font-semibold">Enter</span> 전송 &nbsp;·&nbsp; <span className="font-semibold">Shift+Enter</span> 줄바꿈 &nbsp;·&nbsp; 파일 최대 5MB
      </p>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────

export default function ChatPage() {
  const [profile, setProfile]             = useState<Profile | null>(null);
  const [channels, setChannels]           = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [sending, setSending]             = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editValue, setEditValue]         = useState("");
  const [userList, setUserList]           = useState<UserOption[]>([]);
  const [notifications, setNotifications] = useState<MentionNotification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [mentionToast, setMentionToast]   = useState<MentionNotification | null>(null);
  const notifRef   = useRef<HTMLDivElement>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());
  const subRef      = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null);

  useEffect(() => {
    fetchProfile().then((p) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p) setProfile(p);
    });
  }, []);

  useEffect(() => {
    fetch("/api/chat/channels")
      .then((r) => r.json())
      .then((d) => {
        setChannels(d.channels ?? []);
        if (d.channels?.length) setActiveChannel(d.channels[0]);
      });
  }, []);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUserList((d.users ?? []).map((u: { id: string; name: string; team: string | null }) => ({ id: u.id, name: u.name, team: u.team }))));
  }, []);

  const loadNotifications = useCallback((name: string) => {
    fetch(`/api/chat/notifications?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => setNotifications(d.mentions ?? []));
  }, []);

  useEffect(() => {
    if (profile?.name) loadNotifications(profile.name);
  }, [profile, loadNotifications]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const loadMessages = useCallback((channelId: string) => {
    setLoadingMsgs(true);
    fetch(`/api/chat/messages?channelId=${channelId}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .finally(() => setLoadingMsgs(false));
  }, []);

  useEffect(() => {
    if (!activeChannel) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages(activeChannel.id);
    if (subRef.current) supabaseRef.current.removeChannel(subRef.current);

    const ch = supabaseRef.current.channel(`chat:${activeChannel.id}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "new_message" }, ({ payload }: { payload: Message }) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === payload.id)) return prev;
        return [...prev, payload];
      });
    })
    .on("broadcast", { event: "edit_message" }, ({ payload }: { payload: { id: string; content: string } }) => {
      setMessages((prev) => prev.map((m) => m.id === payload.id ? { ...m, content: payload.content } : m));
    })
    .on("broadcast", { event: "delete_message" }, ({ payload }: { payload: { id: string } }) => {
      setMessages((prev) => prev.filter((m) => m.id !== payload.id));
    })
    .on("broadcast", { event: "mention" }, ({ payload }: { payload: MentionNotification }) => {
      if (payload.mentionedName === profile?.name) {
        setNotifications((prev) => [payload, ...prev]);
        setMentionToast(payload);
        setTimeout(() => setMentionToast(null), 5000);
      }
    })
    .subscribe();
    subRef.current = ch;
    return () => { supabaseRef.current.removeChannel(ch); };
  }, [activeChannel, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(content: string) {
    if (!activeChannel || !profile) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel.id, authorName: profile.name, authorTeam: profile.team || null, content }),
      });
      const { message } = await res.json();
      setMessages((prev) => [...prev, message]);
      subRef.current?.send({ type: "broadcast", event: "new_message", payload: message });

      const isFile = content.startsWith('{"__type":"file"');
      if (!isFile) {
        const mentioned = extractMentions(content).filter((n) => n !== profile.name);
        if (mentioned.length > 0) {
          const notifRes = await fetch("/api/chat/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: message.id, channelId: activeChannel.id, mentionedNames: mentioned, fromName: profile.name, preview: content.slice(0, 100) }),
          });
          const { mentions: savedMentions } = await notifRes.json();
          for (const m of (savedMentions ?? [])) {
            subRef.current?.send({ type: "broadcast", event: "mention", payload: m });
          }
          // 헤더 알림 벨 즉시 갱신
          window.dispatchEvent(new Event("chat-mention-received"));
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function handleMarkAllRead() {
    if (!profile) return;
    await fetch("/api/chat/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: profile.name }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  async function handleEditSave(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/chat/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });
    if (!res.ok) return;
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: trimmed } : m));
    subRef.current?.send({ type: "broadcast", event: "edit_message", payload: { id, content: trimmed } });
    setEditingId(null);
    setEditValue("");
  }

  async function handleDeleteMessage(id: string) {
    if (!confirm("이 메시지를 삭제할까요?")) return;
    await fetch(`/api/chat/messages/${id}`, { method: "DELETE" });
    setMessages((prev) => prev.filter((m) => m.id !== id));
    subRef.current?.send({ type: "broadcast", event: "delete_message", payload: { id } });
  }

  function handleChannelCreated(ch: Channel) {
    setChannels((prev) => [...prev, ch]);
    setActiveChannel(ch);
    setShowAddChannel(false);
  }

  async function handleDeleteChannel(ch: Channel) {
    if (!confirm(`#${ch.name} 채널을 삭제할까요? 모든 메시지가 사라집니다.`)) return;
    await fetch(`/api/chat/channels/${ch.id}`, { method: "DELETE" });
    setChannels((prev) => prev.filter((c) => c.id !== ch.id));
    if (activeChannel?.id === ch.id) {
      const remaining = channels.filter((c) => c.id !== ch.id);
      setActiveChannel(remaining[0] ?? null);
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex rounded-2xl overflow-hidden" style={{ height: "calc(100vh - 116px)", background: "#FFFFFF", border: "1px solid #E9EBEF" }}>

      {/* ── 사이드바 (DIVERZ 디자인) ── */}
      <aside className="w-56 flex flex-col shrink-0" style={{ background: "#F8FAFC", borderRight: "1px solid #E9EBEF" }}>

        {/* 워크스페이스 헤더 */}
        <div className="px-4 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid #E9EBEF" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0"
            style={{ background: "#3182F6" }}>D</div>
          <span className="text-sm font-black tracking-wide" style={{ color: "#191F28" }}>DIVERZ</span>
        </div>

        {/* 채널 목록 */}
        <div className="flex-1 overflow-y-auto py-3">
          <div className="px-3 mb-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-bold" style={{ color: "#94A3B8" }}>채널</span>
              <button onClick={() => setShowAddChannel(true)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors"
                title="채널 추가">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>

            {channels.map((ch) => {
              const isActive = activeChannel?.id === ch.id;
              return (
                <div key={ch.id} className="group relative">
                  <button
                    onClick={() => setActiveChannel(ch)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors"
                    style={{
                      background: isActive ? "rgba(49,130,246,0.1)" : "transparent",
                      color: isActive ? "#3182F6" : "#4E5968",
                    }}>
                    <span className="text-sm font-bold" style={{ color: isActive ? "#3182F6" : "#94A3B8" }}>#</span>
                    <span className="text-sm font-medium truncate flex-1">{ch.name}</span>
                  </button>
                  <button onClick={() => handleDeleteChannel(ch)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                    title="채널 삭제">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              );
            })}

            {channels.length === 0 && (
              <button onClick={() => setShowAddChannel(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-100 text-left"
                style={{ color: "#94A3B8" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span className="text-sm">채널 추가</span>
              </button>
            )}
          </div>
        </div>

        {/* 내 프로필 */}
        <div className="p-3" style={{ borderTop: "1px solid #E9EBEF" }}>
          {profile ? (
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
              <div className="relative shrink-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: authorColor(profile.name) }}>
                  {initials(profile.name)}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{ background: "#10B981", borderColor: "#F8FAFC" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: "#191F28" }}>{profile.name}</p>
                {profile.team && <p className="text-xs truncate" style={{ color: "#94A3B8" }}>{profile.team}</p>}
              </div>
            </div>
          ) : (
            <div className="px-2 py-2">
              <p className="text-xs" style={{ color: "#B0B8C1" }}>로딩 중...</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── 메시지 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#FFFFFF" }}>
        {activeChannel ? (
          <>
            {/* 채널 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#E9EBEF" }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-black" style={{ color: "#94A3B8" }}>#</span>
                <h2 className="text-base font-bold" style={{ color: "#191F28" }}>{activeChannel.name}</h2>
                {activeChannel.description && (
                  <>
                    <div className="w-px h-4 mx-1" style={{ background: "#E9EBEF" }} />
                    <p className="text-sm truncate" style={{ color: "#94A3B8" }}>{activeChannel.description}</p>
                  </>
                )}
              </div>

              {/* 알림 버튼 */}
              {profile && (
                <div className="relative shrink-0" ref={notifRef}>
                  <button
                    onClick={() => {
                      setShowNotifDropdown((v) => !v);
                      if (!showNotifDropdown) handleMarkAllRead();
                    }}
                    className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-slate-100"
                    title="멘션 알림">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={unreadCount > 0 ? "#3182F6" : "#94A3B8"}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{ background: "#EF4444" }} />
                    )}
                  </button>

                  {showNotifDropdown && (
                    <div className="absolute right-0 top-11 w-80 rounded-2xl border shadow-xl z-50 overflow-hidden"
                      style={{ background: "#FFFFFF", borderColor: "#E9EBEF" }}>
                      <div className="px-4 py-3 border-b flex items-center justify-between"
                        style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
                        <span className="text-sm font-bold" style={{ color: "#191F28" }}>내 멘션</span>
                        {notifications.length > 0 && (
                          <button onClick={handleMarkAllRead}
                            className="text-xs font-medium transition-colors hover:opacity-70"
                            style={{ color: "#3182F6" }}>모두 읽음</button>
                        )}
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center">
                            <p className="text-sm" style={{ color: "#97979C" }}>멘션이 없습니다</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <button key={n.id}
                              onClick={() => { const ch = channels.find((c) => c.id === n.channelId); if (ch) setActiveChannel(ch); setShowNotifDropdown(false); }}
                              className="w-full px-4 py-3 text-left border-b transition-colors hover:bg-slate-50 last:border-0"
                              style={{ borderColor: "#ECECEC", background: n.isRead ? "transparent" : "rgba(29,155,209,0.05)" }}>
                              <div className="flex items-start gap-2.5">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                                  style={{ background: authorColor(n.fromName) }}>
                                  {initials(n.fromName)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold" style={{ color: "#1D1C1D" }}>
                                    {n.fromName}
                                    <span className="ml-1 font-normal" style={{ color: "#97979C" }}>이 멘션했습니다</span>
                                  </p>
                                  <p className="text-xs mt-0.5 truncate" style={{ color: "#616061" }}>{n.preview}</p>
                                  <p className="text-xs mt-0.5" style={{ color: "#97979C" }}>{formatTime(n.createdAt)}</p>
                                </div>
                                {!n.isRead && (
                                  <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: "#3182F6" }} />
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 메시지 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto">
              {loadingMsgs ? (
                <div className="h-full flex items-center justify-center">
                  <div className="flex items-center gap-2" style={{ color: "#97979C" }}>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <span className="text-sm">불러오는 중...</span>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black"
                    style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>#</div>
                  <div className="text-center">
                    <p className="text-base font-bold" style={{ color: "#191F28" }}>#{activeChannel.name} 채널에 오신 것을 환영합니다!</p>
                    {activeChannel.description && (
                      <p className="text-sm mt-1" style={{ color: "#94A3B8" }}>{activeChannel.description}</p>
                    )}
                    <p className="text-sm mt-2" style={{ color: "#B0B8C1" }}>첫 번째 메시지를 보내보세요.</p>
                  </div>
                </div>
              ) : (
                profile && (
                  <MessageList
                    messages={messages}
                    profile={profile}
                    actions={{
                      editingId,
                      editValue,
                      onEdit: (id, content) => { setEditingId(id); setEditValue(content); },
                      onEditChange: setEditValue,
                      onEditSave: handleEditSave,
                      onEditCancel: () => { setEditingId(null); setEditValue(""); },
                      onDelete: handleDeleteMessage,
                    }}
                  />
                )
              )}
              <div ref={bottomRef} />
            </div>

            {/* 입력창 */}
            <MessageInput
              channelName={activeChannel.name}
              onSend={handleSend}
              disabled={sending || !profile}
              users={userList}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black"
              style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>#</div>
            <div className="text-center">
              <p className="text-base font-bold" style={{ color: "#191F28" }}>채널을 선택하세요</p>
              <p className="text-sm mt-1" style={{ color: "#94A3B8" }}>왼쪽에서 채널을 선택하거나 새 채널을 만들어보세요.</p>
            </div>
          </div>
        )}
      </div>

      {/* 채널 추가 모달 */}
      {showAddChannel && (
        <CreateChannelModal onClose={() => setShowAddChannel(false)} onCreated={handleChannelCreated} />
      )}

      {/* 멘션 토스트 알림 */}
      {mentionToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-xl"
          style={{ background: "#FFFFFF", border: "1px solid #E9EBEF", maxWidth: 320 }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: authorColor(mentionToast.fromName) }}>
            {initials(mentionToast.fromName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#1D1C1D" }}>
              {mentionToast.fromName}
              <span className="ml-1 font-normal" style={{ color: "#97979C" }}>이 나를 멘션했습니다</span>
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#616061" }}>{mentionToast.preview}</p>
          </div>
          <button onClick={() => setMentionToast(null)}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#97979C" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
