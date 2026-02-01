import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsString } from "class-validator";

export class TranscriptionBaseDto {
    @ApiProperty({ description: 'Provider of the transcription' })
    @IsString()
    @IsNotEmpty()
    provider: string;

    @ApiProperty({ description: 'Activity ID' })
    @IsString()
    @IsNotEmpty()
    activityId: string;

    @ApiProperty({ description: 'File ID' })
    @IsString()
    @IsNotEmpty()
    fileId: string;

    @ApiProperty({ description: 'In comment' })
    @IsBoolean()
    @IsNotEmpty()
    inComment: boolean;

    @ApiProperty({ description: 'Status of the transcription' })
    @IsString()
    @IsNotEmpty()
    status: string;

    @ApiProperty({ description: 'Text of the transcription' })
    @IsString()
    @IsNotEmpty()
    text: string;

    @ApiProperty({ description: 'Symbols count of the transcription' })
    @IsString()
    @IsNotEmpty()
    symbolsCount: string;

    @ApiProperty({ description: 'Price of the transcription' })
    @IsString()
    @IsNotEmpty()
    price: string;

    @ApiProperty({ description: 'Duration of the transcription' })
    @IsString()
    @IsNotEmpty()
    duration: string;

    @ApiProperty({ description: 'Domain of the transcription' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({ description: 'User result of the transcription' })
    @IsString()
    @IsNotEmpty()
    userResult?: string;

    @ApiProperty({ description: 'User ID' })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ description: 'User name' })
    @IsString()
    @IsNotEmpty()
    userName: string;

    @ApiProperty({ description: 'Application name' })
    @IsString()
    @IsNotEmpty()
    app: string;

    @ApiProperty({ description: 'Entity type' })
    @IsString()
    @IsNotEmpty()
    entityType: string;

    @ApiProperty({ description: 'Entity ID' })
    @IsString()
    @IsNotEmpty()
    entityId: string;

    @ApiProperty({ description: 'Entity name' })
    @IsString()
    @IsNotEmpty()
    entityName: string;

    @ApiProperty({ description: 'Department' })
    @IsString()
    @IsNotEmpty()
    department: string;
}


export class TranscriptionStoreDto extends TranscriptionBaseDto {
    @ApiProperty({ description: 'Transcription ID' })
    id: string;

    @ApiProperty({ description: 'Created at' })
    created_at?: Date;

    @ApiProperty({ description: 'Updated at' })
    updated_at?: Date;
}
