declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string | ':memory:')
    exec(sql: string): void
    prepare(sql: string): Statement
    query(sql: string): Statement
    close(): void
    run(sql: string, ...params: any[]): void
    serialize(): Uint8Array
    loadExtension(path: string): void
    inTransaction(): boolean
    transaction<T>(fn: () => T): T
  }

  export interface Statement {
    get(...params: any[]): any
    all(...params: any[]): any[]
    run(...params: any[]): { changes: number; lastInsertRowid: number }
  }
}

