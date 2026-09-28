/**
 * Type-level pins for the command record.
 *
 * Typechecked by vitest (`typecheck` in vitest.node.config.ts), never
 * executed. Every `@ts-expect-error` is a tripwire: if the marked line stops
 * being a type error, the suite fails.
 */
import { expectTypeOf } from 'vitest';

import type { CommandContext, CommandSpec, ExecuteResult } from './commands';

interface SheetCtx extends CommandContext {
  readonly rows: number;
}

// A disabled state always carries a reason. There is no bare `false`.
const bareFalse: CommandSpec = {
  id: 'x',
  title: 'X',
  // @ts-expect-error — enabled returns true or { reason }, never false.
  enabled: () => false,
  run: () => {}
};

const withReason: CommandSpec<SheetCtx> = {
  id: 'rows.delete',
  title: (ctx) => `Delete ${ctx.rows} rows`,
  enabled: (ctx) => (ctx.rows > 0 ? true : { reason: 'Select a row first' }),
  run: () => {}
};

// Argument fields follow the argument's type.
const numberArg: CommandSpec<SheetCtx, { count: number }> = {
  id: 'rows.insert',
  title: 'Insert rows',
  args: { count: { kind: 'number', label: 'Count', min: 1 } },
  run: (_ctx, args) => {
    expectTypeOf(args.count).toEqualTypeOf<number>();
  }
};

const wrongField: CommandSpec<SheetCtx, { count: number }> = {
  id: 'rows.insert',
  title: 'Insert rows',
  // @ts-expect-error — a number argument cannot use a text field.
  args: { count: { kind: 'text', label: 'Count' } },
  run: () => {}
};

// A disabled result always names its reason.
expectTypeOf<Extract<ExecuteResult, { why: 'disabled' }>>().toHaveProperty('reason').toEqualTypeOf<string>();

// Referenced so the fixtures above are not unused locals.
void [bareFalse, withReason, numberArg, wrongField];
