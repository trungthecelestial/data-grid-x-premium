import { useCallback, useRef, useState } from 'react';

/** State that follows MUI X's controlled/uncontrolled convention: a defined `controlled` value wins, otherwise the hook owns the state seeded from `initial`. */
export function useGridState<T>(controlled: T | undefined, initial: T, onChange?: (value: T) => void) {
  const [internal, setInternal] = useState<T>(initial);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : internal;

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(valueRef.current) : next;
      valueRef.current = resolved;
      if (!isControlled) {
        setInternal(resolved);
      }
      onChangeRef.current?.(resolved);
    },
    [isControlled],
  );

  return [value, setValue] as const;
}
