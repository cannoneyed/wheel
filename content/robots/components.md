# Components

Human page: [Components](../docs/components.mdx). API: [`wheel/core`](api/core.md).

## Connection contract

```tsx
const connectIssueRow = connect(
  (props: { issueId: string }) => `IssueRow:${props.issueId}`,
  (context, props) => {
    const issues = context.service(IssueService);
    return view({ vm: () => issues.issueVm(props.issueId) }, { open: issues.open });
  },
);

export function IssueRow(props: { issueId: string }) {
  const state = connectIssueRow(props);
  return <article use:componentRoot>{state.vm.title}</article>;
}
```

- One `connect()` declaration per component file.
- Call the generated connection as the component's first statement.
- Pass component props to the connection.
- Resolve services only in the declaration callback.
- Return values and bound actions, never a service instance.

## Deferred reads

`view()` expects accessors in its reads object. Passing `service.count` or `() => service.byId(id)` preserves tracking. Calling `service.count()` in the declaration captures one value.

## Props boundary

Use props for domain identity and presentation variation. Self-connecting children resolve their own shared data. Reusable leaf components can accept display data directly.

Display-ready multi-table view models belong in service `computedFor` fields. Components receive the id and connect the keyed view themselves.

## Root registration

- Connected host roots use `use:componentRoot`.
- Non-connected host roots use `use:viewRoot`.
- View components with props pass them in the directive object.
- Headless components use an explicit lint pragma with a reason.

## Local state

Use `useSignal(initial, name)` inside components. The signal registers against the mounted instance. Shared state moves to a service.

## Testing levels

1. `stubOf(connection, shape)` plus `StubProvider` for one component.
2. `fakeService()` or explicit service overrides for a subtree.
3. A real engine and client for sync behavior.

## Relevant enforced rules

`single-connect`, `single-connect-per-file`, `connect-only`, `no-whole-service-injection`, `max-connect-surface`, `no-called-view-read`, `require-component-root`, `require-view-root`, `require-stable-instance-name`, `require-use-signal`, `require-connect-props`, `require-view-props`, and `require-component-states`.

Primary sources:

- [`connect.tsx`](../../packages/wheel/src/core/connect.tsx)
- [`view.ts`](../../packages/wheel/src/core/view.ts)
- [`states.tsx`](../../packages/wheel/src/core/states.tsx)
