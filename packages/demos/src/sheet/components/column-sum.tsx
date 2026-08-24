/**
 * One footer cell: the live sum of a column's numeric cells, via the
 * computed-with-args LRU (one memo per column).
 */
import { componentRoot, connect, view } from 'wheel/core';

import { SheetService } from '../services/sheet-service';
import styles from './sheet.module.css';

const connectColumnSum = connect('ColumnSum', (c, props: { col: number }) => {
  const sheetService = c.service(SheetService);
  return view({
    sum: () => sheetService.columnSum(props.col)
  });
});

/** The Σ-row cell for one column. */
export function ColumnSum(props: { col: number }) {
  const state = connectColumnSum(props);
  return <td use:componentRoot class={styles.sumCell}>{Math.round(state.sum * 100) / 100}</td>;
}
