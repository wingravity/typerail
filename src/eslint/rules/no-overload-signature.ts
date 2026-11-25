import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import { docsUrl } from "../../gaps.ts";

type MessageId = "overload";

export const noOverloadSignature: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: { description: "Disallow overload signatures on functions and methods that have an implementation", url: docsUrl("TR207") },
    messages: {
      overload:
        "[TR207] Overload signatures are checked only loosely against the implementation, so this one can promise a result the implementation never returns. Use one signature with a union or conditional return type, or separate functions.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    if (context.filename.endsWith(".d.ts")) {
      return {};
    }
    const isAmbient = (node: TSESTree.Node): boolean =>
      [node, ...context.sourceCode.getAncestors(node)].some((ancestor) => "declare" in ancestor && ancestor.declare);
    return {
      TSDeclareFunction(node) {
        if (!isAmbient(node)) {
          context.report({ node, messageId: "overload" });
        }
      },
      MethodDefinition(node) {
        if (node.value.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression && !node.override && !isAmbient(node)) {
          context.report({ node, messageId: "overload" });
        }
      },
    };
  },
};
