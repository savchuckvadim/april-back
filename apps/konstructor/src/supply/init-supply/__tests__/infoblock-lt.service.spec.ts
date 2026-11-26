import { InfoblockLtService } from '../services/rpa-timeline-comment/infoblock/infoblock-lt.service';
import type { InitSupplyDto } from '../dto/init-supply.dto';
import { RPA_NESTED_BULLET } from '../services/rpa-timeline-comment/lib/rpa-comment-helper.service';

const dtoWith = (
    items: Array<{ code: string; value: string }>,
): InitSupplyDto =>
    ({ contractSpecificationState: { items } }) as unknown as InitSupplyDto;

describe('InfoblockLtService: Legal Tech в комментарии заявки', () => {
    const service = new InfoblockLtService();

    it('каждый платный пакет своей строкой со своим составом', () => {
        const comment = service.getLtComment(
            dtoWith([
                { code: 'specification_lt_free', value: 'LT Малый' },
                {
                    code: 'specification_lt_free_services',
                    value: ' Сутяжник\n',
                },
                { code: 'specification_lt_packet', value: 'LT Малый' },
                { code: 'specification_lt_services', value: 'Искра\n' },
                { code: 'specification_lt_packet_2', value: 'LT Средний' },
                {
                    code: 'specification_lt_services_2',
                    value: 'ЧекДок\nТендер\n',
                },
            ]),
        );
        expect(comment).toContain('Бесплатный LegalTech');
        expect(comment).toContain(`${RPA_NESTED_BULLET}Сутяжник`);
        expect(comment).toContain('Платный LegalTech');
        // заголовок «Платный» один, пакеты — пунктами, состав — под пакетом
        expect(comment.split('Платный LegalTech')).toHaveLength(2);
        expect(comment).toContain(
            `• [b]LT Малый[/b]\n${RPA_NESTED_BULLET}Искра`,
        );
        expect(comment).toContain(
            `• [b]LT Средний[/b]\n${RPA_NESTED_BULLET}ЧекДок\n${RPA_NESTED_BULLET}Тендер`,
        );
    });

    it('без Legal Tech — пусто; пустой легаси-пакет не печатается', () => {
        expect(
            service.getLtComment(
                dtoWith([
                    { code: 'specification_lt_packet', value: '' },
                    { code: 'specification_lt_services', value: '' },
                ]),
            ),
        ).toBe('');
    });
});
