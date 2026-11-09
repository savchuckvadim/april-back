/** Пробелы по краям — не данные: « » в имени не должно пройти как имя. */
export const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Необязательное поле: пустая строка формы — то же, что «не заполнено»,
 * иначе пустая почта упала бы на проверке формата.
 */
export const trimOptional = ({ value }: { value: unknown }): unknown => {
    const trimmed = trim({ value });
    return trimmed === '' ? undefined : trimmed;
};
