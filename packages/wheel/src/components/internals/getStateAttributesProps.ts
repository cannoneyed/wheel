/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export type StateAttributesMapping<State> = {
  [Property in keyof State]?: (state: State[Property]) => Record<string, string> | null;
};

/**
 * Converts a component's state object into `data-*` attribute props.
 * Truthy booleans become empty-valued attributes (`data-checked=""`),
 * other truthy values are stringified, and falsy values emit nothing.
 */
export function getStateAttributesProps<State extends Record<string, any>>(
  state: State,
  customMapping?: StateAttributesMapping<State>,
) {
  const props: Record<string, string> = {};

  for (const key in state) {
    const value = state[key];

    if (customMapping?.hasOwnProperty(key)) {
      const customProps = customMapping[key]!(value);
      if (customProps != null) {
        Object.assign(props, customProps);
      }

      continue;
    }

    if (value === true) {
      props[`data-${key.toLowerCase()}`] = '';
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = value.toString();
    }
  }

  return props;
}
