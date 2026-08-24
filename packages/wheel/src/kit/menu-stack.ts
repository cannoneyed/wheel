/**
 * The menu stack — one headless model for every menu that has submenus.
 *
 * A menu is a STACK of levels, not a tree of popups. Choosing a group
 * PUSHES its level onto the stack, and the same panel redraws in place with
 * a back control beside the new title. Nothing flies out sideways, so the
 * panel never leaves the screen and never fights the pointer.
 *
 * The model is pure: no DOM, no focus, no Solid. It owns which levels are
 * open, the query, and the highlight. A renderer draws it — `MenuStackPanel`
 * in the portal for a context menu, and an inline panel at the caret for an
 * editor's `/` menu. Both get the same keys and the same shape because both
 * call `handleKey` here.
 *
 * A query searches the LEAVES of every level, not the level on screen.
 * Grouping the headings behind one entry must not make `/h1` slower than it
 * was when the list was flat.
 */

/** A menu entry that runs an action. */
export interface MenuAction {
  readonly id: string;
  readonly label: string;
  /** Runs the entry. The renderer closes the menu after it returns. */
  readonly run: () => void;
  /**
   * A toggle draws a check and stays open when chosen. Absent means the
   * entry is an ordinary command.
   */
  readonly checked?: boolean;
  /** Extra words the query matches, beyond the label. */
  readonly keywords?: readonly string[];
  /**
   * The entry is visible but cannot run. `choose` refuses it and the panel
   * draws it dim.
   *
   * Hiding an entry that does not apply RIGHT NOW teaches nothing: the user
   * looks for it, does not find it, and cannot tell whether the feature
   * exists. A dim entry with `disabledReason` says what is missing.
   */
  readonly disabled?: boolean;
  /** Why the entry cannot run. The panel draws it beside the label. */
  readonly disabledReason?: string;
  readonly submenu?: never;
}

/** A menu entry that opens a submenu. */
export interface MenuGroup {
  readonly id: string;
  readonly label: string;
  /** The level this entry pushes. */
  readonly submenu: MenuLevel;
  readonly keywords?: readonly string[];
  /** The group is visible but cannot open. See `MenuAction.disabled`. */
  readonly disabled?: boolean;
  /** Why the group cannot open. The panel draws it beside the label. */
  readonly disabledReason?: string;
  readonly run?: never;
  readonly checked?: never;
}

/** One entry: it RUNS, or it PUSHES. */
export type MenuItem = MenuAction | MenuGroup;

/**
 * A size picker: a grid of empty squares the pointer sweeps to choose a
 * count. Word, Google Docs, and Notion all insert a table this way, and it
 * beats two number fields because the shape is the answer.
 */
export interface MenuGrid {
  /** How many squares tall the grid draws. */
  readonly rows: number;
  /** How many squares wide the grid draws. */
  readonly columns: number;
  /** Chooses a size. The renderer closes the menu after it returns. */
  readonly choose: (rows: number, columns: number) => void;
}

/**
 * A level that asks for a value: a link's address, a new name. The field
 * takes the focus and the keys, so the items below it stay reachable with
 * the pointer but stop answering the arrows.
 */
export interface MenuInput {
  readonly placeholder?: string;
  /** What the field holds when the level opens. */
  readonly initial: () => string;
  /** Accepts the value. The renderer closes the menu after it returns. */
  readonly submit: (value: string) => void;
}

/** One level of the stack: what it is called, and what it holds. */
export interface MenuLevel {
  /** The title the back header shows. The root's title may be empty. */
  readonly title: string;
  readonly items: readonly MenuItem[];
  /** A size picker above the items. Only the table level uses one today. */
  readonly grid?: MenuGrid;
  /** A value field above the items. The link pane uses one. */
  readonly input?: MenuInput;
}

/** Where the highlight sits inside a level's grid. */
export interface GridPoint {
  /** A 1-based count, so it reads as "3 rows". Zero means no highlight. */
  readonly rows: number;
  /** A 1-based count. Zero means no highlight. */
  readonly columns: number;
}

