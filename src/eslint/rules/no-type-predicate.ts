import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { typedContext, type TypedContext } from "./slots.ts";

type MessageId = "predicate" | "assertion";

type FunctionWithBody = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const FALSY_PRIMITIVES = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike;

const TYPEOF_FLAGS: Readonly<Record<string, number>> = {
  string: ts.TypeFlags.StringLike,
  number: ts.TypeFlags.NumberLike,
  bigint: ts.TypeFlags.BigIntLike,
  boolean: ts.TypeFlags.BooleanLike,
};

type Members = readonly ts.Type[];

function returnedExpression(node: FunctionWithBody): TSESTree.Expression | undefined {
  if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return node.body;
  }
  const [only] = node.body.body;
  return node.body.body.length === 1 && only?.type === AST_NODE_TYPES.ReturnStatement ? (only.argument ?? undefined) : undefined;
}

function isParameter(node: TSESTree.Node, name: string): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === name;
}

function literalValue(node: TSESTree.Node): string | number | boolean | undefined {
  if (node.type === AST_NODE_TYPES.Literal && (typeof node.value === "string" || typeof node.value === "number" || typeof node.value === "boolean")) {
    return node.value;
  }
  return undefined;
}

function isNullLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === null && node.raw === "null";
}

function isUndefined(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === "undefined";
}

function literalOf(type: ts.Type): string | number | boolean | undefined {
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return type.value;
  }
  if ((type.getFlags() & ts.TypeFlags.BooleanLiteral) !== 0 && "intrinsicName" in type) {
    return type.intrinsicName === "true";
  }
  return undefined;
}

interface Narrowing {
  readonly checker: ts.TypeChecker;
  readonly name: string;
  readonly trueBranchOnly: boolean;
}

