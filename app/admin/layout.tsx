"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import {
  Menu,
  ChevronDown,
  ChevronRight,
  Home,
  Search,
  MapPin,
  Package,
  Layers,
  FileText,
  Truck,
  LogOut,
} from "lucide-react";

/* ============================================
   SHADCN MODERN SIDEBAR — VERSION 2 (Hydration Safe)
   ============================================ */

const SIDEBAR_WIDE = "w-60";    // 240px
const SIDEBAR_NARROW = "w-18";  // 72px
const MAIN_WIDE = "ml-60";
const MAIN_NARROW = "ml-18";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);

  const sidebarOpen = hovering || !collapsed;

  const [dtdcOpen, setDtdcOpen] = useState(true);
  const [delhiveryOpen, setDelhiveryOpen] = useState(false);
  const [xpressOpen, setXpressOpen] = useState(false);

  async function logout() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    await signOut({ redirect: true, callbackUrl: "/login" });
  }

  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* ===========================
          FIXED SIDEBAR (NO INLINE STYLES)
      ============================ */}
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`
          h-screen fixed left-0 top-0 z-40 
          bg-white border-r border-slate-200 shadow-sm
          transition-all duration-300 flex flex-col
          ${sidebarOpen ? SIDEBAR_WIDE : SIDEBAR_NARROW}
        `}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b">
          {sidebarOpen && <span className="text-lg font-semibold tracking-tight">Admin</span>}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded hover:bg-slate-100"
          >
            <Menu size={21} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-6">

          {/* ======= DTDC Section ======= */}
          <SidebarSection
            title="DTDC"
            open={dtdcOpen}
            toggle={() => setDtdcOpen(!dtdcOpen)}
            icon={<Package size={18} className="text-blue-600" />}
            sidebarOpen={sidebarOpen}
          >
            <SidebarLink href="/admin" label="Dashboard" icon={<Home size={17} />} active={pathname === "/admin"} />
            <SidebarLink href="/admin/track" label="Track Consignment" icon={<Search size={17} />} active={pathname.startsWith("/admin/track")} />
            <SidebarLink href="/admin/pincode" label="Pincode Serviceability" icon={<MapPin size={17} />} active={pathname.startsWith("/admin/pincode")} />
            <SidebarLink href="/admin/label" label="Generate Label" icon={<FileText size={17} />} />
            <SidebarLink href="/admin/dtdc/bulk-booking" label="Bulk Order Booking" icon={<Layers size={17} />} />
            <SidebarLink href="/admin/dtdc/single-booking" label="Book New Consignment" icon={<Package size={17} />} />
          </SidebarSection>

          {/* ======= Delhivery Section ======= */}
          <SidebarSection
            title="Delhivery"
            open={delhiveryOpen}
            toggle={() => setDelhiveryOpen(!delhiveryOpen)}
            icon={<Truck size={18} className="text-orange-500" />}
            sidebarOpen={sidebarOpen}
          >
            <SidebarLink href="#" label="Dashboard" icon={<Home size={17} />} />
            <SidebarLink href="#" label="Track Consignment" icon={<Search size={17} />} />
          </SidebarSection>

          {/* ======= XpressBees Section ======= */}
          <SidebarSection
            title="XpressBees"
            open={xpressOpen}
            toggle={() => setXpressOpen(!xpressOpen)}
            icon={<Truck size={18} className="text-yellow-500" />}
            sidebarOpen={sidebarOpen}
          >
            <SidebarLink href="#" label="Dashboard" icon={<Home size={17} />} />
            <SidebarLink href="#" label="Track Consignment" icon={<Search size={17} />} />
          </SidebarSection>

        </nav>

        {/* Logout */}
        <div className="border-t px-4 py-4 mt-auto">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ===========================
          MAIN CONTENT (Tailwind margin — NOT inline)
      ============================ */}
      <main
        className={`flex-1 transition-all duration-300 p-6 ${sidebarOpen ? MAIN_WIDE : MAIN_NARROW}`}
      >
        {children}
      </main>

    </div>
  );
}

/* ---------------------------------------------
   REUSABLE COMPONENTS
--------------------------------------------- */

function SidebarSection({
  title,
  open,
  toggle,
  icon,
  sidebarOpen,
  children,
}: any) {
  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full px-3 py-2 rounded hover:bg-slate-100"
      >
        <div className="flex items-center gap-3">
          {icon}
          {sidebarOpen && <span className="font-medium">{title}</span>}
        </div>

        {sidebarOpen &&
          (open ? <ChevronDown size={17} /> : <ChevronRight size={17} />)}
      </button>

      {open && sidebarOpen && (
        <div className="mt-1 space-y-1 ml-3 border-l pl-4">{children}</div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 px-3 py-2 rounded transition
        ${active ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-700 hover:bg-slate-100"}
      `}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
