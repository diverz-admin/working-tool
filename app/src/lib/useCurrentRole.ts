"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "diverz_user_role";

export type UserRole = "Admin" | "Manager" | "Staff";

export function useCurrentRole(): [UserRole, (r: UserRole) => void] {
  const [role, setRoleState] = useState<UserRole>("Staff");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as UserRole | null;
    if (stored === "Admin" || stored === "Manager" || stored === "Staff") {
      setRoleState(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function setRole(r: UserRole) {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
  }

  return [role, setRole];
}
