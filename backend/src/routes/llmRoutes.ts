import { Router } from 'express';
import { pingLLMConnectivity } from '../services/aiService';

const router = Router();

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @route   POST /api/llm/ping
 * @desc    测试 LLM 连通性（基于用户输入配置）
 * @access  Public
 */
router.post('/ping', async (req, res) => {
  try {
    const apiKey = normalizeText(req.body?.apiKey);
    const baseUrl = normalizeText(req.body?.baseUrl);
    const model = normalizeText(req.body?.model);

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'apiKey 不能为空'
      });
    }

    const result = await pingLLMConnectivity({
      apiKey,
      baseUrl: baseUrl || undefined,
      model: model || undefined
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(500).json({
      success: false,
      message
    });
  }
});

export default router;
