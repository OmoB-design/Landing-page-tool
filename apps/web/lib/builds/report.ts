import type { BuildReport, ComplianceFinding } from "@/lib/validators/build";

/** The claims check's page-wide note for an expert byline (worker app/engines/compliance.py). */
const EXPERT_RULE = "expert_author";

/** The section a finding's location names: `hero > div > p` → `hero`; null for the whole page. */
export function findingSection(location: string): string | null {
  const first = location.split(">")[0]?.trim() ?? "";
  return first && first !== "page" ? first : null;
}

/** A section key as a label: `hero` → "Hero", `social_proof` → "Social proof". */
export function sectionLabel(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Sentence case for a report value: "in the template's order" → "In the template's order". */
export function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A reason as the panel shows it: curly quotes, no closing full stop (Figma Build, Claim check). */
export function claimReason(reason: string): string {
  return reason.replace(/"([^"]*)"/g, "\u201c$1\u201d").replace(/\.$/, "");
}

/** The claims to act on (Figma Build, Claim check): everything but the page-wide reminders. */
export function reportClaims(report: BuildReport): ComplianceFinding[] {
  return report.compliance.findings.filter((f) => f.rule !== EXPERT_RULE);
}

/** How a claim reads: high risk is to fix; medium and low are to check. */
export function claimAction(finding: ComplianceFinding): "Fix" | "Check" {
  return finding.severity === "high" ? "Fix" : "Check";
}

export type Reminder = {
  title: string;
  detail?: string;
  /** A fix the review desk offers on the card (D86): redraft the lines left unwritten. */
  action?: "redraft-unwritten";
};

/**
 * What to keep in mind before publishing (Figma Build, Reminders): placeholder images, copy that
 * wasn't rewritten, an expert byline, and the pipeline's other notes.
 */
export function reportReminders(report: BuildReport): Reminder[] {
  const reminders: Reminder[] = [];
  if (report.mock_images) {
    reminders.push({
      title: "Placeholder images.",
      detail:
        "Scenes and people are placeholders, so this page can’t be published. Real images arrive in B1.3.",
    });
  }
  if (report.copy.error) {
    reminders.push({
      title: "Some copy wasn’t rewritten.",
      detail: report.copy.error,
      action: "redraft-unwritten",
    });
  }
  if (report.copy.skipped) {
    reminders.push({
      title: "Copy not rewritten.",
      detail: report.copy.skipped,
    });
  } else if (report.copy.mock) {
    reminders.push({
      title: "Copy written in mock mode.",
      detail:
        "Lines are marked [mock] instead of being rewritten, at no cost. Real copy needs mock mode off.",
    });
  }
  for (const finding of report.compliance.findings) {
    if (finding.rule === EXPERT_RULE) {
      reminders.push({
        title: "Written as an expert.",
        detail: finding.reason,
      });
    }
  }
  for (const warning of report.warnings) {
    // The copy error has its own card above.
    if (warning !== report.copy.error) reminders.push({ title: warning });
  }
  return reminders;
}
