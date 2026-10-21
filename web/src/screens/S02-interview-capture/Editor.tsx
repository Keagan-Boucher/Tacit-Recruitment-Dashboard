import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import type { KeyboardEvent, MouseEvent, Ref } from "react";
import { joinSections, locate, offsetIn, splitSections } from "./capture";
import styles from "./InterviewCapture.module.css";

export type EditorHandle = {
  /** Put the cursor at `offset` of the whole note text. */
  focusAt: (offset: number) => void;
};

type Props = {
  text: string;
  questions: string[];
  placeholder: string;
  autoFocus: boolean;
  onChange: (text: string) => void;
  /** Called with the cursor's offset in the whole note text whenever it moves. */
  onCursor: (offset: number) => void;
  ref?: Ref<EditorHandle>;
};

const NL = String.fromCharCode(10);

/** Sizes every field to its text, keeping the card's scroll position (collapsing a field to measure it would jump it). */
function fitAll(fields: (HTMLTextAreaElement | null)[], scroller: HTMLElement | null) {
  const top = scroller?.scrollTop ?? 0;
  for (const el of fields) {
    if (!el) continue;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  if (scroller) scroller.scrollTop = top;
}

/**
 * The live note: each question heading is a muted 14 px label above its own 18 px answer field, as in the read-only
 * view. The text is still one plain string (heading line, then the answer, sections joined by line breaks), so what is
 * saved, restored and read by the interpreter is unchanged; this only splits it for display and joins it on every edit.
 */
export function Editor({ text, questions, placeholder, autoFocus, onChange, onCursor, ref }: Props) {
  const sections = useMemo(() => splitSections(text, questions), [text, questions]);
  const fields = useRef<(HTMLTextAreaElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useImperativeHandle(
    ref,
    () => ({
      focusAt(offset) {
        const { index, at } = locate(sections, offset);
        const el = fields.current[index];
        el?.focus();
        el?.setSelectionRange(at, at);
      },
    }),
    [sections],
  );

  // Fields grow with their text; the card scrolls, not each field.
  useLayoutEffect(() => fitAll(fields.current, root.current), [text]);
  useEffect(() => {
    const fit = () => fitAll(fields.current, root.current);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // The blank line that separates an answer from the next question is not shown (the gap between sections is), but kept.
  const hides = (i: number) => i < sections.length - 1 && Boolean(sections[i]!.body?.endsWith(NL));
  const set = (i: number, v: string) => onChange(joinSections(sections.map((s, j) => (j === i ? { ...s, body: hides(i) ? v + NL : v } : s))));
  const report = (i: number, el: HTMLTextAreaElement) => onCursor(offsetIn(sections, i, el.selectionStart));
  const hop = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    const el = e.currentTarget;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const up = e.key === "ArrowUp" && el.selectionStart === 0 && el.selectionEnd === 0 && i > 0;
    const down = e.key === "ArrowDown" && el.selectionStart === el.value.length && el.selectionEnd === el.value.length && i < sections.length - 1;
    if (!up && !down) return;
    e.preventDefault();
    const to = fields.current[i + (up ? -1 : 1)];
    const at = up ? (to?.value.length ?? 0) : 0;
    to?.focus();
    to?.setSelectionRange(at, at);
  };
  // Clicking the empty space under the last answer puts the cursor at the end, as one big text box would.
  const clickBelow = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("textarea, label")) return;
    e.preventDefault();
    const last = fields.current[sections.length - 1];
    last?.focus();
    last?.setSelectionRange(last.value.length, last.value.length);
  };

  return (
    <div ref={root} className={styles.sections} onMouseDown={clickBelow}>
      {sections.map((s, i) => {
        const fieldId = `${id}-${i}`;
        const head = s.head?.trim();
        return (
          <div key={i} className={styles.section}>
            {head !== undefined && (
              <label htmlFor={fieldId} className={`${styles.sectionHead} t-body-m-strong`}>
                {head}
              </label>
            )}
            <textarea
              id={fieldId}
              ref={(el) => {
                fields.current[i] = el;
              }}
              className={`${styles.editor} t-note`}
              aria-label={head === undefined ? "Interview note" : undefined}
              placeholder={sections.length === 1 && text === "" ? placeholder : undefined}
              rows={1}
              value={hides(i) ? s.body!.slice(0, -1) : (s.body ?? "")}
              autoFocus={autoFocus && i === sections.length - 1}
              spellCheck
              onChange={(e) => set(i, e.target.value)}
              onSelect={(e) => report(i, e.currentTarget)}
              onKeyDown={(e) => hop(e, i)}
            />
          </div>
        );
      })}
    </div>
  );
}
