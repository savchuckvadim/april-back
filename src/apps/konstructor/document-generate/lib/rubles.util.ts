import { rubles } from 'rubles';
export const formatRuble = (value: number): string => {
    // return new Intl.NumberFormat('ru-RU', {
    //     style: 'currency',
    //     currency: 'RUB',
    //     minimumFractionDigits: 0,
    // }).format(value);
    return rubles(value)
}