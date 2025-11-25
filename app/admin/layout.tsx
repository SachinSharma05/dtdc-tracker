"use client";

import Link from "next/link";
import { ReactNode, useState, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import {
  Menu,
  Home,
  Search,
  MapPin,
  LogOut
} from "lucide-react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [hovering, setHovering] = useState(false);

  async function logout() {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {}

    await signOut({
      redirect: true,
      callbackUrl: "/login",
    });
  }

  // Determine final open state
  const sidebarOpen = hovering ? true : !collapsed;

  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* SIDEBAR */}
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`
          ${sidebarOpen ? "w-64" : "w-16"}
          bg-white border-r border-slate-200 p-4
          transition-all duration-300 overflow-hidden
        `}
      >

        {/* Header + Hamburger */}
        <div className="flex items-center justify-between mb-4">
          <div className={`${sidebarOpen ? "text-xl font-semibold" : "hidden"}`}>
            Admin
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded hover:bg-slate-100"
          >
            <Menu size={22} />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="space-y-2">

          <SidebarLink
            href="/admin"
            label="Dashboard"
            icon={<Home size={20} />}
            open={sidebarOpen}
          />

          <SidebarLink
            href="/admin/track"
            label="Track Consignment"
            icon={<Search size={20} />}
            open={sidebarOpen}
          />

          <SidebarLink
            href="/admin/pincode"
            label="Pincode Serviceability"
            icon={<MapPin size={20} />}
            open={sidebarOpen}
          />

          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-100 w-full text-left"
          >
            <LogOut size={20} className="text-red-600" />
            {sidebarOpen && <span className="text-red-600">Logout</span>}
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  open,
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  open: boolean;
  onClick?: (e?: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-100"
    >
      <div className="text-slate-600">{icon}</div>
      {open && <span>{label}</span>}
    </Link>
  );
}
