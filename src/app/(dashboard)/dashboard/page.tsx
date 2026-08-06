import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, FileText, Heart, Crown, CheckCircle2, CreditCard, TrendingUp, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ROLE_LABELS, OWNER_TIERS, PYMES_PLANS } from "@/lib/constants";
import { formatCurrency } from "@/lib/admin";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const isOwnerRole =
    profile.role === "propietario" ||
    profile.role === "propietario_preferido" ||
    profile.role === "inversionista";

  const isTenantRole =
    profile.role === "inquilino" || profile.role === "inquilino_premium";

  const isPymesRole = profile.role === "pymes";

  // Fetch stats based on role
  let propertyCount = 0;
  let serviceCount = 0;
  let ownerTier: string | null = null;
  let pymesPlan: string | null = null;
  let totalCFP = 0;
  let leadCount = 0;
  let matchedCount = 0;
  let pymesScore: number | null = null;
  let pymesUrgency: string | null = null;
  let pymesLoss: number | null = null;

  const isInvestor = profile.role === "inversionista";
  // Steve 4/20: respect user's initial user_type selection
  // propietario* = Property Owner (stays Basic/Preferred even with 4+ properties)
  // inversionista = Investor (always Elite with portfolio breakdown)
  const isOwnerNotInvestor =
    profile.role === "propietario" || profile.role === "propietario_preferido";

  if (isOwnerRole) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, cfp_monthly")
      .eq("owner_id", user.id);
    propertyCount = props?.length || 0;
    totalCFP = props?.reduce((sum, p) => sum + (Number(p.cfp_monthly) || 0), 0) || 0;

    // Steve #8 + 4/20: investors always Elite; Property Owners stay at Basic/Preferred
    // regardless of property count (never auto-promote to Elite).
    if (isInvestor) {
      ownerTier = "elite";
    } else if (isOwnerNotInvestor) {
      // Explicit Property Owner — cap at preferred_owners
      ownerTier = propertyCount >= 2 ? "preferred_owners" : "basic";
    } else if (propertyCount >= 4) {
      // Only fallback for users with no role set yet
      ownerTier = "elite";
    } else if (propertyCount >= 2) {
      ownerTier = "preferred_owners";
    } else if (propertyCount >= 1) {
      ownerTier = "basic";
    }
  }

  if (isTenantRole) {
    // Steve #2-1: use same matching logic as Services page so counts match
    const { matchPropertiesForTenant } = await import("@/lib/profiling");
    const matches = await matchPropertiesForTenant(user.id);
    matchedCount = matches.length;
  }

  if (isPymesRole) {
    const { data: diagnosis } = await supabase
      .from("pymes_diagnosis")
      .select("recommended_plan, total_score, urgency_level, estimated_loss")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    pymesPlan = diagnosis?.recommended_plan || null;
    pymesScore = diagnosis?.total_score ?? null;
    pymesUrgency = diagnosis?.urgency_level ?? null;
    pymesLoss = diagnosis?.estimated_loss ? Number(diagnosis.estimated_loss) : null;
  }

  // Lead count (if user is an owner/pymes)
  const { count: lCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  leadCount = lCount || 0;

  const { count: svcCount } = await supabase
    .from("services")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);
  serviceCount = svcCount || 0;

  // Resolve plan details for display
  const ownerPlan = ownerTier ? OWNER_TIERS[ownerTier] : null;
  const pymesPlanDetails = pymesPlan ? PYMES_PLANS[pymesPlan] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">
          Welcome, {profile.full_name}
        </h1>
        <p className="text-muted-foreground">
          {ROLE_LABELS[profile.role] || profile.role} Dashboard
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isOwnerRole && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">My Properties</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{propertyCount}</div>
                <p className="text-xs text-muted-foreground">Registered properties</p>
              </CardContent>
            </Card>
            {totalCFP > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total CFP</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalCFP)}</div>
                  <p className="text-xs text-muted-foreground">Monthly cash flow preserved</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {isTenantRole && (
          <>
            <Link href="/dashboard/services#matched-properties">
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Matched Properties</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{matchedCount}</div>
                  <p className="text-xs text-muted-foreground">Click to view matched properties</p>
                </CardContent>
              </Card>
            </Link>
          </>
        )}

        {isPymesRole && pymesScore !== null && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Diagnosis Score</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pymesScore}/35</div>
                <p className="text-xs text-muted-foreground capitalize">
                  Urgency: {pymesUrgency || "N/A"}
                </p>
              </CardContent>
            </Card>
            {pymesLoss !== null && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Estimated Loss</CardTitle>
                  <TrendingUp className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(pymesLoss)}</div>
                  <p className="text-xs text-muted-foreground">Monthly revenue at risk</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available Services</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{serviceCount}</div>
            <p className="text-xs text-muted-foreground">Active services</p>
          </CardContent>
        </Card>

        {leadCount > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leadCount}</div>
              <p className="text-xs text-muted-foreground">Your lead requests</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══ Assigned Plan / Tier ═══ */}
      {ownerPlan && (
        <Card className={`${ownerPlan.borderColor} ${ownerPlan.bgColor}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className={`h-5 w-5 ${ownerPlan.color}`} />
              <CardTitle className="text-lg">Your Service Tier</CardTitle>
            </div>
            <CardDescription>{ownerPlan.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge className={`${ownerPlan.bgColor} ${ownerPlan.color} border ${ownerPlan.borderColor} text-sm px-3 py-1`}>
                {ownerPlan.name}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Based on {propertyCount} {propertyCount === 1 ? "property" : "properties"}
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Recommendations</p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${ownerPlan.color}`} />
                  Professional photography for your listing
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${ownerPlan.color}`} />
                  Listing optimization checklist
                </li>
              </ul>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                See your full plan details and features in the{" "}
                <Link href="/dashboard/services" className="text-primary underline">Services</Link> section.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {pymesPlanDetails && (
        <Card className={`${pymesPlanDetails.borderColor} ${pymesPlanDetails.bgColor}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className={`h-5 w-5 ${pymesPlanDetails.color}`} />
              <CardTitle className="text-lg">Your Recommended Plan</CardTitle>
            </div>
            <CardDescription>{pymesPlanDetails.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <span className={`text-3xl font-bold ${pymesPlanDetails.color}`}>
                {pymesPlanDetails.price}
              </span>
              <p className="text-xs text-muted-foreground">
                {pymesPlanDetails.upfront} + {pymesPlanDetails.installment}
              </p>
              <p className="text-xs text-muted-foreground">{pymesPlanDetails.duration}</p>
            </div>
            <ul className="space-y-1.5">
              {pymesPlanDetails.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${pymesPlanDetails.color}`} />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 pt-3 sm:flex-row">
              <Link
                href="/dashboard/services#contact"
                className={buttonVariants({ className: "flex-1" })}
              >
                Start Now
              </Link>
              <Link
                href="/dashboard/services"
                className={buttonVariants({ variant: "outline", className: "flex-1" })}
              >
                View Plan Details
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {isTenantRole && (
        <Card className={profile.is_premium_tenant ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className={`h-5 w-5 ${profile.is_premium_tenant ? "text-amber-600" : "text-blue-600"}`} />
              <CardTitle className="text-lg">Your Tenant Status</CardTitle>
            </div>
            <CardDescription>
              {profile.is_premium_tenant
                ? "You qualify as a Premium Tenant with priority matching"
                : "Complete your profile to unlock Premium Tenant benefits"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge className={profile.is_premium_tenant
              ? "bg-amber-50 text-amber-600 border border-amber-200 text-sm px-3 py-1"
              : "bg-blue-50 text-blue-600 border border-blue-200 text-sm px-3 py-1"
            }>
              {profile.is_premium_tenant ? "Premium Tenant" : "Standard Tenant"}
            </Badge>
            {profile.is_premium_tenant && profile.premium_criteria_met && (
              <p className="mt-2 text-sm text-muted-foreground">
                {profile.premium_criteria_met} of 8 premium criteria met
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* No plan assigned yet — prompt to complete form */}
      {isOwnerRole && !ownerPlan && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Crown className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No service tier assigned yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete your Discovery Brief to get your service tier.
            </p>
            <Link href="/forms/propietario" className={buttonVariants({ className: "mt-4" })}>
              Complete Discovery Brief
            </Link>
          </CardContent>
        </Card>
      )}

      {isPymesRole && !pymesPlanDetails && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Crown className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No plan assigned yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Take the Sales Leak Diagnosis to get your recommended plan.
            </p>
            <Link href="/forms/pymes" className={buttonVariants({ className: "mt-4" })}>
              Start Diagnosis
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Access key features directly
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {isOwnerRole && (
            <Link href="/forms/propietario" className={buttonVariants()}>
              Discovery Brief
            </Link>
          )}
          {isTenantRole && (
            <Link href="/forms/inquilino" className={buttonVariants()}>
              Update Preferences
            </Link>
          )}
          {isPymesRole && (
            <Link href="/forms/pymes" className={buttonVariants()}>
              Sales Leak Calculator
            </Link>
          )}
          <Link href="/dashboard/services" className={buttonVariants({ variant: "outline" })}>
            View Services
          </Link>
          <Link href="/dashboard/profile" className={buttonVariants({ variant: "outline" })}>
            My Profile
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
