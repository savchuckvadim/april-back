import { Transcription } from 'generated/prisma';
import { TranscriptionBaseDto } from '../dto/transcription.store.dto';

export abstract class TranscriptionRepository {
    abstract create(
        transcription: TranscriptionBaseDto,
    ): Promise<Transcription | null>;
    abstract update(
        id: string,
        transcription: Partial<Transcription>,
    ): Promise<Transcription | null>;
    abstract findById(id: string): Promise<Transcription | null>;
    abstract findMany(): Promise<Transcription[] | null>;
    abstract findByDomain(domain: string): Promise<Transcription[] | null>;
    abstract findByDomainAndUser(domain: string, userId: string): Promise<Transcription[] | null>;
    abstract delete(id: string): Promise<boolean>;
}
