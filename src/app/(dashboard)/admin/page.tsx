import { requireInternal } from "@/lib/admin-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatCurrency, formatDateTime } from "@/lib/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, FileText, DollarSign, ArrowRight } from "lucide-react";
import { ROLE_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from "@/lib/constants";
import Link from "next/link";

export default async function AdminDashboardPage() {
  // Steve 6/11 (6-2.md #54): used to call requireAdmin() which
  // bounced marketing/sales/support to /dashboard. Their sidebar
  // points at "Admin Dashboard" though, so they were landing on the
  // customer dashboard and seeing Available Services 18 — Alex's
  // "no trae las metricas" complaint. Read-only KPIs are fine for
  // every internal role; mutation endpoints still gate on admin.
  await requireInternal();

  // Steve 6/11 (6-2.md #54): every count/list on this page was
  // running under the admin's cookie-context client. Same RLS quirk
  // that broke every other admin surface this week (Total Users
  // showed 1, Total Leads showed 0, Revenue showed only the admin's
  // own payments, etc.). Switched the lot to supabaseAdmin so the
  // dashboard reflects the real platform totals. requireAdmin()
  // still runs first so non-admins get bounced.
  const [
    { count: totalUsers },
    { count: totalProperties },
    { count: totalLeads },
    { data: revenueData },
    { data: usersByRole },
    { data: leadsByStatus },
    { data: recentLeads },
    { data: recentUsers },
    { data: recentPayments },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("properties").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("leads").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("status", "completed"),
    supabaseAdmin.rpc("count_by_role") as unknown as Promise<{ data: { role: string; count: number }[] | null }>,
    supabaseAdmin.rpc("count_by_lead_status") as unknown as Promise<{ data: { status: string; count: number }[] | null }>,
    supabaseAdmin
      .from("leads")
      .select("id, full_name, email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("payments")
      .select("id, amount, status, created_at, profiles:user_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const totalRevenue = revenueData?.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  ) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your platform metrics
        </p>
      </div>

      {/* KPI Cards — clickable, drill into the corresponding section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/users" className="block">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold">{totalUsers || 0}</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {usersByRole && usersByRole.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {usersByRole.map((r) => (
                    <Badge key={r.role} variant="outline" className="text-xs">
                      {ROLE_LABELS[r.role] || r.role}: {r.count}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/properties" className="block">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Properties</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold">{totalProperties || 0}</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/leads" className="block">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold">{totalLeads || 0}</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {leadsByStatus && leadsByStatus.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {leadsByStatus.map((l) => {
                    const colors = LEAD_STATUS_COLORS[l.status];
                    return (
                      <Badge
                        key={l.status}
                        variant="outline"
                        className={`text-xs ${colors?.bg || ""} ${colors?.text || ""}`}
                      >
                        {LEAD_STATUS_LABELS[l.status] || l.status}: {l.count}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/payments" className="block">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Leads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Leads</CardTitle>
            <CardDescription>Latest lead submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {!recentLeads || recentLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads yet</p>
            ) : (
              <div className="space-y-3">
                {recentLeads.map((lead) => {
                  const colors = LEAD_STATUS_COLORS[lead.status];
                  return (
                    <div key={lead.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{lead.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${colors?.bg || ""} ${colors?.text || ""}`}
                      >
                        {LEAD_STATUS_LABELS[lead.status] || lead.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Registrations</CardTitle>
            <CardDescription>Newest users</CardDescription>
          </CardHeader>
          <CardContent>
            {!recentUsers || recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet</p>
            ) : (
              <div className="space-y-3">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Payments</CardTitle>
            <CardDescription>Latest transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {!recentPayments || recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet</p>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(p.profiles as unknown as { full_name: string } | null)?.full_name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(p.created_at)}
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0">
                      {formatCurrency(Number(p.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
