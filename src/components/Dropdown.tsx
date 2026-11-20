import {useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import {Check, ChevronDown} from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  /** Shown before the label, in the button and the list (a flag, an icon). */
  icon?: ReactNode;
}

interface DropdownProps {
  /** What is chosen; screen readers always hear it, sighted visitors see it unless hidden. */
  label: string;
  hideLabel?: boolean;
  /** Shown before the chosen option in the button, e.g. a language icon. */
  buttonIcon?: ReactNode;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  /** A longer explanation, shown when hovering the button. */
  hint?: string;
}

/**
 * The app's one dropdown: a button that opens a list, with the keyboard behaviour of a
 * native select (the WAI-ARIA "select-only combobox" pattern). A native <select> cannot
 * show flags or match the app's look, so every choice in the app uses this instead.
 */
export function Dropdown({label, hideLabel = false, buttonIcon, options, value, onChange, hint}: Readonly<DropdownProps>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const labelId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const optionId = (option: DropdownOption) => `${listboxId}-${option.value}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openList = () => {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const choose = (option: DropdownOption) => {
    setOpen(false);
    if (option.value !== value) onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    const moves: Partial<Record<string, (index: number) => number>> = {
      ArrowDown: (index) => Math.min(last, index + 1),
      ArrowUp: (index) => Math.max(0, index - 1),
      Home: () => 0,
      End: () => last,
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setActiveIndex(move);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const active = open ? options[activeIndex] : undefined;
  if (!selected) return null;

  return (
    <div ref={rootRef} className="relative flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span id={labelId} className={hideLabel ? 'sr-only' : 'text-xs sm:text-sm font-medium text-app-muted whitespace-nowrap'}>
        {label}
      </span>
      <div
        role="combobox"
        tabIndex={0}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-activedescendant={active ? optionId(active) : undefined}
        title={hint}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer select-none bg-app-btn text-app-heading hover:bg-app-btn-hover border border-app-border-strong focus-visible:outline-2 focus-visible:outline-app-accent"
      >
        {buttonIcon}
        {selected.icon}
        {selected.label}
        <ChevronDown className={`w-4 h-4 text-app-muted transition-transform ${open ? 'rotate-180' : ''}`}/>
      </div>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 top-full mt-2 z-20 min-w-full max-h-80 overflow-y-auto py-1 rounded-lg border border-app-border bg-app-card shadow-2xl"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                id={optionId(option)}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
                // Keyboard use goes through the combobox; this covers assistive technology
                // that activates an option directly.
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') choose(option);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer whitespace-nowrap ${index === activeIndex ? 'bg-app-btn-hover' : ''} ${isSelected ? 'font-semibold text-app-heading' : 'text-app-text'}`}
              >
                {option.icon}
                <span className="flex-1">{option.label}</span>
                {isSelected && <Check className="w-4 h-4 text-app-good"/>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
