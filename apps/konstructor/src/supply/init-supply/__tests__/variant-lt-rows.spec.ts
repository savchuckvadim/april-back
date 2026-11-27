import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { InitSupplyDto } from '../dto/init-supply.dto';
import { initSupplyForVariant } from '../lib/init-supply-variants';
import { InfoblockLtService } from '../services/rpa-timeline-comment/infoblock/infoblock-lt.service';
import { RPA_NESTED_BULLET } from '../services/rpa-timeline-comment/lib/rpa-comment-helper.service';

/**
 * Legal Tech на странице участника в заявке RPA: платный пакет печатается
 * строкой с названием пакета и составом под ней, как бесплатный.
 */
describe('init-supply: Legal Tech участника', () => {
    const FREE = 'Гарант-LegalTech. Малый пакет';
    const PAID = 'Гарант-LegalTech. Средний пакет';
    const SEMINARS = 'Интернет-семинары';
    const CONSTRUCTOR = 'Конструктор правовых документов';

    const group = (names: string[]) =>
        ({
            groupsName: 'Legal Tech',
            type: 'lt',
            value: names.map(name => ({ name, checked: true })),
        }) as unknown as DocumentVariantDto['complect'][number];

    const ltRow = (name: string, over: Record<string, unknown> = {}) => ({
        name,
        shortName: name,
        productType: 'lt',
        type: 'general',
        ...over,
    });

    const generalSet = (lt: unknown[]) => ({
        general: [{ id: 0, show: false, rows: { lt }, total: [] }],
        alternative: [],
    });

    const variant = (over: Partial<DocumentVariantDto>): DocumentVariantDto =>
        ({
            variantSmartId: 9001,
            title: 'Юрист',
            contractType: CONTRACT_LTYPE.ABON,
            complect: [],
            rows: [],
            sets: { general: [], alternative: [] },
            total: { name: 'Итого' },
            ...over,
        }) as unknown as DocumentVariantDto;

    /** Спецификация заявки: бесплатный LT открытого набора и его платный пакет. */
    const requestDto = (): InitSupplyDto =>
        ({
            contractSpecificationState: {
                items: [
                    { code: 'complect_name', value: 'X' },
                    { code: 'specification_lt_free', value: FREE },
                    {
                        code: 'specification_lt_free_services',
                        value: ` ${SEMINARS}\n ${CONSTRUCTOR}\n`,
                    },
                    { code: 'specification_lt_packet', value: 'Чужой пакет' },
                    { code: 'specification_lt_services', value: 'Чужой\n' },
                    { code: 'specification_lt_packet_2', value: 'Чужой 2' },
                ],
            },
        }) as unknown as InitSupplyDto;

    const commentOf = (over: Partial<DocumentVariantDto>): string =>
        new InfoblockLtService().getLtComment(
            initSupplyForVariant(requestDto(), variant(over)),
        );

    const freeBlock = `• [b]${FREE}[/b]\n${RPA_NESTED_BULLET}${SEMINARS}\n${RPA_NESTED_BULLET}${CONSTRUCTOR}`;

    it('платный пакет: название пакета, под ним состав без бесплатных сервисов', () => {
        const comment = commentOf({
            complect: [group([SEMINARS, CONSTRUCTOR, 'ЧекДок', 'Тендер'])],
            sets: generalSet([ltRow(PAID)]) as never,
        });

        expect(comment).toContain(freeBlock);
        expect(comment).toContain('Платный LegalTech');
        // тот же вид, что у бесплатного: жирное название и вложенные сервисы
        expect(comment).toContain(
            `• [b]${PAID}[/b]\n${RPA_NESTED_BULLET}ЧекДок\n${RPA_NESTED_BULLET}Тендер`,
        );
        // платный пакет открытого набора на чужую страницу не попадает
        expect(comment).not.toContain('Чужой');
    });

    it('платных пакетов нет: бесплатный состав не выдаётся за платный', () => {
        const comment = commentOf({
            complect: [group([SEMINARS, CONSTRUCTOR])],
            sets: generalSet([]) as never,
        });

        expect(comment).toContain(freeBlock);
        expect(comment).not.toContain('Платный LegalTech');
        expect(comment).not.toContain('Чужой');
    });

    it('свёрнутый набор: пакет читается из rows, строки наборов для сравнения не считаются', () => {
        const comment = commentOf({
            complect: [group([SEMINARS, CONSTRUCTOR, 'ЧекДок'])],
            rows: [
                ltRow(PAID),
                ltRow('Пакет из набора для сравнения', {
                    type: 'alternative',
                }),
            ] as never,
        });

        expect(comment).toContain(
            `• [b]${PAID}[/b]\n${RPA_NESTED_BULLET}ЧекДок`,
        );
        expect(comment).not.toContain('набора для сравнения');
    });

    it('несколько платных пакетов: каждый своей строкой с названием', () => {
        const comment = commentOf({
            complect: [group([SEMINARS, CONSTRUCTOR, 'ЧекДок', 'Тендер'])],
            sets: generalSet([
                ltRow(PAID),
                ltRow('Гарант-LegalTech. Большой пакет', {
                    productType: 'lt_other',
                }),
            ]) as never,
        });

        expect(comment.split('Платный LegalTech')).toHaveLength(2);
        expect(comment).toContain(`• [b]${PAID}[/b]`);
        expect(comment).toContain('• [b]Гарант-LegalTech. Большой пакет[/b]');
        // состав между пакетами не делится: чужие сервисы под пакет не пишутся
        expect(comment).not.toContain(`${RPA_NESTED_BULLET}ЧекДок`);
    });

    it('lt варианта заменяет весь Legal Tech заявки: бесплатный и платные пакеты со составом', () => {
        const comment = commentOf({
            lt: {
                freePacket: 'Гарант-LegalTech. Большой пакет',
                freeServices: ['Сутяжник', 'Искра'],
                paidPacket: '',
                paidServices: [],
                paidPackets: [
                    { name: PAID, services: ['ЧекДок', 'Тендер'] },
                    { name: FREE, services: [SEMINARS] },
                ],
            },
        });

        expect(comment).toContain(
            `• [b]Гарант-LegalTech. Большой пакет[/b]\n${RPA_NESTED_BULLET}Сутяжник\n${RPA_NESTED_BULLET}Искра`,
        );
        expect(comment).toContain(
            `• [b]${PAID}[/b]\n${RPA_NESTED_BULLET}ЧекДок\n${RPA_NESTED_BULLET}Тендер`,
        );
        expect(comment).toContain(
            `• [b]${FREE}[/b]\n${RPA_NESTED_BULLET}${SEMINARS}`,
        );
        expect(comment).not.toContain('Чужой');
    });

    it('lt варианта без платных пакетов: бесплатный LT заявки не остаётся от чужого набора', () => {
        const comment = commentOf({
            lt: {
                freePacket: '',
                freeServices: [],
                paidPacket: '',
                paidServices: [],
            },
        });

        expect(comment).toBe('');
    });

    it('lt варианта в легаси-форме: одна пара paidPacket и paidServices', () => {
        const comment = commentOf({
            lt: {
                freePacket: '',
                freeServices: [],
                paidPacket: PAID,
                paidServices: ['ЧекДок'],
            },
        });

        expect(comment).toContain(
            `• [b]${PAID}[/b]\n${RPA_NESTED_BULLET}ЧекДок`,
        );
    });
});
