import type { OfferPdfTheme } from './offer-pdf-theme';

/**
 * Стили, собранные по теме, — один раз на тему. Тема приходит пропсом:
 * тесты обходят дерево, вызывая компоненты как функции, и React-контекст
 * (хуки) там не работает.
 */
export const themedStyles = <T>(
    build: (theme: OfferPdfTheme) => T,
): ((theme: OfferPdfTheme) => T) => {
    const cache = new WeakMap<OfferPdfTheme, T>();
    return theme => {
        const cached = cache.get(theme);
        if (cached) return cached;
        const built = build(theme);
        cache.set(theme, built);
        return built;
    };
};
