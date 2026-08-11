export enum SmartNameEnum {
    SERVICE_OFFER = 'service_offer',
    PRESENTATION = 'presentation',
    COLD = 'cold',
    /** Const-смарт «AI-анализ звонков»: шаблон из констант, не из Excel. */
    AICALL = 'aicall',
    /** Const-смарт «СКАП» (логин×месяц): шаблон из констант, не из Excel. */
    SKAP = 'skap',
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
