/**
 * The Framing docs example: a small workbench built only from the shipped kit
 * framing API. Structure is ordinary JSX (`Frame.Row`, `Frame.Column`,
 * `Frame.Drawer`); `LayoutService` owns sizes and open state, keyed by frame id.
 */
import type { JSX } from 'solid-js';
import { ServiceProvider, componentRoot, connect, useSignal, view, viewRoot } from 'wheel/core';
import { Frame, LayoutService } from 'wheel/kit';

function paneStyle(background: string): JSX.CSSProperties {
  return {
    display: 'flex',
    'flex-direction': 'column',
    gap: '4px',
    flex: '1 1 auto',
    'min-width': '0',
    'min-height': '0',
    padding: '10px',
    overflow: 'auto',
    background,
    'font-size': '12px'
  };
}

function Explorer(): JSX.Element {
  return (
    <div use:viewRoot={'Explorer'} style={paneStyle('var(--wheel-bg-hover)')}>
      <strong>Files</strong>
      <span>frame.tsx</span>
      <span>layout-service.ts</span>
      <span>split-tree.ts</span>
    </div>
  );
}

function EditorPane(): JSX.Element {
  const [draft, setDraft] = useSignal(
    '// Type here, then hide the sidebar.\n// This draft survives: a closed\n// frame is hidden, never unmounted.',
    'draft'
  );
  return (
    <textarea
      use:viewRoot={'EditorPane'}
      value={draft()}
      onInput={(event) => setDraft(event.currentTarget.value)}
      style={{
        flex: '1 1 auto',
        'min-width': '0',
        'min-height': '0',
        border: '0',
        padding: '10px',
        resize: 'none',
        background: 'var(--wheel-bg-raised)',
        'font-family': 'ui-monospace, monospace',
        'font-size': '12px'
      }}
    />
  );
}

function Outline(): JSX.Element {
  return (
    <div use:viewRoot={'Outline'} style={paneStyle('var(--wheel-bg-soft)')}>
      <strong>Outline</strong>
      <span>Frame.Row</span>
      <span>Frame.Column</span>
      <span>Frame.Drawer</span>
    </div>
  );
}

function Terminal(): JSX.Element {
  return (
    <div use:viewRoot={'Terminal'} style={{ ...paneStyle('var(--wheel-stage-2)'), color: 'var(--wheel-ok-tint)' }}>
      <code>$ bun run check</code>
      <code>&#10003; geometry is one service</code>
    </div>
  );
}

function InspectorPanel(): JSX.Element {
  return (
    <div use:viewRoot={'InspectorPanel'} style={{ ...paneStyle('var(--wheel-indigo-tint)'), 'border-left': '1px solid var(--wheel-indigo-edge)' }}>
      <strong>Inspector</strong>
      <span>A drawer overlays content instead of taking space from it.</span>
    </div>
  );
}

// #region definition
/**
 * The layout itself. Every frame carries an app-unique `id` — that id is the
 * persistence key, the action target, and the debug label. Sizes are written
 * in exactly two spellings: `'200px'` for a fixed track, `'1fr'` for a share
 * of the leftover space.
 */
function WorkbenchLayout(): JSX.Element {
  return (
    <Frame.Row id="workbench">
      <Frame.Column
        id="sidebar"
        size="200px"
        minSize="140px"
        maxSize="320px"
        collapseBelow="520px"
      >
        <Explorer />
      </Frame.Column>

      <Frame.Column id="work" size="1fr" minSize="240px">
        <Frame.Row id="editors" size="1fr" minSize="120px">
          <Frame.Column id="editor" size="2fr" minSize="120px">
            <EditorPane />
          </Frame.Column>
          <Frame.Column id="outline" size="1fr" minSize="90px">
            <Outline />
          </Frame.Column>
        </Frame.Row>
        <Frame.Column id="terminal" size="110px" minSize="60px" maxSize="220px">
          <Terminal />
        </Frame.Column>
      </Frame.Column>

      <Frame.Drawer id="inspector" side="right" size="220px" label="Inspector">
        <InspectorPanel />
      </Frame.Drawer>
    </Frame.Row>
  );
}
// #endregion definition

// #region controls
const connectWorkbenchControls = connect('WorkbenchControls', (c) => {
  const layout = c.service(LayoutService);
  // `node(id)` is null while that frame is unmounted; reads never throw.
  return view(
    {
      sidebarOpen: () => layout.node('sidebar')?.open ?? false,
      terminalOpen: () => layout.node('terminal')?.open ?? false,
      inspectorOpen: () => layout.node('inspector')?.open ?? false
    },
    {
      toggleSidebar: () => layout.toggle('sidebar'),
      toggleTerminal: () => layout.toggle('terminal'),
      toggleInspector: () => layout.toggle('inspector'),
      resetLayout: () => layout.reset()
    }
  );
});

/** Buttons that drive geometry by frame id — no refs, no layout props. */
function WorkbenchControls(): JSX.Element {
  const state = connectWorkbenchControls({});
  return (
    <div
      use:componentRoot
      style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}
    >
      <button type="button" onClick={() => state.toggleSidebar()}>
        {state.sidebarOpen ? 'Hide' : 'Show'} sidebar
      </button>
      <button type="button" onClick={() => state.toggleTerminal()}>
        {state.terminalOpen ? 'Hide' : 'Show'} terminal
      </button>
      <button type="button" onClick={() => state.toggleInspector()}>
        {state.inspectorOpen ? 'Close' : 'Open'} inspector
      </button>
      <button type="button" onClick={() => state.resetLayout()}>
        Reset layout
      </button>
    </div>
  );
}
// #endregion controls

// #region usage
/**
 * Mount the layout inside a scope. `LayoutService` is a plain kit singleton:
 * the first `Frame` to mount resolves it, so there is nothing to configure
 * and nothing to pass down.
 */
function Workbench(props: { readonly width: number }): JSX.Element {
  return (
    <ServiceProvider scopeId="docs-framing">
      <WorkbenchControls />
      <div
        use:viewRoot={{ name: 'Workbench', props }}
        style={{
          width: `${props.width}px`,
          'max-width': '100%',
          height: '280px',
          'margin-top': '12px',
          display: 'flex',
          overflow: 'hidden',
          border: '1px solid var(--wheel-line)',
          'border-radius': 'var(--wheel-radius-md)',
          '--wheel-frame-divider': 'var(--wheel-line)',
          '--wheel-frame-divider-active': 'var(--wheel-accent)'
        }}
      >
        <WorkbenchLayout />
      </div>
    </ServiceProvider>
  );
}
// #endregion usage

/** The live demo embedded on the Framing docs page. */
export function KitchenSinkFrame(): JSX.Element {
  const [width, setWidth] = useSignal(660, 'width');
  return (
    <div use:viewRoot={'KitchenSinkFrame'} class="demo">
      <div class="demo-label">Live demo — kit framing on a real LayoutService</div>
      <Workbench width={width()} />
      <label
        style={{
          display: 'flex',
          gap: '8px',
          'align-items': 'center',
          'margin-top': '12px',
          'font-size': '12px'
        }}
      >
        <span>Container width {width()}px</span>
        <input
          type="range"
          min="360"
          max="760"
          step="10"
          value={width()}
          onInput={(event) => setWidth(event.currentTarget.valueAsNumber)}
        />
        <span>Below 520px the sidebar collapses on its own.</span>
      </label>
    </div>
  );
}
