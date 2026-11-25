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
  readonly fresh: boolean;
}

export function wideningListeners(
  typed: TypedContext,
  onWidening: (widening: Widening) => void,
  options: { readonly includeFresh?: boolean } = {},
): TSESLint.RuleListener {
  const { checker, program, toTs } = typed;

  const passedToLibrary = (slot: TSESTree.Expression): boolean => {
    let node: TSESTree.Node = slot;
    for (let depth = 0; depth < 20; depth++) {
      const parent: TSESTree.Node = node.parent;
      if ((parent.type === AST_NODE_TYPES.CallExpression || parent.type === AST_NODE_TYPES.NewExpression) && node !== parent.callee) {
        const call = toTs(parent);
        const signature = ts.isCallExpression(call) || ts.isNewExpression(call) ? checker.getResolvedSignature(call) : undefined;
        return isFromExternalLibrary(program, signature?.getDeclaration());
      }
      if (
        parent.type !== AST_NODE_TYPES.Property &&
        parent.type !== AST_NODE_TYPES.ObjectExpression &&
        parent.type !== AST_NODE_TYPES.ArrayExpression &&
        parent.type !== AST_NODE_TYPES.ConditionalExpression &&
        parent.type !== AST_NODE_TYPES.LogicalExpression
      ) {
        return false;
      }
      node = parent;
    }
    return false;
  };

  const check = (slot: TSESTree.Expression | null | undefined): void => {
    if (slot === null || slot === undefined || passedToLibrary(slot)) {
      return;
    }
    const tsSlot = toTs(slot);
    const contextual = ts.isExpression(tsSlot) ? checker.getContextualType(tsSlot) : undefined;
    if (contextual === undefined) {
      return;
    }
    const targets = contextual.isUnion() ? contextual.types : [contextual];
    const shared = sharedValues(slot);
    const fresh = shared.length === 0;
    const nodes = options.includeFresh === true && fresh ? [slot] : shared;
    for (const node of nodes) {
      const source = checker.getNonNullableType(checker.getTypeAtLocation(toTs(node)));
      onWidening({ node, source, targets, fresh });
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

export function isFromExternalLibrary(program: ts.Program, declaration: ts.Node | undefined): boolean {
  if (declaration === undefined) {
    return false;
  }
  const file = declaration.getSourceFile();
  if (program.isSourceFileDefaultLibrary(file)) {
    return false;
  }
  return program.isSourceFileFromExternalLibrary(file) || file.fileName.includes("/node_modules/");
}

export function isTopLike(type: ts.Type): boolean {
  if ((type.getFlags() & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive)) !== 0) {
    return true;
  }
  return (
    (type.getFlags() & ts.TypeFlags.Object) !== 0 &&
    type.getProperties().length === 0 &&
    type.getCallSignatures().length === 0 &&
    type.getConstructSignatures().length === 0 &&
    type.getStringIndexType() === undefined &&
    type.getNumberIndexType() === undefined
  );
}

export function isExternalLibraryType(program: ts.Program, type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return (symbol?.getDeclarations() ?? []).some((declaration) => isFromExternalLibrary(program, declaration));
}

export function isFromDefaultLibrary(program: ts.Program, symbol: ts.Symbol | undefined): boolean {
  const declarations = symbol?.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
}
