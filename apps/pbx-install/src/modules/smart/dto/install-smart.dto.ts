export enum SmartNameEnum {
    SERVICE_OFFER = 'service_offer',
    PRESENTATION = 'presentation',
    COLD = 'cold',
    /** Const-смарт «AI-анализ звонков»: шаблон из констант, не из Excel. */
    AICALL = 'aicall',
    /** Const-смарт «СКАП» (логин×месяц): шаблон из констант, не из Excel. */
    SKAP = 'skap',
    /** Const-смарт «Звонки По решению»: первый const-смарт с воронкой. */
    ZPR = 'zpr',
    /**
     * Const-смарт «Презентации» — зеркало сделок «ОП Презентации».
     * Значение `pres`, а НЕ `presentation`: имя presentation занято
     * Excel-шаблоном смарта выше, а const-ветка ParseSmartService матчит
     * шаблоны по паре (type, group) и перехватила бы его.
     */
    PRES = 'pres',
}

export enum SmartGroupEnum {
    SERVICE = 'service',
    SALES = 'sales',
    GENERAL = 'general',
}

export class InstallSmartDto {
    smartName: SmartNameEnum;
    group: SmartGroupEnum;
    domain: string;
}
