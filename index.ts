import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { CronJob } from "cron";
import { receivedTXModal } from "./models/transaction";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { token2022Transfer } from "./SplTokenTransfer";
import { config } from "./config";
import { Data } from "./type";
import {
  TOKEN_2022_PROGRAM_ID,
  getTransferFeeAmount,
  unpackAccount,
  withdrawWithheldTokensFromAccounts,
} from "@solana/spl-token";

const connection = new Connection(config.SOLANA_RPC_URL);
const teamAccountAddress = new PublicKey(config.SOL_VAULT_WALLET);

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.set("strictQuery", true);
mongoose
  .connect("mongodb://0.0.0.0:27017/token2022_airdrop")
  .then(async () => {
    console.log("==========> Server is running! ❤️  <==========");
    app.listen(port, () => {
      console.log(`===> Connected on http://localhost:${port} <===`);
    });
  })
  .catch((err) => {
    console.log("Cannot connect to the bot! 😭", err);
    process.exit();
  });

app.get("/", () => {
  console.log("server is running!");
});

async function handleAccountChange(accountInfo: any) {
  // Fetch full transaction details using the transaction signature
  if (accountInfo.signature) {
    const transaction = await connection.getParsedConfirmedTransaction(
      accountInfo.signature,
      "confirmed"
    );

    if (transaction && transaction.meta && transaction.blockTime) {
      const receiver: string =
        transaction.transaction.message.accountKeys[1].pubkey.toBase58(); // Get the receiver's public key

      const sender: string =
        transaction.transaction.message.accountKeys[0].pubkey.toBase58(); // Get the sender's public key
      const amount: number =
        transaction.meta.preBalances[0] - transaction.meta.postBalances[0]; // Calculate amount transferred
      const sentTime: Date = new Date(transaction.blockTime * 1000); // Convert blockTime to a Date object

      try {
        if (
          sender &&
          sentTime &&
          amount &&
          receiver === teamAccountAddress.toBase58()
        ) {
          const newData = new receivedTXModal({
            signature: accountInfo.signature,
            sender: sender,
            sentTime: sentTime,
            amount: amount,
            status: 0,
          });

          // Save the new deposit data
          const res = await newData.save();
          console.log("data saved successfully:", res);
        } else {
          console.error("Missing required data.");
        }
      } catch (error) {
        console.error("An error occurred while saving data:", error);
      }
    }
  }
}

const subscriptionId = connection.onAccountChange(
  teamAccountAddress,
  async (accountData: any) => {
    await handleAccountChange(accountData);
  },
  "confirmed"
);

const subscriptionIdos = connection.onLogs(
  teamAccountAddress,
  async (accountData: any) => {
    await handleAccountChange(accountData);
  },
  "confirmed"
);

// Close the subscription gracefully
process.on("SIGINT", () => {
  console.log("Closing subscription");
  connection.removeProgramAccountChangeListener(subscriptionId);
  connection.removeProgramAccountChangeListener(subscriptionIdos);
  process.exit();
});

// Airdrop Sol Token according to the ETH deposit
async function withdrawToken() {
  try {
    const transactions = await receivedTXModal.find({ status: 0 });

    const keypair = Keypair.fromSecretKey(
      Buffer.from(bs58.decode(config.SOLANA_PRIVATE as string))
    );

    const chunkSize = 10;

    for (let i = 0; i < transactions.length; i += chunkSize) {
      const blocks = transactions.slice(i, i + chunkSize);

      let fullData: Data[] = [];

      await Promise.all(
        blocks.map(async (block) => {
          const data: Data = {
            receiver: new PublicKey(block.sender as string),
            amount: block.amount ? block.amount : 0,
            signature: block.signature,
          };
          fullData.push(data);
        })
      );

      await token2022Transfer(
        connection,
        keypair.publicKey,
        new PublicKey(config.SOL_TOKEN_ADDRESS),
        config.SOL_TOKEN_DECIMAL,
        fullData,
        keypair
      );
    }

    console.log("All transactions updated");
  } catch (error) {
    console.error("Error:", error);
  }
}

// const withdrawWithheldTokens = async () => {
//   const tokenMintAddr = new PublicKey(config.SOL_TOKEN_ADDRESS);
//   const payer = Keypair.fromSecretKey(
//     Buffer.from(bs58.decode(config.SOLANA_PRIVATE as string))
//   );

//   // Find all token fee existed ATAs
//   const allAccounts = await connection.getProgramAccounts(
//     TOKEN_2022_PROGRAM_ID,
//     {
//       commitment: "confirmed",
//       filters: [
//         {
//           memcmp: {
//             offset: 0,
//             bytes: tokenMintAddr.toString(),
//           },
//         },
//       ],
//     }
//   );

//   // Collect fee to TREASURY_WALLET simply by loop
//   const accountsToWithdrawFrom: PublicKey[] = [];
//   for (const accountInfo of allAccounts) {
//     const account = unpackAccount(
//       accountInfo.pubkey,
//       accountInfo.account,
//       TOKEN_2022_PROGRAM_ID
//     );
//     const transferFeeAmount = getTransferFeeAmount(account);
//     if (
//       transferFeeAmount !== null &&
//       transferFeeAmount.withheldAmount > BigInt(0)
//     ) {
//       accountsToWithdrawFrom.push(accountInfo.pubkey);
//       const result = await withdrawWithheldTokensFromAccounts(
//         connection,
//         payer,
//         tokenMintAddr,
//         TREASURY_WALLET,
//         WITHDRAW_WITHHELD_AUTHORITY,
//         [],
//         [accountInfo.pubkey],
//         undefined,
//         TOKEN_2022_PROGRAM_ID
//       );
//     }
//   }
// };

// Process sol token withdraw every 10s
const cronWithdraw = new CronJob("*/30 * * * * *", async () => {
  await withdrawToken();
});

if (!cronWithdraw.running) {
  cronWithdraw.start();
}
