import { Toolbar, ToggleGroup, Toggle } from 'wheel/components';

// Wheel supplies the component recipe classes.
// Deviation from the css-modules/tailwind variants: the font-picker `Select`
// is dropped here since `select.css` is a different component's recipe (out
// of scope for the toolbar recipe) — the toggle group, format buttons,
// separators, and link already exercise every themed Toolbar part.
export default function ExampleToolbar() {
  return (
    <Toolbar.Root>
      <ToggleGroup aria-label="Alignment">
        <Toolbar.Button asChild>
          {(props) => (
            <Toggle {...props} aria-label="Align left" value="align-left">
              Align Left
            </Toggle>
          )}
        </Toolbar.Button>
        <Toolbar.Button asChild>
          {(props) => (
            <Toggle {...props} aria-label="Align right" value="align-right">
              Align Right
            </Toggle>
          )}
        </Toolbar.Button>
      </ToggleGroup>
      <Toolbar.Separator />
      <Toolbar.Group aria-label="Numerical format">
        <Toolbar.Button aria-label="Format as currency">
          $
        </Toolbar.Button>
        <Toolbar.Button aria-label="Format as percent">
          %
        </Toolbar.Button>
      </Toolbar.Group>
      <Toolbar.Separator />
      <Toolbar.Link href="#">
        Edited 51m ago
      </Toolbar.Link>
    </Toolbar.Root>
  );
}
