/* eslint-disable wheel/require-export-jsdoc -- Each generated export is documented by its adjacent Markdown contract. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps } from '../internals/types';

export type AstryxComponentSize = 'sm' | 'md' | 'lg';
export type AstryxComponentTone =
  | 'neutral'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';
export type AstryxComponentDensity = 'compact' | 'balanced' | 'spacious';
export type AstryxComponentOrientation = 'horizontal' | 'vertical';

export interface AstryxComponentState {
  readonly component: string;
  readonly size: AstryxComponentSize;
  readonly tone: AstryxComponentTone;
  readonly density: AstryxComponentDensity;
  readonly orientation: AstryxComponentOrientation;
  readonly variant?: string | undefined;
  readonly disabled: boolean;
}

export interface AstryxComponentProps
  extends BaseUIComponentProps<any, AstryxComponentState> {
  size?: AstryxComponentSize | undefined;
  tone?: AstryxComponentTone | undefined;
  density?: AstryxComponentDensity | undefined;
  orientation?: AstryxComponentOrientation | undefined;
  variant?: string | undefined;
  disabled?: boolean | undefined;
}

interface GeneratedDefaults {
  readonly role?: string | undefined;
}

function createAstryxComponent(
  component: string,
  defaultTag: keyof JSX.IntrinsicElements = 'div',
  defaults: GeneratedDefaults = {},
): (props: AstryxComponentProps) => JSX.Element {
  return function AstryxComponent(componentProps: AstryxComponentProps): JSX.Element {
    const [, elementProps] = splitProps(componentProps, [
      'class',
      'style',
      'as',
      'asChild',
      'children',
      'size',
      'tone',
      'density',
      'orientation',
      'variant',
      'disabled',
    ]);
    const state: AstryxComponentState = {
      component,
      get size() {
        return componentProps.size ?? 'md';
      },
      get tone() {
        return componentProps.tone ?? 'neutral';
      },
      get density() {
        return componentProps.density ?? 'compact';
      },
      get orientation() {
        return componentProps.orientation ?? 'vertical';
      },
      get variant() {
        return componentProps.variant;
      },
      get disabled() {
        return componentProps.disabled ?? false;
      },
    };

    return renderElement(defaultTag, componentProps, {
      defaultClass: `wheel-${component}`,
      slot: component.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
      state,
      props: [
        () => ({
          'data-wheel-generated': '',
          'data-component': component,
          'data-size': state.size,
          'data-tone': state.tone,
          'data-density': state.density,
          'data-orientation': state.orientation,
          'data-variant': state.variant,
          'data-disabled': state.disabled ? '' : undefined,
          'aria-disabled': state.disabled || undefined,
          disabled: (defaultTag === 'button' || defaultTag === 'textarea') && state.disabled
            ? true
            : undefined,
          type: defaultTag === 'button' ? 'button' : undefined,
          role: defaults.role,
        }),
        elementProps as Record<string, any>,
      ],
    });
  };
}

export const AppShell = createAstryxComponent('AppShell');
export const AspectRatio = createAstryxComponent('AspectRatio');
export const AvatarGroup = createAstryxComponent('AvatarGroup');
export const AvatarGroupOverflow = createAstryxComponent('AvatarGroupOverflow');
export const AvatarStatusDot = createAstryxComponent('AvatarStatusDot', 'span');
export const Badge = createAstryxComponent('Badge', 'span');
export const Banner = createAstryxComponent('Banner', 'section');
export const Blockquote = createAstryxComponent('Blockquote', 'blockquote');
export const BottomSheet = createAstryxComponent('BottomSheet', 'section');
export const BottomSheetSwitcher = createAstryxComponent('BottomSheetSwitcher');
export const Breadcrumbs = createAstryxComponent('Breadcrumbs', 'nav');
export const BreadcrumbItem = createAstryxComponent('BreadcrumbItem', 'span');
export const Calendar = createAstryxComponent('Calendar');
export const Carousel = createAstryxComponent('Carousel', 'section');
export const ChatComposer = createAstryxComponent('ChatComposer', 'form');
export const ChatComposerDrawer = createAstryxComponent('ChatComposerDrawer');
export const ChatComposerInput = createAstryxComponent('ChatComposerInput');
export const ChatComposerTokenElement = createAstryxComponent('ChatComposerTokenElement', 'span');
export const ChatDictationButton = createAstryxComponent('ChatDictationButton', 'button');
export const ChatSendButton = createAstryxComponent('ChatSendButton', 'button');
export const ChatLayout = createAstryxComponent('ChatLayout', 'section');
export const ChatLayoutScrollButton = createAstryxComponent('ChatLayoutScrollButton', 'button');
export const ChatMessage = createAstryxComponent('ChatMessage', 'article');
export const ChatMessageBubble = createAstryxComponent('ChatMessageBubble');
export const ChatMessageList = createAstryxComponent('ChatMessageList', 'ol');
export const ChatMessageMetadata = createAstryxComponent('ChatMessageMetadata');
export const ChatSystemMessage = createAstryxComponent('ChatSystemMessage', 'li');
export const ChatTokenizedText = createAstryxComponent('ChatTokenizedText');
export const ChatToolCalls = createAstryxComponent('ChatToolCalls');
export const Citation = createAstryxComponent('Citation', 'a');
export const CommandPalette = createAstryxComponent('CommandPalette');
export const DateInput = createAstryxComponent('DateInput');
export const DateRangeInput = createAstryxComponent('DateRangeInput');
export const DateTimeInput = createAstryxComponent('DateTimeInput');
export const DialogHeader = createAstryxComponent('DialogHeader', 'header');
export const EmptyState = createAstryxComponent('EmptyState', 'section');
export const InputGroup = createAstryxComponent('InputGroup');
export const FileInput = createAstryxComponent('FileInput');
export const Icon = createAstryxComponent('Icon', 'span');
export const Indicator = createAstryxComponent('Indicator', 'span');
export const Item = createAstryxComponent('Item');
export const Kbd = createAstryxComponent('Kbd', 'kbd');
export const Layout = createAstryxComponent('Layout');
export const LayoutHeader = createAstryxComponent('LayoutHeader', 'header');
export const LayoutContent = createAstryxComponent('LayoutContent', 'main');
export const LayoutFooter = createAstryxComponent('LayoutFooter', 'footer');
export const LayoutPanel = createAstryxComponent('LayoutPanel', 'aside');
export const Stack = createAstryxComponent('Stack');
export const StackItem = createAstryxComponent('StackItem');
export const Grid = createAstryxComponent('Grid');
export const GridSpan = createAstryxComponent('GridSpan');
export const Center = createAstryxComponent('Center');
export const Section = createAstryxComponent('Section', 'section');
export const FormLayout = createAstryxComponent('FormLayout');
export const Card = createAstryxComponent('Card', 'article');
export const ClickableCard = createAstryxComponent('ClickableCard', 'a');
export const SelectableCard = createAstryxComponent('SelectableCard', 'button');
export const Lightbox = createAstryxComponent('Lightbox');
export const Link = createAstryxComponent('Link', 'a');
export const List = createAstryxComponent('List', 'ul');
export const ListItem = createAstryxComponent('ListItem', 'li');
export const Markdown = createAstryxComponent('Markdown', 'article');
export const MetadataList = createAstryxComponent('MetadataList', 'dl');
export const MetadataListItem = createAstryxComponent('MetadataListItem');
export const MobileNav = createAstryxComponent('MobileNav', 'nav');
export const MobileNavToggle = createAstryxComponent('MobileNavToggle', 'button');
export const NavHeadingMenu = createAstryxComponent('NavHeadingMenu');
export const NavIcon = createAstryxComponent('NavIcon', 'span');
export const SideNav = createAstryxComponent('SideNav', 'nav');
export const SideNavCollapseButton = createAstryxComponent('SideNavCollapseButton', 'button');
export const SideNavHeading = createAstryxComponent('SideNavHeading');
export const SideNavItem = createAstryxComponent('SideNavItem', 'a');
export const SideNavSection = createAstryxComponent('SideNavSection', 'section');
export const TopNav = createAstryxComponent('TopNav', 'nav');
export const TopNavHeading = createAstryxComponent('TopNavHeading');
export const TopNavItem = createAstryxComponent('TopNavItem', 'a');
export const TopNavMenu = createAstryxComponent('TopNavMenu');
export const TopNavMegaMenu = createAstryxComponent('TopNavMegaMenu');
export const TopNavMegaMenuItem = createAstryxComponent('TopNavMegaMenuItem', 'a');
export const TopNavMegaMenuFeaturedCard = createAstryxComponent('TopNavMegaMenuFeaturedCard', 'a');
export const Outline = createAstryxComponent('Outline', 'nav');
export const OverflowList = createAstryxComponent('OverflowList');
export const Overlay = createAstryxComponent('Overlay');
export const Pagination = createAstryxComponent('Pagination', 'nav');
export const PowerSearch = createAstryxComponent('PowerSearch');
export const Resizable = createAstryxComponent('Resizable');
export const ResizeHandle = createAstryxComponent('ResizeHandle', 'button');
export const SegmentedControl = createAstryxComponent('SegmentedControl', 'div', { role: 'radiogroup' });
export const MultiSelect = createAstryxComponent('MultiSelect');
export const ComplexSelect = createAstryxComponent('ComplexSelect');
export const Skeleton = createAstryxComponent('Skeleton', 'span');
export const Spinner = createAstryxComponent('Spinner', 'span', { role: 'status' });
export const StatusDot = createAstryxComponent('StatusDot', 'span');
export const Stepper = createAstryxComponent('Stepper', 'ol');
export const Step = createAstryxComponent('Step', 'li');
export const Table = createAstryxComponent('Table', 'table');
export const Text = createAstryxComponent('Text', 'span');
export const Heading = createAstryxComponent('Heading', 'h2');
export const TextArea = createAstryxComponent('TextArea', 'textarea');
export const Thumbnail = createAstryxComponent('Thumbnail');
export const TimeInput = createAstryxComponent('TimeInput');
export const Timestamp = createAstryxComponent('Timestamp', 'time');
export const Token = createAstryxComponent('Token', 'span');
export const Tokenizer = createAstryxComponent('Tokenizer');
export const TreeList = createAstryxComponent('TreeList', 'div', { role: 'tree' });
export const InternationalizationProvider = createAstryxComponent('InternationalizationProvider');
export const LayerProvider = createAstryxComponent('LayerProvider');
export const LinkProvider = createAstryxComponent('LinkProvider');
export const MediaTheme = createAstryxComponent('MediaTheme');
export const SyntaxTheme = createAstryxComponent('SyntaxTheme');
export const Theme = createAstryxComponent('Theme');
export const VisuallyHidden = createAstryxComponent('VisuallyHidden', 'span');
