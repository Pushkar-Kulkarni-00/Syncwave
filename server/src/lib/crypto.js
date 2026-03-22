/**
 * lib/crypto.js
 * AES-256-GCM encryption for storing Spotify tokens in PostgreSQL.
 *
 * Why encrypt tokens in the DB?
 *   If the database is ever breached (leaked backup, SQL injection via a future
 *   bug, compromised DB credentials), plaintext tokens would give an attacker
 *   full read access to every user's Spotify account until tokens expire.
 *   Encryption at rest means they'd need both the DB dump AND the encryption
 *   key (stored separately as an env var) to decrypt anything.
 *
 * Algorithm: AES-256-GCM
 *   - Authenticated encryption: provides confidentiality + integrity
 *   - Each encrypt() call generates a fresh random 12-byte IV
 *   - The auth tag (16 bytes) detects tampering
 *   - Stored format: hex(iv):hex(authTag):hex(ciphertext)
 */
"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // GCM standard nonce length

// Validate the key at module load time so we fail fast rather than at runtime
const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
if (!rawKey || rawKey.length !== 64) {
  console.error(
    "[FATAL] TOKEN_ENCRYPTION_KEY must be a 64-character hex string. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
  process.exit(1);
}

const KEY = Buffer.from(rawKey, "hex"); // 32 bytes = 256 bits

/**
 * Encrypt a plaintext string.
 * Returns a colon-separated string: iv:authTag:ciphertext (all hex encoded).
 */
function encrypt(plaintext) {
  if (typeof plaintext !== "string") throw new TypeError("encrypt: plaintext must be a string");
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a value produced by encrypt().
 * Throws if the ciphertext has been tampered with (auth tag mismatch).
 */
function decrypt(stored) {
  if (typeof stored !== "string") throw new TypeError("decrypt: stored must be a string");
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("decrypt: invalid stored format");
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv         = Buffer.from(ivHex,         "hex");
  const authTag    = Buffer.from(authTagHex,    "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher   = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
