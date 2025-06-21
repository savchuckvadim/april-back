export enum SmartNameEnum {
    SERVICE_OFFER = 'service_offer',
    SERVICE_ORDER = 'service_order',
    SERVICE_CALL = 'service_call',
    SERVICE_CALL_RESULT = 'service_call_result',
    SERVICE_CALL_RESULT_RESULT = 'service_call_result_result',
}

export enum SmartGroupEnum {
    SERVICE = 'service',
    SALES = 'sales',

}

export class InstallSmartDto {
    smartName: SmartNameEnum;
    domain: string;
}
