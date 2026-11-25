import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import { docsUrl } from "../../gaps.ts";

type MessageId = "predicate" | "assertion";

type FunctionWithBody = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

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
    const check = (node: FunctionWithBody): void => {
      const annotation = node.returnType?.typeAnnotation;
      if (annotation?.type !== AST_NODE_TYPES.TSTypePredicate) {
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
