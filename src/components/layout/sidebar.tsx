"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import {
  LayoutDashboard,
  Building2,
  Heart,
  CreditCard,
  User,
  Users,
  FileText,
  Settings,
  ImageIcon,
  ClipboardList,
  Link2,
  DollarSign,
  PenSquare,
  Scale,
  Download,
  LogOut,
  Crown,
  Newspaper,
  Sliders,
  Image as ImageIcon2,
  ArrowRightLeft,
  BarChart3,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  separator?: boolean;
}

const ALL_ROLES: UserRole[] = [
  "propietario",
  "propietario_preferido",
  "inversionista",
  "inquilino",
  "inquilino_premium",
  "pymes",
];

const OWNER_ROLES: UserRole[] = [
  "propietario",
  "propietario_preferido",
  "inversionista",
];

const NAV_ITEMS: NavItem[] = [
  // ── User routes ──
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
  },
  {
    label: "My Properties",
    href: "/dashboard/properties",
    icon: Building2,
    roles: OWNER_ROLES,
  },
  {
    label: "Image Gallery",
    href: "/dashboard/images",
    icon: ImageIcon,
    roles: OWNER_ROLES,
  },
  {
    label: "Recommended Services",
    href: "/dashboard/services",
    icon: Heart,
    roles: ALL_ROLES,
  },
  {
    label: "Payment History",
    href: "/dashboard/payments",
    icon: CreditCard,
    roles: [...OWNER_ROLES, "pymes" as UserRole],
  },
  {
    label: "My Profile",
    href: "/dashboard/profile",
    icon: User,
    roles: ALL_ROLES,
  },
  // ── Admin routes ──
  {
    label: "Admin Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    roles: ["admin"],
    separator: true,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: FileText,
    roles: ["admin"],
  },
  {
    label: "Properties",
    href: "/admin/properties",
    icon: Building2,
    roles: ["admin"],
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: CreditCard,
    roles: ["admin"],
  },
  {
    label: "Sales Report",
    href: "/admin/reports",
    icon: BarChart3,
    roles: ["admin"],
  },
  {
    label: "Services",
    href: "/admin/services",
    icon: Settings,
    roles: ["admin"],
  },
  {
    label: "Plan Checklists",
    href: "/admin/plans",
    icon: Crown,
    roles: ["admin"],
  },
  {
    label: "Reassign Services",
    href: "/admin/reassign",
    icon: ArrowRightLeft,
    roles: ["admin"],
  },
  {
    label: "Forms",
    href: "/admin/forms",
    icon: ClipboardList,
    roles: ["admin"],
  },
  {
    label: "Matching",
    href: "/admin/matching",
    icon: Link2,
    roles: ["admin"],
  },
  {
    label: "Pricing",
    href: "/admin/pricing",
    icon: DollarSign,
    roles: ["admin"],
  },
  {
    label: "Content",
    href: "/admin/content",
    icon: PenSquare,
    roles: ["admin"],
  },
  {
    label: "Articles",
    href: "/admin/articles",
    icon: Newspaper,
    roles: ["admin"],
  },
  {
    label: "Image Library",
    href: "/admin/images",
    icon: ImageIcon2,
    roles: ["admin"],
  },
  {
    label: "Internal Team",
    href: "/admin/team",
    icon: Sliders,
    roles: ["admin"],
  },
  {
    label: "Legal",
    href: "/admin/legal",
    icon: Scale,
    roles: ["admin"],
  },
  {
    label: "Export",
    href: "/admin/export",
    icon: Download,
    roles: ["admin"],
  },
];

function SidebarFooter({
  userName,
  role,
}: {
  userName?: string;
  role: UserRole;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!userName) return null;
  return (
    <div className="border-t p-4 mt-auto">
      <div className="mb-2">
        <p className="text-sm font-medium truncate">{userName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {ROLE_LABELS[role] || role}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSignOut}
        className="w-full gap-2"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign Out
      </Button>
    </div>
  );
}

/** Shared navigation links used by both desktop sidebar and mobile drawer */
export function SidebarNav({
  role,
  userName,
  onNavigate,
}: {
  role: UserRole;
  userName?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const filteredItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              item.href !== "/admin" &&
              pathname.startsWith(item.href));
          return (
            <div key={item.href}>
              {item.separator && (
                <div className="my-2 border-t pt-2">
                  <span className="px-3 text-xs font-semibold uppercase text-muted-foreground">
                    Admin
                  </span>
                </div>
              )}
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
      <SidebarFooter userName={userName} role={role} />
    </div>
  );
}

/** Desktop sidebar — hidden on mobile */
export function Sidebar({
  role,
  userName,
}: {
  role: UserRole;
  userName?: string;
}) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-muted/30 overflow-y-auto md:flex md:flex-col">
      <SidebarNav role={role} userName={userName} />
    </aside>
  );
}
