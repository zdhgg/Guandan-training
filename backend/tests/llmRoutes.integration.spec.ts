import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('llm routes integration', () => {
  it('POST /api/llm/ping 未提供 apiKey 时返回 400', async () => {
    const response = await request(app).post('/api/llm/ping').send({
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat'
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('apiKey');
  });
});
