import type { TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { isBrandedPrimitive, typedContext } from "./slots.ts";

type MessageId = "returnOnly";

const CONTAINERS = new Set(["Array", "ReadonlyArray", "Set", "ReadonlySet", "Map", "ReadonlyMap", "WeakMap", "WeakSet"]);

function references(node: ts.Node, name: string): boolean {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === name) {
    return true;
  }
  return ts.forEachChild(node, (child) => (references(child, name) ? true : undefined)) === true;
}

function claimsValue(node: ts.Node, name: string): boolean {
  if (ts.isArrayTypeNode(node)) {
    return false;
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    if (node.typeName.text === name) {
      return true;
    }
    if (CONTAINERS.has(node.typeName.text)) {
      return false;
    }
  }
  return ts.forEachChild(node, (child) => (claimsValue(child, name) ? true : undefined)) === true;
}

function appearsWithoutUndefined(node: ts.Node, name: string): boolean {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === name) {
    const parent = node.parent;
    return !(ts.isUnionTypeNode(parent) && parent.types.some((member) => member.kind === ts.SyntaxKind.UndefinedKeyword));
  }
  return ts.forEachChild(node, (child) => (appearsWithoutUndefined(child, name) ? true : undefined)) === true;
}

function isBrand(type: ts.Type): boolean {
  const parts = (type.isUnion() ? type.types : [type]).filter(
    (part) => (part.getFlags() & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0,
  );
  return parts.length > 0 && parts.every((part) => isBrandedPrimitive(part));
}

export const noReturnTypeArgument: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow explicit type arguments for type parameters that appear only in the return type",
      url: docsUrl("TR208"),
    },
    messages: {
      returnOnly:
        "[TR208] `{{argument}}` only tells the compiler what `{{callee}}` returns; nothing checks it. This is a type assertion in disguise. Leave it out and validate the result.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const typed = typedContext(context);
    if (typed === undefined) {
      return {};
    }
    const { checker, toTs } = typed;
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const typeArguments = node.typeArguments?.params ?? [];
        if (typeArguments.length === 0) {
          return;
        }
        const call = toTs(node);
        if (!ts.isCallExpression(call)) {
          return;
        }
        const declaration = checker.getResolvedSignature(call)?.getDeclaration();
        const typeParameters = declaration?.typeParameters;
        if (declaration === undefined || typeParameters === undefined || declaration.type === undefined) {
          return;
        }
        const returnType = declaration.type;
        for (const [index, argument] of typeArguments.entries()) {
          const parameter = typeParameters[index];
          if (parameter === undefined) {
            continue;
          }
          const name = parameter.name.text;
          const inParameters = declaration.parameters.some((p) => p.type !== undefined && references(p.type, name));
          const emptyState = node.arguments.length === 0 && !appearsWithoutUndefined(returnType, name);
          const tsArgument = toTs(argument);
          const brand = ts.isTypeNode(tsArgument) && isBrand(checker.getTypeFromTypeNode(tsArgument));
          if (!inParameters && !emptyState && !brand && claimsValue(returnType, name)) {
            context.report({
              node: argument,
              messageId: "returnOnly",
              data: { argument: context.sourceCode.getText(argument), callee: context.sourceCode.getText(node.callee) },
            });
          }
        }
      },
    };
  },
};
