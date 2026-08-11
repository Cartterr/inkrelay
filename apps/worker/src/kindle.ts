import { randomBytes } from "node:crypto";

import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";

const MAX_EPUB_BYTES = 25 * 1024 * 1024;
const SAFE_EMAIL = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/u;

export interface KindleDeliveryConfig {
  destinationEmail: string;
  senderEmail: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  configurationSet?: string;
}

export interface KindleEmailInput {
  senderEmail: string;
  destinationEmail: string;
  editionId: string;
  epub: Buffer;
  boundary?: string;
}

export interface KindleDeliveryProvider {
  send(input: { editionId: string; epub: Buffer }): Promise<{ messageId: string | null }>;
}

export function buildKindleMimeMessage(input: KindleEmailInput): Buffer {
  assertSafeEmail(input.senderEmail);
  assertSafeEmail(input.destinationEmail);
  if (input.epub.length === 0) throw new Error("Kindle EPUB attachment is empty");
  if (input.epub.length > MAX_EPUB_BYTES) throw new Error("Kindle EPUB attachment is too large");
  const safeEditionId = input.editionId.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 40);
  if (!safeEditionId) throw new Error("Kindle edition ID is invalid");
  const boundary = input.boundary ?? `inkrelay-${randomBytes(18).toString("hex")}`;
  if (!/^[A-Za-z0-9-]+$/u.test(boundary)) throw new Error("MIME boundary is invalid");
  const attachment = wrapBase64(input.epub.toString("base64"));

  return Buffer.from(
    [
      `From: InkRelay <${input.senderEmail}>`,
      `To: ${input.destinationEmail}`,
      `Subject: InkRelay Weekly ${safeEditionId}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      `InkRelay Weekly ${safeEditionId} is attached for your Kindle library.`,
      "",
      `--${boundary}`,
      `Content-Type: application/epub+zip; name="inkrelay-weekly-${safeEditionId}.epub"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="inkrelay-weekly-${safeEditionId}.epub"`,
      "",
      attachment,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
    "utf8",
  );
}

export class SesKindleDeliveryProvider implements KindleDeliveryProvider {
  readonly #client: SESClient;
  readonly #config: KindleDeliveryConfig;

  constructor(config: KindleDeliveryConfig) {
    this.#config = config;
    this.#client = new SESClient({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async send(input: { editionId: string; epub: Buffer }): Promise<{ messageId: string | null }> {
    const result = await this.#client.send(
      new SendRawEmailCommand({
        Source: this.#config.senderEmail,
        Destinations: [this.#config.destinationEmail],
        RawMessage: {
          Data: buildKindleMimeMessage({
            senderEmail: this.#config.senderEmail,
            destinationEmail: this.#config.destinationEmail,
            editionId: input.editionId,
            epub: input.epub,
          }),
        },
        ...(this.#config.configurationSet
          ? { ConfigurationSetName: this.#config.configurationSet }
          : {}),
      }),
    );
    return { messageId: result.MessageId ?? null };
  }
}

function assertSafeEmail(value: string): void {
  if (!SAFE_EMAIL.test(value)) throw new Error("Kindle email address is invalid");
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/gu)?.join("\r\n") ?? "";
}
