/** How far a workspace has got (Home checklist, account menu). Counts are from the database. */
export type SetupCounts = {
  brands: number;
  products: number;
  templates: number;
  builds: number;
  published: number;
};

export type SetupStep = {
  id: string;
  label: string;
  done: boolean;
  href: string;
};

export type SetupProgress = {
  steps: SetupStep[];
  done: number;
  total: number;
  /** The first open step, if any. */
  next: SetupStep | null;
};

/** The five getting-started steps, in order, with links to where each is done. */
export function setupProgress(counts: SetupCounts): SetupProgress {
  const steps: SetupStep[] = [
    {
      id: "brand",
      label: "Create your first brand",
      done: counts.brands > 0,
      href: "/brands",
    },
    {
      id: "product",
      label: "Add a product",
      done: counts.products > 0,
      href: "/brands",
    },
    {
      id: "template",
      label: "Choose a template",
      done: counts.templates > 0,
      href: "/templates",
    },
    {
      id: "build",
      label: "Build your first page",
      done: counts.builds > 0,
      href: "/pages",
    },
    {
      id: "publish",
      label: "Publish a page",
      done: counts.published > 0,
      href: "/pages",
    },
  ];
  const done = steps.filter((step) => step.done).length;
  return {
    steps,
    done,
    total: steps.length,
    next: steps.find((step) => !step.done) ?? null,
  };
}
