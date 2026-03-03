const express = require("express");
const { getImageById } = require("../controllers/imageController");

const router = express.Router();

router.get("/:id", getImageById);

module.exports = router;
