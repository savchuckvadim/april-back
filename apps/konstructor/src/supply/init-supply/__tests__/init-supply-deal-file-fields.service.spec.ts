import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { InitSupplyDto } from '../dto/init-supply.dto';
import { InitSupplyDealFileFieldsService } from '../services/file/init-supply-deal-file-fields.service';

/**
 * Файл, приложенный менеджером, уходит и в RPA, и в поле сделки. Файл, который
 * уже лежит в сделке (`downloadUrl`), в сделку писать не надо — он там есть.
 */
describe('InitSupplyDealFileFieldsService', () => {
    const service = new InitSupplyDealFileFieldsService();

    const portalModelWith = (codes: Record<string, string>): PortalModel =>
        ({
            getDealFieldBitrixIdByCode: (code: string) => codes[code] ?? '',
        }) as unknown as PortalModel;

    const dtoWith = (files: InitSupplyDto['files']): InitSupplyDto =>
        ({ domain: 'd.ru', files }) as InitSupplyDto;

    it('без приложенных файлов не трогает сделку', () => {
        expect(service.get(dtoWith(undefined), portalModelWith({}))).toEqual(
            {},
        );
        expect(service.get(dtoWith([]), portalModelWith({}))).toEqual({});
    });

    it('берёт имя поля сделки из pbx', () => {
        const result = service.get(
            dtoWith([
                {
                    code: 'current_contract',
                    filename: 'dogovor.docx',
                    base64: 'QkFTRTY0',
                },
            ]),
            portalModelWith({ current_contract: 'UF_CRM_1684144993' }),
        );

        expect(result).toEqual({
            UF_CRM_1684144993: { fileData: ['dogovor.docx', 'QkFTRTY0'] },
        });
    });

    it('падает на легаси-имя, если поля нет в pbx', () => {
        const result = service.get(
            dtoWith([
                {
                    code: 'current_invoice',
                    filename: 'schet.pdf',
                    base64: 'QkFTRTY0',
                },
            ]),
            portalModelWith({}),
        );

        expect(result).toEqual({
            UF_CRM_CURRENT_INVOICE: { fileData: ['schet.pdf', 'QkFTRTY0'] },
        });
    });

    it('игнорирует файлы других полей и пустой base64', () => {
        const result = service.get(
            dtoWith([
                { code: 'current_supply', filename: 'otchet.docx', base64: 'X' },
                { code: 'current_contract', filename: 'dogovor.docx', base64: '' },
            ]),
            portalModelWith({
                current_supply: 'UF_CRM_SUPPLY',
                current_contract: 'UF_CRM_CONTRACT',
            }),
        );

        expect(result).toEqual({});
    });
});
