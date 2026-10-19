/** One choice of a dropdown: the value a form or the API holds and the label the person reads. */
export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}
