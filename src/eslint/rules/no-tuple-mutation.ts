import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { docsUrl } from "../../gaps.ts";
import { typedContext } from "./slots.ts";

type MessageId = "length" | "order";

const LENGTH_METHODS = new Set(["push", "pop", "shift", "unshift", "splice"]);
const ORDER_METHODS = new Set(["reverse", "sort", "fill", "copyWithin"]);

function propertyName(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
    return member.property.name;
  }
  return undefined;
}

export const noTupleMutation: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: { description: "Disallow array methods that change a tuple's length or the order of its differently typed elements", url: docsUrl("TR104") },
    messages: {
      length: "[TR104] `{{method}}` changes the length of this tuple, but its type still describes the original positions. Build a new tuple instead.",
      order: "[TR104] `{{method}}` moves elements of different types between positions of this tuple. Build a new tuple instead.",
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

    const tupleElements = (node: TSESTree.Expression): readonly ts.Type[] | undefined => {
      const type = checker.getNonNullableType(checker.getTypeAtLocation(toTs(node)));
      if (!checker.isTupleType(type) || checker.getPropertyOfType(type, "push") === undefined) {
        return undefined;
      }
      return checker
        .getPropertiesOfType(type)
        .filter((property) => /^\d+$/u.test(property.getName()))
        .map((property) => checker.getTypeOfSymbol(property));
    };

    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
          return;
        }
        const method = propertyName(node.callee);
        if (method === undefined) {
          return;
        }
        const elements = tupleElements(node.callee.object);
        if (elements === undefined) {
          return;
        }
        if (LENGTH_METHODS.has(method)) {
          context.report({ node, messageId: "length", data: { method } });
          return;
        }
        const first = elements[0];
        const mixed = first !== undefined && elements.some((element) => element !== first);
        if (ORDER_METHODS.has(method) && mixed) {
          context.report({ node, messageId: "order", data: { method } });
        }
      },
      AssignmentExpression(node) {
        if (node.left.type === AST_NODE_TYPES.MemberExpression && propertyName(node.left) === "length" && tupleElements(node.left.object) !== undefined) {
          context.report({ node, messageId: "length", data: { method: "length =" } });
        }
      },
    };
  },
};
