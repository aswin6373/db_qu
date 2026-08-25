import { useEffect, useState } from "react";

type Props = {
  value: number;
  /** Used when the field is emptied and blurred (e.g. 3306 for ports). */
  fallback: number;
  min?: number;
  max?: number;
  className?: string;
  onCommit: (value: number) => void;
};

/** Number input that can be temporarily cleared while typing — a plain
 *  `Number(e.target.value) || fallback` snaps back to the default on every
 *  keystroke of deletion, which makes editing ports miserable. */
export function NumberField({ value, fallback, min, max, className, onCommit }: Props) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (current === String(value) ? current : String(value)));
  }, [value]);

  return (
    <input
      className={className}
      max={max}
      min={min}
      onBlur={() => {
        if (text.trim() === "") {
          setText(String(fallback));
          onCommit(fallback);
        }
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        if (raw !== "") {
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) onCommit(parsed);
        }
      }}
      type="number"
      value={text}
    />
  );
}