/** Everything a renderer needs to draw the menu. */
export interface MenuStackState {
  /** The levels, root first. The LAST one is on screen. */
  readonly stack: readonly MenuLevel[];
  /** The typed filter. Empty means "show the level I stand on". */
  readonly query: string;
  /** The highlighted entry's index into `items`. */
  readonly index: number;
  /**
   * The entries to draw. With a query this is the flattened match list
   * across every level; without one it is the current level's own items.
   */
  readonly items: readonly MenuItem[];
  /** The title beside the back control, or null at the root. */
  readonly title: string | null;
  /** The grid to draw, or null. A query hides it — a filter is a list. */
  readonly grid: MenuGrid | null;
  /** The grid's highlight. Zero by zero means nothing is highlighted. */
  readonly gridPoint: GridPoint;
  /** The value field to draw, or null. A query hides it, like the grid. */
  readonly input: MenuInput | null;
}

/** The headless stack (see module doc). */
export interface MenuStack {
  /** The state a renderer draws. */
  state(): MenuStackState;
  /** Replace the query. Clearing it returns to the level you stand on. */
  setQuery(query: string): void;
  /** Move the highlight by `delta`, wrapping at both ends. */
  move(delta: number): void;
  /** Highlight `index` — what a pointer hover calls. */
  highlight(index: number): void;
  /** Highlight a grid size — what a pointer hover over a square calls. */
  highlightGrid(point: GridPoint): void;
  /** Push a submenu level. */
  push(level: MenuLevel): void;
  /** Pop one level. Returns false at the root, where there is nothing to pop. */
  pop(): boolean;
  /**
   * Choose an entry: a group pushes, an action runs. Returns 'pushed',
   * 'ran', 'toggled' (an action that stays open), or null when nothing is
   * highlighted. The renderer closes on 'ran'.
   */
  choose(item?: MenuItem): 'pushed' | 'ran' | 'toggled' | null;
  /** Choose the highlighted grid size. Returns whether one was chosen. */
  chooseGrid(): boolean;
  /**
   * Apply one key. Returns whether the menu consumed it.
   *
   * Up and down move. Enter and Tab choose. Backspace and Left pop, but
   * ONLY when the query is empty — inside a query, Backspace edits the
   * query, because a key that both deletes text and navigates is a key you
   * cannot trust.
   */
  handleKey(key: string): boolean;
  /** Reset to the root level with no query. */
  reset(): void;
}

/** Whether an entry's label or keywords hold `query`, case-insensitive. */
function matches(item: MenuItem, query: string): boolean {
  const needle = query.toLowerCase();
  if (item.label.toLowerCase().includes(needle)) {
    return true;
  }
  return (item.keywords ?? []).some((word) => word.toLowerCase().includes(needle));
}

/**
 * Every ACTION in the tree, depth first, with the groups dropped.
 *
 * A filtered list holds leaves only. Offering "Heading" beside "Heading 1"
 * would make the user choose twice for one outcome.
 *
 * A level that carries a grid or an input is a WIDGET, and the search does
 * not enter it. Its items configure that widget — "Header row" belongs to
 * the size picker, not to the catalogue, and reaching that setting from a
 * filter would flip it for a picker the user is not looking at. The GROUP
 * stands in for it instead, so `/table` still finds the picker in one step.
 */
export function flattenLeaves(level: MenuLevel): MenuItem[] {
  const leaves: MenuItem[] = [];
  for (const item of level.items) {
    if (item.submenu) {
      if (item.submenu.grid || item.submenu.input) {
        leaves.push(item); // the widget itself is the destination
      } else {
        leaves.push(...flattenLeaves(item.submenu));
      }
      continue;
    }
    leaves.push(item);
  }
  return leaves;
}

/** Entries matching `query` across the WHOLE tree, or the level's own. */
export function menuMatches(root: MenuLevel, current: MenuLevel, query: string): MenuItem[] {
  if (query === '') {
    return [...current.items];
  }
  return flattenLeaves(root).filter((item) => matches(item, query));
}

