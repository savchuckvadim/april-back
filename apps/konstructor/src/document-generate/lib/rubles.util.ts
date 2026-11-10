import { convert as convertNumberToWordsRu } from 'number-to-words-ru';

/** Formats a number as a money string with exactly 2 decimal places: 5000 → "5000.00" */
export const formatMoney = (value: number): string => {
    return value.toFixed(2);
};

export const formatRuble = (value: number): string => {
    return convertNumberToWordsRu(value, {
        currency: 'rub',
        declension: 'nominative',
        roundNumber: -1,
        convertMinusSignToWord: true,
        showNumberParts: {
            integer: true,
            fractional: true,
        },
    });
};

/** 1 месяц, 2–4 месяца, 5–20 месяцев (11–14 — «месяцев»). */
export const getCaseMonthes = (monthQuantity: number): string => {
    const lastTwo = monthQuantity % 100;
    const last = monthQuantity % 10;
    if (last === 1 && lastTwo !== 11) return 'месяц';
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
        return 'месяца';
    }
    return 'месяцев';
};

// Использование без опций
// convertNumberToWordsRu('104')
// // Сто четыре рубля 00 копеек

// // или с опциями
// convertNumberToWordsRu('-4201512.21', {
//     currency: 'rub',
//     declension: 'nominative',
//     roundNumber: -1,
//     convertMinusSignToWord: true,
//     showNumberParts: {
//         integer: true,
//         fractional: true,
//     },
//     convertNumberToWords: {
//         integer: true,
//         fractional: false,
//     },
//     showCurrency: {
//         integer: true,
//         fractional: true,
//     },
// });
// console.log(
//     convertNumberToWordsRu('-4201512.21', {
//         currency: 'rub',
//         declension: 'nominative',
//         roundNumber: -1,
//         convertMinusSignToWord: true,
//         showNumberParts: {
//             integer: true,
//             fractional: true,
//         },
//         convertNumberToWords: {
//             integer: true,
//             fractional: false,
//         },
//         showCurrency: {
//             integer: true,
//             fractional: true,
//         },
//     }),
// );
