import PEC from '../extends/pec/index';
import { reader, splitPath } from './reader';
import { structChart } from './Chart';
import { structInfoData, structLineData } from './structInfo';
import md5 from 'md5';
reader.use({
  pattern: /\.(json|pec)$/i,
  type: 'json',
  weight: 10,
  read(i: ByteData): ChartReaderData {
    const { path } = splitPath(i.pathname);
    const raw = JSON.parse(i.text!);
    if (raw.formatVersion != null) {
      const { data, messages } = structChart(raw, i.pathname);
      return { pathname: i.pathname, type: 'chart', md5: md5(i.text!), data, msg: messages, info: structInfoData([], path), line: [], format: `PGS(${raw.formatVersion})` };
    }
    const rpeData = PEC.parseRPE(i.text!, i.pathname);
    const { data, messages } = structChart(rpeData.data, i.pathname);
    const info = structInfoData([rpeData.info], path);
    const line = structLineData(rpeData.line, path);
    const { messages: msg, format } = rpeData;
    messages.push(...msg);
    return { pathname: i.pathname, type: 'chart', md5: md5(i.text!), data, msg: messages, info, line, format };
  }
});
reader.use({
  pattern: /\.pec$/i,
  type: 'text',
  read(i: ByteData): ChartReaderData {
    const pecData = PEC.parse(i.text!, i.pathname);
    const { data, messages } = structChart(pecData.data, i.pathname);
    const { messages: msg, format } = pecData;
    (messages as (BetterMessage | string)[]).push(...msg);
    return { pathname: i.pathname, type: 'chart', md5: md5(i.text!), data, msg: messages, format };
  }
});
reader.use({
  pattern: /^(Settings|info)\.txt$/i,
  type: 'text',
  mustMatch: true,
  read(i: ByteData): ChartInfoReaderData {
    const { path } = splitPath(i.pathname);
    const data = i.text!;
    const chartInfo = structInfoData(PEC.readInfo(data), path);
    return { pathname: i.pathname, type: 'info', data: chartInfo };
  }
});
function parseYaml(text: string): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if (!key) continue;
    if (!val.startsWith('"') && !val.startsWith("'") && val.includes(' #')) {
      val = val.slice(0, val.indexOf(' #')).trim();
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val === 'null' || val === '~' || val === '') {
      result[key] = null;
    } else if (val === 'true' || val === 'True') {
      result[key] = true;
    } else if (val === 'false' || val === 'False') {
      result[key] = false;
    } else {
      result[key] = val;
    }
  }
  return result;
}
reader.use({
  pattern: /^info\.ya?ml$/i,
  type: 'text',
  mustMatch: true,
  weight: 20,
  read(i: ByteData): ChartInfoReaderData {
    const { path } = splitPath(i.pathname);
    const raw = parseYaml(i.text || '');
    const mapped: Record<string, string | null> = {
      Chart: raw.chart ? String(raw.chart) : null,
      Name: raw.name ? String(raw.name) : null,
      Composer: raw.composer ? String(raw.composer) : (raw.artist ? String(raw.artist) : null),
      Charter: raw.charter ? String(raw.charter) : (raw.designer ? String(raw.designer) : null),
      Illustrator: raw.illustrator ? String(raw.illustrator) : null,
      Level: raw.level ? String(raw.level) : (raw.difficulty != null ? String(raw.difficulty) : null),
      Music: raw.music ? String(raw.music) : (raw.song ? String(raw.song) : null),
      Image: raw.illustration ? String(raw.illustration) : (raw.image ? String(raw.image) : (raw.background ? String(raw.background) : null)),
      AspectRatio: raw.aspectRatio != null ? String(raw.aspectRatio) : null,
      BackgroundDim: raw.backgroundDim != null ? String(raw.backgroundDim) : null,
      Offset: raw.offset != null ? String(raw.offset) : null,
      NoteScale: raw.noteScale != null ? String(raw.noteScale) : null
    };
    const chartInfo = structInfoData([mapped], path);
    return { pathname: i.pathname, type: 'info', data: chartInfo };
  }
});
reader.use({
  pattern: /^extra\.json$/i,
  type: 'text',
  mustMatch: true,
  weight: 20,
  read(i: ByteData): ExtraReaderData {
    return { pathname: i.pathname, type: 'extra', data: i.text };
  }
});
reader.use({
  pattern: /\.(glsl|frag|vert|fs|vs)$/i,
  type: 'text',
  mustMatch: true,
  weight: 20,
  read(i: ByteData): ShaderReaderData {
    return { pathname: i.pathname, type: 'shader', data: i.text || '' };
  }
});
if (Object.hasOwn(self, 'webp')) {
  reader.use({
    pattern: /\.webp$/i,
    type: 'binary',
    async read(i: ByteData): Promise<ImageReaderData> {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const webp2canvas = Object.getOwnPropertyDescriptor(self, 'webp')?.value.default as (buffer: ArrayBuffer) => Promise<HTMLCanvasElement>;
      const img = await webp2canvas(i.buffer);
      const bitmap = await createImageBitmap(img);
      return { pathname: i.pathname, type: 'image', data: bitmap };
    }
  });
}
// reader.use({
//   pattern: /^\.ogg$/i,
//   type: 'binary',
//   async read(i: ByteData): Promise<MediaReaderData> {
//     const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis');
//     const decoder = new OggVorbisDecoder();
//     await decoder.ready;
//     const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(new Uint8Array(i.buffer));
//     decoder.free();
//     const actx = new (window.AudioContext || window.webkitAudioContext)();
//     const ab = actx.createBuffer(channelData.length, samplesDecoded, sampleRate);
//     channelData.forEach((channel, idx) => ab.getChannelData(idx).set(channel));
//     return { pathname: i.pathname, type: 'media', data: { audio: ab, video: null } };
//   }
// });
