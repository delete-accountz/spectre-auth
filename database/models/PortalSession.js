const mongoose = require("mongoose");

const portalSessionSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },

    // SHA-256 do token (nunca armazenar o token em claro)
    tokenHash: { type: String, required: true, unique: true, index: true },

    // token CSRF simples (frontend manda em x-csrf-token)
    csrfToken: { type: String, required: true, maxlength: 128 },

    ip: { type: String, maxlength: 80, default: "" },
    ua: { type: String, maxlength: 260, default: "" },

    lastSeenAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: true }
);

// TTL: remove automaticamente após expirar
portalSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

portalSessionSchema.set("toJSON", { versionKey: false });

module.exports =
  mongoose.models.PortalSession || mongoose.model("PortalSession", portalSessionSchema);
