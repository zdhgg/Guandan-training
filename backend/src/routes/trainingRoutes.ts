import { Router } from 'express';
import { autoGroupTrainingCards, newTrainingHand, validateTrainingGroups } from '../controllers/trainingController';

const router = Router();

/**
 * @route   POST /api/training/validate-groups
 * @desc    批量校验理牌分组合法性（纯逻辑，不写数据库）
 * @access  Public
 */
router.post('/validate-groups', validateTrainingGroups);

/**
 * @route   POST /api/training/auto-group
 * @desc    智能贪心理牌，返回合法牌堆二维数组
 * @access  Public
 */
router.post('/auto-group', autoGroupTrainingCards);

/**
 * @route   GET /api/training/new-hand
 * @desc    训练模式重新发牌，返回27张新手牌
 * @access  Public
 */
router.get('/new-hand', newTrainingHand);

export default router;
