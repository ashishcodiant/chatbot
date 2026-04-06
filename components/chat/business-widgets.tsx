"use client";

import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  Clock3Icon,
  CreditCardIcon,
  DollarSignIcon,
  MailIcon,
  ShieldAlertIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserIcon,
  ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type TopCustomer = {
  id: string;
  name: string;
  email: string;
  totalSpent: string | number;
};

type ChurnRiskCustomer = {
  id: string;
  name: string;
  email: string;
  createdAt?: string | Date | null;
};

type CustomerLtvResult = {
  success: boolean;
  error?: string;
  customer?: {
    id: string;
    name: string;
    email: string;
    createdAt?: string | Date | null;
  };
  metrics?: {
    ltv?: string | number | null;
    churnRisk?: string | number | null;
    recency?: string | number | null;
    frequency?: string | number | null;
  };
};

type CandidatePreview = {
  id: string;
  emailMasked: string;
  totalSpent: string | number;
  orderCount: number;
  lastPurchaseAt: string | Date | null;
};

type CustomerReferenceResult = {
  success: boolean;
  error?: string;
  requiresDisambiguation?: boolean;
  matchedCount?: number;
  customer?: {
    id: string;
    name: string;
    email: string;
    emailMasked?: string;
    createdAt?: string | Date | null;
  };
  metrics?: {
    ltv?: string | number | null;
    churnRisk?: string | number | null;
    recency?: string | number | null;
    frequency?: string | number | null;
    totalSpent?: string | number | null;
    orderCount?: number | null;
    lastPurchaseAt?: string | Date | null;
  };
  candidatePreview?: CandidatePreview[];
};

type CustomerDetailsResult = {
  success: boolean;
  error?: string;
  customer?: {
    id: string;
    name: string;
    email: string;
    emailMasked?: string;
    createdAt?: string | Date | null;
  };
  metrics?: {
    ltv?: string | number | null;
    churnRisk?: string | number | null;
    recency?: string | number | null;
    frequency?: string | number | null;
  };
  recentTransactions?: Array<{
    id: string;
    amount: string | number;
    createdAt: string | Date | null;
  }>;
};

type CampaignLogsResult = {
  success: boolean;
  count: number;
  logs: Array<{
    id: string;
    email: string | null;
    customerName: string | null;
    status: string;
    error: string | null;
    createdAt: string | Date | null;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrency(value: unknown, options?: Intl.NumberFormatOptions): string {
  const n = toNumber(value) ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    ...options,
  }).format(n);
}

function formatCompactCurrency(value: unknown) {
  return formatCurrency(value, { notation: "compact", maximumFractionDigits: 1 });
}

function formatPercent(value: unknown) {
  const n = toNumber(value);
  if (n === null) return "n/a";
  return `${Math.round(n * 100)}%`;
}

function formatDate(value: unknown) {
  if (!value) return "n/a";
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return "n/a";
  return format(d, "MMM d, yyyy");
}

function formatDateTime(value: unknown) {
  if (!value) return "n/a";
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return "n/a";
  return format(d, "MMM d, h:mm a");
}

