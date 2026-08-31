const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // Identidade principal: username (substituiu discordId)
    username: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },

    // Senha hashada (scrypt, mesmo formato do AdminUser)
    passwordHash: { type: String, default: null },

    key: { type: String, default: null },        // licenseKey (raw)
    linkedAt: { type: Date, default: null },

    productLinks: {
      type: [
        {
          product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
          key: { type: String, required: true },
          linkedAt: { type: Date, default: null },
          expiresAt: { type: Date, default: null },
          productHash: { type: String, default: null },
          keyScopeHash: { type: String, default: null },
        },
      ],
      default: [],
    },

    // Campos de exibição (preenchidos no registro/update)
    displayName: { type: String, default: null },
    avatarUrl: { type: String, default: null },

    selfHwidFreeResetsUsed: { type: Number, default: 0, min: 0 },

    paused: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
