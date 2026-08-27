/**
 * `note.md` is the file an agent reads first, so its rendering is the part
 * that gets the most tests: ids stay sortable and readable, the timeline
 * survives values that would break a markdown table, and nothing in the
 * markdown claims something the payload does not say.
 */
import { describe, expect, it } from 'vitest';

import { describeEvent, noteId, renderNoteMarkdown, slugify } from './note-format';
import type { NotePayload, RecordedEvent } from './types';

function payload(overrides: Partial<NotePayload> = {}): NotePayload {
  return {
    id: '1755974400123-cell-clears',
    at: 1_755_974_400_123,
    text: 'Clicking a cell clears the selection',
    voice: null,
    label: 'bug',
    anchor: {
      rect: { x: 412, y: 84, width: 40, height: 40 },
      instanceId: 'BoardCell:3-7',
      name: 'BoardCell',
      ancestors: ['Board', 'BoardRow'],
      domPath: 'div > button:nth-of-type(3)',
      element: 'button',
      text: null
    },
    target: null,
    nearby: [],
    environment: {
      url: 'http://localhost:5173/board/42',
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      userAgent: 'test-agent',
      sync: null
    },
    startedAt: 1_755_974_400_123,
    endedAt: 1_755_974_400_123,
    timeline: [],
    startState: {},
    attachments: [],
    ...overrides
  };
}

describe('slugify', () => {
  it('makes a short, file-safe, readable slug', () => {
    expect(slugify('Clicking a Cell CLEARS the selection!')).toBe('clicking-a-cell-clears-the-selection');
  });

  it('never returns an empty name', () => {
    expect(slugify('***')).toBe('note');
    expect(slugify('')).toBe('note');
  });
});

describe('noteId', () => {
  it('sorts chronologically and still reads', () => {
    expect(noteId(1_700_000_000_000, 'cell clears', 'BoardCell')).toBe('1700000000000-cell-clears');
  });

  it('falls back to the anchor name when there is no text yet', () => {
    expect(noteId(17, '', 'BoardCell')).toBe('17-boardcell');
  });
});

describe('describeEvent', () => {
  it('names the service and action of a call', () => {
    const event: RecordedEvent = {
      at: 1,
      kind: 'action',
      service: 'BoardService',
      action: 'toggleCell',
      args: [{ cellId: '3-7' }],
      durationMs: 2
    };
    expect(describeEvent(event)).toBe('BoardService.toggleCell({"cellId":"3-7"})');
  });

  it('renders a coalesced state change with its count', () => {
    const event: RecordedEvent = {
      at: 1,
      kind: 'state',
      service: 'DragService',
      atom: 'position',
      from: 0,
      to: 400,
      count: 137
    };
    expect(describeEvent(event)).toBe('DragService.position 0 → 400 ×137');
  });

  it('renders a diffed state change key by key', () => {
    const event: RecordedEvent = {
      at: 1,
      kind: 'state',
      service: 'BoardService',
      atom: 'board',
      changed: { selection: { from: null, to: '3-7' } }
    };
    expect(describeEvent(event)).toBe('BoardService.board { selection: — → "3-7" }');
  });

  it('points an input at the component it hit', () => {
    const event: RecordedEvent = {
      at: 1,
      kind: 'input',
      type: 'click',
      instanceId: 'BoardCell:3-7',
      target: 'button.cell',
      detail: { x: 412, y: 90, button: 0 }
    };
    expect(describeEvent(event)).toBe('click → BoardCell:3-7 (x=412 y=90 button=0)');
  });
});

describe('renderNoteMarkdown', () => {
  it('leads with frontmatter an agent can grep', () => {
    const markdown = renderNoteMarkdown(payload());
    expect(markdown.startsWith('---\n')).toBe(true);
    expect(markdown).toContain('label: bug');
    expect(markdown).toContain('instanceId: "BoardCell:3-7"');
  });

  it('says what the note is attached to, including the ancestor chain', () => {
    expect(renderNoteMarkdown(payload())).toContain('`BoardCell:3-7` — inside `Board` › `BoardRow`');
  });

  it('renders the timeline with offsets relative to the start of the recording', () => {
    const markdown = renderNoteMarkdown(
      payload({
        startedAt: 1000,
        endedAt: 1400,
        timeline: [
          { at: 1120, kind: 'input', type: 'click', instanceId: 'BoardCell:3-7', target: 'button', detail: {} },
          { at: 1121, kind: 'action', service: 'BoardService', action: 'toggleCell', args: [], durationMs: 1 }
        ]
      })
    );
    expect(markdown).toContain('recordedMs: 400');
    expect(markdown).toContain('| +120ms | input |');
    expect(markdown).toContain('| +121ms | action | BoardService.toggleCell() |');
  });

  it('escapes pipes so a value cannot break the table', () => {
    const markdown = renderNoteMarkdown(
      payload({ timeline: [{ at: 0, kind: 'route', url: 'http://x/a|b' }] })
    );
    expect(markdown).toContain('http://x/a\\|b');
  });

  it('records the voice transcript as the readable half of a voice note', () => {
    const markdown = renderNoteMarkdown(
      payload({
        text: '',
        voice: { transcript: 'it drops the highlight', hasAudio: true, source: 'speech-recognition' }
      })
    );
    expect(markdown).toContain('> Voice note (transcribed): it drops the highlight');
    expect(markdown).toContain('# it drops the highlight');
  });
});
