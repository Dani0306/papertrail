/** Joins class names, skipping falsy values. Does not resolve Tailwind conflicts. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
