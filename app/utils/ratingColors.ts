/**
 * Returns Tailwind classes for a rating badge background and text color.
 * Uses a symmetric diverging scale: both edges (0 and 5) are strongest;
 * the middle (2, 3) is most subtle.
 */
export function getRatingColor(rating: number | null | undefined): string {
  // Treat null/undefined as "no data" — neutral gray
  if (rating === null || rating === undefined) return "bg-[var(--ds-color-surface-hover)] text-[var(--ds-color-text-subtle)]";
  switch (rating) {
    case 0:
      return "bg-rating-0-bg text-rating-0-text";
    case 1:
      return "bg-rating-1-bg text-rating-1-text";
    case 2:
      return "bg-rating-2-bg text-rating-2-text";
    case 3:
      return "bg-rating-3-bg text-rating-3-text";
    case 4:
      return "bg-rating-4-bg text-rating-4-text";
    case 5:
      return "bg-rating-5-bg text-rating-5-text";
    default:
      return "bg-[var(--ds-color-surface-hover)] text-[var(--ds-color-text-subtle)]";
  }
}

export function getRatingColorBorder(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "border border-[var(--ds-color-border-subtle)]";
  switch (rating) {
    case 0:
      return "border border-[var(--ds-color-success-border-strong)]";
    case 1:
      return "border border-[var(--ds-color-success-border-subtle)]";
    case 2:
    case 3:
      return "border border-[var(--ds-color-border-subtle)]";
    case 4:
      return "border border-[var(--ds-color-danger-border-subtle)]";
    case 5:
      return "border border-[var(--color-danger-border-dark)]";
    default:
      return "border border-[var(--ds-color-border-subtle)]";
  }
}

export function getRatingLabel(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "No data";
  if (rating === 0) return "Non-comedogenic";
  if (rating === 1) return "Very Low";
  if (rating === 2) return "Low";
  if (rating === 3) return "Moderate";
  if (rating === 4) return "High";
  return "Very High";
}

type SkinType = "all" | "oily" | "dry" | "sensitive" | "acneProne" | "normal";

export function getSkinTypeLabel(type: SkinType): string {
  const labels: Record<SkinType, string> = {
    all: "All Skin Types",
    oily: "Oily",
    dry: "Dry",
    sensitive: "Sensitive",
    acneProne: "Acne-Prone",
    normal: "Normal",
  };
  return labels[type];
}
