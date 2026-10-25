import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComplectService, InfoblockService } from '@lib/garant';
import { StorageService, StorageType } from '@lib/core/storage';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import dayjs from 'dayjs';
import { Packer } from 'docx';
import {
    ComplectDescriptionGenerateDto,
    ComplectDescriptionResponseDto,
} from '../dto/complect-description.dto';
import {
    buildDescriptionDocument,
    countInfoblocks,
    descriptionFileName,
    resolveDescriptionGroups,
    type DescriptionSource,
} from '../lib/complect-description-doc';

/**
 * «Описание комплекта» для менеджера: тексты блоков берутся из БД по коду
 * (инфоблоки — `infoblocks.description`, сервисы LT/консалтинг/СТАР —
 * `complects.description`), чего в БД нет — из запроса. Файл кладётся в
 * публичное хранилище, ссылка — токен /api/files, как у договора.
 */
@Injectable()
export class ComplectDescriptionService {
    private readonly baseUrl: string;

    constructor(
        private readonly infoblockService: InfoblockService,
        private readonly complectService: ComplectService,
        private readonly storage: StorageService,
        private readonly fileLink: FileLinkService,
        configService: ConfigService,
    ) {
        this.baseUrl = (configService.get('APP_URL') as string) ?? '';
    }

    async generate(
        dto: ComplectDescriptionGenerateDto,
    ): Promise<ComplectDescriptionResponseDto> {
        const codes = [
            ...new Set(
                dto.groups.flatMap(group =>
                    group.infoblocks.map(infoblock => infoblock.code),
                ),
            ),
        ];
        const sources = await this.loadSources(codes);
        const groups = resolveDescriptionGroups(dto.groups, sources);
        const doc = buildDescriptionDocument({
            complectName: dto.complectName,
            supply: dto.supply,
            groups,
        });
        const buffer = await Packer.toBuffer(doc);

        const year = String(new Date().getFullYear());
        const documentName = descriptionFileName(
            dto.complectName,
            dayjs().format('YYYY-MM-DD_HH-mm-ss'),
        );
        await this.storage.saveFile(
            buffer,
            documentName,
            StorageType.PUBLIC,
            `konstructor/description/${year}/${dto.domain}/${dto.userId}`,
        );
        const rootLink = await this.fileLink.createPublicLink(
            dto.domain,
            dto.userId,
            'konstructor',
            'description',
            year,
            documentName,
        );

        return {
            link: `${this.baseUrl}${rootLink}`,
            documentName,
            infoblocksCount: countInfoblocks(groups),
        };
    }

    /** Тексты по кодам: инфоблоки и сервисы каталога (одна карта code → описание) */
    private async loadSources(
        codes: string[],
    ): Promise<Map<string, DescriptionSource>> {
        const sources = new Map<string, DescriptionSource>();
        if (!codes.length) return sources;

        const infoblocks =
            (await this.infoblockService.getInfoblocksByCodse(codes)) ?? [];
        for (const infoblock of infoblocks) {
            sources.set(infoblock.code, {
                name: infoblock.name,
                description: infoblock.description,
            });
        }

        const wanted = new Set(codes.filter(code => !sources.has(code)));
        if (!wanted.size) return sources;
        const complects = (await this.complectService.findAll()) ?? [];
        for (const complect of complects) {
            if (!complect.code || !wanted.has(complect.code)) continue;
            sources.set(complect.code, {
                name: complect.fullName || complect.name,
                description: complect.description ?? null,
            });
        }
        return sources;
    }
}
