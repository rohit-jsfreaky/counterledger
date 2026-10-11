"use client";

import { BaseSignerWalletAdapter, isVersionedTransaction, WalletNotConnectedError, WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { Keypair, type Transaction, type TransactionVersion, type VersionedTransaction } from "@solana/web3.js";

export const DemoWalletName = "Demo wallet (devnet)" as WalletName<"Demo wallet (devnet)">;
const KEY = "counterledger:demo-wallet:v1";

// two ledger columns, the site mark
const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#002fa7"/><rect x="5" y="5" width="6" height="14" rx="1.2" fill="none" stroke="#fff" stroke-width="1.4"/><rect x="13" y="5" width="6" height="14" rx="1.2" fill="#dfe6ff"/></svg>`,
      )
    : "");

/**
 * A throwaway devnet keypair kept in this browser's localStorage, so anyone can try the app without installing a wallet.
 * Devnet only: never send real funds to it. Clearing site data deletes it.
 */
export class DemoWalletAdapter extends BaseSignerWalletAdapter {
  name = DemoWalletName;
  url = "https://docs.solana.com/cli/wallets";
  icon = ICON;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0]);
  private _keypair: Keypair | null = null;

  get connecting() {
    return false;
  }
  get publicKey() {
    return this._keypair?.publicKey ?? null;
  }
  get readyState() {
    return typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.Loadable;
  }

  async connect() {
    let kp: Keypair | null = null;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved)));
    } catch {
      kp = null;
    }
    if (!kp) {
      kp = Keypair.generate();
      try {
        localStorage.setItem(KEY, JSON.stringify(Array.from(kp.secretKey)));
      } catch {
        /* private mode: the wallet lasts for this tab only */
      }
    }
    this._keypair = kp;
    this.emit("connect", kp.publicKey);
  }

  async disconnect() {
    this._keypair = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._keypair) throw new WalletNotConnectedError();
    if (isVersionedTransaction(tx)) tx.sign([this._keypair]);
    else tx.partialSign(this._keypair);
    return tx;
  }
}
