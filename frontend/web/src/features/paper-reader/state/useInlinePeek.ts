import { useEffect, useState } from "react";
export function useInlinePeek(active: boolean) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    setHeld(false);
    if (!active) return;
    const down = (event: KeyboardEvent) => {
      if (event.key === "Alt" && !event.ctrlKey && !event.metaKey && !event.isComposing) {
        event.preventDefault();
        setHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Alt" || !event.altKey) setHeld(false);
    };
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [active]);
  return held;
}
