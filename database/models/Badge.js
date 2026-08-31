const mongoose = require("mongoose");

const badgeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 40, index: true },
    description: { type: String, default: null, trim: true, maxlength: 180 },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      validate: {
        validator: (v) => /^https?:\/\/.+/i.test(String(v)),
        message: "Invalid imageUrl",
      },
    },
    rarity: { type: String, enum: ["common", "rare", "epic", "legendary"], default: "common", index: true },
    color: { type: String, default: "#ffffff", trim: true, maxlength: 16 },

    effects: {
      glow: { type: Boolean, default: false },
      sparkles: { type: Boolean, default: false },
      confetti: { type: Boolean, default: false },
      gradient: { type: Boolean, default: false },
    },
  },
  { timestamps: true, minimize: true }
);

badgeSchema.set("toJSON", { versionKey: false });

module.exports = mongoose.models.Badge || mongoose.model("Badge", badgeSchema);
