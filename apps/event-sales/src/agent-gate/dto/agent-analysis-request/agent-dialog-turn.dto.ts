import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * Реплика размеченного диалога — вынесена из общего файла контракта агента
 * (лимит файла); имена и декораторы прежние, реэкспорт через барель.
 */

export const AGENT_DIALOG_ROLES = ['manager', 'client', 'other'] as const;
export type AgentDialogRole = (typeof AGENT_DIALOG_ROLES)[number];

/**
 * Одна реплика диалога, размеченного агентом по ролям.
 * Контекст разметки: активные продажи — обычно менеджер звонит первым
 * и представляется компанией.
 */
export class AgentDialogTurnDto {
    @ApiProperty({
        description:
            'Роль говорящего: manager (менеджер), client (клиент), ' +
            'other (третий участник/автоответчик/неопределимо).',
        enum: AGENT_DIALOG_ROLES,
        example: 'manager',
    })
    @IsString()
    @IsIn(AGENT_DIALOG_ROLES as unknown as string[])
    role: AgentDialogRole;

    @ApiProperty({
        description: 'Текст реплики (без имени говорящего).',
        example: 'Добрый день, компания Гарант, меня зовут Олеся…',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    text: string;
}
