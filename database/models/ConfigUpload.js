const mongoose = require("mongoose");

const DISCORD_ID_REGEX = /^\d{17,19}$/;

const configUploadSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },

    ownerDiscordId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (v) => DISCORD_ID_REGEX.test(String(v)),
        message: "Invalid ownerDiscordId",
      },
    },

    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: null, trim: true, maxlength: 240 },

    fileKey: { type: String, default: null, trim: true, maxlength: 180 },
    fileUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      validate: {
        validator: (v) => v === null || v === "" || /^https?:\/\/.+/i.test(String(v)),
        message: "Invalid fileUrl",
      },
    },

    fileSize: { type: Number, default: 0, min: 0, max: 50_000_000 },

    downloads: { type: Number, default: 0, min: 0 },

    visibility: { type: String, enum: ["public", "private", "unlisted"], default: "public", index: true },
  },
  { timestamps: true, minimize: true }
);

configUploadSchema.index({ product: 1, visibility: 1, createdAt: -1 });

configUploadSchema.set("toJSON", { versionKey: false });

module.exports = mongoose.models.ConfigUpload || mongoose.model("ConfigUpload", configUploadSchema);
