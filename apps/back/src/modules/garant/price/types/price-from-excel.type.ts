export class PriceCreateType {
    //данные по которым в db будут еще найдены связи с другими таблицами
    code: string;
    region_type: '1' | '0';

    value: number;
    isSpecial: boolean;
    discount: number | null;

    complectCode: string | null; // будет найден Complect по code
    supplyTypeCode: '1' | '0' | null; // 0 - internet 1 - proxima
    supplyCode: string | null; // 1 - 18 будет найден Supply по code
    supplyType: 'internet' | 'proxima' | null; // internet | proxima

    garantPackageCode: string | null; // будет найден Package по code
}
