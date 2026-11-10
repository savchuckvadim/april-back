/** Буква перед «г» — значит, это конец слова («Таганрог»), а не сокращение «город». */
const CITY_AFTER_MARK =
    /(?:^|[^а-яёa-z])г(?:\.|ород)?\s+([а-яё-]+)(?=[,\s]|$)/iu;
/** «…, Москва г, …» — обратный порядок, как пишет ФНС. */
const CITY_BEFORE_MARK = /,\s*([а-яё-]+)\s+г,/iu;

/**
 * Город заключения договора — из юридического адреса поставщика, как в
 * легаси ContractController (`contract_city`): «г. Москва». Не нашёлся —
 * пустая строка, шаблон напечатает прочерк.
 */
export const contractCityOf = (address: string | null | undefined): string => {
    if (!address) return '';
    const match =
        address.match(CITY_AFTER_MARK) ?? address.match(CITY_BEFORE_MARK);
    const city = match?.[1]?.trim();
    return city ? `г. ${city}` : '';
};
