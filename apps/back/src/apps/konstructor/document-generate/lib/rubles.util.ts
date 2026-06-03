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

export const getCaseMonthes = (monthQuantity: number): string => {
    if (monthQuantity % 10 === 1 && monthQuantity % 100 !== 11) {
        return 'месяц';
    } else if (monthQuantity % 10 === 2 && monthQuantity % 100 !== 12) {
        return 'месяца';
    } else if (monthQuantity % 10 === 3 && monthQuantity % 100 !== 13) {
        return 'месяцев';
    } else {
        return 'месяцев';
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
