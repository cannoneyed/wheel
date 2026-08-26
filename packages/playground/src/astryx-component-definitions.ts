import type { ComponentGroup } from './component-fixtures';

export interface AstryxComponentDefinition {
  readonly name: string;
  readonly slug: string;
  readonly group: ComponentGroup;
  readonly family: string;
  readonly summary: string;
  readonly tag?: string | undefined;
}

interface AstryxFamilyDefinition {
  readonly family: string;
  readonly group: ComponentGroup;
  readonly entries: readonly Omit<AstryxComponentDefinition, 'family' | 'group'>[];
}

const families: readonly AstryxFamilyDefinition[] = [
  { family: 'App Shell', group: 'Layout', entries: [
    { name: 'AppShell', slug: 'app-shell', summary: 'Frames application navigation, content, and supporting panels.' },
  ] },
  { family: 'Aspect Ratio', group: 'Layout', entries: [
    { name: 'AspectRatio', slug: 'aspect-ratio', summary: 'Keeps media at a stable ratio while its container resizes.' },
  ] },
  { family: 'Avatar', group: 'Content', entries: [
    { name: 'AvatarGroup', slug: 'avatar-group', summary: 'Stacks related identities without hiding their individual labels.' },
    { name: 'AvatarGroupOverflow', slug: 'avatar-group-overflow', summary: 'Reports identities that do not fit in an Avatar Group.' },
    { name: 'AvatarStatusDot', slug: 'avatar-status-dot', summary: 'Adds a named availability state to an Avatar.' },
  ] },
  { family: 'Badge', group: 'Data display', entries: [
    { name: 'Badge', slug: 'badge', summary: 'Labels compact status, category, or count information.' },
  ] },
  { family: 'Banner', group: 'Feedback', entries: [
    { name: 'Banner', slug: 'banner', summary: 'Presents a page or section message with optional actions.' },
  ] },
  { family: 'Blockquote', group: 'Content', entries: [
    { name: 'Blockquote', slug: 'blockquote', summary: 'Presents quoted content with an optional source.', tag: 'blockquote' },
  ] },
  { family: 'Bottom Sheet', group: 'Overlays', entries: [
    { name: 'BottomSheet', slug: 'bottom-sheet', summary: 'Presents a touch-oriented task surface from the viewport edge.' },
    { name: 'BottomSheetSwitcher', slug: 'bottom-sheet-switcher', summary: 'Switches between related Bottom Sheet surfaces without losing context.' },
  ] },
  { family: 'Breadcrumbs', group: 'Navigation', entries: [
    { name: 'Breadcrumbs', slug: 'breadcrumbs', summary: 'Shows the current page position in a navigation hierarchy.', tag: 'nav' },
    { name: 'BreadcrumbItem', slug: 'breadcrumb-item', summary: 'Represents one destination or the current page in Breadcrumbs.' },
  ] },
  { family: 'Calendar', group: 'Forms', entries: [
    { name: 'Calendar', slug: 'calendar', summary: 'Selects one date or a bounded date range.' },
  ] },
  { family: 'Carousel', group: 'Content', entries: [
    { name: 'Carousel', slug: 'carousel', summary: 'Moves through an ordered set of media or content panels.' },
  ] },
  { family: 'Chat', group: 'Product patterns', entries: [
    { name: 'ChatComposer', slug: 'chat-composer', summary: 'Collects a message, attachments, tools, and send actions.' },
    { name: 'ChatComposerDrawer', slug: 'chat-composer-drawer', summary: 'Shows secondary composer tools without replacing the draft.' },
    { name: 'ChatComposerInput', slug: 'chat-composer-input', summary: 'Edits a growing chat draft with keyboard-safe submission.' },
    { name: 'ChatComposerTokenElement', slug: 'chat-composer-token-element', summary: 'Embeds a named reference inside a chat draft.' },
    { name: 'ChatDictationButton', slug: 'chat-dictation-button', summary: 'Starts and stops named dictation states.' },
    { name: 'ChatSendButton', slug: 'chat-send-button', summary: 'Sends, stops, retries, or resumes a chat request.' },
    { name: 'ChatLayout', slug: 'chat-layout', summary: 'Owns the message viewport and composer placement.' },
    { name: 'ChatLayoutScrollButton', slug: 'chat-layout-scroll-button', summary: 'Returns a chat viewport to the latest message.' },
    { name: 'ChatMessage', slug: 'chat-message', summary: 'Groups one authored message and its delivery state.' },
    { name: 'ChatMessageBubble', slug: 'chat-message-bubble', summary: 'Presents the readable surface for one chat message.' },
    { name: 'ChatMessageList', slug: 'chat-message-list', summary: 'Orders chat messages and maintains live-region behavior.' },
    { name: 'ChatMessageMetadata', slug: 'chat-message-metadata', summary: 'Shows authorship, time, delivery, and message actions.' },
    { name: 'ChatSystemMessage', slug: 'chat-system-message', summary: 'Presents a non-author system event in the message flow.' },
    { name: 'ChatTokenizedText', slug: 'chat-tokenized-text', summary: 'Renders text with interactive references and tokens.' },
    { name: 'ChatToolCalls', slug: 'chat-tool-calls', summary: 'Shows tool requests, progress, results, and failures.' },
  ] },
  { family: 'Citation', group: 'Content', entries: [
    { name: 'Citation', slug: 'citation', summary: 'Links an inline source marker to its full reference.' },
  ] },
  { family: 'Code', group: 'Content', entries: [
    { name: 'Code', slug: 'code', summary: 'Presents short inline source or machine-readable text.', tag: 'code' },
  ] },
  { family: 'Command Palette', group: 'Overlays', entries: [
    { name: 'CommandPalette', slug: 'command-palette', summary: 'Searches and runs grouped application commands.' },
  ] },
  { family: 'Date Input', group: 'Forms', entries: [
    { name: 'DateInput', slug: 'date-input', summary: 'Edits a locale-aware date through stable segments.' },
    { name: 'DateRangeInput', slug: 'date-range-input', summary: 'Edits a bounded start and end date.' },
    { name: 'DateTimeInput', slug: 'date-time-input', summary: 'Edits a date and time without losing locale semantics.' },
  ] },
  { family: 'Dialog', group: 'Overlays', entries: [
    { name: 'DialogHeader', slug: 'dialog-header', summary: 'Aligns a dialog title, description, close action, and tools.' },
  ] },
  { family: 'Empty State', group: 'Feedback', entries: [
    { name: 'EmptyState', slug: 'empty-state', summary: 'Explains an empty result and offers the next useful action.' },
  ] },
  { family: 'Field', group: 'Forms', entries: [
    { name: 'InputGroup', slug: 'input-group', summary: 'Connects an input with prefixes, suffixes, and actions.' },
  ] },
  { family: 'File Input', group: 'Forms', entries: [
    { name: 'FileInput', slug: 'file-input', summary: 'Selects or drops files and reports validation or upload state.' },
  ] },
  { family: 'Icon', group: 'Content', entries: [
    { name: 'Icon', slug: 'icon', summary: 'Sizes and colors one application icon without changing its source.' },
  ] },
  { family: 'Indicator', group: 'Feedback', entries: [
    { name: 'Indicator', slug: 'indicator', summary: 'Shows checked, mixed, selected, or current state.' },
  ] },
  { family: 'Item', group: 'Content', entries: [
    { name: 'Item', slug: 'item', summary: 'Composes a dense row from media, text, status, and actions.' },
  ] },
  { family: 'Keyboard Key', group: 'Content', entries: [
    { name: 'Kbd', slug: 'kbd', summary: 'Displays one key, chord, or key sequence.', tag: 'kbd' },
  ] },
  { family: 'Layout', group: 'Layout', entries: [
    { name: 'Layout', slug: 'layout', summary: 'Composes a page frame from named structural regions.' },
    { name: 'LayoutHeader', slug: 'layout-header', summary: 'Holds persistent controls at the start of a Layout.', tag: 'header' },
    { name: 'LayoutContent', slug: 'layout-content', summary: 'Owns the primary scrollable content region.', tag: 'main' },
    { name: 'LayoutFooter', slug: 'layout-footer', summary: 'Holds persistent controls at the end of a Layout.', tag: 'footer' },
    { name: 'LayoutPanel', slug: 'layout-panel', summary: 'Adds a supporting panel beside Layout Content.', tag: 'aside' },
    { name: 'Stack', slug: 'stack', summary: 'Arranges children on one axis with token-based gaps.' },
    { name: 'StackItem', slug: 'stack-item', summary: 'Controls one child’s growth and alignment inside a Stack.' },
    { name: 'Grid', slug: 'grid', summary: 'Arranges children in responsive columns.' },
    { name: 'GridSpan', slug: 'grid-span', summary: 'Controls one child’s column and row span.' },
    { name: 'Center', slug: 'center', summary: 'Centers content with a bounded readable width.' },
    { name: 'Section', slug: 'section', summary: 'Groups related page content under one surface and spacing contract.', tag: 'section' },
    { name: 'FormLayout', slug: 'form-layout', summary: 'Aligns labels, controls, messages, and form actions.' },
    { name: 'Card', slug: 'card', summary: 'Groups related content on one contained surface.', tag: 'article' },
    { name: 'ClickableCard', slug: 'clickable-card', summary: 'Makes one Card act as a named link or button.' },
    { name: 'SelectableCard', slug: 'selectable-card', summary: 'Adds single or multiple selection semantics to a Card.' },
  ] },
  { family: 'Lightbox', group: 'Overlays', entries: [
    { name: 'Lightbox', slug: 'lightbox', summary: 'Views media with captions, gallery navigation, zoom, and pan.' },
  ] },
  { family: 'Link', group: 'Actions', entries: [
    { name: 'Link', slug: 'link', summary: 'Navigates to an internal, external, or downloaded resource.', tag: 'a' },
  ] },
  { family: 'List', group: 'Content', entries: [
    { name: 'List', slug: 'list', summary: 'Orders semantic or interactive items with shared density.', tag: 'ul' },
    { name: 'ListItem', slug: 'list-item', summary: 'Provides one row within a List.', tag: 'li' },
  ] },
  { family: 'Markdown', group: 'Content', entries: [
    { name: 'Markdown', slug: 'markdown', summary: 'Renders sanitized Markdown through Wheel components.', tag: 'article' },
  ] },
  { family: 'Metadata List', group: 'Data display', entries: [
    { name: 'MetadataList', slug: 'metadata-list', summary: 'Presents compact label and value pairs.', tag: 'dl' },
    { name: 'MetadataListItem', slug: 'metadata-list-item', summary: 'Pairs one metadata label with its value.' },
  ] },
  { family: 'Navigation', group: 'Navigation', entries: [
    { name: 'MobileNav', slug: 'mobile-nav', summary: 'Presents primary navigation at compact viewport widths.', tag: 'nav' },
    { name: 'MobileNavToggle', slug: 'mobile-nav-toggle', summary: 'Opens and closes Mobile Nav with a persistent accessible name.' },
    { name: 'NavHeadingMenu', slug: 'nav-heading-menu', summary: 'Adds a menu of actions beside a navigation heading.' },
    { name: 'NavIcon', slug: 'nav-icon', summary: 'Aligns a navigation icon with item text and state.' },
    { name: 'SideNav', slug: 'side-nav', summary: 'Presents persistent vertical application navigation.', tag: 'nav' },
    { name: 'SideNavCollapseButton', slug: 'side-nav-collapse-button', summary: 'Collapses and restores Side Nav without losing destinations.' },
    { name: 'SideNavHeading', slug: 'side-nav-heading', summary: 'Names a Side Nav section.' },
    { name: 'SideNavItem', slug: 'side-nav-item', summary: 'Represents one Side Nav destination or action.' },
    { name: 'SideNavSection', slug: 'side-nav-section', summary: 'Groups related Side Nav items under one heading.' },
    { name: 'TopNav', slug: 'top-nav', summary: 'Presents persistent horizontal product navigation.', tag: 'nav' },
    { name: 'TopNavHeading', slug: 'top-nav-heading', summary: 'Provides product identity inside Top Nav.' },
    { name: 'TopNavItem', slug: 'top-nav-item', summary: 'Represents one Top Nav destination or action.' },
    { name: 'TopNavMenu', slug: 'top-nav-menu', summary: 'Shows a compact menu from a Top Nav item.' },
    { name: 'TopNavMegaMenu', slug: 'top-nav-mega-menu', summary: 'Shows grouped navigation and featured content from Top Nav.' },
    { name: 'TopNavMegaMenuItem', slug: 'top-nav-mega-menu-item', summary: 'Represents one destination in a Top Nav Mega Menu.' },
    { name: 'TopNavMegaMenuFeaturedCard', slug: 'top-nav-mega-menu-featured-card', summary: 'Highlights one destination in a Top Nav Mega Menu.' },
  ] },
  { family: 'Outline', group: 'Navigation', entries: [
    { name: 'Outline', slug: 'outline', summary: 'Tracks headings and moves within a long page.', tag: 'nav' },
  ] },
  { family: 'Overflow List', group: 'Layout', entries: [
    { name: 'OverflowList', slug: 'overflow-list', summary: 'Keeps ordered items visible until space requires an overflow menu.' },
  ] },
  { family: 'Overlay', group: 'Overlays', entries: [
    { name: 'Overlay', slug: 'overlay', summary: 'Provides shared modal and non-modal layer structure.' },
  ] },
  { family: 'Pagination', group: 'Navigation', entries: [
    { name: 'Pagination', slug: 'pagination', summary: 'Moves through known or unknown result pages.', tag: 'nav' },
  ] },
  { family: 'Power Search', group: 'Forms', entries: [
    { name: 'PowerSearch', slug: 'power-search', summary: 'Searches across scopes, filters, commands, and recent items.' },
  ] },
  { family: 'Resizable', group: 'Layout', entries: [
    { name: 'Resizable', slug: 'resizable', summary: 'Coordinates bounded, collapsible panel sizes.' },
    { name: 'ResizeHandle', slug: 'resize-handle', summary: 'Changes a panel size with pointer or keyboard input.' },
  ] },
  { family: 'Segmented Control', group: 'Forms', entries: [
    { name: 'SegmentedControl', slug: 'segmented-control', summary: 'Selects one value from a compact visible set.' },
  ] },
  { family: 'Select', group: 'Forms', entries: [
    { name: 'MultiSelect', slug: 'multi-select', summary: 'Chooses multiple values from an anchored collection.' },
    { name: 'ComplexSelect', slug: 'complex-select', summary: 'Chooses a rich value with supporting metadata and actions.' },
  ] },
  { family: 'Skeleton', group: 'Feedback', entries: [
    { name: 'Skeleton', slug: 'skeleton', summary: 'Reserves content geometry while data is unavailable.' },
  ] },
  { family: 'Spinner', group: 'Feedback', entries: [
    { name: 'Spinner', slug: 'spinner', summary: 'Reports an indeterminate wait after an optional delay.' },
  ] },
  { family: 'Status Dot', group: 'Feedback', entries: [
    { name: 'StatusDot', slug: 'status-dot', summary: 'Pairs a compact color mark with a named status.' },
  ] },
  { family: 'Stepper', group: 'Navigation', entries: [
    { name: 'Stepper', slug: 'stepper', summary: 'Shows progress and navigation across ordered task steps.' },
    { name: 'Step', slug: 'step', summary: 'Represents one complete, current, optional, or invalid step.' },
  ] },
  { family: 'Table', group: 'Data display', entries: [
    { name: 'Table', slug: 'table', summary: 'Presents dense tabular data with interactive state.', tag: 'table' },
  ] },
  { family: 'Text', group: 'Content', entries: [
    { name: 'Text', slug: 'text', summary: 'Applies semantic type and color without changing content meaning.', tag: 'span' },
    { name: 'Heading', slug: 'heading', summary: 'Applies heading type while preserving the chosen heading level.', tag: 'h2' },
  ] },
  { family: 'Text Area', group: 'Forms', entries: [
    { name: 'TextArea', slug: 'text-area', summary: 'Edits multi-line text with fixed or content-driven height.', tag: 'textarea' },
  ] },
  { family: 'Thumbnail', group: 'Content', entries: [
    { name: 'Thumbnail', slug: 'thumbnail', summary: 'Previews an image, video, or file with fallback and status.' },
  ] },
  { family: 'Time Input', group: 'Forms', entries: [
    { name: 'TimeInput', slug: 'time-input', summary: 'Edits a locale-aware time through stable segments.' },
  ] },
  { family: 'Timestamp', group: 'Data display', entries: [
    { name: 'Timestamp', slug: 'timestamp', summary: 'Displays absolute or relative time with machine-readable output.', tag: 'time' },
  ] },
  { family: 'Token', group: 'Forms', entries: [
    { name: 'Token', slug: 'token', summary: 'Represents one compact value with optional remove action.' },
    { name: 'Tokenizer', slug: 'tokenizer', summary: 'Creates and edits a validated collection of Tokens.' },
  ] },
  { family: 'Tree List', group: 'Data display', entries: [
    { name: 'TreeList', slug: 'tree-list', summary: 'Navigates hierarchical rows with disclosure and selection.' },
  ] },
  { family: 'Utilities', group: 'Providers', entries: [
    { name: 'InternationalizationProvider', slug: 'internationalization-provider', summary: 'Provides locale, direction, numbering, date, and time defaults.' },
    { name: 'LayerProvider', slug: 'layer-provider', summary: 'Provides a shared portal root and layer order.' },
    { name: 'LinkProvider', slug: 'link-provider', summary: 'Connects Wheel links to an application router.' },
    { name: 'MediaTheme', slug: 'media-theme', summary: 'Provides media-specific light, dark, and system tokens.' },
    { name: 'SyntaxTheme', slug: 'syntax-theme', summary: 'Provides syntax token colors to Code surfaces.' },
    { name: 'Theme', slug: 'theme', summary: 'Applies a light, dark, or system theme to one subtree.' },
  ] },
  { family: 'Visually Hidden', group: 'Content', entries: [
    { name: 'VisuallyHidden', slug: 'visually-hidden', summary: 'Keeps content available to assistive technology without visual layout.' },
  ] },
];

export const ASTRYX_COMPONENT_DEFINITIONS: readonly AstryxComponentDefinition[] = families.flatMap(
  ({ family, group, entries }) => entries.map((entry) => ({ ...entry, family, group })),
);
