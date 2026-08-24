/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor, type JSX } from 'solid-js';

interface GroupCollectionContextValue {
  items: Accessor<readonly any[]>;
}

const GroupCollectionContext = createContext<GroupCollectionContextValue | null>(null);

export function useGroupCollectionContext(): GroupCollectionContextValue | null {
  return useContext(GroupCollectionContext);
}

/**
 * Solid port of upstream's `GroupCollectionContext.tsx`'s `GroupCollectionProvider`.
 */
export function GroupCollectionProvider(props: {
  children?: JSX.Element;
  items: Accessor<readonly any[]>;
}): JSX.Element {
  return (
    <GroupCollectionContext.Provider value={{ items: props.items }}>
      {props.children}
    </GroupCollectionContext.Provider>
  );
}
