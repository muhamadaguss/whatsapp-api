const express = require('express')
const router = express.Router()
const { historyCampaign, getDataCampaign } = require('../controllers/campaignController')
const { verifyToken } = require('../middleware/authMiddleware')

router.get('/historyCampaign',verifyToken, historyCampaign)
router.post('/getDataCampaign',verifyToken, getDataCampaign)

module.exports = router