function formatRelativeTime(value: unknown) {
  if (!value) return "n/a";
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return "n/a";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

function maskEmail(email: string) {
  const [localPart = "", domain = ""] = email.split("@");
  const visibleLocal = localPart.slice(0, 2);
  const maskedLocal = `${visibleLocal}${"*".repeat(Math.max(localPart.length - visibleLocal.length, 2))}`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function churnRiskLevel(value: unknown): "low" | "medium" | "high" {
  const n = toNumber(value);
  if (n === null) return "low";
  if (n >= 0.66) return "high";
  if (n >= 0.33) return "medium";
  return "low";
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function DashboardShell({
  title,
  subtitle,
  icon,
  children,
  accentClass = "from-[oklch(0.55_0.22_270)] to-[oklch(0.50_0.24_290)]",
}: {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  children: ReactNode;
  accentClass?: string;
}) {
  return (
    <section className="not-prose w-full max-w-[880px] overflow-hidden rounded-[28px] border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 shadow-[var(--shadow-float)] widget-in">
      {/* Header strip with brand gradient */}
      <div className={`bg-gradient-to-r ${accentClass} px-5 py-4`}>
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="flex size-7 items-center justify-center rounded-lg bg-white/20 text-white">
              {icon}
            </div>
          )}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
              Structured Result
            </div>
            <h3 className="font-bold text-[18px] tracking-tight text-white leading-tight">
              {title}
            </h3>
          </div>
        </div>
        <p className="mt-1.5 text-[12px] leading-5 text-white/70 max-w-[52ch]">
          {subtitle}
        </p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  colorClass = "bg-[oklch(0.55_0.22_270)/0.08] text-[oklch(0.45_0.24_270)]",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  colorClass?: string;
}) {
  return (
    <div className="group rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <div className={`flex size-7 items-center justify-center rounded-lg ${colorClass}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 font-bold text-[22px] tracking-tight text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-[13px] text-muted-foreground">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div>{message}</div>
    </div>
  );
}

function AvatarChip({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "size-8 text-[11px]", md: "size-10 text-[13px]", lg: "size-14 text-[18px]" }[size];
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.55_0.22_270)] to-[oklch(0.50_0.24_290)] font-bold text-white shadow-[var(--shadow-brand)]`}
    >
      {getInitials(name)}
    </div>
  );
}

function ChurnBadge({ value }: { value: unknown }) {
  const level = churnRiskLevel(value);
  const config = {
    low:    { label: "Low risk",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    medium: { label: "Medium risk", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    high:   { label: "High risk",   cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  }[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${config.cls}`}>
      {config.label}
    </span>
  );
}

