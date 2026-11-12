import { stripPhpTagDollars } from '../../contract/generate/lib/template-dollar.util';

/**
 * Шаблоны отчёта о поставке пришли из Laravel и написаны под PhpWord:
 * поля `${name}`, блок `${client_rq_block}…${/client_rq_block}` (cloneBlock)
 * и строки таблиц, которые Laravel размножал `cloneRowAndSetValues` по
 * маркеру первой ячейки. docxtemplater понимает только `{name}`, `{#loop}`
 * и `{/loop}` — здесь шаблон переводится на его синтаксис перед рендером.
 * Шаблон, уже написанный под docxtemplater, проходит без изменений.
 */

/** Строки, размноженные в Laravel cloneRowAndSetValues: маркер → цикл данных. */
export const PHPWORD_ROW_LOOPS: ReadonlyArray<{
    marker: string;
    loop: string;
}> = [
    { marker: 'productNumber', loop: 'productRows' },
    { marker: 'contact_name', loop: 'contacts' },
];

/** Имя тега в тексте: после «{» или начала текстового узла, до «}» или конца узла. */
const tagNamePattern = (name: string, flags = ''): RegExp =>
    new RegExp(`([{>])(${name})(?=[<}])`, flags);

const textOf = (xml: string): string => xml.replace(/<[^>]+>/g, '');

/** `{name}…{/name}` (PhpWord cloneBlock) → `{#name}…{/name}`. */
export const openPhpWordBlocks = (xml: string): string => {
    const text = textOf(xml);
    const names = new Set(
        [...text.matchAll(/\{\/([A-Za-z0-9_]+)\}/g)].map(match => match[1]),
    );
    let out = xml;
    for (const name of names) {
        if (text.includes(`{#${name}}`) || text.includes(`{^${name}}`))
            continue;
        // первое вхождение имени не после «/» — открывающий тег блока
        out = out.replace(tagNamePattern(name), '$1#$2');
    }
    return out;
};

/** Открывающий тег текстового узла Word: `<w:t>` или `<w:t xml:space=…>`. */
const TEXT_OPEN = /<w:t(?:\s[^>]*)?>/;

/**
 * Элементы управления Word (`w:sdt`) внутри строки: цикл через них не
 * проходит («would produce invalid XML»). Содержимое оставляем, обёртку
 * снимаем — в шаблонах она скрытая и на вид документа не влияет.
 */
const unwrapContentControls = (row: string): string =>
    row
        .replace(/<w:sdt(?:\s[^>]*)?>[\s\S]*?<w:sdtContent>/g, '')
        .replace(/<\/w:sdtContent>\s*<\/w:sdt>/g, '');

/**
 * Строка таблицы с маркером → цикл: `{#loop}` в начало первой ячейки,
 * `{/loop}` в конец последней. docxtemplater повторит строку на каждый
 * элемент массива, как cloneRowAndSetValues в Laravel.
 */
export const wrapPhpWordRows = (
    xml: string,
    specs: ReadonlyArray<{ marker: string; loop: string }> = PHPWORD_ROW_LOOPS,
): string => {
    let out = xml;
    for (const { marker, loop } of specs) {
        if (textOf(out).includes(`{#${loop}}`)) continue;
        const at = out.search(tagNamePattern(marker));
        if (at < 0) continue;
        const rowStart = Math.max(
            out.lastIndexOf('<w:tr>', at),
            out.lastIndexOf('<w:tr ', at),
        );
        const rowEnd = out.indexOf('</w:tr>', at);
        if (rowStart < 0 || rowEnd < 0) continue;

        const row = unwrapContentControls(out.slice(rowStart, rowEnd));
        const open = TEXT_OPEN.exec(row);
        const lastClose = row.lastIndexOf('</w:t>');
        if (!open || lastClose < 0) continue;
        const afterOpen = open.index + open[0].length;
        const wrapped =
            row.slice(0, afterOpen) +
            `{#${loop}}` +
            row.slice(afterOpen, lastClose) +
            `{/${loop}}` +
            row.slice(lastClose);
        out = out.slice(0, rowStart) + wrapped + out.slice(rowEnd);
    }
    return out;
};

/** Полный перевод части документа: `$` → блоки → строки-циклы. */
export const convertPhpWordTemplate = (xml: string): string =>
    wrapPhpWordRows(openPhpWordBlocks(stripPhpTagDollars(xml)));
