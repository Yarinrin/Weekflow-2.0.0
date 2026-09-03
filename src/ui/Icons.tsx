/**
 * The whole icon set: fourteen icons on a 24px grid, 1.7px stroke, round caps,
 * built from circles and rounded rectangles. Hand-drawn rather than pulled from a
 * library, because a library brings 900 icons in somebody else's voice.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...props,
});

export const HomeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 10.6 12 4.2l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6h-3.2v-5.8h-6.4v5.8H5.6A1.6 1.6 0 0 1 4 19z" />
  </svg>
);

export const WeekIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3.4" />
    <path d="M3.6 10.2h16.8M8.2 3.2v4M15.8 3.2v4" />
  </svg>
);

export const GoalIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.4" />
  </svg>
);

export const YouIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.4" r="3.8" />
    <path d="M5 20.2c.9-3.7 3.6-5.6 7-5.6s6.1 1.9 7 5.6" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2.1}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg viewBox="0 0 12 12" fill="none" aria-hidden focusable="false" {...p}>
    <path d="M2 6.3 4.7 9 10 3.2" />
  </svg>
);

export const ChevronRight = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const ChevronLeft = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const TaskIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12h16M4 6h16M4 18h10" />
  </svg>
);

export const HabitIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 17c3-8 5-8 8 0s5 8 8 0" />
  </svg>
);

export const StarIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4.6l2.2 4.7 5 .7-3.6 3.6.9 5.1L12 16.3l-4.5 2.4.9-5.1L4.8 10l5-.7z" />
  </svg>
);

export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.8 6.6h14.4M9.4 6.6V4.9a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.7" />
    <path d="M6.6 6.6l.9 12.3a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-12.3" />
  </svg>
);

export const MoveIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M13.5 5.5 20 12l-6.5 6.5M20 12H4.5" />
  </svg>
);

export const SparkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.6v4.2M12 16.2v4.2M4.8 12H9M15 12h4.2" />
    <path d="M7.2 7.2l2.4 2.4M14.4 14.4l2.4 2.4M16.8 7.2l-2.4 2.4M9.6 14.4l-2.4 2.4" />
  </svg>
);
