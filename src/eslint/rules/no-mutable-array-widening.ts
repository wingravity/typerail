import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { typedContext, wideningListeners } from "./slots.ts";

type MessageId = "widened";

function isMutableArray(checker: ts.TypeChecker, type: ts.Type): boolean {
  return (checker.isArrayType(type) || checker.isTupleType(type)) && checker.getPropertyOfType(type, "push") !== undefined;
}

function elementType(checker: ts.TypeChecker, type: ts.Type): ts.Type | undefined {
  return checker.getIndexTypeOfType(type, ts.IndexKind.Number);
}

export function isWidenedArray(checker: ts.TypeChecker, source: ts.Type, target: ts.Type): boolean {
  if (!isMutableArray(checker, source) || !isMutableArray(checker, target)) {
    return false;
  }
  const sourceElement = elementType(checker, source);
  const targetElement = elementType(checker, target);
  return sourceElement !== undefined && targetElement !== undefined && !checker.isTypeAssignableTo(targetElement, sourceElement);
}

export const noMutableArrayWidening: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow using an existing mutable array where a mutable array of a wider element type is expected",
      url: docsUrl("TR101"),
    },
    messages: {
      widened:
        "[TR101] This {{source}} is used as a mutable {{target}}, so code holding it can add any {{targetElement}} to the original array. Type the target as `readonly {{target}}`, or pass a copy.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const typed = typedContext(context);
    if (typed === undefined) {
      return {};
    }
    const { checker } = typed;
    return wideningListeners(typed, ({ node, source, targets }) => {
      const arrayTargets = targets.filter((target) => checker.isArrayType(target) || checker.isTupleType(target));
      const target = arrayTargets[0];
      if (target === undefined || !isMutableArray(checker, source)) {
        return;
      }
      const targetElement = elementType(checker, target);
      if (targetElement !== undefined && arrayTargets.every((candidate) => isWidenedArray(checker, source, candidate))) {
        context.report({
          node,
          messageId: "widened",
          data: {
            source: checker.typeToString(source),
            target: checker.typeToString(target),
            targetElement: checker.typeToString(targetElement),
          },
        });
      }
    });
  },
};
