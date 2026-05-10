// RPC helper that bypasses strict Supabase generics.
// Reason: supabase-js v2's RPC argument generic depends on the full
// schema shape (with `Relationships`, `SetofOptions`, etc.) that our
// condensed `Database` type doesn't expose. The actual runtime call
// is identical; we just relax the types here.

type RpcArgs = Record<string, unknown> | undefined;

type RpcResult<T> = Promise<{
  data: T | null;
  error: { code?: string; message: string } | null;
}>;

type RpcRunner = {
  rpc: (fn: string, args?: RpcArgs) => RpcResult<unknown>;
};

export function rpc<T = unknown>(
  client: unknown,
  fn: string,
  args?: RpcArgs,
): RpcResult<T> {
  return (client as RpcRunner).rpc(fn, args) as RpcResult<T>;
}
