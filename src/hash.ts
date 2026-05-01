export class Hash {
  private bytes: Uint8Array;
  private bitOffset = 0;

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static async from(input: string): Promise<Hash> {
    const data = new TextEncoder().encode(input);
    let digest = await crypto.subtle.digest("SHA-256", data);
    const chunks: Uint8Array[] = [new Uint8Array(digest)];
    // Pre-extend to 8 chained hashes = 256 bytes = 2048 bits. Plenty.
    for (let i = 0; i < 7; i++) {
      digest = await crypto.subtle.digest("SHA-256", digest);
      chunks.push(new Uint8Array(digest));
    }
    const total = new Uint8Array(chunks.length * 32);
    chunks.forEach((c, i) => total.set(c, i * 32));
    return new Hash(total);
  }

  next(bits: number): number {
    if (bits < 1 || bits > 32) {
      throw new Error(`next(bits): bits must be 1..32, got ${bits}`);
    }
    let result = 0;
    let remaining = bits;
    while (remaining > 0) {
      this.ensureBits(remaining);
      const byteIndex = Math.floor(this.bitOffset / 8);
      const bitInByte = this.bitOffset % 8;
      const take = Math.min(remaining, 8 - bitInByte);
      const byte = this.bytes[byteIndex]!;
      const chunk = (byte >>> (8 - bitInByte - take)) & ((1 << take) - 1);
      // Use multiplication instead of left-shift to stay in safe integer range
      // when accumulating into the upper bits (avoids signed 32-bit overflow).
      result = result * (1 << take) + chunk;
      this.bitOffset += take;
      remaining -= take;
    }
    return result;
  }

  float(): number {
    return this.next(24) / (1 << 24);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Hash.pick on empty array");
    return arr[this.next(16) % arr.length]!;
  }

  private ensureBits(needed: number): void {
    const totalBits = this.bytes.length * 8;
    if (this.bitOffset + needed <= totalBits) return;
    throw new Error(`Hash exhausted: needed ${needed}, total ${totalBits - this.bitOffset} remain. Increase pre-extension in Hash.from.`);
  }
}
