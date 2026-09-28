import type { SmartLinkLoader } from '../../domain/loaders/smart-link.loader';

/** Заглушка SmartLinkLoader и её jest.Mock для проверки вызовов. */
export interface SmartLinksStub {
    loader: SmartLinkLoader;
    resolveLinks: jest.Mock;
}

/**
 * resolveLinks отвечает картой «transcriptionId → ссылка» по словарю; не
 * перечисленные id → null (как у настоящего загрузчика, когда элемента
 * смарта по звонку нет).
 */
export function smartLinksWith(
    linkById: Record<string, string | null> = {},
): SmartLinksStub {
    const resolveLinks = jest.fn((_domain: string, ids: readonly string[]) =>
        Promise.resolve(
            new Map<string, string | null>(
                ids.map(id => [id, linkById[id] ?? null]),
            ),
        ),
    );
    return {
        loader: { resolveLinks } as unknown as SmartLinkLoader,
        resolveLinks,
    };
}

/** resolveLinks падает — проверка fail-open use-case'а. */
export function smartLinksFailing(message: string): SmartLinksStub {
    const resolveLinks = jest.fn().mockRejectedValue(new Error(message));
    return {
        loader: { resolveLinks } as unknown as SmartLinkLoader,
        resolveLinks,
    };
}