function SpendBar({ value, max }: { value: unknown; max: number }) {
  const n = toNumber(value) ?? 0;
  const pct = max > 0 ? Math.min((n / max) * 100, 100) : 0;
  return (
    <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[oklch(0.55_0.22_270)] to-[oklch(0.62_0.20_290)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Top Customers ─────────────────────────────────────────────────────────────

export function TopCustomersWidget({ customers }: { customers: TopCustomer[] }) {
  const totalRevenue = customers.reduce((sum, c) => sum + (toNumber(c.totalSpent) ?? 0), 0);
  const topCustomer = customers[0];
  const averageSpend = customers.length > 0 ? totalRevenue / customers.length : 0;
  const maxSpend = toNumber(topCustomer?.totalSpent) ?? 1;

  const rankStyle = (i: number) => {
    if (i === 0) return "bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow";
    if (i === 1) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow";
    if (i === 2) return "bg-gradient-to-br from-amber-600 to-orange-600 text-white shadow";
    return "bg-muted text-muted-foreground";
  };

  return (
    <DashboardShell
      icon={<TrendingUpIcon className="size-4" />}
      subtitle="Ranked customer performance with highest-value accounts surfaced first."
      title="Top Customers"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          hint={topCustomer?.name ?? "No customers"}
          icon={<TrendingUpIcon className="size-3.5" />}
          label="Top Spend"
          value={topCustomer ? formatCompactCurrency(topCustomer.totalSpent) : "$0"}
          colorClass="bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <MetricCard
          hint={`${customers.length} customers in this ranking`}
          icon={<DollarSignIcon className="size-3.5" />}
          label="Combined Value"
          value={formatCompactCurrency(totalRevenue)}
          colorClass="bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <MetricCard
          hint="Average spend across returned list"
          icon={<ArrowUpRightIcon className="size-3.5" />}
          label="Average"
          value={formatCompactCurrency(averageSpend)}
          colorClass="bg-[oklch(0.55_0.22_270)/0.1] text-[oklch(0.45_0.24_270)] dark:text-[oklch(0.72_0.18_270)]"
        />
      </div>

      <div className="mt-4 space-y-2">
        {customers.length === 0 ? (
          <EmptyState message="No customer records were returned for this ranking." />
        ) : (
          customers.map((customer, index) => (
            <div
              className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[var(--shadow-card)] transition-all duration-150 hover:border-[oklch(0.55_0.22_270)/0.3] hover:shadow-[var(--shadow-float)]"
              key={customer.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl font-bold text-[13px] ${rankStyle(index)}`}
                >
                  #{index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[14px] text-foreground">
                    {customer.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <MailIcon className="size-3 shrink-0" />
                    <span className="truncate">{maskEmail(customer.email)}</span>
                  </div>
                  <SpendBar value={customer.totalSpent} max={maxSpend} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold text-[16px] text-foreground">
                  {formatCurrency(customer.totalSpent)}
                </div>
                <div className="text-[11px] text-muted-foreground">lifetime spend</div>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}

// ─── Churn Risk ────────────────────────────────────────────────────────────────

export function ChurnRiskCustomersWidget({
  customers,
  days,
}: {
  customers: ChurnRiskCustomer[];
  days?: number;
}) {
  return (
    <DashboardShell
      accentClass="from-red-500 to-rose-600"
      icon={<ShieldAlertIcon className="size-4" />}
      subtitle="Customers with no recent purchase activity — flagged for retention follow-up."
      title="Churn Risk"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          hint="Currently inside the risk segment"
          icon={<ShieldAlertIcon className="size-3.5" />}
          label="At Risk"
          value={String(customers.length)}
          colorClass="bg-red-100/80 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <MetricCard
          hint="Inactivity threshold for this segment"
          icon={<Clock3Icon className="size-3.5" />}
          label="Threshold"
          value={`${days ?? 60} days`}
          colorClass="bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <MetricCard
          hint="Best action for win-back campaigns"
          icon={<ZapIcon className="size-3.5" />}
          label="Priority"
          value="Re-engage"
          colorClass="bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {customers.length === 0 ? (
          <EmptyState message="No inactive customers found for this threshold." />
        ) : (
          customers.map((customer) => (
            <article
              className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-card)] transition-all duration-150 hover:border-red-200 dark:hover:border-red-900/50"
              key={customer.id}
            >
              <div className="flex items-start gap-3">
                <AvatarChip name={customer.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[14px] text-foreground">
                    {customer.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <MailIcon className="size-3 shrink-0" />
                    <span className="truncate">{maskEmail(customer.email)}</span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  At risk
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="size-3" /> Joined
                </span>
                <span className="font-medium">{formatDate(customer.createdAt)}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </DashboardShell>
  );
}

// ─── Customer LTV ──────────────────────────────────────────────────────────────

export function CustomerLtvWidget({ result }: { result: CustomerLtvResult }) {
  if (!result.success || !result.customer || !result.metrics) {
    return (
      <DashboardShell subtitle="Could not generate customer value summary." title="Customer Value">
        <EmptyState message={result.error ?? "Customer metrics were unavailable."} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      icon={<DollarSignIcon className="size-4" />}
      subtitle="Lifetime value and retention signals for a single customer profile."
      title="Customer Value"
    >
      {/* Profile card */}
      <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarChip name={result.customer.name} size="md" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[20px] tracking-tight text-foreground">
              {result.customer.name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MailIcon className="size-3.5" />
              <span>{maskEmail(result.customer.email)}</span>
            </div>
          </div>
          <Badge className="rounded-full shrink-0" variant="secondary">
            Since {formatDate(result.customer.createdAt)}
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="Estimated lifetime value"
          icon={<DollarSignIcon className="size-3.5" />}
          label="LTV"
          value={formatCurrency(result.metrics.ltv)}
          colorClass="bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <MetricCard
          hint="Model output when available"
          icon={<ShieldAlertIcon className="size-3.5" />}
          label="Churn Risk"
          value={formatPercent(result.metrics.churnRisk)}
          colorClass="bg-red-100/80 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <MetricCard
          hint="Recorded purchase frequency"
          icon={<TrendingUpIcon className="size-3.5" />}
          label="Frequency"
          value={String(result.metrics.frequency ?? "n/a")}
          colorClass="bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <MetricCard
          hint="Days since last activity"
          icon={<Clock3Icon className="size-3.5" />}
          label="Recency"
          value={
            result.metrics.recency != null ? `${result.metrics.recency}d` : "n/a"
          }
          colorClass="bg-[oklch(0.55_0.22_270)/0.1] text-[oklch(0.45_0.24_270)] dark:text-[oklch(0.72_0.18_270)]"
        />
      </div>
    </DashboardShell>
  );
}

// ─── Customer Reference ────────────────────────────────────────────────────────

export function CustomerReferenceWidget({ result }: { result: CustomerReferenceResult }) {
  if (!result.success && result.requiresDisambiguation) {
    return (
      <DashboardShell
        subtitle="Multiple customers matched — add one more filter to narrow down."
        title="Customer Match"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(result.candidatePreview ?? []).map((candidate) => (
            <div
              className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-card)]"
              key={candidate.id}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-[14px] text-foreground">
                  {candidate.emailMasked}
                </div>
                <Badge className="rounded-full" variant="secondary">
                  {candidate.orderCount} orders
                </Badge>
              </div>
              <div className="mt-3 font-bold text-[20px] tracking-tight text-foreground">
                {formatCurrency(candidate.totalSpent)}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                Last purchase {formatRelativeTime(candidate.lastPurchaseAt)}
              </div>
            </div>
          ))}
        </div>
      </DashboardShell>
    );
  }

  if (!result.success || !result.customer || !result.metrics) {
    return (
      <DashboardShell
        subtitle="No single customer could be resolved from the provided reference."
        title="Customer Match"
      >
        <EmptyState message={result.error ?? "No customer matched this lookup."} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      icon={<UserIcon className="size-4" />}
      subtitle="Resolved customer record with spend and retention signals."
      title="Customer Match"
    >
      <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarChip name={result.customer.name} size="md" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[20px] tracking-tight text-foreground">
              {result.customer.name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MailIcon className="size-3.5" />
              <span>{result.customer.emailMasked ?? maskEmail(result.customer.email)}</span>
            </div>
          </div>
          <ChurnBadge value={result.metrics.churnRisk} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="Aggregate spend"
          icon={<DollarSignIcon className="size-3.5" />}
          label="Total Spent"
          value={formatCurrency(result.metrics.totalSpent)}
          colorClass="bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <MetricCard
          hint="Orders recorded"
          icon={<TrendingUpIcon className="size-3.5" />}
          label="Orders"
          value={String(result.metrics.orderCount ?? "n/a")}
          colorClass="bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <MetricCard
          hint="Retention risk score"
          icon={<ShieldAlertIcon className="size-3.5" />}
          label="Churn Risk"
          value={formatPercent(result.metrics.churnRisk)}
          colorClass="bg-red-100/80 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <MetricCard
          hint="Most recent activity"
          icon={<Clock3Icon className="size-3.5" />}
          label="Last Purchase"
          value={formatDate(result.metrics.lastPurchaseAt)}
          colorClass="bg-[oklch(0.55_0.22_270)/0.1] text-[oklch(0.45_0.24_270)] dark:text-[oklch(0.72_0.18_270)]"
        />
      </div>
    </DashboardShell>
  );
}

// ─── Customer Details ──────────────────────────────────────────────────────────

export function CustomerDetailsWidget({ result }: { result: CustomerDetailsResult }) {
  if (!result.success || !result.customer) {
    return (
      <DashboardShell subtitle="Could not retrieve customer profile." title="Customer Profile">
        <EmptyState message={result.error ?? "Customer not found."} />
      </DashboardShell>
    );
  }

  const transactions = result.recentTransactions ?? [];
  const totalFromTx = transactions.reduce((s, t) => s + (toNumber(t.amount) ?? 0), 0);

  return (
    <DashboardShell
      icon={<UserIcon className="size-4" />}
      subtitle="Full customer profile with metrics and recent transaction history."
      title="Customer Profile"
    >
      {/* Hero profile card */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-[oklch(0.55_0.22_270)/0.06] to-transparent p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarChip name={result.customer.name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[24px] tracking-tight text-foreground">
              {result.customer.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MailIcon className="size-3.5" />
                {result.customer.emailMasked ?? maskEmail(result.customer.email)}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="size-3.5" />
                Customer since {formatDate(result.customer.createdAt)}
              </span>
            </div>
          </div>
          <ChurnBadge value={result.metrics?.churnRisk} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="Estimated lifetime value"
          icon={<DollarSignIcon className="size-3.5" />}
          label="LTV"
          value={formatCurrency(result.metrics?.ltv)}
          colorClass="bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <MetricCard
          hint="Churn probability score"
          icon={<ShieldAlertIcon className="size-3.5" />}
          label="Churn Risk"
          value={formatPercent(result.metrics?.churnRisk)}
          colorClass="bg-red-100/80 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <MetricCard
          hint="Purchase frequency"
          icon={<TrendingUpIcon className="size-3.5" />}
          label="Frequency"
          value={String(result.metrics?.frequency ?? "n/a")}
          colorClass="bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <MetricCard
          hint="Days since last purchase"
          icon={<Clock3Icon className="size-3.5" />}
          label="Recency"
          value={result.metrics?.recency != null ? `${result.metrics.recency}d` : "n/a"}
          colorClass="bg-[oklch(0.55_0.22_270)/0.1] text-[oklch(0.45_0.24_270)] dark:text-[oklch(0.72_0.18_270)]"
        />
      </div>

      {/* Transaction timeline */}
      {transactions.length > 0 && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Recent Transactions
            </div>
            <div className="text-[12px] font-semibold text-foreground">
              {formatCurrency(totalFromTx)} shown
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/80 shadow-[var(--shadow-card)]">
            {transactions.map((tx, i) => (
              <div
                className={`flex items-center justify-between gap-4 px-4 py-3 text-[13px] ${
                  i < transactions.length - 1 ? "border-b border-border/40" : ""
                } hover:bg-muted/30 transition-colors`}
                key={tx.id}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <CreditCardIcon className="size-3.5" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">
                      Transaction #{i + 1}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDateTime(tx.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="font-bold text-[15px] text-foreground">
                  {formatCurrency(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

// ─── Campaign Logs ─────────────────────────────────────────────────────────────

export function CampaignLogsWidget({ result }: { result: CampaignLogsResult }) {
  const sentCount = result.logs.filter((l) => l.status === "sent").length;
  const failedCount = result.logs.filter((l) => l.status === "failed").length;
  const deliveryRate = result.count > 0 ? Math.round((sentCount / result.count) * 100) : 0;

  return (
    <DashboardShell
      accentClass="from-sky-500 to-blue-600"
      icon={<MailIcon className="size-4" />}
      subtitle="Delivery activity rendered as a compact operational dashboard."
      title="Campaign Logs"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          hint="Rows returned in this query"
          icon={<MailIcon className="size-3.5" />}
          label="Entries"
          value={String(result.count)}
          colorClass="bg-sky-100/80 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
        />
        <MetricCard
          hint="Delivered successfully"
          icon={<ArrowUpRightIcon className="size-3.5" />}
          label="Sent"
          value={String(sentCount)}
          colorClass="bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <MetricCard
          hint="Require follow-up"
          icon={<TrendingDownIcon className="size-3.5" />}
          label="Failed"
          value={String(failedCount)}
          colorClass="bg-red-100/80 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
      </div>

      {/* Delivery rate bar */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-muted-foreground uppercase tracking-[0.14em] text-[10px]">Delivery Rate</span>
          <span className="font-bold text-foreground">{deliveryRate}%</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${deliveryRate}%` }}
          />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-border/60 bg-background/80 shadow-[var(--shadow-card)]">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[1.2fr_1.4fr_110px_130px] gap-3 border-b border-border/60 px-4 py-3 font-semibold text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <div>Customer</div>
            <div>Email</div>
            <div>Status</div>
            <div>Sent At</div>
          </div>
          {result.logs.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState message="No campaign delivery logs were returned." />
            </div>
          ) : (
            result.logs.map((log) => (
              <div
                className="grid grid-cols-[1.2fr_1.4fr_110px_130px] gap-3 border-b border-border/40 px-4 py-3 text-[13px] last:border-b-0 hover:bg-muted/20 transition-colors"
                key={log.id}
              >
                <div className="truncate font-semibold text-foreground">
                  {log.customerName ?? "Unknown"}
                </div>
                <div className="truncate text-muted-foreground">
                  {log.email ? maskEmail(log.email) : "n/a"}
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      log.status === "sent"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
                <div className="text-muted-foreground">{formatDateTime(log.createdAt)}</div>
                {log.error && (
                  <div className="col-span-4 rounded-xl bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                    {log.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
