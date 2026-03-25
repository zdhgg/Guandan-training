import { Router } from 'express';
import { createMatch, processPlay, endMatch, getInitialHands, getMatchLogs } from '../services/gameService';
import { RuntimeCard } from '../core/cardEngine';

const router = Router();

/**
 * @route   POST /api/matches
 * @desc    创建新对局
 * @access  Public
 */
router.post('/matches', async (req, res) => {
  try {
    const { initialHands } = req.body;
    
    if (!initialHands || !Array.isArray(initialHands) || initialHands.length !== 4) {
      return res.status(400).json({
        success: false,
        message: '需要提供4个玩家的初始手牌数组'
      });
    }

    const result = await createMatch(initialHands as RuntimeCard[][]);
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error('创建对局时发生错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * @route   GET /api/matches/:id/hands/initial
 * @desc    获取指定玩家的开局手牌
 * @access  Public
 */
router.get('/matches/:id/hands/initial', async (req, res) => {
  try {
    const { id: matchId } = req.params;
    const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : 'player1';

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '需要提供对局ID'
      });
    }

    const result = await getInitialHands(matchId, playerId);
    if (!result.success) {
      if (result.message === '对局不存在') {
        return res.status(404).json(result);
      }
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('获取初始手牌时发生错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * @route   POST /api/matches/:id/play
 * @desc    处理玩家出牌
 * @access  Public
 */
router.post('/matches/:id/play', async (req, res) => {
  try {
    const { id: matchId } = req.params;
    const { playerId, cards } = req.body;
    
    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '需要提供对局ID'
      });
    }
    
    if (!playerId) {
      return res.status(400).json({
        success: false,
        message: '需要提供玩家ID'
      });
    }
    
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        success: false,
        message: '需要提供有效的牌组'
      });
    }

    const result = await processPlay(matchId, playerId, cards as RuntimeCard[]);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('处理出牌时发生错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * @route   POST /api/matches/:id/end
 * @desc    结束对局
 * @access  Public
 */
router.post('/matches/:id/end', async (req, res) => {
  try {
    const { id: matchId } = req.params;
    
    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '需要提供对局ID'
      });
    }

    const result = await endMatch(matchId);
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('结束对局时发生错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * @route   GET /api/matches/:id/logs
 * @desc    获取对局日志
 * @access  Public
 */
router.get('/matches/:id/logs', async (req, res) => {
  try {
    const { id: matchId } = req.params;
    
    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '需要提供对局ID'
      });
    }

    const result = await getMatchLogs(matchId);
    if (!result.success) {
      if (result.message === '对局不存在') {
        return res.status(404).json(result);
      }
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('获取对局日志时发生错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

export default router;
