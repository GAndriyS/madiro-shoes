import { GeminiVisionProvider } from './gemini.provider';
import { VisionProviderError } from './vision-provider';

const image = { buffer: Buffer.from('fake-jpeg'), mimeType: 'image/jpeg' };

const candidateResponse = (text: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe('GeminiVisionProvider', () => {
  let provider: GeminiVisionProvider;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = new GeminiVisionProvider('test-key');
  });

  it('шле base64-зображення зі structured-output схемою і ключем у хедері', async () => {
    fetchMock.mockResolvedValue(
      candidateResponse('{"size":38,"color":"36","style":"7645","confidence":0.95}'),
    );

    const result = await provider.recognizeTag(image);

    expect(result).toEqual({ size: 38, color: '36', style: '7645', confidence: 0.95 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inline_data.data).toBe(image.buffer.toString('base64'));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual([
      'size',
      'color',
      'style',
      'confidence',
    ]);
  });

  it('HTTP-помилка → VisionProviderError', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it('мережевий збій/таймаут → VisionProviderError', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it('відповідь без кандидата → VisionProviderError', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [] }) });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it('кандидат із невалідним JSON → VisionProviderError', async () => {
    fetchMock.mockResolvedValue(candidateResponse('not json at all'));

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });
});
