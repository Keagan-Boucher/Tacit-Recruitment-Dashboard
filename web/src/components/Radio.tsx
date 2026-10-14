import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { FieldError } from "./Input";
import { Icon } from "./Icon";
import styles from "./Radio.module.css";

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** radio = round dot + label; chip = pill that turns lime when chosen (override reasons). */
  variant?: "radio" | "chip";
  children: ReactNode;
};

/** One native radio. Use inside a RadioGroup, or inside your own fieldset for custom tiles. */
export function Radio({ variant = "radio", children, className, ...rest }: RadioProps) {
  return (
    <label className={[variant === "chip" ? styles.chipItem : styles.item, className].filter(Boolean).join(" ")}>
      <input type="radio" className="sr-only" {...rest} />
      {variant === "chip" ? (
        <span className={`${styles.chipFace} t-body-s-strong`}>
          {rest.checked && <Icon name="bx-check" size={16} />}
          {children}
        </span>
      ) : (
        <>
          <span className={styles.dot} aria-hidden="true" />
          <span className="t-body-m">{children}</span>
        </>
      )}
    </label>
  );
}

type Option = { value: string; label: ReactNode; disabled?: boolean };

type GroupProps = {
  legend: string;
  /** Quiet word after the legend, e.g. "Required". */
  note?: string;
  hideLegend?: boolean;
  name?: string;
  value: string | null;
  onChange: (value: string) => void;
  options: Option[];
  variant?: "radio" | "chip";
  /** Message under the group. Sets aria-invalid and aria-describedby on the group. */
  error?: string;
  /** Id of an error element you render yourself with FieldError. */
  describedBy?: string;
  className?: string;
};

/** Native radio group (arrow keys come from the browser). */
export function RadioGroup({ legend, note, hideLegend, name, value, onChange, options, variant = "radio", error, describedBy, className }: GroupProps) {
  const auto = useId();
  const groupName = name ?? auto;
  const errorId = `${auto}-error`;
  return (
    <fieldset
      role="radiogroup"
      className={[styles.group, className].filter(Boolean).join(" ")}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : describedBy}
    >
      <legend className={hideLegend ? "sr-only" : `${styles.legend} t-body-s-strong`}>
        <span className={styles.legendInner}>
          {legend}
          {note && <span className={`${styles.note} t-meta`}>{note}</span>}
        </span>
      </legend>
      <div className={variant === "chip" ? styles.chips : styles.list}>
        {options.map((o) => (
          <Radio
            key={o.value}
            variant={variant}
            name={groupName}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          >
            {o.label}
          </Radio>
        ))}
      </div>
      <div className={styles.errorSlot} aria-live="polite">
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    </fieldset>
  );
}
