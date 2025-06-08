import { rubles } from 'rubles';
// import { convert as convertNumberToWordsRu } from 'number-to-words-ru'
//todo https://www.npmjs.com/package/number-to-words-ru
export const formatRuble = (value: number): string => {
    // return new Intl.NumberFormat('ru-RU', {
    //     style: 'currency',
    //     currency: 'RUB',
    //     minimumFractionDigits: 0,
    // }).format(value);
    return rubles(value)
}

// Использование без опций
// convertNumberToWordsRu('104')
// // Сто четыре рубля 00 копеек

// // или с опциями
// convertNumberToWordsRu('-4201512.21', {
//   currency: 'rub',
//   declension: 'nominative',
//   roundNumber: -1,
//   convertMinusSignToWord: true,
//   showNumberParts: {
//     integer: true,
//     fractional: true,
//   },
//   convertNumberToWords: {
//     integer: true,
//     fractional: false,
//   },
//   showCurrency: {
//     integer: true,
//     fractional: true,
//   },
// })