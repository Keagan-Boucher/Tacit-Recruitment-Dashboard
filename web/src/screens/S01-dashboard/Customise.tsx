import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEventHandler, ReactNode } from "react";
import { Link } from "react-router";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import type { DashboardWidget, WidgetId } from "@tacit/shared";
import { Button, Icon, IconButton } from "../../components";
import { useReduceMotion } from "../../features/prefs";
import { boardOf, setSize, setVisible, TITLES } from "../S17-widgets/layout";
import { collide, fitScale, NEW_ROW, nextSize, reorder, ZOOM, zoomVar } from "./arrange";
import styles from "./Dashboard.module.css";

// S01 customise (Figma 145:319): the real board with frozen widgets, a grip, size and remove buttons on each, and the Widget shelf.
// The board is laid out at the size it has on / and scaled by one factor, so rows, columns and content match it exactly.
const AUTO_PAGE = "(max-width: 719px), (max-height: 599px)"; // the page stops being a fixed height here (see .page)
const SHELF_GAP = 16;

const ICONS: Record<WidgetId, string> = {
  forgotten: "bx-user-voice", "roles-to-shortlist": "bx-list-check", "to-confirm": "bx-check-circle", "people-met": "bx-group",
  "roles-in-play": "bx-briefcase", "worth-a-call": "bx-phone-call", waiting: "bx-time-five", "ask-next": "bx-help-circle", "recent-notes": "bx-pencil",
  "brief-inbox": "bx-file", "company-coverage": "bx-building", "match-history": "bx-history", "override-log": "bx-show",
  "waiting-for-review": "bx-archive-in",
};
const SIZE_LABEL = { "1x1": "1×1", "2x1": "2×1", "2x2": "2×2" } as const;
// Cells are different sizes, so letting the others slide aside (rectSortingStrategy) breaks the grid; the target is outlined instead.
const noShift = () => null;
const title = (id: UniqueIdentifier) => TITLES[id as WidgetId] ?? String(id);

type Props = {
  draft: DashboardWidget[];
  onChange: (next: DashboardWidget[], said: string) => void;
  render: (w: DashboardWidget) => ReactNode;
  sizeClass: (w: DashboardWidget) => string;
  shelfOpen: boolean;
  onCloseShelf: () => void;
};

