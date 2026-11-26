import { generateSecMsGecV2, installEdgeTtsV2Patch } from '../../src/modules/voice/edge-tts-v2';

describe('Edge TTS V2 compatibility patch', () => {
  it('generates the reference CS64-SHA256 token for a fixed timestamp', () => {
    // 期望值来自 node-edge-tts@1.2.12 的 generateSecMsGecToken_V2
    expect(generateSecMsGecV2(1763664000)).toBe(
      'CA59E35B293077E3-5497547729EA68B46333F7325C22CD0E377274191A6BE965431CD79F44AD3F8C',
    );
  });

  it('uses a 5-minute window: same window yields the same token', () => {
    expect(generateSecMsGecV2(1763664000)).toBe(generateSecMsGecV2(1763664000 + 200));
    expect(generateSecMsGecV2(1763664000)).not.toBe(generateSecMsGecV2(1763664000 + 400));
  });

  it('patches the module function consumed by EdgeTTS instances', async () => {
    installEdgeTtsV2Patch();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const protocol = require('@andresaya/edge-tts/dist/core/protocol');
    await expect(protocol.generateSecMsGec('ignored', 1763664000000)).resolves.toBe(
      'CA59E35B293077E3-5497547729EA68B46333F7325C22CD0E377274191A6BE965431CD79F44AD3F8C',
    );
  });

  it('aligns the handshake version and browser headers', () => {
    installEdgeTtsV2Patch();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const constants = require('@andresaya/edge-tts/dist/config/constants');
    expect(constants.Constants.VERSION_MS_GEC).toBe('2-143.0.3650.75');
    expect(constants.Constants.getBaseHeaders()['User-Agent']).toContain('Edg/143.0.0.0');
    expect(constants.Constants.WSS_HEADERS['User-Agent']).toContain('Edg/143.0.0.0');
    expect(constants.Constants.VOICE_HEADERS['User-Agent']).toContain('Edg/143.0.0.0');
    expect(constants.Constants.VOICE_HEADERS['Sec-CH-UA']).toContain('Chromium";v="143');
  });

  it('patches the library to use V2 token and legacy endpoint with TrustedClientToken', async () => {
    installEdgeTtsV2Patch();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const protocol = require('@andresaya/edge-tts/dist/core/protocol');
    const token = await protocol.generateSecMsGec('ignored', 1763664000000);
    const url = protocol.buildSynthesisUrl(
      'wss://unused.example',
      'token123',
      token,
      '2-143.0.3650.75',
      'cid789',
    );
    expect(url).toContain('speech.platform.bing.com');
    expect(url).toContain('TrustedClientToken=token123');
    expect(url).toContain(`Sec-MS-GEC=${encodeURIComponent(token)}`);
    expect(url).not.toContain('Ocp-Apim-Subscription-Key');
  });
});
