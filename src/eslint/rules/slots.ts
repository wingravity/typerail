import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";

export interface TypedContext {
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
  readonly toTs: (node: TSESTree.Node) => ts.Node;
}

export function typedContext(context: { readonly sourceCode: Readonly<TSESLint.SourceCode> }): TypedContext | undefined {
  const services = context.sourceCode.parserServices;
  const program = services?.program;
  const nodeMap = services?.esTreeNodeToTSNodeMap;
  if (program === undefined || program === null || nodeMap === undefined) {
    return undefined;
  }
  return { checker: program.getTypeChecker(), program, toTs: (node) => nodeMap.get(node) };
}

export function sharedValues(expression: TSESTree.Expression): TSESTree.Expression[] {
  if (expression.type === AST_NODE_TYPES.Identifier || expression.type === AST_NODE_TYPES.MemberExpression) {
    return [expression];
  }
  if (expression.type === AST_NODE_TYPES.ChainExpression) {
    return [expression.expression];
  }
  if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
    return [...sharedValues(expression.consequent), ...sharedValues(expression.alternate)];
  }
  if (expression.type === AST_NODE_TYPES.LogicalExpression) {
    return [...sharedValues(expression.left), ...sharedValues(expression.right)];
  }
  return [];
}

export interface Widening {
  readonly node: TSESTree.Expression;
  readonly source: ts.Type;
  readonly targets: readonly ts.Type[];
}

export function wideningListeners(
  typed: TypedContext,
  onWidening: (widening: Widening) => void,
  options: { readonly includeFresh?: boolean } = {},
): TSESLint.RuleListener {
  const { checker, toTs } = typed;

  const check = (slot: TSESTree.Expression | null | undefined): void => {
    if (slot === null || slot === undefined) {
      return;
    }
    const tsSlot = toTs(slot);
    const contextual = ts.isExpression(tsSlot) ? checker.getContextualType(tsSlot) : undefined;
    if (contextual === undefined) {
      return;
    }
    const targets = contextual.isUnion() ? contextual.types : [contextual];
    const nodes = options.includeFresh === true ? [slot] : sharedValues(slot);
    for (const node of nodes) {
      const source = checker.getNonNullableType(checker.getTypeAtLocation(toTs(node)));
      onWidening({ node, source, targets });
    }
  };

  return {
    VariableDeclarator(node) {
      check(node.init);
    },
    AssignmentExpression(node) {
      check(node.right);
    },
    "CallExpression, NewExpression"(node: TSESTree.CallExpression | TSESTree.NewExpression) {
      for (const argument of node.arguments) {
        if (argument.type !== AST_NODE_TYPES.SpreadElement) {
          check(argument);
        }
      }
    },
    ReturnStatement(node) {
      check(node.argument);
    },
    "ArrowFunctionExpression[expression=true]"(node: TSESTree.ArrowFunctionExpression) {
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        check(node.body);
      }
    },
    Property(node) {
      if (node.parent.type === AST_NODE_TYPES.ObjectExpression && node.value.type !== AST_NODE_TYPES.AssignmentPattern) {
        const { value } = node;
        if (
          value.type !== AST_NODE_TYPES.ArrayPattern &&
          value.type !== AST_NODE_TYPES.ObjectPattern &&
          value.type !== AST_NODE_TYPES.TSEmptyBodyFunctionExpression
        ) {
          check(value);
        }
      }
    },
    ArrayExpression(node) {
      for (const element of node.elements) {
        if (element !== null && element.type !== AST_NODE_TYPES.SpreadElement) {
          check(element);
        }
      }
    },
  };
}

export function isArrayLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

export function isObjectType(type: ts.Type): boolean {
  return (type.getFlags() & ts.TypeFlags.Object) !== 0 || type.isIntersection();
}

export function isFromLibrary(program: ts.Program, declaration: ts.Node | undefined): boolean {
  if (declaration === undefined) {
    return false;
  }
  const file = declaration.getSourceFile();
  return program.isSourceFileDefaultLibrary(file) || program.isSourceFileFromExternalLibrary(file) || file.fileName.includes("/node_modules/");
}

export function isFromDefaultLibrary(program: ts.Program, symbol: ts.Symbol | undefined): boolean {
  const declarations = symbol?.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
}
