import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { AgentCallAnalysisContentDto } from './agent-call-analysis-content.dto';
import {
    AgentChecklistEvidenceDto,
    AgentNeedItemDto,
} from './agent-evidence.dto';

/**
 * Слой мест в разговоре (задание focus-v3.4): потребности с цитатой и
 * секундой, места пунктов «хвоста» и 5К. Вынесен отдельным слоем по лимиту
 * файла содержания; разбор без цитат этих полей не несёт.
 */
export class AgentCallAnalysisEvidenceDto extends AgentCallAnalysisContentDto {
    @ApiPropertyOptional({
        description:
            'Выявленные потребности с местом в разговоре; список `needs` ' +
            'собирается из них кодом.',
        type: [AgentNeedItemDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentNeedItemDto)
    needItems?: AgentNeedItemDto[];

    @ApiPropertyOptional({
        description:
            'Где в разговоре раскрыты пункты «хвоста» (только пункты со ' +
            'значением true); null — не презентация.',
        type: [AgentChecklistEvidenceDto],
        nullable: true,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentChecklistEvidenceDto)
    hvostEvidence?: AgentChecklistEvidenceDto[] | null;

    @ApiPropertyOptional({
        description:
            'Где в разговоре выяснены блоки 5К (только блоки со значением ' +
            'true); null — не презентация.',
        type: [AgentChecklistEvidenceDto],
        nullable: true,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentChecklistEvidenceDto)
    fiveKEvidence?: AgentChecklistEvidenceDto[] | null;

    /**
     * Служебное: тип звонка, по которому строилось задание фокус-разбора с
     * цитатами (приор классификатора). Итоговый тип может стать другим после
     * синтеза — тогда у презентации нет «хвоста» и 5К; приём отмечает это в
     * журнале. Ставит код, из тела запроса не принимается (без декораторов
     * class-validator whitelist вырезает поле).
     */
    @ApiHideProperty()
    taskCallType?: string | null;
}
