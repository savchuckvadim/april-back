import { isValidElement, type ReactNode } from 'react';

/**
 * Дерево примитивов react-pdf после раскрытия компонентов: по нему спеки
 * проверяют, какие блоки неделимы и что в них лежит. Работает с заглушкой
 * @react-pdf/renderer (react-pdf.mock): примитивы — строковые теги.
 */
export interface HostNode {
    type: string;
    props: Record<string, unknown>;
    children: Array<HostNode | string>;
}

type Component = (props: Record<string, unknown>) => ReactNode;

/** Раскрывает функции-компоненты и фрагменты; остаются примитивы и строки */
export const expandHost = (node: ReactNode): Array<HostNode | string> => {
    if (node === null || node === undefined || typeof node === 'boolean') {
        return [];
    }
    if (typeof node === 'string' || typeof node === 'number') {
        return [String(node)];
    }
    if (Array.isArray(node)) return node.flatMap(expandHost);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    if (typeof node.type === 'function') {
        return expandHost((node.type as Component)(node.props));
    }
    const children = expandHost(node.props.children as ReactNode);
    return typeof node.type === 'string'
        ? [{ type: node.type, props: node.props, children }]
        : children;
};

/** Все узлы в порядке документа */
export const flattenHost = (nodes: Array<HostNode | string>): HostNode[] =>
    nodes.flatMap(node =>
        typeof node === 'string' ? [] : [node, ...flattenHost(node.children)],
    );

/** Текст узла со всеми потомками */
export const hostText = (node: HostNode | string): string =>
    typeof node === 'string' ? node : node.children.map(hostText).join('');

/** Неделимые блоки (`wrap={false}`), в которых лежит текст */
export const unbreakableWith = (tree: HostNode[], text: string): HostNode[] =>
    tree.filter(
        node => node.props.wrap === false && hostText(node).includes(text),
    );
