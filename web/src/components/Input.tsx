import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { useId, useState } from "react";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import styles from "./Input.module.css";

/** The red message with an alert icon. Use it directly when the message belongs to a group (give it an id and
 *  point aria-describedby at it). Input and Textarea render it for you. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={`${styles.error} t-caption-para`}>
      <Icon name="bx-error-circle" size={14} />
      <span>{children}</span>
    </p>
  );
}

type FieldProps = {
  label: string;
  /** Quiet word after the label, e.g. "Required". */
  note?: string;
  /** Keeps the label for screen readers only (search boxes). */
  hideLabel?: boolean;
  /** Message under the field. Sets aria-invalid and links the message with aria-describedby. */
  error?: string;
};

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "aria-invalid" | "aria-describedby" | "size"> &
  FieldProps & {
    ref?: Ref<HTMLInputElement>;
    /** Decorative element before the text, e.g. a search icon. */
    /** sm = 40 high (search box); default 46. */
    size?: "sm" | "md";
    leading?: ReactNode;
    /** Element after the text, e.g. the password eye button. */
    trailing?: ReactNode;
  };

type FieldShellProps = FieldProps & {
  id: string;
  errorId: string;
  className?: string;
  children: ReactNode;
};

function FieldShell({ id, errorId, label, note, hideLabel, error, className, children }: FieldShellProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : `${styles.label} t-body-s-strong`}>
        {label}
        {note && <span className={`${styles.note} t-meta`}>{note}</span>}
      </label>
      {children}
      {/* always mounted so screen readers announce the message when it appears */}
      <div id={errorId} className={styles.errorSlot} aria-live="polite">
        {error && <FieldError>{error}</FieldError>}
      </div>
    </div>
  );
}

export function Input({ label, note, hideLabel, error, size = "md", leading, trailing, className, id, ref, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errorId = `${inputId}-error`;
  return (
    <FieldShell id={inputId} errorId={errorId} label={label} note={note} hideLabel={hideLabel} error={error} className={className}>
      <div className={[styles.control, size === "sm" && styles.sm, error && styles.invalid].filter(Boolean).join(" ")}>
        {leading && <span className={styles.leading}>{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`${styles.native} t-body-m`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </div>
    </FieldShell>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "aria-invalid" | "aria-describedby"> &
  FieldProps & { ref?: Ref<HTMLTextAreaElement> };

export function Textarea({ label, note, hideLabel, error, className, id, ref, ...rest }: TextareaProps) {
  const auto = useId();
  const textId = id ?? auto;
  const errorId = `${textId}-error`;
  return (
    <FieldShell id={textId} errorId={errorId} label={label} note={note} hideLabel={hideLabel} error={error} className={className}>
      <div className={[styles.control, styles.multiline, error && styles.invalid].filter(Boolean).join(" ")}>
        <textarea
          ref={ref}
          id={textId}
          className={`${styles.native} ${styles.textarea} t-body-m`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

/** Input with a show/hide eye button. */
export function PasswordInput(props: Omit<InputProps, "type" | "trailing" | "leading" | "size">) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <IconButton
          icon={shown ? "bx-hide" : "bx-show"}
          label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          size={18}
          onClick={() => setShown((s) => !s)}
        />
      }
    />
  );
}
