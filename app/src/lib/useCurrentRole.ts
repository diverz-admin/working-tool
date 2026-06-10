"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "diverz_user_role";

export type UserRole = "Admin" | "Manager" | "Staff";

export function useCurrentRole(): [UserRole, (r: UserRole) => void] {
  const [role, setRoleState] = useState<UserRole>("Staff");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as UserRole | null;
    if (stored === "Admin" || stored === "Manager" || stored === "Staff") {
      setRoleState(stored);
    }
  }, []);

  function setRole(r: UserRole) {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
  }

  return [role, setRole];
}
