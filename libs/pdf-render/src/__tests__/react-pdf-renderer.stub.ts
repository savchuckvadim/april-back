/**
 * Заглушка `@react-pdf/renderer` для jest (moduleNameMapper в package.json):
 * пакет ESM-only и под CommonJS-раннером не грузится, а DI-тесты модулей
 * импортируют графы с PDF-сервисами. Примитивы — строковые теги (по дереву
 * элементов можно ходить и собирать тексты), рендер — байты-заглушка.
 * Спеки, которым нужно своё поведение, делают `jest.mock` с фабрикой —
 * фабрика сильнее маппера.
 */
export const Document = 'DOCUMENT';
export const Page = 'PAGE';
export const Text = 'TEXT';
export const View = 'VIEW';
export const Image = 'IMAGE';

export const StyleSheet = {
    create: <T>(styles: T): T => styles,
};

export const Font = {
    register: (): void => undefined,
    registerHyphenationCallback: (): void => undefined,
};

export const renderToBuffer = (): Promise<Buffer> =>
    Promise.resolve(Buffer.from('%PDF-1.7 stub'));

export const pdf = (): never => {
    throw new Error('pdf() под jest не рендерит: замокайте в спеке');
};
