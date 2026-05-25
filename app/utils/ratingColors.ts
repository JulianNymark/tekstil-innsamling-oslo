/**
 * Returns Tailwind classes for a rating badge background and text color.
 * Uses a symmetric diverging scale: both edges (0 and 5) are strongest;
 * the middle (2, 3) is most subtle.
 */
export function getRatingColor(rating: number): string {
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
      return "bg-rating-0-bg text-rating-0-text";
  }
}

export function getRatingLabel(rating: number): string {
  if (rating === 0) return "Non-comedogenic";
  if (rating === 1) return "Very Low";
  if (rating === 2) return "Low";
  if (rating === 3) return "Moderate";
  if (rating === 4) return "High";
  return "Very High";
}
