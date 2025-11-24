// app/admin/layout.tsx
"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  function logout() {
    // simple logout: clear local/session storage and navigate to login
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {}
    router.push("/api/auth/signout?callbackUrl=/login"); // adapt to your auth flow
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 p-4">
        <div className="text-xl font-semibold mb-4">Admin</div>

        <nav className="space-y-2">
          <Link href="/admin" className="block px-3 py-2 rounded hover:bg-slate-100">Dashboard</Link>
          <Link href="/admin/track" className="block px-3 py-2 rounded hover:bg-slate-100">Track Consignment</Link>
        </nav>

        <div className="mt-6">
          <button onClick={logout} className="text-red-600 hover:underline">Logout</button>
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
