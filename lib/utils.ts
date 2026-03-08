export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function sanitizeFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return cleaned || "upload";
}

export function normalizeOptionalText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeOptionalNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferSupermarketTag(name: string | null | undefined) {
  return name ? slugify(name).toUpperCase() || null : null;
}

export function formatDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(parsed);
}

export function formatCurrencyValue(value: number | null, currency: string | null) {
  if (value === null) {
    return "-";
  }

  if (!currency) {
    return value.toFixed(2);
  }

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
