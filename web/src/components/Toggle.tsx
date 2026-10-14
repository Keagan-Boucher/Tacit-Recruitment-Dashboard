import styles from "./Toggle.module.css";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Show Recent notes on the board". */
  label: string;
  /** Show the word On / Off beside the switch. */
  showWord?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Switch: lime with a black knob when on, --surface-3 when off. */
export function Toggle({ checked, onChange, label, showWord = false, disabled, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[styles.toggle, className].filter(Boolean).join(" ")}
      onClick={() => onChange(!checked)}
    >
      {showWord && (
        <span className={`${styles.word} t-caption`} aria-hidden="true">
          {checked ? "On" : "Off"}
        </span>
      )}
      <span className={styles.track} />
    </button>
  );
}
