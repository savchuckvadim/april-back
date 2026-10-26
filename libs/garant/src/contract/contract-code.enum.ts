/**
 * Коды видов договоров «Гаранта». Единственный источник значений для
 * генерации документов (резолв шаблонов по code) и валидации в админке:
 * опечатка в коде раньше молча превращала договор в internet
 * (fallback konstructor-init).
 */
export enum CONTRACT_CODE {
    INTERNET = 'internet',
    PROXIMA = 'proxima',
    ABON6 = 'abonHalf',
    ABON12 = 'abonYear',
    ABON24 = 'abonTwoYears',
    LIC = 'lic',
    LIC6 = 'licHalf',
    LIC12 = 'licYear',
    LIC24 = 'licTwoYears',
    KEY = 'key',
}

/** Runtime-массив кодов для валидации и Swagger */
export const CONTRACT_CODES = Object.values(CONTRACT_CODE);
