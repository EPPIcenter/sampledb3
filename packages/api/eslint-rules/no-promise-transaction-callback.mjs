/**
 * Flags a callback passed to `.transaction(...)` whose return type is Promise-like.
 *
 * Drizzle's bun-sqlite `transaction` (and bun:sqlite's own) runs the callback synchronously and
 * commits when it returns, so a callback that returns a Promise commits at its first `await`.
 * Checking the callback's return type catches inline `async` functions, named async functions
 * (`db.transaction(doWrites)`), and sync functions that return a Promise (`tx => helper(tx)`).
 */

/** @param {import('typescript').Type} type */
const constituents = (type) => (type.isUnion() ? type.types : [type])

/**
 * @param {import('typescript').TypeChecker} checker
 * @param {import('typescript').Type} type
 * @param {import('typescript').Node} location
 */
function isThenable(checker, type, location) {
  return constituents(type).some((part) => {
    const then = part.getProperty('then')
    return then != null && checker.getTypeOfSymbolAtLocation(then, location).getCallSignatures().length > 0
  })
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow callbacks that return a Promise in database.transaction(...)' },
    messages: {
      promiseCallback:
        "Drizzle's bun-sqlite transaction commits when the callback returns, so a callback that returns a Promise commits at its first await. Use withWriteTransaction from src/db/write-transaction.ts, or a synchronous callback.",
    },
    schema: [],
  },
  create(context) {
    const services = context.sourceCode.parserServices
    if (!services?.program || !services.esTreeNodeToTSNodeMap) {
      throw new Error('no-promise-transaction-callback needs type information (parserOptions.project).')
    }
    const checker = services.program.getTypeChecker()

    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'transaction'
        ) {
          return
        }
        const callback = node.arguments[0]
        if (!callback || callback.type === 'SpreadElement') return

        const tsNode = services.esTreeNodeToTSNodeMap.get(callback)
        const returnsPromise = constituents(checker.getTypeAtLocation(tsNode)).some((part) =>
          part
            .getCallSignatures()
            .some((signature) => isThenable(checker, checker.getReturnTypeOfSignature(signature), tsNode)),
        )
        if (returnsPromise) context.report({ node: callback, messageId: 'promiseCallback' })
      },
    }
  },
}
