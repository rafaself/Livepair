declare module 'better-sqlite3' {
  export type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export interface Statement<Result = unknown> {
    all(...params: unknown[]): Result[];
    get(...params: unknown[]): Result | undefined;
    run(...params: unknown[]): RunResult;
  }

  export interface Database {
    close(): void;
    exec(source: string): this;
    pragma(name: string, options?: { simple?: boolean }): unknown;
    prepare<Result = unknown>(source: string): Statement<Result>;
    transaction<Fn extends (...args: never[]) => unknown>(fn: Fn): Fn;
  }

  interface DatabaseConstructor {
    new (filename: string): Database;
    prototype: Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
