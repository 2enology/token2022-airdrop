import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    solana: { type: Number, require: true },
    ethereum: { type: Number, require: true },
  },
  {
    timestamps: {
      createdAt: "created_at",
    },
  }
);

export const walletModel = mongoose.model("wallet", walletSchema);
