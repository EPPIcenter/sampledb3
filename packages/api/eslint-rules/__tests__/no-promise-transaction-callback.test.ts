import { describe, it } from 'vitest'
import { join } from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import rule from '../no-promise-transaction-callback.mjs'

RuleTester.describe = describe
RuleTester.it = it

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    // With CI=true, typescript-eslint builds one program from the files on disk, so every case
    // would be type-checked as the placeholder fixtures/file.ts instead of its own code.
    parserOptions: { project: './tsconfig.json', tsconfigRootDir: fixtures, disallowAutomaticSingleRunInference: true },
  },
})

/** Drizzle's bun-sqlite shape: the callback runs synchronously and its result is returned. */
const database = `
  type Tx = { insert(value: number): void }
  declare const db: { transaction<T>(fn: (tx: Tx) => T): T }
  declare function helper(tx: Tx): Promise<void>
  declare function syncHelper(tx: Tx): number
`
const filename = join(fixtures, 'file.ts')
const invalid = (code: string) => ({ code: database + code, filename, errors: [{ messageId: 'promiseCallback' }] })

ruleTester.run('no-promise-transaction-callback', rule, {
  valid: [
    { code: `${database} db.transaction((tx) => { tx.insert(1) })`, filename },
    { code: `${database} db.transaction(syncHelper)`, filename },
    { code: `${database} function doWrites(tx: Tx) { tx.insert(1); return 1 } db.transaction(doWrites)`, filename },
    { code: `${database} declare const other: { run(fn: () => Promise<void>): void }; other.run(async () => {})`, filename },
  ],
  invalid: [
    invalid(`db.transaction(async (tx) => { tx.insert(1) })`),
    invalid(`db.transaction(async function (tx) { tx.insert(1) })`),
    invalid(`async function doWrites(tx: Tx) { tx.insert(1) } db.transaction(doWrites)`),
    invalid(`db.transaction((tx) => helper(tx))`),
    invalid(`db.transaction(helper)`),
    invalid(`declare const maybe: (tx: Tx) => Promise<void> | void; db.transaction(maybe)`),
  ],
})
