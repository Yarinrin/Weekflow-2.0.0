/** Shared building blocks. Every one reads design tokens; none names a colour. */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronLeft } from './Icons';
import type { Area } from '@/domain/types';

/** Sheets render into this node, which App mounts as the last child of `.app`. */
export const OVERLAY_ROOT_ID = 'wf-overlays';

/* ------------------------------------------------------------------- ring */

export function Ring({
  value,
  size = 62,
  stroke,
  label,
  labelSize,
  title,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  labelSize?: number;
  /** Screen-reader description, e.g. "Build the portfolio, 67 percent complete". */
  title?: string;
}) {
  const sw = stroke ?? Math.max(4, Math.round(size / 10));
  const r = (size - sw) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const offset = circumference * (1 - clamped / 100);

  return (
    <span
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={title ?? `${Math.round(clamped)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={sw} />
        <circle
          className="ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={sw}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {label !== undefined && (
        <span className="ring__label num" style={{ fontSize: labelSize ?? Math.round(size / 3.5) }}>
          {label}
        </span>
      )}
    </span>
  );
}

/* --------------------------------------------------------------- checkbox */

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="check"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span className="check__box">
        <CheckIcon />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------- habit dot */

export function HabitDot({
  done,
  today,
  scheduled = true,
  size = 'md',
  label,
  onClick,
}: {
  done: boolean;
  today?: boolean;
  scheduled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label: string;
  onClick?: () => void;
}) {
  const cls = [
    'dot',
    size === 'lg' && 'dot--lg',
    size === 'sm' && 'dot--sm',
    done && 'dot--done',
    today && 'dot--today',
    !scheduled && !done && 'dot--off',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="dot__box">
        <CheckIcon />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ bars */

export function Bars({
  data,
  height = 96,
}: {
  data: { value: number; max: number; tick: string; highlight?: boolean }[];
  height?: number;
}) {
  const usable = height - 26; // leave room for the tick labels
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => {
        const h = d.max > 0 ? Math.max(3, Math.round((d.value / d.max) * usable)) : 3;
        return (
          <span key={i} className={`bars__col${d.highlight ? ' bars__col--hi' : ''}`}>
            <b className="bars__bar" style={{ height: h }} />
            <em className="bars__tick">{d.tick}</em>
          </span>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- pills */

export const Pill = ({
  children,
  variant = 'area',
}: {
  children: ReactNode;
  variant?: 'area' | 'plain' | 'attention' | 'ghost';
}) => <span className={`pill${variant === 'area' ? '' : ` pill--${variant}`}`}>{children}</span>;

/* --------------------------------------------------------------- section */

export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section__head">
        <h2 className="label">{title}</h2>
        {aside !== undefined && <span className="meta">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ empty state */

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      <strong className="empty__title">{title}</strong>
      <span className="empty__body">{body}</span>
      {action && (
        <button type="button" className="btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- sheet */

/**
 * Bottom sheet.
 *
 * Rendered through a portal into `#wf-overlays` rather than in place. A sheet opened
 * from inside a screen would otherwise be trapped in that screen's stacking context —
 * painting beneath the floating nav — and clipped by the screen's scroll container.
 *
 * Focus moves in on open and back to the trigger on close; Escape and the hardware
 * Back button dismiss it; focus is trapped while it is open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  area,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  area?: Area;
}) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  // Resolved after mount, because App renders the overlay root in the same commit.
  const [host, setHost] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById(OVERLAY_ROOT_ID),
  );
  useEffect(() => {
    if (!host) setHost(document.getElementById(OVERLAY_ROOT_ID));
  }, [host]);

  // Held in a ref so `finish` stays stable. Callers almost always pass an inline
  // arrow, and a changing identity would re-run the focus effect on every render,
  // yanking focus back out of the sheet mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finish = useCallback(() => {
    setClosing(true);
    // Let the exit animation run before unmounting.
    window.setTimeout(() => {
      setClosing(false);
      onCloseRef.current();
    }, 200);
  }, []);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first control, or the panel itself if there is none.
    const focusable = panel?.querySelector<HTMLElement>(
      'input, textarea, button, [href], select, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [
        ...panel.querySelectorAll<HTMLElement>(
          'input, textarea, button:not([disabled]), [href], select, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnTo.current?.focus({ preventScroll: true });
    };
  }, [open, finish]);

  if (!open || !host) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`scrim${closing ? ' scrim--out' : ''}`}
        aria-label="Close"
        onClick={finish}
      />
      <div
        ref={panelRef}
        className={`sheet${closing ? ' sheet--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        {...(area ? { 'data-area': area } : {})}
      >
        <div className="sheet__grab" />
        {title && (
          <h2 id={titleId} className="label" style={{ marginBottom: 'var(--sp-5)' }}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </>,
    host,
  );
}

/* ------------------------------------------------------------ back button */

export const BackButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="backBtn" onClick={onClick}>
    <ChevronLeft />
    {label}
  </button>
);

/* ------------------------------------------------------------------ chips */

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  areaStyled,
  legend,
}: {
  options: { value: T; label: string; area?: Area }[];
  value: T;
  onChange: (v: T) => void;
  areaStyled?: boolean;
  legend: string;
}) {
  return (
    <div role="radiogroup" aria-label={legend} className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`chip${value === o.value ? ' chip--on' : ''}${areaStyled ? ' chip--area' : ''}`}
          {...(areaStyled && o.area ? { 'data-area': o.area } : {})}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
