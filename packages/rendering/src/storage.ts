import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredAsset {
  body: Buffer;
  contentType: string;
  etag?: string;
}

export interface AssetStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredAsset | null>;
  delete(key: string): Promise<void>;
}

export function safeAssetKey(key: string): string {
  if (!/^(?:covers|assets)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/u.test(key) || key.includes("..")) {
    throw new Error("Invalid asset key");
  }
  return key;
}

export class MemoryAssetStore implements AssetStore {
  readonly #assets = new Map<string, StoredAsset>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.#assets.set(safeAssetKey(key), { body: Buffer.from(body), contentType });
  }

  async get(key: string): Promise<StoredAsset | null> {
    const asset = this.#assets.get(safeAssetKey(key));
    return asset ? { ...asset, body: Buffer.from(asset.body) } : null;
  }

  async delete(key: string): Promise<void> {
    this.#assets.delete(safeAssetKey(key));
  }
}

export interface S3AssetStoreOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3AssetStore implements AssetStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: S3AssetStoreOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: safeAssetKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredAsset | null> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: safeAssetKey(key) }),
      );
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return {
        body: Buffer.from(bytes),
        contentType: result.ContentType ?? "application/octet-stream",
        etag: result.ETag,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: safeAssetKey(key) }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "NoSuchKey") ||
      ("$metadata" in error &&
        typeof error.$metadata === "object" &&
        error.$metadata !== null &&
        "httpStatusCode" in error.$metadata &&
        error.$metadata.httpStatusCode === 404))
  );
}
