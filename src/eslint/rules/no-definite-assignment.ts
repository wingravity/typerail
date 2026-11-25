import type { TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import { docsUrl } from "../../gaps.ts";

type MessageId = "definite";

export const noDefiniteAssignment: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: "problem",
    docs: { description: "Disallow definite assignment assertions (`field!: T`)", url: docsUrl("TR205") },
    messages: {
      definite:
        "[TR205] `!` claims this is assigned before it is read, and nothing checks the claim. Initialize it, or type it as `T | undefined` and check it.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    return {
      "PropertyDefinition[definite=true], VariableDeclarator[definite=true]"(node: TSESTree.PropertyDefinition | TSESTree.VariableDeclarator) {
        context.report({ node, messageId: "definite" });
      },
    };
  },
};
