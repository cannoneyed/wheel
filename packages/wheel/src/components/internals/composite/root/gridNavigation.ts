/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import {
  createGridCellMap,
  getGridCellIndexOfCorner,
  getGridCellIndices,
  getGridNavigatedIndex,
  isListIndexDisabled,
} from '../../../floating-ui-solid/utils/composite';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT } from '../../../floating-ui-solid/utils/constants';

type CompositeGridOnLoop = (event: KeyboardEvent, prevIndex: number, nextIndex: number) => number;

export interface CompositeGridItemSize {
  width: number;
  height: number;
}

export interface CompositeGridConfig {
  cols: number;
  dense?: boolean | undefined;
  itemSizes?: CompositeGridItemSize[] | undefined;
}

export interface CompositeGridNavigationState {
  event: KeyboardEvent;
  elements: Array<HTMLElement | null>;
  highlightedIndex: number;
  minIndex: number;
  maxIndex: number;
  orientation: 'horizontal' | 'vertical' | 'both';
  loopFocus: boolean;
  onLoop?: CompositeGridOnLoop | undefined;
  disabledIndices?: number[] | undefined;
  rtl: boolean;
}

export type CompositeGridNavigator = (state: CompositeGridNavigationState) => number;

/**
 * Builds the grid navigation handler passed to `CompositeRoot`/`createCompositeRoot`
 * via the `grid` prop. Importing and calling this is the opt-in for grid
 * navigation.
 *
 * Solid port of upstream's `gridNavigation`. The underlying cell-mapping
 * algorithm (`createGridCellMap`/`getGridNavigatedIndex`/etc.) is shared with
 * `useListNavigation`'s own grid mode via the canonical
 * `floating-ui-solid/utils/composite.ts` module (see that file's doc comment)
 * rather than duplicated here.
 */
export function gridNavigation(config: CompositeGridConfig): CompositeGridNavigator {
  const { cols, dense = false, itemSizes } = config;

  return (state) => {
    const {
      disabledIndices,
      elements,
      event,
      highlightedIndex,
      loopFocus,
      maxIndex,
      minIndex,
      onLoop,
      orientation,
      rtl,
    } = state;

    const sizes =
      itemSizes ||
      Array.from({ length: elements.length }, () => ({
        width: 1,
        height: 1,
      }));
    // Work in hypothetical 1x1 cell indices, then convert back to item indices.
    const cellMap = createGridCellMap(sizes, cols, dense);
    const minGridIndex = cellMap.findIndex(
      (index) => index != null && !isListIndexDisabled(elements, index, disabledIndices),
    );
    const maxGridIndex = cellMap.reduce(
      (foundIndex: number, index, cellIndex) =>
        index != null && !isListIndexDisabled(elements, index, disabledIndices)
          ? cellIndex
          : foundIndex,
      -1,
    );
    const cellIndex = getGridNavigatedIndex(
      cellMap.map((itemIndex) => (itemIndex != null ? elements[itemIndex] : null)),
      {
        event,
        orientation,
        loopFocus,
        onLoop,
        cols,
        // Treat undefined gaps as disabled so navigation cannot land in them.
        disabledIndices: getGridCellIndices(
          [
            ...(disabledIndices ||
              elements.map((_, index) => (isListIndexDisabled(elements, index) ? index : undefined))),
            undefined,
          ],
          cellMap,
        ),
        minIndex: minGridIndex,
        maxIndex: maxGridIndex,
        prevIndex: getGridCellIndexOfCorner(
          highlightedIndex > maxIndex ? minIndex : highlightedIndex,
          sizes,
          cellMap,
          cols,
          // Choose the corner closest to the movement direction so spanning items
          // do not immediately resolve back to themselves.
          event.key === ARROW_DOWN
            ? 'bl'
            : event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)
              ? 'tr'
              : 'tl',
        ),
        rtl,
      },
    );

    // Navigated cell will never be nullish.
    return cellMap[cellIndex] as number;
  };
}

