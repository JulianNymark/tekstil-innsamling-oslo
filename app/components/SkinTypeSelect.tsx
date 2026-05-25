import { getSkinTypeLabel } from "../utils/ratingColors";

type SkinType = "all" | "oily" | "dry" | "sensitive" | "acneProne" | "normal";

const SKIN_TYPES: SkinType[] = [
  "all",
  "oily",
  "dry",
  "sensitive",
  "acneProne",
  "normal",
];

interface SkinTypeSelectProps {
  value: SkinType;
  onChange: (value: SkinType) => void;
}

export default function SkinTypeSelect({
  value,
  onChange,
}: SkinTypeSelectProps) {
  return (
    <div className="ds-field max-w-fit">
      <label className="ds-label" htmlFor="skin-type" data-weight="medium">
        Skin Type
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SkinType)}
        className="ds-input"
        id="skin-type"
      >
        {SKIN_TYPES.map((type) => (
          <option key={type} value={type}>
            {getSkinTypeLabel(type)}
          </option>
        ))}
      </select>
    </div>
  );
}
