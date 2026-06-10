"use client";

import { createContext, useContext } from "react";

export type UserRole = "Admin" | "Manager" | "Staff";

interface UserCtx {
  name: string;
  role: UserRole;
}

const UserContext = createContext<UserCtx>({ name: "사용자", role: "Staff" });

export function UserProvider({
  name, role, children,
}: { name: string; role: UserRole; children: React.ReactNode }) {
  return <UserContext.Provider value={{ name, role }}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
