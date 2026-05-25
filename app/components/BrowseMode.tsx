'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExclamationmarkTriangleFillIcon } from "@navikt/aksel-icons";
import {
  getRatingColor,
  getRatingLabel,
} from "../utils/ratingColors";
import SkinTypeSelect from "./SkinTypeSelect";

interface Ingredient {
  id: string;
  inciName: string;
  commonNames: string[];
  rating: number | null;
  irritancy: number;
  category: string;
  categoryGroup: string;
  function: string[];
  description: string;
  skinTypeNotes: Record<string, string>;
  flags: string[];
  sourceUrls?: { name: string; url: string; type: string }[];
  regulatory?: {
    status: string;
    annex: string;
    restriction_details: string;
    conditions: string;
    regulation_source: string;
  };
}

type SkinType = "all" | "oily" | "dry" | "sensitive" | "acneProne" | "normal";

interface ApiResponse {
  ingredients: Ingredient[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  categories: string[];
}

function getSkinTypeAdvice(ingredient: Ingredient, skinType: SkinType): string {
  if (skinType === "all") return "";
  if (ingredient.rating === null || ingredient.rating === undefined) return "";
  const advice = ingredient.skinTypeNotes[skinType];
  if (!advice) return "";
  const adviceMap: Record<string, string> = {
    safe: "Safe for your skin type",
    caution: "Use with caution",
    avoid: "Best to avoid",
  };
  return adviceMap[advice] || advice;
}

function getSkinTypeAdviceColor(ingredient: Ingredient, skinType: SkinType): string {
  if (skinType === "all") return "";
  const advice = ingredient.skinTypeNotes[skinType];
  if (!advice) return "";
  const colorMap: Record<string, string> = {
    safe: "text-[var(--ds-color-success-text-default)]",
    caution: "text-[var(--ds-color-warning-text-default)]",
    avoid: "text-[var(--ds-color-danger-text-default)]",
  };
  return colorMap[advice] || "";
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function BrowseMode({
  selectedSkinType,
  onSkinTypeChange,
  onSelectIngredient,
}: {
  selectedSkinType: SkinType;
  onSkinTypeChange: (type: SkinType) => void;
  onSelectIngredient: (ing: Ingredient | null) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "name" | "category">("rating");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchIngredients = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', '50');
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedSkinType !== 'all') params.set('skinType', selectedSkinType);

      const apiSortBy = sortBy === 'rating' ? 'rating' : sortBy === 'name' ? 'inci_name' : 'category';
      const apiSortOrder = sortBy === 'rating' ? 'desc' : 'asc';
      params.set('sortBy', apiSortBy);
      params.set('sortOrder', apiSortOrder);

      const res = await fetch(`/api/ingredients?${params.toString()}`);
      const data: ApiResponse = await res.json();
      setIngredients(data.ingredients);
      setPagination(data.pagination);
      if (data.categories.length > 0) setCategories(data.categories);
    } catch (err) {
      console.error('Failed to fetch ingredients:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, selectedSkinType, sortBy]);

  // Fetch when page changes
  useEffect(() => {
    fetchIngredients(page);
  }, [page, fetchIngredients]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategory, selectedSkinType, sortBy]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
  };

  const handleSortChange = (value: "rating" | "name" | "category") => {
    setSortBy(value);
  };

  return (
    <div className="space-y-6">
      {/* Scale Info */}
      <div className="p-4 bg-[var(--ds-color-surface-tinted)] rounded-xl border border-[var(--ds-color-border-default)]">
        <h3 className="text-sm font-semibold text-[var(--ds-color-text-default)] mb-2">
          About the Comedogenic Scale
        </h3>
        <p className="text-xs text-[var(--ds-color-text-subtle)] mb-2">
          Based on the Fulton 1989 rabbit ear assay (REA). Ratings 0-1 are
          generally safe, 2-3 use caution, 4-5 avoid for acne-prone skin. Note:
          REA is more sensitive than human skin; concentration and formulation
          matter.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[5, 4, 3, 2, 1, 0].map((r) => (
            <span
              key={r}
              className={`text-xs px-2 py-1 rounded-full ${getRatingColor(r)}`}
            >
              {r}: {getRatingLabel(r)}
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search ingredients..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-3 pl-11 bg-[var(--ds-color-surface-tinted)] border border-[var(--ds-color-border-default)] rounded-xl text-[var(--ds-color-text-default)] placeholder-text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-neutral-base-default)] focus:border-transparent transition-all"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ds-color-text-subtle)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <SkinTypeSelect
            value={selectedSkinType}
            onChange={onSkinTypeChange}
          />

          <div className="ds-field">
            <label className="ds-label" data-weight="medium">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="ds-input"
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="ds-field">
            <label className="ds-label" data-weight="medium">
              Sort by
            </label>
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as "rating" | "name" | "category")}
              className="ds-input"
            >
              <option value="rating">Rating (High to Low)</option>
              <option value="name">Name (A-Z)</option>
              <option value="category">Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-[var(--ds-color-text-subtle)]">
        {loading ? 'Searching...' : `Showing ${ingredients.length} of ${pagination.total} ingredients`}
      </div>

      {/* Ingredient List */}
      <div className="space-y-3">
        {ingredients.map((ingredient) => {
          const isBanned = ingredient.regulatory?.status === 'banned';
          return (
          <div
            key={ingredient.id}
            onClick={() => onSelectIngredient(ingredient)}
            className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
              isBanned
                ? 'bg-[var(--ds-color-danger-surface-default)]/10 border-[var(--ds-color-danger-border-default)] hover:border-[var(--ds-color-danger-border-strong)]'
                : 'bg-[var(--ds-color-surface-tinted)] border-[var(--ds-color-border-default)] hover:border-[var(--ds-color-border-strong)]'
            }`}
          >
            {isBanned && (
              <div className="flex items-center gap-2 mb-2">
                <ExclamationmarkTriangleFillIcon className="text-[var(--ds-color-danger-text-default)]" aria-label="Banned ingredient warning" />
                <span className="text-sm font-bold text-[var(--ds-color-danger-text-default)]">
                  Banned Ingredient
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`font-semibold ${isBanned ? 'text-[var(--ds-color-danger-text-default)]' : 'text-[var(--ds-color-text-default)]'}`}>
                    {ingredient.inciName}
                  </h3>
                  {ingredient.commonNames.length > 0 && (
                    <span className="text-sm text-[var(--ds-color-text-subtle)] truncate">
                      ({ingredient.commonNames[0]})
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--ds-color-text-subtle)] mt-1 line-clamp-2">
                  {ingredient.description}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs px-2 py-1 bg-[var(--ds-color-surface-hover)] text-[var(--ds-color-text-subtle)] rounded-full">
                    {ingredient.category}
                  </span>
                  {ingredient.regulatory && (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${
                      ingredient.regulatory.status === 'banned'
                        ? 'bg-[var(--ds-color-danger-surface-default)] text-[var(--ds-color-danger-text-default)]'
                        : 'bg-[var(--ds-color-warning-surface-default)] text-[var(--ds-color-warning-text-default)]'
                    }`}>
                      {ingredient.regulatory.status === 'banned' && (
                        <ExclamationmarkTriangleFillIcon className="w-3 h-3" aria-label="Banned" />
                      )}
                      {ingredient.regulatory.status === 'banned' ? 'BANNED' : 'RESTRICTED'}
                    </span>
                  )}
                  {ingredient.irritancy > 0 && (
                    <span className="text-xs px-2 py-1 bg-[var(--ds-color-warning-surface-tinted)] text-[var(--ds-color-warning-text-default)] rounded-full">
                      Irritancy: {ingredient.irritancy}/5
                    </span>
                  )}
                  {selectedSkinType !== "all" && (
                    <span
                      className={`text-xs font-medium ${getSkinTypeAdviceColor(ingredient, selectedSkinType)}`}
                    >
                      {getSkinTypeAdvice(ingredient, selectedSkinType)}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px] ${getRatingColor(ingredient.rating)}`}
              >
                <div className="text-2xl font-bold">{ingredient.rating}</div>
                <div className="text-xs font-medium opacity-80">
                  {getRatingLabel(ingredient.rating)}
                </div>
              </div>
            </div>
          </div>
        )}
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-[var(--ds-color-border-default)]">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-4 py-2 rounded-lg border border-[var(--ds-color-border-default)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--ds-color-surface-hover)] transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--ds-color-text-subtle)]">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages || loading}
            className="px-4 py-2 rounded-lg border border-[var(--ds-color-border-default)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--ds-color-surface-hover)] transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && ingredients.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-semibold text-[var(--ds-color-text-default)] mb-1">
            No ingredients found
          </h3>
          <p className="text-[var(--ds-color-text-subtle)]">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  );
}
