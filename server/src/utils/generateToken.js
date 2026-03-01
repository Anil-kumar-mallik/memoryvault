const jwt = require("jsonwebtoken");

function generateToken({ id, tokenVersion, tokenId }) {
  return jwt.sign(
    {
      id,
      tv: tokenVersion,
      jti: tokenId
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      issuer: process.env.JWT_ISSUER || "memoryvault-api",
      audience: process.env.JWT_AUDIENCE || "memoryvault-client"
    }
  );
}

module.exports = generateToken;
