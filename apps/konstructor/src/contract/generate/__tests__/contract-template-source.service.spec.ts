import { NotFoundException } from '@nestjs/common';
import {
    TemplateCandidate,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import { ContractGenerateDto } from '../dto/contract-generate.dto';
import { ContractTemplateSourceService } from '../services/contract-template-source.service';

const DB_PATH =
    'storage/app/konstructor/templates/contract/etalon/lic/internet/state/template.docx';

const dto = (over: Partial<ContractGenerateDto> = {}): ContractGenerateDto =>
    ({
        domain: 'gsr.bitrix24.ru',
        providerId: 12,
        contractType: CONTRACT_LTYPE.LIC,
        clientType: ClientTypeEnum.ORG_STATE,
        supply: { type: SupplyTypeEnum.INTERNET },
        ...over,
    }) as unknown as ContractGenerateDto;

const candidate = (over: Partial<TemplateCandidate> = {}): TemplateCandidate =>
    ({
        id: '42',
        filePath: DB_PATH,
        portalId: null,
        agentId: null,
        contractType: CONTRACT_LTYPE.LIC,
        clientTypes: [ClientTypeEnum.ORG_STATE],
        supplyTypes: [SupplyTypeEnum.INTERNET],
        isDefault: true,
        updatedAt: null,
        createdAt: null,
        ...over,
    }) as TemplateCandidate;

describe('ContractTemplateSourceService', () => {
    // Моки — отдельными const: assert на repo.method ломает
    // @typescript-eslint/unbound-method (см. CLAUDE.md).
    let fileExists: jest.Mock;
    let resolveContract: jest.Mock;
    let service: ContractTemplateSourceService;

    beforeEach(() => {
        fileExists = jest.fn().mockResolvedValue(true);
        resolveContract = jest.fn().mockResolvedValue({
            source: TemplateResolutionSource.DB,
            match: { candidate: candidate(), reason: 'общий шаблон' },
            criteria: {},
        });
        service = new ContractTemplateSourceService(
            { fileExists } as never,
            { resolveContract } as never,
        );
    });

    it('шаблон из БД: путь и id строки', async () => {
        const result = await service.resolve(dto());

        expect(result).toEqual({ path: DB_PATH, templateId: '42' });
    });

    it('в подбор уходят тип договора, клиент, поставка и поставщик', async () => {
        await service.resolve(dto());

        expect(resolveContract).toHaveBeenCalledWith({
            domain: 'gsr.bitrix24.ru',
            providerId: 12,
            contractType: CONTRACT_LTYPE.LIC,
            clientType: ClientTypeEnum.ORG_STATE,
            supplyType: SupplyTypeEnum.INTERNET,
        });
    });

    it('нет шаблона — ошибка подбора доходит до менеджера как есть', async () => {
        resolveContract.mockRejectedValue(
            new NotFoundException(
                'Нет шаблона договора: «Лицензионный договор»',
            ),
        );

        await expect(service.resolve(dto())).rejects.toThrow(
            'Нет шаблона договора',
        );
    });

    it('строка есть, файла нет — говорим, что файл надо загрузить заново', async () => {
        fileExists.mockResolvedValue(false);

        await expect(service.resolve(dto())).rejects.toThrow(
            'Файл шаблона договора #42 не найден',
        );
    });
});
