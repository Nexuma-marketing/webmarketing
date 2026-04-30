import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { buildBranding } from "@/lib/branding";
import {
  Building2,
  Users,
  BarChart3,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Star,
  Shield,
  Zap,
  TrendingUp,
} from "lucide-react";

interface Testimonial {
  name: string;
  role: string;
  text: string;
  img: string;
}

interface FaqItem {
  q: string;
  a: string;
}

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    name: "Sarah Mitchell",
    role: "Property Owner",
    text: "Thanks to WebMarketing, I rented my apartment in record time. The professional photos and digital strategy made all the difference.",
    img: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face",
  },
  {
    name: "Caroline Tremblay",
    role: "Business Owner",
    text: "The Sales Leak Calculator was eye-opening. Now I have a clear digital strategy and my sales have increased significantly.",
    img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face",
  },
  {
    name: "Anna Chen",
    role: "Tenant",
    text: "I found my ideal home in less than a week. The preference profile connected me with exactly what I was looking for.",
    img: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face",
  },
];

const DEFAULT_FAQS: FaqItem[] = [
  {
    q: "Do I have to pay to register?",
    a: "Initial registration is free. Some premium or specialized services have a cost, which is always disclosed before any payment.",
  },
  {
    q: "How is the communication — will I talk to a bot or a junior executive?",
    a: "Closeness is our core value. You'll have a direct channel with the person responsible for your strategy. We believe in total transparency: you'll know what we're working on each week through clear reports.",
  },
  {
    q: "What is the differential value of this platform?",
    a: "For property owners, as our motto says \"your property, your money\": you pay us only once, and once tenants move in, the tenant pays you directly — no intermediaries, no rent increases to cover third-party costs and profits.\n\nFor tenants, you not only pay less rent than with real-estate agencies or sub-leasing third parties, but we are also the only ones who show you properties that truly match your preferences.\n\nFor businesses, we target small and medium companies with prices within their reach. We know marketing agencies only care about clients with big budgets — we are truly your allies and we care about your business actually growing.",
  },
  {
    q: "How do you balance marketing for B2B and B2C audiences?",
    a: "We understand that even if channels change, we are always dealing with people. That's why all our marketing is personalized and handled by an advisor — we prioritize emotional connection and passion for the product. Our methodology unites both worlds through \"Human Service\": marketing designed by people for people.",
  },
  {
    q: "What happens if my needs change mid-project?",
    a: "Flexibility is one of our greatest strengths. As an agile and human organization, we can pivot and adjust strategies without the bureaucratic delays of traditional agencies.",
  },
  {
    q: "How do you ensure marketing attracts the ideal tenant and not just curious visitors?",
    a: "Our approach isn't limited to \"filling the space\" — it's about protecting your investment. We use a segmented marketing strategy that combines profiling formats with specific qualification filters and tenant credit screening services.",
  },
  {
    q: "How do I know my information is secure?",
    a: "We use secure connections and strong data-protection practices. Your information is used only to manage your request and deliver the service.",
  },
];

// Build admin-editable testimonials and FAQ from site_content rows.
// Steve 4/28 round 2: testimonials/FAQ were hardcoded — admin edits in
// /admin/content did nothing on the public homepage.
function buildTestimonials(rows: { key: string; value: string }[]): Testimonial[] {
  // Pair keys testimonial_<n>_author / _role / _text / _img
  const byIdx: Record<string, Partial<Testimonial>> = {};
  for (const r of rows) {
    const m = r.key.match(/^testimonial_(\d+)_(author|role|text|img)$/);
    if (!m) continue;
    const idx = m[1];
    if (!byIdx[idx]) byIdx[idx] = {};
    if (m[2] === "author") byIdx[idx].name = r.value;
    if (m[2] === "role") byIdx[idx].role = r.value;
    if (m[2] === "text") byIdx[idx].text = r.value;
    if (m[2] === "img") byIdx[idx].img = r.value;
  }
  const list = Object.keys(byIdx)
    .sort((a, b) => Number(a) - Number(b))
    .map((idx) => byIdx[idx])
    .filter((t) => t.name && t.text)
    .map((t) => ({
      name: t.name!,
      role: t.role || "",
      text: t.text!,
      img:
        t.img ||
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face",
    }));
  return list.length > 0 ? list : DEFAULT_TESTIMONIALS;
}