export function Customise({ draft, onChange, render, sizeClass, shelfOpen, onCloseShelf }: Props) {
  const reduce = useReduceMotion();
  const [active, setActive] = useState<WidgetId>();
  const focus = useRef<string>(undefined);
  const board = boardOf(draft);
  const ids = board.map((w) => w.widgetId);
  const slot = useRef<HTMLDivElement>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const shelfEl = useRef<HTMLElement>(null);
  // w/min: the real board's width and least height on /; h: its height here; z: the factor that fits it beside the shelf.
  const [fit, setFit] = useState({ w: 0, min: 0, h: 0, z: ZOOM });
  const measure = useCallback(() => {
    const sl = slot.current, bd = boardEl.current;
    if (!sl || !bd) return;
    const box = sl.getBoundingClientRect(); // the slot is the box the board fills on /
    const auto = matchMedia(AUTO_PAGE).matches;
    const w = Math.round(box.width * 100) / 100;
    const h = bd.offsetHeight;
    const shelfLeft = shelfEl.current?.getBoundingClientRect().left;
    // A shelf that covers most of the page (a phone) overlays the board instead of sitting beside it.
    const roomW = shelfLeft !== undefined && shelfLeft > box.left + w * 0.4 ? shelfLeft - SHELF_GAP - box.left : w;
    const gap = parseFloat(getComputedStyle(sl).rowGap) || 0;
    // A board taller than its slot scrolls on / too, so only one that fits the window is shrunk to keep the new-row slot in view.
    const roomH = auto || h > box.height ? Infinity : box.height - (tail.current?.offsetHeight ?? 0) - gap;
    const next = { w, min: auto ? 0 : Math.round(box.height), h, z: fitScale({ w, h }, { w: roomW, h: roomH }) };
    setFit((p) => (p.w === next.w && p.min === next.min && p.h === next.h && p.z === next.z ? p : next));
  }, []);
  useLayoutEffect(measure); // after every render: the board's height follows its width, and the factor follows its height
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    for (const el of [slot.current, boardEl.current, tail.current]) if (el) ro.observe(el);
    addEventListener("resize", measure);
    return () => { ro.disconnect(); removeEventListener("resize", measure); };
  }, [measure]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The grip or Add button that just changed under the recruiter's hands keeps focus (a removed widget's button is gone).
  useEffect(() => {
    document.getElementById(focus.current ?? "")?.focus();
    focus.current = undefined;
  }, [draft]);

  const place = (id: UniqueIdentifier) => `position ${Math.max(0, ids.indexOf(id as WidgetId)) + 1} of ${ids.length}`;
  const to = (id: UniqueIdentifier) => (id === NEW_ROW ? ids[ids.length - 1]! : id);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}. It is in ${place(active.id)}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `${title(active.id)} is now over ${over.id === NEW_ROW ? "the new row slot" : title(over.id)}, ${place(to(over.id))}.` : `${title(active.id)} is not over a place to drop.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${title(active.id)} in ${place(to(over.id))}.` : `Dropped ${title(active.id)}. It stays in ${place(active.id)}.`),
    onDragCancel: ({ active }) => `Cancelled. ${title(active.id)} stays in ${place(active.id)}.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    setActive(undefined);
    if (!over || over.id === active.id) return;
    onChange(reorder(draft, active.id as WidgetId, over.id), `Moved ${title(active.id)} to ${place(to(over.id))}.`);
  }
  function remove(id: WidgetId) {
    focus.current = `add-${id}`;
    onChange(setVisible(draft, id, false), `Removed ${TITLES[id]}. It is on the Widget shelf.`);
  }
  function resize(w: DashboardWidget) {
    const size = nextSize(w.size);
    focus.current = `size-${w.widgetId}`;
    onChange(setSize(draft, w.widgetId, size), `${TITLES[w.widgetId]} is now ${SIZE_LABEL[size]}.`);
  }
  function add(id: WidgetId) {
    focus.current = `grip-${id}`;
    onChange(setVisible(draft, id, true), `Added ${TITLES[id]} at the end of the board.`);
  }

  const shelf = draft.filter((w) => !w.visible).sort((a, b) => a.order - b.order);
  const lifted = board.find((w) => w.widgetId === active);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={(e) => setActive(e.active.id as WidgetId)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(undefined)}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: "To move a widget with the keyboard, press Space on its handle. Use the arrow keys to move it, Space to drop it and Escape to cancel. With a mouse, drag the widget itself." },
        }}
      >
        <div
          ref={slot}
          className={styles.arrange}
          style={{ ...zoomVar(fit.z), "--bw": `${fit.w}px`, "--bh": `${fit.min}px` } as CSSProperties}
        >
          <div className={styles.stage} style={{ width: fit.w * fit.z, height: fit.h * fit.z }}>
            <SortableContext items={ids} strategy={noShift}>
              <div ref={boardEl} className={`${styles.board} ${styles.edit}`} role="region" aria-label="Your board">
                {board.map((w) => (
                  <Cell key={w.widgetId} w={w} cls={sizeClass(w)} onRemove={() => remove(w.widgetId)} onResize={() => resize(w)}>
                    {render(w)}
                  </Cell>
                ))}
              </div>
            </SortableContext>
          </div>
          <div ref={tail} className={styles.tail} style={{ width: fit.w * fit.z }}>
            <NewRow />
            <p className={`${styles.hint} t-body-s`}>
              <Icon name="bx-grid-vertical" />
              Drag a widget to move it, or press Space on its handle and use the arrow keys.
            </p>
          </div>
        </div>
        <DragOverlay dropAnimation={reduce ? null : undefined}>
          {lifted && (
            <div className={styles.lift} style={zoomVar(fit.z)}>
              <div className={styles.liftIn}>{render(lifted)}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {shelfOpen && (
        <aside ref={shelfEl} className={styles.shelf} aria-label="Widget shelf">
          <div className={styles.shelfTitle}>
            <h2 className="t-title">Widget shelf</h2>
            <IconButton icon="bx-x" label="Close the Widget shelf" onClick={onCloseShelf} />
          </div>
          {shelf.length === 0 ? (
            <p className={`${styles.say} t-body-s-para`}>Every widget is on your board.</p>
          ) : (
            <ul className={styles.shelfList}>
              {shelf.map((w) => (
                <li key={w.widgetId} className={styles.shelfItem}>
                  <div className={styles.shelfRow}>
                    <span className={styles.preview}>
                      <Icon name={ICONS[w.widgetId]} />
                    </span>
                    <span className="t-body-m-strong">{TITLES[w.widgetId]}</span>
                  </div>
                  <div className={styles.shelfRow}>
                    <span className={`${styles.size} t-meta`}>{SIZE_LABEL[w.size]}</span>
                    <Button id={`add-${w.widgetId}`} icon="bx-plus" className={styles.add} aria-label={`Add ${TITLES[w.widgetId]} to the board`} onClick={() => add(w.widgetId)}>
                      Add
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/widgets" className={`${styles.manage} t-body-s-strong`}>
            Manage widgets
            <Icon name="bx-chevron-right" size={16} />
          </Link>
        </aside>
      )}
    </>
  );
}

// Its own component: useDroppable only reaches a DndContext above it, and Customise is the one that renders the context.
function NewRow() {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_ROW });
  return (
    <div ref={setNodeRef} className={`${styles.newRow} t-body-s`} data-over={isOver || undefined}>
      Drop here for a new row
    </div>
  );
}

function Cell({ w, cls, onRemove, onResize, children }: { w: DashboardWidget; cls: string; onRemove: () => void; onResize: () => void; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging, isOver } = useSortable({ id: w.widgetId });
  // The whole cell starts a mouse drag; only the grip takes the keyboard (Space, arrows). Content is inert, so no widget link can fire.
  const { onPointerDown, ...keys } = listeners ?? {};
  const stop: PointerEventHandler = (e) => e.stopPropagation(); // pressing a button is a click, not the start of a drag
  const name = TITLES[w.widgetId];
  const next = SIZE_LABEL[nextSize(w.size)];
  return (
    <div ref={setNodeRef} onPointerDown={onPointerDown as PointerEventHandler | undefined} className={`${styles.cell} ${styles.editCell} ${cls} ${w.widgetId === "forgotten" ? styles.heroCell : ""} ${isDragging ? styles.slot : ""}`}>
      <div className={styles.frozen} inert>
        {children}
      </div>
      <button ref={setActivatorNodeRef} id={`grip-${w.widgetId}`} type="button" className={styles.grip} aria-label={`Move ${name}`} {...attributes} {...keys}>
        <Icon name="bx-grid-vertical" size={20} />
      </button>
      <button type="button" className={styles.remove} aria-label={`Remove ${name} from the board`} onPointerDown={stop} onClick={onRemove}>
        <Icon name="bx-x" size={20} />
      </button>
      <button id={`size-${w.widgetId}`} type="button" className={`${styles.resize} t-meta`} aria-label={`Size of ${name}: ${SIZE_LABEL[w.size]}. Change to ${next}`} onPointerDown={stop} onClick={onResize}>
        <Icon name="bx-expand-alt" size={14} />
        {SIZE_LABEL[w.size]}
      </button>
      {isOver && !isDragging && <span className={`${styles.dropHere} t-body-s-strong`}>Drop here</span>}
    </div>
  );
}
