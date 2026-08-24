/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { collapsibleOpenStateMapping as baseMapping } from '../../collapsible/collapsibleOpenStateMapping';
import type { AccordionItemState } from './AccordionItem';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { AccordionItemDataAttributes } from './AccordionItemDataAttributes';

export const accordionStateAttributesMapping: StateAttributesMapping<AccordionItemState> = {
  ...baseMapping,
  index: (value) => {
    return Number.isInteger(value) ? { [AccordionItemDataAttributes.index]: String(value) } : null;
  },
  ...transitionStatusMapping,
  value: () => null,
};
