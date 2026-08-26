export interface ContentDigestPort {
  sha256Utf8(value: string): Promise<`sha256:${string}`>;
}
