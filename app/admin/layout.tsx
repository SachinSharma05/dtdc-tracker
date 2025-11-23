"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/api/auth/signin?callbackUrl=/admin");
    }
  }, [status]);

  if (status !== "authenticated") {
    return <div className="p-6">Checking authentication…</div>;
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200">
        <div className="p-4 text-xl font-semibold">Admin</div>

        <nav className="p-4 space-y-2">
          <Link
            href="/admin/track"
            className="block px-3 py-2 rounded hover:bg-slate-100"
          >
            Track Consignment
          </Link>

          <button
            onClick={() => {
              sessionStorage.removeItem("dtdc_rows");
              sessionStorage.removeItem("dtdc_file");
              signOut({ callbackUrl: "/api/auth/signin?callbackUrl=/admin" });
            }}
            className="w-full text-left px-3 py-2 rounded hover:bg-red-100 text-red-600 font-medium"
          >
            Logout
          </button>
        </nav>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
