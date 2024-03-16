import mongoose from "mongoose";

const withdrawSchema = new mongoose.Schema(
  {
    hash: { type: String, require: true },
    wallet: { type: String, require: true },
    ethereum: { type: String, require: true },
    amount: { type: Number, require: true },
  },
  {
    timestamps: {
      createdAt: "created_at",
    },
  }
);

export const withdrawModel = mongoose.model("withdraw", withdrawSchema);
