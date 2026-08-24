/**
 * The install block, addressed to an agent instead of a shell.
 *
 * `bun add wheel` was the wrong first instruction twice over: nobody types
 * install commands by hand any more, and wheel is not on a registry yet, so the
 * line did not even work. What a reader actually wants is the one sentence that
 * puts their agent to work — so the page hands them that sentence, a copy
 * button, and a link to the file the sentence points at.
 *
 * The line on screen and the line on the clipboard are separate props. What
 * reads well to a person ("ask your agent to get started") is not what an agent
 * can act on, and a copy button that hands over a non-actionable sentence is
 * worse than no button. `copy` carries the real instruction; `prompt` is what
 * the reader sees. Omit `copy` and the two are the same line.
 *
 * `{origin}` is substituted at render time in both. The copied text has to
 * carry an ABSOLUTE url (an agent has no page to resolve `/install.md`
 * against), and hardcoding the production host would copy a dead link on
 * localhost. The visible link stays relative, so it works on both.
 *
 * Every word here comes from `home.mdx`, same as the rest of the page.
 */
import { Show } from 'solid-js';
import Check from 'lucide-solid/icons/check';
import Copy from 'lucide-solid/icons/copy';
import FileText from 'lucide-solid/icons/file-text';
import { systemDefer, useSignal, viewRoot } from 'wheel/core';

/** How long the button stays in its "copied" state before reverting. */
const COPIED_MS = 1600;

function absolute(prompt: string): string {
  // wheel-raw-location: a static landing page with no router — the origin is
  // read once at render to make the copied prompt fetchable from anywhere.
  return prompt.replace('{origin}', window.location.origin);
}

/**
 * Prompt line, then two actions on its right: copy the prompt, or open the file
 * it points at.
 *
 * Both labels of the copy button render at once, stacked in one grid cell with
 * the inactive one hidden. The cell is therefore as wide as the WIDER label, so
 * "Copy" → "Copied" cannot resize the button and shove the prompt sideways
 * mid-click. A min-width guess would do the same job until someone translates
 * the labels; this cannot drift.
 */
export function AgentInstall(props: {
  prompt: string;
  /** What the button puts on the clipboard. Defaults to the visible prompt. */
  copy?: string;
  copyLabel: string;
  copiedLabel: string;
  linkLabel: string;
  href: string;
}) {
  const [copied, setCopied] = useSignal(false, 'copied');
  const text = () => absolute(props.prompt);
  const clipboardText = () => absolute(props.copy ?? props.prompt);
  const copy = () => {
    void navigator.clipboard.writeText(clipboardText()).then(() => {
      setCopied(true);
      // The sanctioned scheduler rather than a raw setTimeout, even for a
      // button label — a raw timer cannot be replayed or faked in a test.
      systemDefer.schedule(COPIED_MS, () => setCopied(false));
    });
  };
  return (
    <div use:viewRoot={{ name: 'AgentInstall', props }} class="agent-install" data-testid="install">
      <div class="agent-install-row">
        <code data-testid="agent-install-prompt">{text()}</code>
        <div class="agent-install-actions">
          <button
            type="button"
            class="agent-install-action"
            data-testid="agent-install-copy"
            data-clipboard={clipboardText()}
            aria-label={copied() ? props.copiedLabel : props.copyLabel}
            onClick={copy}
          >
            <Show when={copied()} fallback={<Copy size={15} />}>
              <Check size={15} />
            </Show>
            <span class="agent-install-swap">
              <span aria-hidden={copied() ? undefined : 'true'} data-shown={copied() ? '' : undefined}>
                {props.copiedLabel}
              </span>
              <span aria-hidden={copied() ? 'true' : undefined} data-shown={copied() ? undefined : ''}>
                {props.copyLabel}
              </span>
            </span>
          </button>
          {/* wheel-raw-anchor: a plain markdown file, not an app route — the
              browser should navigate to it, and an agent should be able to
              fetch it. */}
          <a class="agent-install-action" href={props.href} data-testid="agent-install-link">
            <FileText size={15} />
            <span>{props.linkLabel}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
