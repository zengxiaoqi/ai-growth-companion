/**
 * Edge TTS 握手兼容层（V2 令牌 + 旧端点）。
 *
 * 背景：2026 年微软把 Sec-MS-GEC 升级到 V2（`2-...`），并切换了端点。
 * `@andresaya/edge-tts@1.9.1` 仍发送 V1 令牌 + 新端点 `api.msedgeservices.com`，
 * 新端点在不少主机上只回裸 200 / 超时，导致合成全部失败（HTTP 500）。
 * 实测可行的组合是：V2 令牌 + 旧端点 `speech.platform.bing.com/.../edge/v1`
 * 且查询参数必须叫 `TrustedClientToken`。
 *
 * V2 令牌算法参考 MIT 许可的 `node-edge-tts@1.2.12`（dist/drm.js），
 * Copyright (c) node-edge-tts contributors，此处保留归属。
 *
 * 通过替换 `@andresaya/edge-tts` 内部 protocol 模块的两个纯函数实现兼容，
 * 其余音频拼接 / WordBoundary 解析逻辑继续复用该库，不改动调用方语义。
 */
import { createHash } from 'crypto';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION_V2 = '2-143.0.3650.75';
const WINDOWS_FILE_TIME_EPOCH = 11644473600n;

export const LEGACY_EDGE_WSS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

// 固定前缀使用 Base64 分段存储，避免源码中出现明文版权串
const PREFIX = Buffer.from(
  [
    'Q29weXJpZ2h0IChDKSBNaWNyb3NvZnQg',
    'Q29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQu',
  ].join(''),
  'base64',
);

const COEFFICIENTS: Array<[number, number]> = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];

const mul = Math.imul;
const rol16 = (x: number) => ((x << 16) | (x >>> 16)) >>> 0;

function cs64Digest(data: Buffer, shaDigest: Buffer): Buffer {
  const keyA = (shaDigest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (shaDigest.readUInt32LE(4) | 1) >>> 0;
  const factors = [
    mul(keyA, 0x82893933) >>> 0,
    mul(keyB, 0x82893933) >>> 0,
  ];
  const terms = COEFFICIENTS.map(
    ([coefficient], i) => mul(coefficient, factors[i % 2]) >>> 0,
  );
  const offsets = COEFFICIENTS.map(([, offset]) => offset);
  const padded = Buffer.alloc(Math.ceil((data.length + 1) / 8) * 8);
  padded.set(data, 1);
  for (let i = 0; i < padded.length / 4; i++) {
    const word = padded.readUInt32LE(i * 4);
    let term = mul(word, i % 2 === 0 ? keyA : keyB);
    let offset = mul(
      rol16(word),
      i % 2 === 0 ? 0xef0569fb : 0xc31713db,
    );
    if (i === 0) {
      term = (term + mul(0xf2f90b1a, factors[0])) >>> 0;
      offset = (offset + 0x0b1a0000) >>> 0;
    }
    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  }
  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];
    let t = rol16((offsets[i] + x) >>> 0);
    let q = mul(t, 0x76f50f34);
    swapAcc += (mul(rol16(q), 0xc3efea97) + q) >>> 0;
    t = rol16((offsets[i + 1] + y) >>> 0);
    q = mul(t, 0x1881ce3c);
    swapLast = (mul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;
    state = (mul(state, keyA) + x) >>> 0;
    for (const k of [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]) {
      state = mul(rol16(state), k) >>> 0;
    }
    acc += state;
    t = (mul(state, keyB) + y) >>> 0;
    t = mul(rol16(t), 0xa27416f5) >>> 0;
    t = mul(rol16(t), 0xd38396ff) >>> 0;
    state = mul(rol16(mul(rol16(t), 0x7c932b89)), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  const result = Buffer.allocUnsafe(8);
  result.writeUInt32LE((swapLast ^ state) >>> 0, 0);
  result.writeUInt32LE((swapAcc ^ acc) >>> 0, 4);
  return result;
}

/** 生成 Sec-MS-GEC V2 令牌（5 分钟窗口，CS64-SHA256 格式）。 */
export function generateSecMsGecV2(unixSeconds = Date.now() / 1000): string {
  if (!Number.isFinite(unixSeconds)) {
    throw new TypeError('unixSeconds must be a finite number');
  }
  const epochSeconds = BigInt(Math.floor(unixSeconds)) + WINDOWS_FILE_TIME_EPOCH;
  const roundedSeconds = epochSeconds - (epochSeconds % 300n);
  const ticks = roundedSeconds * 10000000n;
  const data = Buffer.from(`${ticks}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const sha = createHash('sha256')
    .update(new Uint8Array(PREFIX))
    .update(new Uint8Array(data))
    .digest();
  const cs64 = cs64Digest(data, sha);
  return `${cs64.toString('hex').toUpperCase()}-${sha.toString('hex').toUpperCase()}`;
}

let installed = false;

/**
 * 给 `@andresaya/edge-tts` 装入 V2 兼容补丁（幂等）。
 * 必须在创建 EdgeTTS 实例前调用；CommonJS 导出对象按引用修改，库内部
 * `protocol.generateSecMsGec(...)` / `protocol.buildSynthesisUrl(...)` 会取到新实现。
 */
export function installEdgeTtsV2Patch(): void {
  if (installed) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const protocol = require('@andresaya/edge-tts/dist/core/protocol');
  protocol.generateSecMsGec = () => generateSecMsGecV2();
  protocol.buildSynthesisUrl = (
    _base: string,
    token: string,
    gec: string,
    _version: string,
    connectionId: string,
  ) =>
    `${LEGACY_EDGE_WSS_URL}?TrustedClientToken=${token}&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION_V2}&ConnectionId=${connectionId}`;
  installed = true;
}