function narrow(state: Narrowing, members: Members, condition: TSESTree.Expression): Members | undefined {
  const { checker, name } = state;
  if (condition.type === AST_NODE_TYPES.LogicalExpression && condition.operator === "&&") {
    const left = narrow(state, members, condition.left);
    if (left === undefined) {
      return undefined;
    }
    const right = narrow(state, left, condition.right);
    return right ?? (state.trueBranchOnly ? left : undefined);
  }
  if (condition.type === AST_NODE_TYPES.UnaryExpression && condition.operator === "!") {
    const inner = condition.argument;
    if (inner.type === AST_NODE_TYPES.UnaryExpression && inner.operator === "!" && isParameter(inner.argument, name)) {
      return truthy(members, state.trueBranchOnly);
    }
    return undefined;
  }
  if (isParameter(condition, name)) {
    return truthy(members, state.trueBranchOnly);
  }
  if (
    condition.type === AST_NODE_TYPES.CallExpression &&
    condition.callee.type === AST_NODE_TYPES.Identifier &&
    condition.callee.name === "Boolean" &&
    condition.arguments.length === 1 &&
    condition.arguments[0] !== undefined &&
    isParameter(condition.arguments[0], name)
  ) {
    return truthy(members, state.trueBranchOnly);
  }
  if (condition.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const strict = condition.operator === "!==" || condition.operator === "===";
  const loose = condition.operator === "!=" || condition.operator === "==";
  if (!strict && !loose) {
    return undefined;
  }
  const equal = condition.operator === "===" || condition.operator === "==";
  const [subject, other] = isParameter(condition.right, name) || condition.right.type === AST_NODE_TYPES.MemberExpression || condition.right.type === AST_NODE_TYPES.UnaryExpression
    ? [condition.right, condition.left]
    : [condition.left, condition.right];

  if (isParameter(subject, name) && (isNullLiteral(other) || isUndefined(other)) && !equal) {
    const drop = loose ? ts.TypeFlags.Null | ts.TypeFlags.Undefined : isNullLiteral(other) ? ts.TypeFlags.Null : ts.TypeFlags.Undefined;
    return members.filter((member) => (member.getFlags() & drop) === 0);
  }

  if (
    subject.type === AST_NODE_TYPES.UnaryExpression &&
    subject.operator === "typeof" &&
    isParameter(subject.argument, name) &&
    strict &&
    equal
  ) {
    const kind = literalValue(other);
    const flags = typeof kind === "string" ? TYPEOF_FLAGS[kind] : undefined;
    if (flags === undefined || members.some((member) => (member.getFlags() & ts.TypeFlags.Any) !== 0)) {
      return undefined;
    }
    if (members.length === 1 && members[0] !== undefined && (members[0].getFlags() & ts.TypeFlags.Unknown) !== 0) {
      const primitive = typeof kind === "string" ? primitiveType(checker, kind) : undefined;
      return primitive === undefined ? undefined : [primitive];
    }
    return members.filter((member) => (member.getFlags() & flags) !== 0);
  }

  if (
    subject.type === AST_NODE_TYPES.MemberExpression &&
    !subject.computed &&
    subject.property.type === AST_NODE_TYPES.Identifier &&
    isParameter(subject.object, name) &&
    strict
  ) {
    const value = literalValue(other);
    if (value === undefined) {
      return undefined;
    }
    const property = subject.property.name;
    const kept: ts.Type[] = [];
    for (const member of members) {
      const symbol = checker.getPropertyOfType(member, property);
      const literal = symbol === undefined ? undefined : literalOf(checker.getTypeOfSymbol(symbol));
      if (literal === undefined) {
        return undefined;
      }
      if ((literal === value) === equal) {
        kept.push(member);
      }
    }
    return kept;
  }
  return undefined;
}

function primitiveType(checker: ts.TypeChecker, kind: string): ts.Type | undefined {
  const types: Readonly<Record<string, ts.Type>> = {
    string: checker.getStringType(),
    number: checker.getNumberType(),
    boolean: checker.getBooleanType(),
    bigint: checker.getBigIntType(),
  };
  return types[kind];
}

function truthy(members: Members, trueBranchOnly: boolean): Members | undefined {
  const kept = members.filter((member) => (member.getFlags() & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) === 0);
  const unknown = kept.some((member) => (member.getFlags() & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0);
  const falsy = kept.some((member) => (member.getFlags() & FALSY_PRIMITIVES) !== 0);
  return unknown || (falsy && !trueBranchOnly) ? undefined : kept;
}

const NARROWING_ARRAY_METHODS = new Set(["filter", "find", "findLast", "every"]);

function isArrayMethodCallback(node: FunctionWithBody): boolean {
  const parent = node.parent;
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    !parent.callee.computed &&
    parent.callee.property.type === AST_NODE_TYPES.Identifier &&
    NARROWING_ARRAY_METHODS.has(parent.callee.property.name)
  );
}

function proves(typed: TypedContext, node: FunctionWithBody, predicate: TSESTree.TSTypePredicate): boolean {
  const { checker, toTs } = typed;
  const name = predicate.parameterName.type === AST_NODE_TYPES.Identifier ? predicate.parameterName.name : undefined;
  const parameter = node.params.find((param) => isParameter(param, name ?? ""));
  const condition = returnedExpression(node);
  if (name === undefined || parameter === undefined || condition === undefined || predicate.typeAnnotation === null) {
    return false;
  }
  const declared = checker.getTypeAtLocation(toTs(parameter));
  const members = declared.isUnion() ? declared.types : [declared];
  const trueBranchOnly = isArrayMethodCallback(node);
  const kept = narrow({ checker, name, trueBranchOnly }, members, condition);
  if (kept === undefined || kept.length === 0) {
    return false;
  }
  const claimed = checker.getTypeFromTypeNode(toTsTypeNode(toTs(predicate.typeAnnotation.typeAnnotation)));
  const claimedParts = claimed.isUnion() ? claimed.types : [claimed];
  const removed = members.filter((member) => !kept.includes(member));
  return (
    kept.every((member) => checker.isTypeAssignableTo(member, claimed)) &&
    claimedParts.every((part) => kept.some((member) => checker.isTypeAssignableTo(part, member))) &&
    (trueBranchOnly || removed.every((member) => !checker.isTypeAssignableTo(member, claimed)))
  );
}

function toTsTypeNode(node: ts.Node): ts.TypeNode {
  return ts.isTypeNode(node) ? node : ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
}

export const noTypePredicate: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: { description: "Disallow hand-written type predicates and assertion functions, which the compiler trusts without checking", url: docsUrl("TR206") },
    messages: {
      predicate:
        "[TR206] The compiler trusts `{{text}}` without checking that the function proves it. Validate with a schema, or remove the annotation and let TypeScript infer the predicate from the body.",
      assertion:
        "[TR206] The compiler trusts `{{text}}` without checking that the function proves it. Validate with a schema, or return a narrowed value instead of asserting.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const typed = typedContext(context);
    const check = (node: FunctionWithBody): void => {
      const annotation = node.returnType?.typeAnnotation;
      if (annotation?.type !== AST_NODE_TYPES.TSTypePredicate) {
        return;
      }
      if (!annotation.asserts && typed !== undefined && proves(typed, node, annotation)) {
        return;
      }
      context.report({
        node: annotation,
        messageId: annotation.asserts ? "assertion" : "predicate",
        data: { text: context.sourceCode.getText(annotation) },
      });
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
