const mongoose = require("mongoose");

const DISCORD_ID_REGEX = /^\d{17,19}$/;

const userBadgeSchema = new mongoose.Schema(
  {
    discordId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (v) => DISCORD_ID_REGEX.test(String(v)),
        message: "Invalid discordId",
      },
    },

    badge: { type: mongoose.Schema.Types.ObjectId, ref: "Badge", required: true, index: true },

    grantedBy: { type: String, default: "admin", maxlength: 32 },
  },
  { timestamps: true, minimize: true }
);

// impede duplicar o mesmo badge para o mesmo usuário
userBadgeSchema.index({ discordId: 1, badge: 1 }, { unique: true });

userBadgeSchema.set("toJSON", { versionKey: false });

module.exports = mongoose.models.UserBadge || mongoose.model("UserBadge", userBadgeSchema);
