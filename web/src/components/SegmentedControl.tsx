import type { KeyboardEvent } from "react";
import { useRef } from "react";
import styles from "./SegmentedControl.module.css";

type Option = { value: string; label: string };

type Props = {
  /** Accessible name of the group, e.g. "Size for Roles to shortlist". */
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** Pill segmented control (radiogroup). Selection is neutral --surface-3, never lime. Arrow keys, Home and End move it. */
export function SegmentedControl({ label, options, value, onChange, className }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, options.findIndex((o) => o.value === value));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = selected === last ? 0 : selected + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = selected === 0 ? last : selected - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={[styles.group, className].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === selected}
          tabIndex={i === selected ? 0 : -1}
          className={`${styles.option} t-meta`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
