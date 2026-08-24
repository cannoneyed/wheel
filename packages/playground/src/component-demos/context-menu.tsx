import { ContextMenu } from 'wheel/components';

// Wheel supplies the component recipe classes.
// ContextMenu.Popup/Item/Separator reuse the Menu recipe's wheel-Menu-* classes
// (and wheel-Separator) since they render the same underlying parts.
export default function ExampleMenu() {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>Right click here</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            <ContextMenu.Item>Add to Library</ContextMenu.Item>
            <ContextMenu.Item>Add to Playlist</ContextMenu.Item>
            <ContextMenu.Separator style={{ margin: '0.25rem 0' }} />
            <ContextMenu.Item>Play Next</ContextMenu.Item>
            <ContextMenu.Item>Play Last</ContextMenu.Item>
            <ContextMenu.Separator style={{ margin: '0.25rem 0' }} />
            <ContextMenu.Item>Favorite</ContextMenu.Item>
            <ContextMenu.Item>Share</ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
