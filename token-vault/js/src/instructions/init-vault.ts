import { AccountLayout as TokenAccountLayout, MintLayout } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { VAULT_PROGRAM_PUBLIC_KEY } from '../common/consts';
import { createMint, createTokenAccount, pdaForVault } from '../common/helpers';
import {
  createInitVaultInstruction,
  InitVaultArgs,
  InitVaultInstructionAccounts,
  Vault,
} from '../generated';
import { InstructionsWithAccounts } from '../types';

export class InitVault {
  /**
   * Sets up the accounts needed to initialize a vault.
   * Use this method if you don't have those accounts setup already.
   *
   * See {@link InitVaultInstructionAccounts} for more information about those accounts.
   * @param args
   *  - externalPriceAccount should be created via {@link import('./create-external-price-account').createExternalPriceAccount}
   */
  static async setupInitVaultAccounts(
    connection: Connection,
    args: {
      payer: PublicKey;
      vaultAuthority: PublicKey;
      priceMint: PublicKey;
      externalPriceAccount: PublicKey;
    },
  ): Promise<InstructionsWithAccounts<InitVaultInstructionAccounts & { vaultPair: Keypair }>> {
    // -----------------
    // Rent Exempts
    // -----------------
    const tokenAccountRentExempt = await connection.getMinimumBalanceForRentExemption(
      TokenAccountLayout.span,
    );

    const mintRentExempt = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
    const vaultRentExempt = await Vault.getMinimumBalanceForRentExemption(connection);

    // -----------------
    // Account Setups
    // -----------------
    const { vaultPair: vault, vaultPDA } = await vaultAccountPDA();

    const [fractionMintIxs, fractionMintSigners, { mintAccount: fractionMint }] = createMint(
      args.payer,
      mintRentExempt,
      0,
      vaultPDA, // mintAuthority
      vaultPDA, // freezeAuthority
    );

    const [redeemTreasuryIxs, redeemTreasurySigners, { tokenAccount: redeemTreasury }] =
      createTokenAccount(
        args.payer,
        tokenAccountRentExempt,
        args.priceMint, // mint
        vaultPDA, // owner
      );

    const [fractionTreasuryIxs, fractionTreasurySigners, { tokenAccount: fractionTreasury }] =
      createTokenAccount(
        args.payer,
        tokenAccountRentExempt,
        fractionMint, // mint
        vaultPDA, // owner
      );

    const uninitializedVaultIx = SystemProgram.createAccount({
      fromPubkey: args.payer,
      newAccountPubkey: vault.publicKey,
      lamports: vaultRentExempt,
      space: Vault.byteSize,
      programId: VAULT_PROGRAM_PUBLIC_KEY,
    });

    return [
      [...fractionMintIxs, ...redeemTreasuryIxs, ...fractionTreasuryIxs, uninitializedVaultIx],
      [...fractionMintSigners, ...redeemTreasurySigners, ...fractionTreasurySigners, vault],
      {
        fractionMint,
        redeemTreasury,
        fractionTreasury,
        vault: vault.publicKey,
        vaultPair: vault,
        authority: args.vaultAuthority,
        pricingLookupAddress: args.externalPriceAccount,
      },
    ];
  }

  /**
   * Initializes the Vault.
   *
   * @param accounts set them up via {@link InitVault.setupInitVaultAccounts}
   */
  static async initVault(accounts: InitVaultInstructionAccounts, initVaultArgs: InitVaultArgs) {
    return createInitVaultInstruction(accounts, {
      initVaultArgs,
    });
  }
}

async function vaultAccountPDA() {
  const vaultPair = Keypair.generate();
  const vaultPDA = await pdaForVault(vaultPair.publicKey);
  return { vaultPair, vaultPDA };
}
