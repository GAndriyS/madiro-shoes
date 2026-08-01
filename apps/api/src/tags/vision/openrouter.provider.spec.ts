import { OpenRouterVisionProvider } from './openrouter.provider';
import { VisionProviderError } from './vision-provider';

const image = { buffer: Buffer.from('fake-jpeg'), mimeType: 'image/jpeg' };

const contentResponse = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
});

describe('OpenRouterVisionProvider', () => {
  let provider: OpenRouterVisionProvider;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = new OpenRouterVisionProvider('test-key');
  });

  it('шле зображення data-URL зі structured-output схемою і ключем у Authorization', async () => {
    fetchMock.mockResolvedValue(
      contentResponse('{"size":38,"color":"36","style":"7645","confidence":0.95}'),
    );

    const result = await provider.recognizeTag(image);

    expect(result).toEqual({ size: 38, color: '36', style: '7645', confidence: 0.95 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content[1].image_url.url).toBe(
      `data:image/jpeg;base64,${image.buffer.toString('base64')}`,
    );
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.required).toEqual([
      'size',
      'color',
      'style',
      'confidence',
    ]);
  });

  it('за замовчуванням бере збенчмаркану модель і додає фолбеки без дублів', async () => {
    fetchMock.mockResolvedValue(
      contentResponse('{"size":38,"color":"36","style":"7645","confidence":0.9}'),
    );

    await provider.recognizeTag(image);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('openai/gpt-5.6-luna');
    expect(body.models[0]).toBe(body.model);
    expect(new Set(body.models).size).toBe(body.models.length);
  });

  it('OPENROUTER_MODEL перекриває дефолт і не дублюється у фолбеках', async () => {
    fetchMock.mockResolvedValue(
      contentResponse('{"size":38,"color":"36","style":"7645","confidence":0.9}'),
    );
    const pinned = new OpenRouterVisionProvider('test-key', 'qwen/qwen3-vl-32b-instruct');

    await pinned.recognizeTag(image);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('qwen/qwen3-vl-32b-instruct');
    expect(new Set(body.models).size).toBe(body.models.length);
  });

  it('HTTP-помилка → VisionProviderError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => '',
      json: async () => ({}),
    });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  // An unread body leaves the socket unusable, so undici destroys it instead of
  // pooling it — a burst of 402s would make every later scan pay a reconnect.
  it('вичитує тіло помилкової відповіді, щоб зʼєднання лишилось у пулі', async () => {
    const text = jest.fn().mockResolvedValue('{"error":"insufficient credits"}');
    fetchMock.mockResolvedValue({ ok: false, status: 402, text, json: async () => ({}) });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
    expect(text).toHaveBeenCalled();
  });

  it('падає як VisionProviderError, навіть якщо вичитування тіла саме кинуло', async () => {
    const text = jest.fn().mockRejectedValue(new Error('socket closed'));
    fetchMock.mockResolvedValue({ ok: false, status: 429, text, json: async () => ({}) });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it('мережевий збій/таймаут → VisionProviderError', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  // OpenRouter answers 200 with an error object when the upstream refuses, so
  // a naive `response.ok` check would hand TagsService undefined content.
  it('200 з полем error → VisionProviderError', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { message: 'upstream refused' } }),
    });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it('відповідь без контенту → VisionProviderError', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [] }) });

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });

  it('контент із невалідним JSON → VisionProviderError', async () => {
    fetchMock.mockResolvedValue(contentResponse('not json at all'));

    await expect(provider.recognizeTag(image)).rejects.toBeInstanceOf(VisionProviderError);
  });
});
