/**
 * Маскирование email для показа в кабинете и в журнале.
 *
 * Кабинет открывает любой сотрудник портала, поэтому полный контактный адрес
 * организации наружу не отдаём — достаточно узнаваемого огрызка, по которому
 * владелец поймёт «да, это моя почта».
 *
 * Домен не скрываем: именно он делает адрес узнаваемым, а секретом не является.
 */
export function maskEmail(email: string | null | undefined): string {
    if (!email) return '';
    const at = email.lastIndexOf('@');
    if (at <= 0) return '***';

    const local = email.slice(0, at);
    const domain = email.slice(at);

    // Короткий локальный кусок раскрывать нельзя: 1–2 символа + домен почти
    // всегда однозначно восстанавливают адрес.
    if (local.length <= 2) return `***${domain}`;

    return `${local[0]}***${local[local.length - 1]}${domain}`;
}
