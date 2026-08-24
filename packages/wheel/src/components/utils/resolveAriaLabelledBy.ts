/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export function getDefaultLabelId(id: string | null | undefined) {
  return id == null ? undefined : `${id}-label`;
}

export function resolveAriaLabelledBy(
  fieldLabelId: string | undefined,
  localLabelId: string | undefined,
) {
  return fieldLabelId ?? localLabelId;
}
