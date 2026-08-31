const mongoose = require("mongoose");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DISCORD_ID_REGEX = /^\d{17,19}$/;

const accountSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      validate: {
        validator: (v) => EMAIL_REGEX.test(String(v || "")),
        message: "Invalid email",
      },
    },

    // guardamos hash no formato: scrypt$N$r$p$saltBase64$hashBase64
    passwordHash: { type: String, required: true, minlength: 20, maxlength: 600 },

    // vinculação segura via OAuth2 (recomendado). Campo opcional.
    discordId: {
      type: String,
      index: true,
      sparse: true,
      validate: {
        validator: (v) => (v == null ? true : DISCORD_ID_REGEX.test(String(v))),
        message: "Invalid discordId",
      },
    },

    profile: {
      displayName: { type: String, maxlength: 48, default: "" },
      avatarUrl: { type: String, maxlength: 512, default: "" },
      bannerUrl: { type: String, maxlength: 512, default: "" },
    },

    // chaves vinculadas explicitamente à conta (sem salvar o código em claro)
    linkedKeys: [{ type: mongoose.Schema.Types.ObjectId, ref: "Key" }],

    status: { type: String, enum: ["ACTIVE", "BANNED"], default: "ACTIVE", index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: true }
);

accountSchema.set("toJSON", {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.models.Account || mongoose.model("Account", accountSchema);