function buildFaqs(rows: { key: string; value: string }[]): FaqItem[] {
  const byIdx: Record<string, Partial<FaqItem>> = {};
  for (const r of rows) {
    const m = r.key.match(/^faq_(\d+)_(question|answer)$/);
    if (!m) continue;
    const idx = m[1];
    if (!byIdx[idx]) byIdx[idx] = {};
    if (m[2] === "question") byIdx[idx].q = r.value;
    if (m[2] === "answer") byIdx[idx].a = r.value;
  }
  const list = Object.keys(byIdx)
    .sort((a, b) => Number(a) - Number(b))
    .map((idx) => byIdx[idx])
    .filter((f) => f.q && f.a)
    .map((f) => ({ q: f.q!, a: f.a! }));
  return list.length > 0 ? list : DEFAULT_FAQS;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const params = await searchParams;
  const contactStatus = params.contact;

  const supabase = await createClient();
  const { data: contentRows } = await supabase
    .from("site_content")
    .select("section, key, value")
    .in("section", ["testimonials", "faq", "branding"]);

  const testimonialRows = (contentRows || []).filter((r) => r.section === "testimonials");
  const faqRows = (contentRows || []).filter((r) => r.section === "faq");
  const brandRows = (contentRows || []).filter((r) => r.section === "branding");
  const testimonials = buildTestimonials(testimonialRows);
  const faqs = buildFaqs(faqRows);
  const branding = buildBranding(brandRows);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="fixed top-0 z-50 w-full border-b border-primary/10 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              {branding.name}
            </span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="#how-it-works"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              How it Works
            </Link>
            <Link
              href="#services"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              Services
            </Link>
            <Link
              href="#about"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              About Us
            </Link>
            <Link
              href="#faq"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              FAQ
            </Link>
            <Link
              href="#contact"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign In
            </Link>
            <Link href="/register" className={buttonVariants({ size: "sm" })}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-12 pt-28 sm:pt-32 md:pb-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-20 -left-40 h-[400px] w-[400px] rounded-full bg-accent/8 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Complete Marketing Platform
            </div>

            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Grow Your{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Property
              </span>{" "}
              &{" "}
              <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                Business
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              We connect property owners, investors, tenants, and businesses
              with tailored marketing strategies. Diagnose, recommend, and
              transform your results.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/forms/propietario"
                className={buttonVariants({
                  size: "lg",
                  className: "gap-2 px-8 shadow-lg shadow-primary/25",
                })}
              >
                <Building2 className="h-4 w-4" />
                Property Owners
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/forms/pymes"
                className={buttonVariants({
                  size: "lg",
                  className:
                    "gap-2 px-8 bg-accent text-accent-foreground shadow-lg shadow-accent/25 hover:bg-accent/90",
                })}
              >
                <BarChart3 className="h-4 w-4" />
                Business Owners
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                Free registration
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                Personalized diagnosis
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                Results in minutes
              </span>
            </div>
          </div>

          {/* Right: Hero image */}
          <div className="relative mx-auto w-full max-w-md md:max-w-none">
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-2xl shadow-primary/10">
              <Image
                src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=1000&fit=crop&crop=center"
                alt="Modern luxury property in British Columbia"
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-transparent to-transparent" />
            </div>
            <div className="absolute -bottom-4 -left-4 rounded-2xl border border-primary/10 bg-card/95 p-4 shadow-xl backdrop-blur-sm sm:-left-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold">100+ Properties</p>
                  <p className="text-xs text-muted-foreground">
                    Managed this year
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute -right-2 top-8 rounded-2xl border border-primary/10 bg-card/95 p-4 shadow-xl backdrop-blur-sm sm:-right-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Star className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">4.9 / 5.0</p>
                  <p className="text-xs text-muted-foreground">Satisfaction</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services strip */}
      <section className="border-y border-primary/5 bg-secondary/30 px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-12">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Our Services
          </span>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-muted-foreground/70 sm:gap-10">
            <span>Photography</span>
            <span className="text-primary/30">|</span>
            <span>Virtual Tours</span>
            <span className="text-primary/30">|</span>
            <span>SEO</span>
            <span className="text-primary/30">|</span>
            <span>Social Media</span>
            <span className="text-primary/30">|</span>
            <span>Branding</span>
            <span className="text-primary/30">|</span>
            <span>Google Ads</span>
          </div>
        </div>
      </section>

      {/* How it Works (PDF 2.1) */}
      <section id="how-it-works" className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              How it Works
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple Steps to Get Started
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* PYMES flow */}
            <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-6">
              <h3 className="mb-4 text-lg font-semibold text-accent">
                For Businesses (SMBs)
              </h3>
              <div className="space-y-4">
                {[
                  { step: "1", text: "Take your free diagnosis" },
                  { step: "2", text: "Get your personalized session (free)" },
                  { step: "3", text: "We quote and propose your best course of action" },
                  { step: "4", text: "Let's go for that goal" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                      {item.step}
                    </div>
                    <p className="text-sm text-muted-foreground pt-0.5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Owners flow (1-3 properties) */}
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-6">
              <h3 className="mb-4 text-lg font-semibold text-primary">
                For Property Owners (1-3 properties)
              </h3>
              <div className="space-y-4">
                {[
                  { step: "1", text: "List your property" },
                  { step: "2", text: "Receive interested tenants" },
                  { step: "3", text: "Choose and secure your rental" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {item.step}
                    </div>
                    <p className="text-sm text-muted-foreground pt-0.5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Investors flow (4+ properties) */}
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-6">
              <h3 className="mb-4 text-lg font-semibold text-primary">
                For Investors (4+ properties)
              </h3>
              <div className="space-y-4">
                {[
                  { step: "1", text: "Fill in your investment profile" },
                  { step: "2", text: "Access your personalized investment portfolio" },
                  { step: "3", text: "We publish your assets" },
                  { step: "4", text: "Monetize your investment" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {item.step}
                    </div>
                    <p className="text-sm text-muted-foreground pt-0.5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tenants flow */}
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-6">
              <h3 className="mb-4 text-lg font-semibold text-primary">
                For Tenants
              </h3>
              <div className="space-y-4">
                {[
                  { step: "1", text: "Tell us your preferences" },
                  { step: "2", text: "Receive properties matching your preferences" },
                  { step: "3", text: "Choose and secure your new home" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {item.step}
                    </div>
                    <p className="text-sm text-muted-foreground pt-0.5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-lg font-medium text-muted-foreground">
              Marketing that maximizes your profitability &mdash;{" "}
              <span className="font-semibold text-primary">Your property, your money</span>
            </p>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="relative px-4 py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-primary/3 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              Our Services
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Solutions for Every Need
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Whether you are a property owner, tenant, or business, we have the
              right tools and services for you.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Property Owners */}
            <div className="group relative overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
              <div className="relative h-48 overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&h=400&fit=crop&crop=center"
                  alt="Modern property exterior"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 shadow-sm">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="mb-2 text-xl font-semibold">
                  Property Owners & Investors
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  Register your properties, get tailored marketing
                  recommendations, and maximize your real estate investment.
                </p>
                <ul className="space-y-2">
                  {[
                    "Room-by-room photo gallery",
                    "Personalized property marketing",
                    "Profiled tenant matching",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/forms/propietario"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Start Discovery Brief
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Tenants */}
            <div className="group relative overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
              <div className="relative h-48 overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop&crop=center"
                  alt="Cozy apartment living room"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 shadow-sm">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="mb-2 text-xl font-semibold">Tenants</h3>
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  Complete your preference profile and we will connect you with
                  the best housing options in British Columbia.
                </p>
                <ul className="space-y-2">
                  {[
                    "Detailed preference profile",
                    "Smart personalized search",
                    "Premium tenant matching",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Find your home
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* PYMES */}
            <div className="group relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/[0.03] to-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/10">
              <div className="absolute right-4 top-4 z-10">
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground shadow-sm">
                  Popular
                </span>
              </div>
              <div className="relative h-48 overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&h=400&fit=crop&crop=center"
                  alt="Business team collaboration"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 shadow-sm">
                    <BarChart3 className="h-5 w-5 text-accent" />
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="mb-2 text-xl font-semibold">
                  Businesses (SMBs)
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  Discover how much revenue your business is leaking and get a
                  tailored marketing plan to fix it.
                </p>
                <ul className="space-y-2">
                  {[
                    "Sales Leak Calculator",
                    "Digital marketing strategies",
                    "3 action plans (Rescue / Growth / Scale)",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/forms/pymes"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
                >
                  Calculate your sales leak
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Us / Mission (PDF 2.2) */}
      <section id="about" className="px-4 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl shadow-primary/10">
              <Image
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&h=600&fit=crop&crop=face"
                alt="Professional business consultant"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="absolute -bottom-6 -right-4 rounded-2xl border border-primary/10 bg-card p-5 shadow-xl sm:-right-8">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
                  <TrendingUp className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">95%</p>
                  <p className="text-xs text-muted-foreground">
                    Client satisfaction
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              Why These Partners
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Our Mission
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground italic">
              &ldquo;Building our dreams together, being passionate about our
              clients&rsquo; projects through a human and close service.&rdquo;
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Every client is unique. That is why our system analyses your
              current situation and creates a personalized marketing plan that
              delivers real results.
            </p>
            <div className="mt-8 space-y-4">
              {[
                {
                  title: "Smart Diagnosis",
                  desc: "We evaluate your digital presence and urgency level.",
                },
                {
                  title: "Personalized Recommendations",
                  desc: "Services selected based on your real needs.",
                },
                {
                  title: "Measurable Results",
                  desc: "Transparent tracking of the impact on your business.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-4">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section
        id="benefits"
        className="border-y border-primary/10 bg-gradient-to-b from-secondary/50 to-background px-4 py-24"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              Why Choose Us
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything You Need in One Place
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Zap,
                title: "Fast & Efficient",
                desc: "Diagnosis and recommendations in minutes, not weeks.",
              },
              {
                icon: TrendingUp,
                title: "Personalized",
                desc: "Every recommendation is unique, based on your real situation.",
              },
              {
                icon: Shield,
                title: "Reliable",
                desc: "Secure data and verified services for your peace of mind.",
              },
              {
                icon: Star,
                title: "Real Results",
                desc: "Proven strategies that generate tangible growth.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="group rounded-2xl border border-transparent bg-card p-6 text-center transition-all duration-300 hover:border-primary/10 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h4 className="mb-2 font-semibold">{item.title}</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              Testimonials
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              What Our Clients Say
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.name}
                className="rounded-2xl border border-primary/10 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-md"
              >
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-primary/80 text-primary/80"
                    />
                  ))}
                </div>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-full">
                    <Image
                      src={testimonial.img}
                      alt={testimonial.name}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl shadow-xl shadow-primary/20">
            <div className="absolute inset-0">
              <Image
                src="https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&h=600&fit=crop&crop=center"
                alt="Beautiful modern interior"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 900px"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-accent/85" />
            </div>
            <div className="relative px-8 py-16 text-center text-primary-foreground sm:px-16">
              <h2 className="text-3xl font-bold sm:text-4xl">
                Start Your Transformation Today
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
                Sign up for free and discover how we can help you achieve your
                marketing goals.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/register"
                  className={buttonVariants({
                    size: "lg",
                    variant: "secondary",
                    className: "gap-2 px-8 font-semibold shadow-lg",
                  })}
                >
                  Create Free Account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Steve 4/21 #1: FAQ Section */}
      <section id="faq" className="px-4 py-24 bg-muted/30">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              FAQ
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-muted-foreground">
              Answers to the most common questions about our services.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((item, i) => (
              <details
                key={i}
                className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <summary className="flex cursor-pointer items-start justify-between gap-4 text-base font-medium">
                  <span>{item.q}</span>
                  <span className="mt-1 shrink-0 text-primary transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form (PDF 2.3) */}
      <section id="contact" className="px-4 py-24">
        <div className="mx-auto max-w-xl">
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-sm font-medium uppercase tracking-widest text-primary">
              Get in Touch
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Contact Us
            </h2>
            <p className="mt-4 text-muted-foreground">
              Have a question? Send us a message and our team will get back to
              you shortly.
            </p>
          </div>

          {contactStatus === "success" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
              <p className="font-medium text-green-800">Message sent successfully!</p>
              <p className="mt-1 text-sm text-green-600">
                Our team will get back to you within 24 hours.
              </p>
            </div>
          )}
          {contactStatus === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="font-medium text-red-800">Something went wrong</p>
              <p className="mt-1 text-sm text-red-600">
                Please try again or email us directly.
              </p>
            </div>
          )}

          <form
            action="/api/contact"
            method="POST"
            className="space-y-4 rounded-2xl border border-primary/10 bg-card p-8 shadow-sm"
          >
            <div className="space-y-2">
              <label htmlFor="contact_name" className="text-sm font-medium">
                Full name
              </label>
              <input
                id="contact_name"
                name="name"
                type="text"
                required
                placeholder="John Smith"
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="contact_phone" className="text-sm font-medium">
                Phone
              </label>
              <input
                id="contact_phone"
                name="phone"
                type="tel"
                required
                placeholder="+1 604 000 0000"
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="contact_email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="contact_email"
                name="email"
                type="email"
                required
                placeholder="email@example.com"
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="contact_subject" className="text-sm font-medium">
                Subject
              </label>
              <textarea
                id="contact_subject"
                name="subject"
                required
                rows={4}
                placeholder="How can we help you?"
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Send Message
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-primary/10 bg-secondary/30 px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold">Nexuma</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="#how-it-works" className="transition-colors hover:text-primary">
                How it Works
              </Link>
              <Link href="#services" className="transition-colors hover:text-primary">
                Services
              </Link>
              <Link href="#about" className="transition-colors hover:text-primary">
                About Us
              </Link>
              <Link href="#contact" className="transition-colors hover:text-primary">
                Contact
              </Link>
            </div>
          </div>
          <div className="mt-8 border-t border-primary/10 pt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Nexuma marketing ltd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
