import type { TSESLint } from "@typescript-eslint/utils";
import { isPropertyReadonlyInType } from "@typescript-eslint/type-utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { isWidenedArray } from "./no-mutable-array-widening.ts";
import { isArrayLike, isFromLibrary, isObjectType, typedContext, wideningListeners } from "./slots.ts";

type MessageId = "widened";

const MAX_DEPTH = 3;

interface Finding {
  readonly path: string;
  readonly sourceType: ts.Type;
  readonly targetType: ts.Type;
}

function isMethod(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((d) => ts.isMethodSignature(d) || ts.isMethodDeclaration(d));
}

function isPlainObject(checker: ts.TypeChecker, type: ts.Type): boolean {
  return isObjectType(type) && !isArrayLike(checker, type) && type.getCallSignatures().length === 0;
}

export function findPropertyWidening(
  program: ts.Program,
  checker: ts.TypeChecker,
  source: ts.Type,
  target: ts.Type,
  depth = 0,
  prefix = "",
): Finding | undefined {
  if (depth > MAX_DEPTH || source === target || checker.isTypeAssignableTo(target, source)) {
    return undefined;
  }
  for (const targetProperty of checker.getPropertiesOfType(target)) {
    if (isMethod(targetProperty) || isFromLibrary(program, targetProperty.getDeclarations()?.[0])) {
      continue;
    }
    const name = targetProperty.getName();
    const sourceProperty = checker.getPropertyOfType(source, name);
    if (sourceProperty === undefined) {
      continue;
    }
    const sourceType = checker.getNonNullableType(checker.getTypeOfSymbol(sourceProperty));
    const targetType = checker.getNonNullableType(checker.getTypeOfSymbol(targetProperty));
    const path = `${prefix}${name}`;
    const writable = !isPropertyReadonlyInType(target, targetProperty, checker);
    if (writable && !checker.isTypeAssignableTo(targetType, sourceType)) {
      return { path, sourceType, targetType };
    }
    if (isWidenedArray(checker, sourceType, targetType)) {
      return { path, sourceType, targetType };
    }
    if (isPlainObject(checker, sourceType) && isPlainObject(checker, targetType)) {
      const nested = findPropertyWidening(program, checker, sourceType, targetType, depth + 1, `${path}.`);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  for (const index of checker.getIndexInfosOfType(target)) {
    if (index.isReadonly || isFromLibrary(program, index.declaration)) {
      continue;
    }
    for (const sourceProperty of checker.getPropertiesOfType(source)) {
      const sourceType = checker.getNonNullableType(checker.getTypeOfSymbol(sourceProperty));
      if (!checker.isTypeAssignableTo(index.type, sourceType)) {
        return { path: `${prefix}${sourceProperty.getName()}`, sourceType, targetType: index.type };
      }
    }
  }
  return undefined;
}

export const noMutablePropertyWidening: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow using an existing object where its properties can be written with values of a wider type",
      url: docsUrl("TR102"),
    },
    messages: {
      widened:
        "[TR102] Property `{{path}}` is {{source}} here but writable as {{target}} through this reference, so code holding it can store a value the original object does not allow. Make the target's properties readonly, or pass a copy.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const typed = typedContext(context);
    if (typed === undefined) {
      return {};
    }
    const { checker, program } = typed;
    return wideningListeners(typed, ({ node, source, targets }) => {
      if (!isPlainObject(checker, source)) {
        return;
      }
      const candidates = targets.filter((target) => isPlainObject(checker, target) && checker.isTypeAssignableTo(source, target));
      if (candidates.length === 0) {
        return;
      }
      const findings = candidates.map((target) => findPropertyWidening(program, checker, source, target));
      const first = findings[0];
      if (first !== undefined && findings.every((finding) => finding !== undefined)) {
        context.report({
          node,
          messageId: "widened",
          data: {
            path: first.path,
            source: checker.typeToString(first.sourceType),
            target: checker.typeToString(first.targetType),
          },
        });
      }
    });
  },
};
