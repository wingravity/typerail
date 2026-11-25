import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { isArrayLike, isFromDefaultLibrary, isObjectType, typedContext, wideningListeners } from "./slots.ts";

type MessageId = "bivariant";

const MAX_DEPTH = 3;

const LIBRARY_WRITERS: Readonly<Record<string, readonly string[]>> = {
  Set: ["add"],
  Map: ["set"],
  WeakSet: ["add"],
  WeakMap: ["set"],
};

interface Finding {
  readonly path: string;
  readonly sourceParameter: ts.Type;
  readonly targetParameter: ts.Type;
}

function isMethod(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((d) => ts.isMethodSignature(d) || ts.isMethodDeclaration(d));
}

function checkedMethods(program: ts.Program, checker: ts.TypeChecker, type: ts.Type): ts.Symbol[] {
  const symbol = type.getSymbol();
  const writers = isFromDefaultLibrary(program, symbol) ? (LIBRARY_WRITERS[symbol?.getName() ?? ""] ?? []) : [];
  return checker
    .getPropertiesOfType(type)
    .filter((property) => writers.includes(property.getName()) || (isMethod(property) && !isFromDefaultLibrary(program, property)));
}

function parameterTypes(checker: ts.TypeChecker, signature: ts.Signature): ts.Type[] {
  return signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter));
}

function narrowerParameter(checker: ts.TypeChecker, source: ts.Type, target: ts.Type): [ts.Type, ts.Type] | undefined {
  const sourceSignature = source.getCallSignatures()[0];
  const targetSignature = target.getCallSignatures()[0];
  if (sourceSignature === undefined || targetSignature === undefined) {
    return undefined;
  }
  const sourceParameters = parameterTypes(checker, sourceSignature);
  const targetParameters = parameterTypes(checker, targetSignature);
  for (const [index, sourceParameter] of sourceParameters.entries()) {
    const targetParameter = targetParameters[index];
    if (targetParameter !== undefined && !checker.isTypeAssignableTo(targetParameter, sourceParameter)) {
      return [sourceParameter, targetParameter];
    }
  }
  return undefined;
}

function isPlainObject(checker: ts.TypeChecker, type: ts.Type): boolean {
  return isObjectType(type) && !isArrayLike(checker, type) && type.getCallSignatures().length === 0;
}

export function findBivariantMethod(
  program: ts.Program,
  checker: ts.TypeChecker,
  source: ts.Type,
  target: ts.Type,
  depth = 0,
  prefix = "",
): Finding | undefined {
  if (depth > MAX_DEPTH || source === target) {
    return undefined;
  }
  for (const method of checkedMethods(program, checker, target)) {
    const sourceMethod = checker.getPropertyOfType(source, method.getName());
    if (sourceMethod === undefined) {
      continue;
    }
    const narrower = narrowerParameter(checker, checker.getTypeOfSymbol(sourceMethod), checker.getTypeOfSymbol(method));
    if (narrower !== undefined) {
      return { path: `${prefix}${method.getName()}`, sourceParameter: narrower[0], targetParameter: narrower[1] };
    }
  }
  for (const property of checker.getPropertiesOfType(target)) {
    if (isMethod(property)) {
      continue;
    }
    const sourceProperty = checker.getPropertyOfType(source, property.getName());
    if (sourceProperty === undefined) {
      continue;
    }
    const sourceType = checker.getNonNullableType(checker.getTypeOfSymbol(sourceProperty));
    const targetType = checker.getNonNullableType(checker.getTypeOfSymbol(property));
    if (sourceType !== targetType && isPlainObject(checker, sourceType) && isPlainObject(checker, targetType)) {
      const nested = findBivariantMethod(program, checker, sourceType, targetType, depth + 1, `${prefix}${property.getName()}.`);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

export const noMethodBivariance: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow using an object where one of its methods can be called with arguments it does not accept",
      url: docsUrl("TR103"),
    },
    messages: {
      bivariant:
        "[TR103] Method `{{path}}` accepts {{source}}, but through this reference it can be called with {{target}}. TypeScript checks method parameters in both directions. Declare the member as a function property, or do not widen the object.",
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
      const findings = candidates.map((target) => findBivariantMethod(program, checker, source, target));
      const first = findings[0];
      if (first !== undefined && findings.every((finding) => finding !== undefined)) {
        context.report({
          node,
          messageId: "bivariant",
          data: {
            path: first.path,
            source: checker.typeToString(first.sourceParameter),
            target: checker.typeToString(first.targetParameter),
          },
        });
      }
    }, { includeFresh: true });
  },
};
