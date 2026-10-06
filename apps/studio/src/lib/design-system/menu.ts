/** An ordered action. Consumers own effects; labels carry no domain interpretation. */
export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}
