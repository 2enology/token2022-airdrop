import mongoose from "mongoose";

const depositSchema = new mongoose.Schema(
  {
    hash: { type: String, require: true },
    wallet: { type: String, require: true },
    solana: { type: String},
    amount: { type: Number, require: true },
    status: { type: Number, require: true, default: 0 },   // 0: insert, 1: process, 2: end 
  },
  {
    timestamps: {
      createdAt: "created_at",
    },
  }
);

export const depositModel = mongoose.model("deposit", depositSchema);
