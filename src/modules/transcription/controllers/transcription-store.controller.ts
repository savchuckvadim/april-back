import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { TranscriptionStoreService } from "../services/transcription.store.service";
import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { TranscriptionBaseDto, TranscriptionStoreDto } from "../dto/transcription.store.dto";

@ApiTags('Transcription Store')
@Controller('transcription-store')
export class TranscriptionStoreController {
    constructor(
        private readonly transcriptionStoreService: TranscriptionStoreService,

    ) { }

    @ApiOperation({ summary: 'Create transcription' })
    @ApiResponse({
        status: 200,
        description: 'Transcription created successfully',
        type: TranscriptionStoreDto,
    })
    @Post()
    async create(@Body() transcriptionDto: TranscriptionBaseDto): Promise<TranscriptionStoreDto> {
        return this.transcriptionStoreService.create(transcriptionDto);
    }

    @ApiOperation({ summary: 'Find transcription by ID' })
    @ApiResponse({
        status: 200,
        description: 'Transcription found successfully',
        type: TranscriptionStoreDto,
    })
    @Get(':id')
    async findById(@Param('id') id: string): Promise<TranscriptionStoreDto> {
        return this.transcriptionStoreService.findById(id);
    }

    @ApiOperation({ summary: 'Find all transcriptions' })
    @ApiResponse({
        status: 200,
        description: 'All transcriptions found successfully',
        type: [TranscriptionStoreDto],
    })
    @Get()
    async findAll(): Promise<TranscriptionStoreDto[]> {
        return this.transcriptionStoreService.findAll();
    }

    @ApiOperation({ summary: 'Find transcriptions by domain' })
    @ApiResponse({
        status: 200,
        description: 'Transcriptions found successfully',
        type: [TranscriptionStoreDto],
    })
    @Get('domain/:domain')
    async findByDomain(@Param('domain') domain: string): Promise<TranscriptionStoreDto[]> {
        return this.transcriptionStoreService.findByDomain(domain);
    }

    @ApiOperation({ summary: 'Find transcriptions by domain and user' })
    @ApiResponse({
        status: 200,
        description: 'Transcriptions found successfully',
        type: [TranscriptionStoreDto],
    })
    @Get('domain/:domain/user/:userId')
    async findByDomainAndUser(@Param('domain') domain: string, @Param('userId') userId: string): Promise<TranscriptionStoreDto[]> {
        return this.transcriptionStoreService.findByDomainAndUser(domain, userId);
    }

    @ApiOperation({ summary: 'Update transcription' })
    @ApiResponse({
        status: 200,
        description: 'Transcription updated successfully',
        type: TranscriptionStoreDto,
    })
    @Put(':id')
    async update(@Param('id') id: string, @Body() transcriptionDto: TranscriptionBaseDto): Promise<TranscriptionStoreDto> {
        return this.transcriptionStoreService.updateTranscription(id, transcriptionDto);
    }

    @ApiOperation({ summary: 'Delete transcription' })
    @ApiResponse({
        status: 200,
        description: 'Transcription deleted successfully',
        type: TranscriptionStoreDto,
    })
    @Delete(':id')
    async delete(@Param('id') id: string): Promise<boolean> {
        return await this.transcriptionStoreService.delete(id);
    }
}
