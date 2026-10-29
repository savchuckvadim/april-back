import { mp3ChannelCount } from '../lib/mp3-channels.util';

/** Кадр MPEG-1 Layer III, 128 кбит/с, 44,1 кГц; четвёртый байт — режим каналов. */
const frame = (modeByte: number): Buffer =>
    Buffer.from([0xff, 0xfb, 0x90, modeByte, 0, 0, 0, 0]);

const STEREO = 0x00;
const JOINT_STEREO = 0x40;
const DUAL_CHANNEL = 0x80;
const MONO = 0xc0;

/** Тег ID3v2.3 без флагов с телом в `bodySize` байт. */
const id3 = (bodySize: number): Buffer =>
    Buffer.concat([
        Buffer.from('ID3', 'latin1'),
        Buffer.from([0x03, 0x00, 0x00, 0, 0, 0, bodySize]),
        Buffer.alloc(bodySize, 0x41),
    ]);

describe('mp3ChannelCount', () => {
    it('режим каналов из заголовка кадра: моно — 1, стерео, joint и dual — 2', () => {
        expect(mp3ChannelCount(frame(MONO))).toBe(1);
        expect(mp3ChannelCount(frame(STEREO))).toBe(2);
        expect(mp3ChannelCount(frame(JOINT_STEREO))).toBe(2);
        expect(mp3ChannelCount(frame(DUAL_CHANNEL))).toBe(2);
    });

    it('тег ID3 в начале и мусор до кадра пропускаются', () => {
        expect(mp3ChannelCount(Buffer.concat([id3(30), frame(STEREO)]))).toBe(
            2,
        );
        expect(
            mp3ChannelCount(
                Buffer.concat([
                    Buffer.from([0x00, 0x12, 0xff, 0x00]),
                    frame(MONO),
                ]),
            ),
        ).toBe(1);
    });

    it('не MP3, пустой буфер и ложный sync с зарезервированными битами — null', () => {
        expect(mp3ChannelCount(Buffer.from('audio'))).toBeNull();
        expect(mp3ChannelCount(Buffer.alloc(0))).toBeNull();
        // version 01 (зарезервировано) и bitrate 1111 — не кадр.
        expect(
            mp3ChannelCount(Buffer.from([0xff, 0xeb, 0x90, 0x00, 0, 0, 0, 0])),
        ).toBeNull();
        expect(
            mp3ChannelCount(Buffer.from([0xff, 0xfb, 0xf0, 0x00, 0, 0, 0, 0])),
        ).toBeNull();
    });
});
