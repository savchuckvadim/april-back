import { isValidElement, ReactNode } from 'react';

/**
 * Заглушка @react-pdf/renderer для jest: пакет ESM-only и под CommonJS-
 * раннером jest не грузится. Примитивы — строковые теги, чтобы по дереву
 * элементов можно было ходить и собирать тексты (collectTexts).
 * Подключать в spec: `jest.mock('@react-pdf/renderer', () => createReactPdfMock())`.
 */
export const createReactPdfMock = () => ({
    Document: 'DOCUMENT',
    Page: 'PAGE',
    Text: 'TEXT',
    View: 'VIEW',
    Image: 'IMAGE',
    StyleSheet: { create: <T>(styles: T): T => styles },
    Font: {
        register: (): void => undefined,
        registerHyphenationCallback: (): void => undefined,
    },
    renderToBuffer: (): Promise<Buffer> =>
        Promise.resolve(Buffer.from('%PDF-1.7 mock')),
});

type RenderProps = {
    pageNumber: number;
    totalPages: number;
    subPageNumber: number;
};
type ElementProps = {
    children?: ReactNode;
    render?: (props: RenderProps) => ReactNode;
};

/**
 * Все строки из React-дерева шаблона в порядке обхода: функции-компоненты
 * вызываются, render-пропсы (номер страницы) — с первой страницей.
 */
export const collectTexts = (node: ReactNode): string[] => {
    if (node === null || node === undefined || typeof node === 'boolean') {
        return [];
    }
    if (typeof node === 'string' || typeof node === 'number') {
        return [String(node)];
    }
    if (Array.isArray(node)) {
        return node.flatMap(collectTexts);
    }
    if (!isValidElement<ElementProps>(node)) {
        return [];
    }
    const texts: string[] = [];
    if (typeof node.props.render === 'function') {
        texts.push(
            ...collectTexts(
                node.props.render({
                    pageNumber: 1,
                    totalPages: 1,
                    subPageNumber: 1,
                }),
            ),
        );
    }
    if (typeof node.type === 'function') {
        const component = node.type as (props: ElementProps) => ReactNode;
        texts.push(...collectTexts(component(node.props)));
    } else {
        texts.push(...collectTexts(node.props.children));
    }
    return texts;
};
