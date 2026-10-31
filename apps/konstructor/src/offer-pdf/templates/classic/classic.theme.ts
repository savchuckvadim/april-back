/**
 * Палитра и размеры «классического» КП — по старому Blade-шаблону
 * (синий акцент rgb(48,115,230), красный rgb(220,26,33), приглушённый текст).
 */
export const CLASSIC_THEME = {
    colors: {
        text: '#111111',
        muted: '#55637C',
        accent: '#3073E6',
        danger: '#DC1A21',
        line: '#D7DEEA',
        shade: '#F3F6FB',
        tableBorder: '#9AA6BC',
    },
    sizes: {
        xs: 7.5,
        sm: 8.5,
        base: 10,
        lg: 11.5,
        h2: 13,
        h1: 15,
    },
    page: {
        paddingTop: 92,
        paddingBottom: 86,
        paddingHorizontal: 44,
        /** Отступ шапки/подвала от края листа */
        edge: 26,
    },
} as const;
