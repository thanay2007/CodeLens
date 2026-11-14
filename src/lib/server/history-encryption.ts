import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class HistoryEncryption {
  private key: Buffer;

  constructor(secret: string) {
    if (!/^[\da-f]{64}$/i.test(secret))
      throw new Error(
        "CODELENS_HISTORY_KEY must contain 64 hexadecimal characters.",
      );
    this.key = Buffer.from(secret, "hex");
  }

  seal(owner: string, id: string, field: string, value: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify([owner, id, field])));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }

  open(owner: string, id: string, field: string, sealed: string) {
    const bytes = Buffer.from(sealed, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(JSON.stringify([owner, id, field])));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
}
