/* eslint-disable wheel/require-view-root -- Catalog fixtures own the inspection boundary for these presentational icons. */
import type { JSX } from 'solid-js';

export function PlusIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="M8 3v10M3 8h10" stroke-linecap="round" />
    </svg>
  );
}

export function MoreIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </svg>
  );
}

export function TrashIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="M3 4.5h10M6 2.5h4M5 6.5v6M8 6.5v6M11 6.5v6M4 4.5l.5 9h7l.5-9" />
    </svg>
  );
}

export function ChevronIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="m5 6 3 3 3-3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function StarIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="m8 2 1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 10.7l-3.4 1.8.7-3.8L2.5 6l3.8-.5L8 2Z" />
    </svg>
  );
}

export function StarFilledIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="m8 2 1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 10.7l-3.4 1.8.7-3.8L2.5 6l3.8-.5L8 2Z" />
    </svg>
  );
}

export function AlignLeftIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="M2.5 4.5h11m-11 7h9M2.5 8h6" />
    </svg>
  );
}

export function AlignCenterIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="M2.5 4.5h11m-10 7h9M5 8h6" />
    </svg>
  );
}

export function AlignRightIcon(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" {...props}>
      <path d="M2.5 4.5h11m-9 7h9M7.5 8h6" />
    </svg>
  );
}
