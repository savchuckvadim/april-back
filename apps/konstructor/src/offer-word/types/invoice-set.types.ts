/**
 * Из какого набора собран счёт: `general` — основной набор запроса,
 * `alternative` — набор «для сравнения». Вместе с индексом в своём массиве
 * (`sets.general[i]` или `sets.alternative[i]`) однозначно указывает набор.
 */
export type InvoiceSetKind = 'general' | 'alternative';
