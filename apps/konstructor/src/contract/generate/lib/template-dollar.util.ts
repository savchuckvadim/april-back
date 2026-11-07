/**
 * Шаблоны договоров пришли из Laravel (PhpWord), где поля писались как
 * `${name}`; docxtemplater понимает `{name}`, и `$` оставался в документе
 * («Итого цена за $1 месяц: $67078.80»). Убираем `$` перед `{`, в том числе
 * когда Word разнёс их по разным фрагментам текста (`$</w:t>…<w:t>{`).
 */
export const stripPhpTagDollars = (xml: string): string =>
    xml.replace(/\$((?:<[^>]*>)*)\{/g, '$1{');

/** Части DOCX с текстом, где могут стоять поля шаблона. */
export const TEMPLATE_TEXT_PARTS =
    /^word\/(?:document|header\d*|footer\d*)\.xml$/;
