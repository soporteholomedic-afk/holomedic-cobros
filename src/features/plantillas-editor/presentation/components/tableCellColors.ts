export const CELL_COLORS = [
  { name: 'Default', value: 'default' },
  { name: 'Gris', value: '#e0e0e0' },
  { name: 'Rojo', value: '#ffcdd2' },
  { name: 'Naranja', value: '#ffe0b2' },
  { name: 'Amarillo', value: '#fff9c4' },
  { name: 'Verde', value: '#c8e6c9' },
  { name: 'Azul', value: '#bbdefb' },
  { name: 'Púrpura', value: '#e1bee7' },
  { name: 'Rosa', value: '#f8bbd0' },
  { name: 'Celeste', value: '#b2ebf2' },
] as const;

export function buildTableCellColorCSS(): string {
  const rules = CELL_COLORS
    .filter((c) => c.value !== 'default')
    .map(
      (c) =>
        `td[data-background-color="${c.value}"],th[data-background-color="${c.value}"]{background-color:${c.value}!important}`,
    )
    .join('');
  return rules;
}
