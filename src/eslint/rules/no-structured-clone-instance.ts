import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { isFromDefaultLibrary, typedContext } from "./slots.ts";

type MessageId = "instance";

function isStructuredClone(callee: TSESTree.Expression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === "structuredClone";
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === "structuredClone"
  );
}

function hasPrototypeMembers(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.getPropertiesOfType(type).some((property) =>
    (property.getDeclarations() ?? []).some(
      (declaration) => ts.isMethodDeclaration(declaration) || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration),
    ),
  );
}

export const noStructuredCloneInstance: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: { description: "Disallow structuredClone on class instances, whose copies lose their methods", url: docsUrl("TR304") },
    messages: {
      instance:
        "[TR304] structuredClone copies the data of this {{type}} but not its prototype, so the copy has none of its methods while its type says it does. Copy it with a method or constructor.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const typed = typedContext(context);
    if (typed === undefined) {
      return {};
    }
    const { checker, program, toTs } = typed;
    return {
      CallExpression(node) {
        const argument = node.arguments[0];
        if (!isStructuredClone(node.callee) || argument === undefined || argument.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }
        const type = checker.getNonNullableType(checker.getTypeAtLocation(toTs(argument)));
        const symbol = type.getSymbol();
        const isClass = symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Class) !== 0;
        if (isClass && !isFromDefaultLibrary(program, symbol) && hasPrototypeMembers(checker, type)) {
          context.report({ node: argument, messageId: "instance", data: { type: checker.typeToString(type) } });
        }
      },
    };
  },
};
