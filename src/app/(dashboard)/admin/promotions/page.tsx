import { PromotionsManager } from "@/components/admin/promotions-manager";

// FIX_PROMOTIONS_REPORT.md: promo codes page for admin, marketing and
// sales (the API enforces who can do what; delete is admin only).
export default function AdminPromotionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Promotions</h1>
        <p className="text-muted-foreground">
          Promo codes customers can use at checkout
        </p>
      </div>
      <PromotionsManager />
    </div>
  );
}
