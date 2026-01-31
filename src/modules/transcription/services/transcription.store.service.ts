import { Injectable, NotFoundException } from "@nestjs/common";
import { TranscriptionRepository } from "../repository/transcription.repository";
import { createTranscriptionResponseDtoFromPrisma } from "../lib/db.mapper";
import { TranscriptionBaseDto, TranscriptionStoreDto } from "../dto/transcription.store.dto";

@Injectable()
export class TranscriptionStoreService {
    constructor(
        private readonly transcriptionRepository: TranscriptionRepository

    ) { }

    async create(transcriptionDto: TranscriptionBaseDto): Promise<TranscriptionStoreDto> {
        const transcription = await this.transcriptionRepository.create(transcriptionDto);
        if (!transcription) {
            throw new NotFoundException('Transcription not found');
        }
        return createTranscriptionResponseDtoFromPrisma(transcription);
    }

    async updateTranscription(id: string, transcriptionDto: TranscriptionBaseDto): Promise<TranscriptionStoreDto> {
        const transcription = await this.transcriptionRepository.update(id, transcriptionDto);
        if (!transcription) {
            throw new NotFoundException('Transcription not found');
        }
        return createTranscriptionResponseDtoFromPrisma(transcription);
    }

    async findById(id: string): Promise<TranscriptionStoreDto> {
        const transcription = await this.transcriptionRepository.findById(id);
        if (!transcription) {
            throw new NotFoundException('Transcription not found');
        }
        return createTranscriptionResponseDtoFromPrisma(transcription);
    }

    async findAll(): Promise<TranscriptionStoreDto[]> {
        const transcriptions = await this.transcriptionRepository.findMany();
        if (!transcriptions) {
            throw new NotFoundException('Transcriptions not found');
        }
        return transcriptions.map(createTranscriptionResponseDtoFromPrisma);
    }
    async findByDomain(domain: string): Promise<TranscriptionStoreDto[]> {
        const transcriptions = await this.transcriptionRepository.findByDomain(domain);
        if (!transcriptions) {
            throw new NotFoundException('Transcriptions not found');
        }
        return transcriptions.map(createTranscriptionResponseDtoFromPrisma);
    }
    async findByDomainAndUser(domain: string, userId: string): Promise<TranscriptionStoreDto[]> {
        const transcriptions = await this.transcriptionRepository.findByDomainAndUser(domain, userId);
        if (!transcriptions) {
            throw new NotFoundException('Transcriptions not found');
        }
        return transcriptions.map(createTranscriptionResponseDtoFromPrisma);
    }
    async delete(id: string): Promise<boolean> {
        return await this.transcriptionRepository.delete(id);
    }
}