/** Build a stack over `root`. `onChange` fires after every state change. */
export function createMenuStack(root: MenuLevel, onChange?: () => void): MenuStack {
  let stack: MenuLevel[] = [root];
  let query = '';
  let index = 0;
  let gridPoint: GridPoint = { rows: 0, columns: 0 };

  const current = () => stack[stack.length - 1]!;
  const items = () => menuMatches(root, current(), query);
  // A query turns the panel into a flat result list, so the grid goes with
  // the level it belonged to — a size picker cannot answer a text filter.
  const grid = () => (query === '' ? (current().grid ?? null) : null);
  const input = () => (query === '' ? (current().input ?? null) : null);

  const changed = () => onChange?.();

  const state = (): MenuStackState => {
    const list = items();
    return {
      stack: [...stack],
      query,
      index,
      items: list,
      // The root's own title never shows: there is nothing to go back to.
      title: stack.length > 1 ? current().title : null,
      grid: grid(),
      gridPoint,
      input: input()
    };
  };

  const clampIndex = () => {
    const count = items().length;
    index = count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
  };

  const pop = (): boolean => {
    if (stack.length <= 1) {
      return false;
    }
    stack = stack.slice(0, -1);
    index = 0;
    gridPoint = { rows: 0, columns: 0 };
    changed();
    return true;
  };

  const choose = (item?: MenuItem): 'pushed' | 'ran' | 'toggled' | null => {
    const target = item ?? items()[index];
    if (!target) {
      return null;
    }
    // A disabled entry refuses every door: the click, the Enter key, and a
    // caller that passes the item by hand.
    if (target.disabled === true) {
      return null;
    }
    if (target.submenu) {
      stack = [...stack, target.submenu];
      // A push clears the query: the submenu you asked for must show its
      // own items, not the filtered list that led you to it.
      query = '';
      index = 0;
      gridPoint = { rows: 0, columns: 0 };
      changed();
      return 'pushed';
    }
    target.run();
    // A toggle redraws in place; the renderer leaves it open.
    if (target.checked !== undefined) {
      changed();
      return 'toggled';
    }
    return 'ran';
  };

  return {
    state,
    setQuery: (next) => {
      query = next;
      // CLAMP, do not reset: narrowing "head" to "headi" keeps the same
      // three headings, and moving the highlight back to the top under the
      // user's fingers is the kind of jump that loses a keystroke.
      clampIndex();
      changed();
    },
    move: (delta) => {
      const count = items().length;
      if (count === 0) {
        return;
      }
      index = (index + delta + count) % count;
      changed();
    },
    highlight: (next) => {
      index = next;
      clampIndex();
      changed();
    },
    highlightGrid: (point) => {
      gridPoint = point;
      changed();
    },
    push: (level) => {
      stack = [...stack, level];
      query = '';
      index = 0;
      gridPoint = { rows: 0, columns: 0 };
      changed();
    },
    pop,
    choose,
    chooseGrid: () => {
      const size = grid();
      if (!size || gridPoint.rows < 1 || gridPoint.columns < 1) {
        return false;
      }
      size.choose(gridPoint.rows, gridPoint.columns);
      return true;
    },
    handleKey: (key) => {
      const size = grid();
      // A level with a grid steers the grid with the arrows: the squares
      // ARE the choice there, and the items below it are its options.
      if (size && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
        const rows = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
        const columns = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
        // Left at one column pops the level instead of stalling at the edge.
        if (columns === -1 && gridPoint.columns <= 1 && gridPoint.rows <= 1) {
          return pop();
        }
        gridPoint = {
          rows: Math.min(Math.max(gridPoint.rows + rows, 1), size.rows),
          columns: Math.min(Math.max(gridPoint.columns + columns, 1), size.columns)
        };
        changed();
        return true;
      }
      if (key === 'ArrowDown') {
        const count = items().length;
        if (count > 0) {
          index = (index + 1) % count;
          changed();
        }
        return true;
      }
      if (key === 'ArrowUp') {
        const count = items().length;
        if (count > 0) {
          index = (index - 1 + count) % count;
          changed();
        }
        return true;
      }
      if (key === 'ArrowLeft' && query === '') {
        return pop();
      }
      if (key === 'Backspace' && query === '') {
        return pop();
      }
      return false;
    },
    reset: () => {
      stack = [root];
      query = '';
      index = 0;
      gridPoint = { rows: 0, columns: 0 };
      changed();
    }
  };
}
