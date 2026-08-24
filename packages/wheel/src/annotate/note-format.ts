/**
 * Rendering a note for the reader that matters: the agent.
 *
 * `note.json` is the complete record, but a JSON dump is a bad first read —
 * you have to know its shape before it tells you anything. So every note also
 * ships `note.md`: YAML frontmatter with the facts worth grepping, then the
 * note itself, then the timeline as a table, then the state that produced it.
 *
 * The markdown adds NO information the JSON lacks. It is a projection, so the
 * two can never disagree.
 *
 * Everything here is pure — no clock, no DOM, no fetch — which is why it is
 * the part with the most tests.
 */
import type { NotePayload, NoteTarget, RecordedEvent } from './types';

/** Longest slug taken from a note's text, in characters. */
const SLUG_LENGTH = 40;

/** How many timeline rows `note.md` prints before it defers to `note.json`. */
const TIMELINE_ROWS = 200;

/** Turn free text into a short, file-safe, greppable slug. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'note';
}

/**
 * A note's id and directory name: `<epoch-ms>-<slug>`.
 *
 * Epoch first so a directory listing sorts chronologically; the slug is what
 * makes a listing readable without opening anything.
 */
export function noteId(at: number, text: string, anchorName: string | null): string {
  const source = text.trim() || anchorName || 'note';
  return `${at}-${slugify(source)}`;
}

/** YAML-safe scalar: quoted, with quotes and backslashes escaped. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

/** A one-line rendering of any projected value, short enough for a table cell. */
function compact(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value) ?? String(value);
  return json.length > 60 ? `${json.slice(0, 60)}…` : json;
}

/** One timeline row's human column — what actually happened, in words. */
export function describeEvent(event: RecordedEvent): string {
  switch (event.kind) {
    case 'action':
      return `${event.service}.${event.action}(${event.args.map(compact).join(', ')})`;
    case 'state': {
      const times = event.count && event.count > 1 ? ` ×${event.count}` : '';
      if (event.changed) {
        const keys = Object.entries(event.changed)
          .map(([key, value]) => `${key}: ${compact(value.from)} → ${compact(value.to)}`)
          .join(', ');
        return `${event.service}.${event.atom} { ${keys} }${times}`;
      }
      return `${event.service}.${event.atom} ${compact(event.from)} → ${compact(event.to)}${times}`;
    }
    case 'input': {
      const where = event.instanceId ? `→ ${event.instanceId}` : `→ ${event.target}`;
      const detail = Object.entries(event.detail)
        .map(([key, value]) => `${key}=${compact(value)}`)
        .join(' ');
      return `${event.type} ${where}${detail ? ` (${detail})` : ''}`;
    }
    case 'write':
      return `${event.table}/${event.rowId} cause=${event.cause}`;
    case 'error':
      return `${event.id} ${event.message}`;
    case 'route':
      return event.url;
    case 'network':
      return `${event.method} ${event.url} → ${event.status ?? 'failed'} (${event.durationMs}ms)`;
  }
}

/** Pipes would break the table; nothing else in a cell needs escaping. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** The timeline as a markdown table, offsets relative to the recording's start. */
function renderTimeline(events: readonly RecordedEvent[], origin: number): string {
  if (events.length === 0) return '';
  const rows = events.slice(0, TIMELINE_ROWS).map((event) => {
    const offset = `+${event.at - origin}ms`;
    return `| ${offset} | ${event.kind} | ${escapeCell(describeEvent(event))} |`;
  });
  const omitted =
    events.length > TIMELINE_ROWS
      ? `\n\n_${events.length - TIMELINE_ROWS} further events are in \`note.json\`._`
      : '';
  return [
    `## Timeline — ${events.length} events`,
    '',
    '| t | kind | what |',
    '| --- | --- | --- |',
    ...rows,
    omitted
  ].join('\n');
}

/** One component's captured state, as a fenced JSON block under its id. */
function renderTarget(target: NoteTarget): string {
  return [
    `### ${target.instanceId}${target.name === target.instanceId ? '' : ` (${target.name})`}`,
    '',
    '```json',
    JSON.stringify({ props: target.props, state: target.state, actions: target.actions }, null, 2),
    '```'
  ].join('\n');
}

/**
 * Render the whole note as markdown. This is the file an agent is pointed at,
 * so the order is deliberate: what it is, what was said, what happened, then
 * the state.
 */
export function renderNoteMarkdown(payload: NotePayload): string {
  const anchor = payload.anchor;
  const origin = payload.startedAt ?? payload.at;
  const heading = payload.text.trim().split('\n')[0] || payload.voice?.transcript.split('\n')[0] || 'Annotation';
  const frontmatter = [
    '---',
    `id: ${yamlString(payload.id)}`,
    `kind: ${payload.kind}`,
    `label: ${payload.label}`,
    `at: ${payload.at}`,
    `url: ${yamlString(payload.environment.url)}`,
    `anchor: { kind: ${anchor.kind}, instanceId: ${yamlString(anchor.instanceId ?? '')}, name: ${yamlString(anchor.name ?? '')} }`,
    `viewport: { width: ${payload.environment.viewportWidth}, height: ${payload.environment.viewportHeight}, dpr: ${payload.environment.devicePixelRatio} }`,
    ...(payload.startedAt !== null && payload.endedAt !== null
      ? [`durationMs: ${payload.endedAt - payload.startedAt}`]
      : []),
    `events: ${payload.timeline.length}`,
    `attachments: [${payload.attachments.join(', ')}]`,
    '---'
  ].join('\n');

  const sections: string[] = [frontmatter, '', `# ${heading}`, ''];

  if (payload.text.trim()) sections.push(payload.text.trim(), '');
  if (payload.voice) {
    sections.push(
      `> Voice note (${payload.voice.source === 'typed' ? 'typed' : 'transcribed'}): ${payload.voice.transcript}`,
      ''
    );
  }

  sections.push(
    '## What it is attached to',
    '',
    anchor.kind === 'page'
      ? 'The page as a whole.'
      : anchor.instanceId
        ? `\`${anchor.instanceId}\`${anchor.ancestors.length ? ` — inside ${anchor.ancestors.map((id) => `\`${id}\``).join(' › ')}` : ''}`
        : `A region of the page${anchor.domPath ? ` (\`${anchor.domPath}\`)` : ''}.`,
    ''
  );

  const timeline = renderTimeline(payload.timeline, origin);
  if (timeline) sections.push(timeline, '');

  if (payload.target) {
    sections.push('## State at capture', '', renderTarget(payload.target), '');
  }
  if (payload.nearby.length > 0) {
    sections.push('## Also under the selection', '', ...payload.nearby.map((target) => renderTarget(target)), '');
  }

  sections.push(
    '## Environment',
    '',
    `- url: ${payload.environment.url}`,
    `- viewport: ${payload.environment.viewportWidth}×${payload.environment.viewportHeight} @${payload.environment.devicePixelRatio}x`,
    `- user agent: ${payload.environment.userAgent}`,
    ...(payload.environment.sync ? [`- sync: ${JSON.stringify(payload.environment.sync)}`] : []),
    ''
  );

  return `${sections.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
