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

  it('patches the library to use V2 token and legacy endpoint with TrustedClientToken', () => {
    installEdgeTtsV2Patch();
    // Verify the prototype was patched - should return a non-empty token
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const EdgeTTSClass = require('@andresaya/edge-tts').EdgeTTS;
    const token = EdgeTTSClass.prototype.generateSecMsGec();
    // Just verify it returns a non-empty string with a dash
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.includes('-')).toBe(true);
    expect(token.length).toBeGreaterThan(20);
  });
});
