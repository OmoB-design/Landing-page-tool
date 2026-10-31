/**
 * A brand's AI spend this month against its budget (D54), as Quality's usage meters: the label
 * with "$12.40 of $50.00" on a chip, a 5 px bar (green, red once the budget is reached) and when
 * it resets. Without a budget, the spend alone and how to set one.
 */
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
// The 1st of next month in UTC, formatted the same on the server and in the browser.
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function money(value: number) {
  return USD.format(value);
}

export function resetsOn(now = new Date()) {
  return DAY.format(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  );
}

export function BudgetMeter({
  spentUsd,
  budgetUsd,
  resets,
}: {
  spentUsd: number;
  budgetUsd: number | null;
  /** e.g. "1 Nov". */
  resets: string;
}) {
  const capped = budgetUsd !== null && budgetUsd > 0;
  const reached = capped && spentUsd >= budgetUsd;
  const share = capped ? Math.min(spentUsd / budgetUsd, 1) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center gap-1">
        <span className="text-type-body-small font-medium text-heading-01">
          This month
        </span>
        <span className="rounded-sm bg-foreground-02 px-1.5 text-type-caption-2 font-medium text-heading-02 tabular-nums">
          {capped
            ? `${money(spentUsd)} of ${money(budgetUsd)}`
            : `${money(spentUsd)} spent`}
        </span>
      </div>
      {capped ? (
        <div
          role="progressbar"
          aria-label={`AI spend this month: ${money(spentUsd)} of ${money(budgetUsd)}`}
          aria-valuemin={0}
          aria-valuemax={budgetUsd}
          aria-valuenow={Math.min(spentUsd, budgetUsd)}
          className="h-1.25 w-full overflow-hidden rounded-full bg-foreground-02"
        >
          <div
            className={
              reached
                ? "h-full bg-spot-500-red"
                : "h-full bg-highlight-green-500"
            }
            style={{ width: `${share * 100}%` }}
          />
        </div>
      ) : null}
      <span className="text-type-caption-2 text-heading-05">
        {capped
          ? reached
            ? `Budget reached: paid AI steps for this brand wait until ${resets}, or raise it in Brand DNA.`
            : `Resets ${resets}`
          : "No cap. Set a monthly AI budget in Brand DNA."}
      </span>
    </div>
  );
}
