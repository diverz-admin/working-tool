"use client";

import { useEffect } from "react";

export default function SessionSync() {
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.user) return;
        localStorage.setItem("diverz_user_role", data.user.role);
        localStorage.setItem("diverz_user_name", data.user.name);
        localStorage.setItem("diverz_user_team", data.user.team ?? "");
        window.dispatchEvent(new Event("session-synced"));
      });
  }, []);

  return null;
}
