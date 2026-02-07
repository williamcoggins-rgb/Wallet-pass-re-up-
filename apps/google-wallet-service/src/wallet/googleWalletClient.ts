import { google, walletobjects_v1 } from "@googleapis/walletobjects";
import { GoogleAuth } from "google-auth-library";
import jwt from "jsonwebtoken";

export type WalletPassInput = {
  userId: string;
  passKind: "receipt" | "insight" | "loyalty";
  payload: Record<string, any>;
};

export type CreatePassResult = {
  objectId: string;
  classId: string;
  saveUrl: string;
};

export class GoogleWalletClient {
  private client: walletobjects_v1.Walletobjects;
  private credentials: { client_email: string; private_key: string };
  private issuerId: string;

  constructor(opts: { issuerId: string; credentialsJson: string }) {
    this.issuerId = opts.issuerId;
    this.credentials = JSON.parse(opts.credentialsJson);

    const auth = new GoogleAuth({
      credentials: this.credentials,
      scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
    });

    this.client = google.walletobjects({ version: "v1", auth });
  }

  private classId(suffix: string): string {
    return `${this.issuerId}.${suffix}`;
  }

  private objectId(suffix: string): string {
    return `${this.issuerId}.${suffix}`;
  }

  // Ensure a GenericClass exists for the given pass kind.
  // Creates one if it doesn't already exist.
  private async ensureClass(passKind: string) {
    const id = this.classId(`class_${passKind}`);

    try {
      await this.client.genericclass.get({ resourceId: id });
    } catch (err: any) {
      if (err.code === 404) {
        await this.client.genericclass.insert({
          requestBody: {
            id,
          },
        });
      } else {
        throw err;
      }
    }

    return id;
  }

  // Create or update a wallet pass object.
  // If the object already exists, it patches it. Otherwise it inserts a new one.
  async createOrUpdatePass(input: WalletPassInput): Promise<CreatePassResult> {
    const classId = await this.ensureClass(input.passKind);
    const objectSuffix = `${input.passKind}_${input.userId}`;
    const objId = this.objectId(objectSuffix);

    const objectPayload: walletobjects_v1.Schema$GenericObject = {
      id: objId,
      classId,
      genericType: "GENERIC_TYPE_UNSPECIFIED",
      cardTitle: {
        defaultValue: { language: "en-US", value: input.payload.title ?? "Pass" },
      },
      header: {
        defaultValue: { language: "en-US", value: input.payload.header ?? "" },
      },
      hexBackgroundColor: input.payload.backgroundColor ?? "#1a73e8",
      state: "ACTIVE",
      barcode: input.payload.barcode
        ? { type: "QR_CODE", value: input.payload.barcode }
        : undefined,
      textModulesData: input.payload.textModules ?? [],
    };

    try {
      await this.client.genericobject.get({ resourceId: objId });
      // Object exists — patch it
      await this.client.genericobject.patch({
        resourceId: objId,
        requestBody: objectPayload,
      });
    } catch (err: any) {
      if (err.code === 404) {
        await this.client.genericobject.insert({ requestBody: objectPayload });
      } else {
        throw err;
      }
    }

    const saveUrl = this.createSaveUrl(objId);

    return { objectId: objId, classId, saveUrl };
  }

  // Generate an "Add to Google Wallet" URL using a signed JWT.
  createSaveUrl(objectId: string): string {
    const claims = {
      iss: this.credentials.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      payload: {
        genericObjects: [{ id: objectId }],
      },
    };

    const token = jwt.sign(claims, this.credentials.private_key, {
      algorithm: "RS256",
    });

    return `https://pay.google.com/gp/v/save/${token}`;
  }

  // Send a push notification to a user's saved pass via addMessage.
  async notifyUser(passObjectId: string, message: string) {
    await this.client.genericobject.addmessage({
      resourceId: passObjectId,
      requestBody: {
        message: {
          header: "Notification",
          body: message,
          messageType: "TEXT_AND_NOTIFY",
        },
      },
    });
    return { status: "notified", passObjectId, message };
  }
}
