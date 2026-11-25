import { gapByCode, gapForRule, type Gap, type Priority } from "../../gaps.ts";

export type { Priority } from "../../gaps.ts";

export const PRIORITY_TITLES: Readonly<Record<Priority, string>> = {
  0: "Process can go down",
  1: "Silent wrong result",
  2: "Request fails",
  3: "Latent risk",
  4: "No runtime effect",
};

export const PRIORITY_DESCRIPTIONS: Readonly<Record<Priority, string>> = {
  0: "Can stop the whole process, affecting every request in flight.",
  1: "Can produce wrong data or behavior without any error being raised.",
  2: "Can throw at runtime and fail the current request or job.",
  3: "Does not fail on its own, but lets through a value that later code may mishandle.",
  4: "Clarity and maintenance only, or a rule from the project's own configuration.",
};

export interface Classification {
  readonly priority: Priority;
  readonly why: string;
  readonly fix: string;
  readonly code?: string;
}

function fromGap(gap: Gap): Classification {
  return { priority: gap.priority, why: gap.why, fix: gap.fix, code: gap.code };
}

function metaGap(code: string): Classification {
  const gap = gapByCode(code);
  return gap === undefined ? { priority: 4, why: "", fix: "" } : fromGap(gap);
}

const UNDEFINED_ACCESS: Classification = {
  priority: 2,
  why: "The value can be undefined at runtime, and using it throws a TypeError.",
  fix: "Check for undefined first (`if (value === undefined) return ...`) or use `?.`. Do not add `!`.",
};

const MISSING_PROPERTY: Classification = {
  priority: 3,
  why: "`undefined` is passed where a property should be left out, so `\"key\" in value` and the declared type disagree.",
  fix: "Leave the property out instead of setting it to undefined, or add `| undefined` to the target type.",
};

const WRONG_CASE: Classification = {
  priority: 0,
  why: "The import differs from the file name only in letter case, so it fails on case-sensitive file systems such as Linux.",
  fix: "Match the letter case of the file name exactly.",
};

const TYPESCRIPT_CODES = new Map<number, Classification>([
  [2532, UNDEFINED_ACCESS],
  [18047, UNDEFINED_ACCESS],
  [18048, UNDEFINED_ACCESS],
  [18049, UNDEFINED_ACCESS],
  [2339, UNDEFINED_ACCESS],
  [2722, UNDEFINED_ACCESS],
  [2721, UNDEFINED_ACCESS],
  [2538, UNDEFINED_ACCESS],
  [
    2345,
    {
      priority: 2,
      why: "A value of the wrong type, often possibly undefined, is passed on.",
      fix: "Narrow the value before passing it, for example by checking for undefined.",
    },
  ],
  [
    2322,
    {
      priority: 2,
      why: "A value of the wrong type, often possibly undefined, is assigned.",
      fix: "Narrow the value before assigning it, or change the target type deliberately.",
    },
  ],
  [
    18046,
    {
      priority: 2,
      why: "A caught or unknown value is used as if its type were known.",
      fix: "Narrow it first, for example `cause instanceof Error`.",
    },
  ],
  [
    2307,
    {
      priority: 0,
      why: "A module cannot be resolved, so loading this file fails.",
      fix: "Fix the import path or install the missing package.",
    },
  ],
  [
    2882,
    {
      priority: 0,
      why: "A side-effect import cannot be resolved, so loading this file fails.",
      fix: "Fix the import path or install the missing package.",
    },
  ],
  [1149, WRONG_CASE],
  [1261, WRONG_CASE],
  [
    7030,
    {
      priority: 1,
      why: "Some code paths return undefined without saying so.",
      fix: "Return a value on every path, or make the return type include undefined explicitly.",
    },
  ],
  [
    7029,
    {
      priority: 1,
      why: "A switch case falls through into the next one.",
      fix: "End the case with `return` or `break`.",
    },
  ],
  [
    2367,
    {
      priority: 1,
      why: "The comparison can never be true, so the branch never runs.",
      fix: "Compare values of matching types.",
    },
  ],
  [2375, MISSING_PROPERTY],
  [2379, MISSING_PROPERTY],
  [4111, { priority: 4, why: "A dynamic key is read with dot notation.", fix: 'Use bracket access: `obj["key"]`.' }],
  [4114, { priority: 4, why: "A method overrides a base class method without saying so.", fix: "Add the `override` keyword." }],
  [6133, { priority: 4, why: "Unused code.", fix: "Remove it. Prefix unused parameters with `_`." }],
  [6192, { priority: 4, why: "Unused imports.", fix: "Remove them." }],
  [6196, { priority: 4, why: "Unused declaration.", fix: "Remove it." }],
  [7027, { priority: 4, why: "Unreachable code.", fix: "Remove it." }],
]);

const DEFAULT_TYPESCRIPT: Classification = {
  priority: 2,
  why: "A type error; the code may not behave as its types claim.",
  fix: "Fix the type error at this location.",
};

export const UNPARSED_FILE: Classification = metaGap("TR001");


const UNKNOWN_RULE: Classification = {
  priority: 4,
  why: "A rule from the project's own configuration, not a typerail rule.",
  fix: "Follow the rule's message.",
};

const FLAG_DIAGNOSTICS = new Map<number, string>([
  [2882, "TR606"],
  [1149, "TR607"],
  [1261, "TR607"],
  [7029, "TR605"],
  [2375, "TR603"],
  [2379, "TR603"],
]);

export function classifyTypeScript(code: number): Classification {
  const classification = TYPESCRIPT_CODES.get(code) ?? DEFAULT_TYPESCRIPT;
  const gapCode = FLAG_DIAGNOSTICS.get(code);
  return gapCode === undefined ? classification : { ...classification, code: gapCode };
}

export function classifyEslint(ruleId: string): Classification {
  const gap = gapForRule(ruleId);
  return gap === undefined ? UNKNOWN_RULE : fromGap(gap);
}

export function isClassifiedRule(ruleId: string): boolean {
  return gapForRule(ruleId) !== undefined;
}
