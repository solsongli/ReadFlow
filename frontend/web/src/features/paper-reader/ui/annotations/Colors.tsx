import { COLORS, type AnnotationColor, type Semantics } from "../../domain/annotations/types.js";
export function Colors({
  value,
  labels,
  change,
}: {
  value?: AnnotationColor;
  labels: Semantics;
  change: (color: AnnotationColor) => void;
}) {
  return (
    <div className="flex items-center gap-1" aria-label="批注颜色">
      {COLORS.map((color, index) => (
        <button
          key={color}
          type="button"
          data-annotation-color={color}
          title={`${labels[color]}（${index + 1}）`}
          aria-label={labels[color]}
          aria-pressed={value === color}
          onClick={() => change(color)}
          className="pr-color h-5 w-5 rounded-full border-2 border-transparent aria-pressed:border-wb-text"
        />
      ))}
    </div>
  );
}
