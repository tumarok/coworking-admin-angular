/** One choice of a dropdown: the value a form or the API holds and the label the person reads. */
export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

/**
 * The options of a filter, with the value in force added when they do not list it: a link or an old
 * URL can name a record that was deleted or lies past the first page, and a filter that narrows the
 * list must be on screen to be taken off. Nothing is added before the options have `loaded`, as the
 * value may be among them.
 */
export function withCurrentOption(
  options: readonly SelectOption[],
  current: string | undefined,
  loaded: boolean,
  label: string,
): readonly SelectOption[] {
  const missing = current && loaded && !options.some((option) => option.value === current);
  return missing ? [{ value: current, label }, ...options] : options;
}
