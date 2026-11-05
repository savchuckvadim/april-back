import { InfoblockLtService } from '../services/rpa-timeline-comment/infoblock/infoblock-lt.service';
import type { InitSupplyDto } from '../dto/init-supply.dto';

const dtoWith = (items: Array<{ code: string; value: string }>): InitSupplyDto =>
    ({ contractSpecificationState: { items } }) as unknown as InitSupplyDto;

describe('InfoblockLtService: Legal Tech в комментарии заявки', () => {
    const service = new InfoblockLtService();

    it('каждый платный пакет своей строкой со своим составом', () => {
        const comment = service.getLtComment(
            dtoWith([
                { code: 'specification_lt_free', value: 'LT Малый' },
                { code: 'specification_lt_free_services', value: ' Сутяжник\n' },
                { code: 'specification_lt_packet', value: 'LT Малый' },
                { code: 'specification_lt_services', value: 'Искра\n' },
                { code: 'specification_lt_packet_2', value: 'LT Средний' },
                { code: 'specification_lt_services_2', value: 'ЧекДок\nТендер\n' },
            ]),
        );
        expect(comment).toContain('Бесплатный LegalTech');
        expect(comment).toContain('<li>Сутяжник</li>');
        expect(comment).toContain('Платный LegalTech');
        // заголовок «Платный» один, пакеты — пунктами списка
        expect(comment.split('Платный LegalTech')).toHaveLength(2);
        expect(comment).toContain('<li>Искра</li>');
        expect(comment).toContain('LT Средний');
        expect(comment).toContain('<li>ЧекДок</li><li>Тендер</li>');
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
